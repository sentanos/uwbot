import {
    Snowflake,
    User,
    Guild,
    Message,
    MessageEmbed,
    TextChannel,
    DMChannel,
    GuildChannel,
    Webhook
} from "discord.js"
import {createHash} from "crypto";
import {
    generateUID,
    random,
    randomColor,
    Queue,
    formatInterval,
    timeDiff,
    dateAfter,
    sendAndMerge
} from "../util";
import {Module} from "../module";
import {Bot} from "../bot";
import {CommandsModule} from "./commands";
import {AuditModule} from "./audit";
import {Blacklist} from "../database/models/blacklist";
import {SettingsConfig} from "./settings.skip";
import {Logs} from "../database/models/logs";
import {Op} from "sequelize";
import {SchedulerModule} from "./scheduler";
import {UserSettingsModule} from "./usersettings";
import {StreamModule} from "./stream";
import {Duration} from "moment";
import {createCanvas, loadImage} from "canvas";

// How it works:
//   - A record of anonymous messages and the user who sent them is kept _in memory_. Each record
//     is guaranteed to be kept for the specified `lifetime`, but can also be kept for longer.
//   - An expired record is kept as long as there is enough room to hold `maxInactiveRecords`.
//     For example, there may be a maximum of 1000 records with 1000 records already stored in
//     memory. At this point, every time a new record is created, the oldest record is deleted.
//   - This only applied to _inactive_ records. If a record has not reached its end of life and
//     somehow gets to be the oldest of 1000 records, it will not be deleted. Instead, the
//     record store will grow to accommodate the new record. The store will decrease back to
//     `maxInactiveRecords` when the extra ones expire.

export type AnonAlias = number;
export type BlacklistResponse = {
    blacklistID: string,
    anonAlias: AnonAlias
}

export class MessageRecords {
    private records: Queue<Record>;
    private readonly maxInactiveRecords: number;
    private readonly lifetime: number;
    private lastRecords: Map<Snowflake, Record>;

    constructor(maxInactiveRecords: number, lifetime: number) {
        this.maxInactiveRecords = maxInactiveRecords;
        this.lifetime = lifetime;
        this.records = new Queue<Record>();
        this.lastRecords = new Map<Snowflake, Record>();
    }

    private prune(): void {
        while(this.records.size() > this.maxInactiveRecords
              && this.records.peek() instanceof Record
              && (this.records.peek() as Record).expired()) {
            this.records.dequeue();
        }
    }

    public addMessage(anonUser: AnonUser, message: Message): void {
        const record = new Record(anonUser.user.id, message.id, message.channel.id,
            anonUser.getAlias(), message.createdAt, this.lifetime);
        this.records.enqueue(record);
        this.prune();
        this.lastRecords.set(message.channel.id, record);
    }

    public getRecordByID(messageID: Snowflake): Record | void {
        const records = this.records.toArray();
        return records.find((record) => {
            return record.messageID == messageID;
        });
    }

    public getLastRecord(channel: Snowflake): Record | void {
        return this.lastRecords.get(channel);
    }
}

export class Record {
    readonly userID: Snowflake;
    private time: Date;
    readonly messageID: Snowflake;
    readonly channelID: Snowflake;
    readonly alias: AnonAlias;
    // Number of seconds after time until record expires.
    readonly lifetime: number;

    constructor(userID: Snowflake, messageID: Snowflake, channelID: Snowflake, alias: AnonAlias,
                time: Date, lifetime: number) {
        this.userID = userID;
        this.messageID = messageID;
        this.channelID = channelID;
        this.alias = alias;
        this.time = time;
        this.lifetime = lifetime;
    }

    public expired(): boolean {
        return (new Date().getTime() - this.time.getTime()) > this.lifetime * 1000;
    }

    public setTime(time: Date): void {
        this.time = time;
    }
}

type AnonWebhook = {
    webhook: Webhook,
    user: AnonUser | void,
    alias: AnonAlias,
    color: number
}

class WebhookHandler {
    private readonly bot: Bot;
    private readonly guild: Guild;
    private readonly maxWebhooks;
    // Map from channel ID to list of webhooks
    // Each list is sorted with the most recently used webhooks coming first
    private webhooks: Map<Snowflake, AnonWebhook[]>;

    constructor(bot: Bot, guild: Guild, maxWebhooks: number) {
        this.bot = bot;
        this.guild = guild;
        this.maxWebhooks = maxWebhooks;
        this.webhooks = new Map();
    }

    private async initWebhooks(channelID: Snowflake): Promise<AnonWebhook[]> {
        if (!this.guild.channels.cache.has(channelID)) {
            throw new Error(`Channel ${channelID} not found for webhook acquisition`);
        }
        const channel = this.guild.channels.cache.get(channelID) as TextChannel;
        let foundWebhooks = [];
        const webhooks = await channel.fetchWebhooks();
        webhooks.forEach((webhook) => {
            if (this.isAnonWebhook(webhook)) {
                foundWebhooks.push(webhook);
            }
        });
        const additional = this.maxWebhooks - webhooks.size;
        if (additional === 0 && foundWebhooks.length === 0) {
            throw new Error(`Could not create webhooks: Max webhook number reached for ${channelID}`);
        }
        let jobs = [];
        for (let i = 0; i < additional; i++) {
            jobs.push(channel.createWebhook(`Anon Unfilled`, {reason: "UW Bot Anon"}));
        }
        return (await Promise.all(jobs)).concat(foundWebhooks).map((webhook) => {
            return {
                webhook: webhook,
                user: null,
                alias: -1,
                color: -1
            }
        });
    }

    // RACE CONDITION
    public async acquireWebhook(channelID: Snowflake, user: AnonUser): Promise<Webhook> {
        if (!this.webhooks.has(channelID)) {
            this.webhooks.set(channelID, await this.initWebhooks(channelID));
        }
        const channelHooks = this.webhooks.get(channelID);
        const alias = user.getAlias();
        const color = user.getColor();
        let replace = channelHooks.length - 1;
        for (let i = 0; i < channelHooks.length; i++) {
            const w = channelHooks[i];
            if (w.user === user) {
                if (w.alias === user.getAlias()
                    && w.color === user.getColor()) {
                    return w.webhook;
                }
                replace = i;
            }
        }
        const entry = channelHooks.splice(replace, 1)[0];
        await entry.webhook.edit({
            name: `Anon ${alias}`,
            avatar: await AnonUser.createAvatar(color)
        });
        entry.user = user;
        entry.alias = alias;
        entry.color = color;
        channelHooks.unshift(entry);
        return entry.webhook;
    }

    public isAnonWebhook(webhook: Webhook): boolean {
        return webhook.owner instanceof User
            && webhook.owner.id === this.bot.client.user.id
            && webhook.name.startsWith("Anon");
    }
}

const settingsConfig: SettingsConfig = {
    maxID: {
        description: "The maximum anon ID (the minimum is always 0)",
        default: "1000"
    },
    lifetime: {
        description: "The minimum number of seconds after which blacklisting is guaranteed to be" +
            " possible",
        default: "43200"
    },
    maxInactiveRecords: {
        description: "The maximum number of inactive message records that are kept",
        default: "1000"
    },
    cooldown: {
        description: "The cooldown (in seconds) between ID changes",
        default: "0"
    },
    maxWebhooks: {
        description: "The maximum number of webhooks to allow per channel",
        default: "10"
    },
    mutedRoles: {
        description: "A comma-separated list of role IDs. If a user has any of these, they will" +
            " not be able to use anon",
        optional: true
    },
};

export class AnonModule extends Module {
    private users: Map<Snowflake, AnonUser>;
    public readonly guild: Guild;
    private readonly filter: string[];
    // Map of user IDs to message IDs
    private messageRecords: MessageRecords;
    private webhookHandler: WebhookHandler;
    private audit: AuditModule;
    private scheduler: SchedulerModule;
    private usettings: UserSettingsModule;

    constructor(bot: Bot) {
        super(bot, "anon", ["audit", "scheduler", "usersettings"], settingsConfig);
        this.guild = this.bot.guild;
        this.filter = this.bot.filter;
    }

    public async initialize() {
        this.users = new Map<Snowflake, AnonUser>();
        this.messageRecords = new MessageRecords(this.settingsN("maxInactiveRecords"),
            this.settingsN("lifetime"));
        this.audit = this.bot.getModule("audit") as AuditModule;
        this.scheduler = this.bot.getModule("scheduler") as SchedulerModule;
        this.usettings = this.bot.getModule("usersettings") as UserSettingsModule;
        this.webhookHandler = new WebhookHandler(this.bot, this.guild, this.settingsN("maxWebhooks"));
        await this.bot.getChannelByName("anonymous").send(new MessageEmbed()
            .setDescription("I was restarted due to updates so IDs have been reset (by the way" +
                " I'm open source, check out my source code" +
                " [here](https://github.com/sentanos/uwbot))")
            .setColor(this.bot.displayColor()));
    }

    public async event(name: string, payload: string): Promise<void> {
        if (name === "ANON_TIMEOUT_END") {
            await this.unblacklist(payload);
        }
    }

    public reset(): void {
        this.users.clear();
    }

    private aliasTaken(alias: AnonAlias): boolean {
        for (const key of this.users.keys()) {
            if (this.users.get(key).getAlias() === alias) {
                return true;
            }
        }
        return false;
    }

    private randomFreeAlias(): AnonAlias {
        let alias: AnonAlias;
        if (this.users.size >= this.settingsN("maxID")) {
            alias = this.users.size + 1;
            console.log("WARNING: IDs should be reset");
        } else {
            alias = random(this.settingsN("maxID"));
            while (this.aliasTaken(alias)) {
                alias = (alias + 1) % this.settingsN("maxID")
            }
        }
        return alias;
    }

    private async initAnonUser(user: User) {
        const status: Blacklist | void = await this.blacklistStatus(user.id);
        if (status instanceof Blacklist) {
            if (status.end != null) {
                throw new Error("SAFE: You are timed out for " + formatInterval(Math.round(
                    timeDiff(status.end, new Date()) / 1000)))
            } else {
                throw new Error("SAFE: You are blacklisted")
            }
        }
        const disable = (await this.usettings.get(user.id, "anon.disablemessages")) === "true";
        this.users.set(user.id, new AnonUser(this, user, this.randomFreeAlias(), disable));
    }

    public async setDisableMessages(user: User, disabled: boolean): Promise<void> {
        (await this.getAnonUser(user)).disableMessages = disabled;
    }

    public async blacklistedBy(blacklistID: string): Promise<Snowflake | void> {
        const res = await Logs.findOne({
            where: {
                action: {
                    [Op.or]: [
                        "BLACKLIST",
                        "TIMEOUT"
                    ]
                },
                target: blacklistID
            },
            order: ["createdAt", "DESC"]
        });
        if (res == null) {
            return null;
        }
        return res.userID;
    }

    public async blacklistStatus(userID: Snowflake): Promise<Blacklist | void> {
        return Blacklist.findOne({
            where: {
                hashed: AnonModule.getHash(userID)
            }
        });
    }

    public async isBlacklisted(userID: Snowflake): Promise<boolean> {
        return (await this.blacklistStatus(userID)) != null;
    }

    private async blacklistIDExists(blacklistID: string): Promise<boolean> {
        const res: Blacklist | null = await Blacklist.findOne({
            where: {blacklistID}
        });
        return res != null;
    }

    private static getHash(ID: Snowflake) {
        return createHash('sha256').update(ID +
        `71a6152717d16d421e862dd923c9ba8f1d306f6c3ddd8f368abd40cef1b3ab1456e4f2965a5f3e08cc2d0f1b32c
        fcc3bff5667955f805feccada825e0c1352e071e3e63ce7e29c7b2e6b7e29c11fe5347ee7da69e0b7d38c57346c
        c8e47263502cfe33a7a60bc01410fd66ff4cd86931cd69b2002662ffd0e53cfadf903147c2`)
            .digest('base64');
    }

    private async blacklistUser(userID: Snowflake, end?: Date): Promise<string> {
        if (await this.isBlacklisted(userID)) {
            throw new Error("SAFE: Target is already blacklisted");
        }
        const blacklistID = generateUID();
        if (end != null) {
            await this.scheduler.schedule("anon", end, "ANON_TIMEOUT_END", blacklistID);
        }
        await Blacklist.create({
            blacklistID: blacklistID,
            hashed: AnonModule.getHash(userID),
            end: end
        });
        return blacklistID;
    }

    public async unblacklist(blacklistID: string, mod?: User) {
        if (!(await this.blacklistIDExists(blacklistID))) {
            throw new Error("SAFE: ID not found")
        }
        await Blacklist.destroy({
            where: {blacklistID}
        });
        if (mod != null) {
            await this.scheduler.deleteJobsByContent("ANON_TIMEOUT_END", blacklistID);
            await this.audit.unblacklist(mod, blacklistID);
        }
    }

    public newAlias(anonUser: AnonUser): void {
        anonUser.setAlias(this.randomFreeAlias());
        anonUser.setColor(randomColor());
    }

    public setAlias(anonUser: AnonUser, alias: AnonAlias): void {
        if (alias > this.settingsN("maxID") || alias < 0) {
            throw new Error("SAFE: ID out of bounds");
        }
        if (this.aliasTaken(alias)) {
            throw new Error("SAFE: This ID is taken");
        }
        anonUser.setAlias(alias);
        anonUser.setColor(randomColor());
    }

    public async doBlacklist(messageID: Snowflake, mod: User, timeoutDuration?: Duration):
        Promise<BlacklistResponse> {
        const record: Record | void = this.messageRecords.getRecordByID(messageID);
        const end = timeoutDuration == null ? null : dateAfter(timeoutDuration);
        if (record instanceof Record) {
            const blacklistID = await this.blacklistUser(record.userID, end);
            this.deleteAnonUserByID(record.userID);
            if (end != null) {
                await this.audit.timeout(mod, blacklistID, record, timeoutDuration)
            } else {
                await this.audit.blacklist(mod, blacklistID, record);
            }
            return {
                blacklistID: blacklistID,
                anonAlias: record.alias
            }
        } else {
            throw new Error("SAFE: Message not found")
        }
    }

    public async getAnonUser(user: User): Promise<AnonUser> {
        if (!this.users.has(user.id)) {
            await this.initAnonUser(user);
        }
        const anon = this.getAnonUserByID(user.id);
        if (anon instanceof AnonUser) {
            return anon;
        } else {
            // Should never happen
            throw new Error("User not found")
        }
    }

    // Deletes the anon user of the specified userID. Returns true if successful, false if the
    // anon user didn't exist in the first place.
    private deleteAnonUserByID(userID: Snowflake): boolean {
        return this.users.delete(userID);
    }

    public getAnonUserByID(userID: Snowflake): AnonUser | void {
        return this.users.get(userID);
    }

    public getAnonUserByAlias(alias: AnonAlias): AnonUser | void {
        for (const anonUser of this.users.values()) {
            if (anonUser.getAlias() === alias) {
                return anonUser;
            }
        }
        return null;
    }

    private updateStream(userID: Snowflake, message: Message, delta: MessageEmbed): void {
        if (message.channel.type === "text"
            && this.bot.isEnabled("stream")) {
            (this.bot.getModule("stream") as StreamModule).broadcast(
                message.channel as GuildChannel, delta,
                new Set<Snowflake>([userID]))
                .catch((err) => {
                    console.error("Broadcast anon message error: " + err.stack);
                })
        }
    }

    public onAnonMessage(anonUser: AnonUser, message: Message, delta: MessageEmbed) {
        this.messageRecords.addMessage(anonUser, message);
        this.updateStream(anonUser.user.id, message, delta);
    }

    public onAnonUpdate(lastRecord: Record, message: Message, delta: MessageEmbed) {
        lastRecord.setTime(message.createdAt);
        this.updateStream(lastRecord.userID, message, delta);
    }

    public getLastRecord(channel: Snowflake): Record | void {
        return this.messageRecords.getLastRecord(channel)
    }

    public async sendAnonMessage(targetOpt: string | TextChannel | AnonUser, message: Message,
                                 offset: number = 1) {
        let target: TextChannel | AnonUser;
        if (typeof targetOpt === "string") {
            target = this.bot.getChannelByName(targetOpt)
        } else {
            target = targetOpt;
        }
        const handler: CommandsModule = this.bot.getModule("commands") as CommandsModule;
        const content: string = offset === 0 ? message.content :
            handler.getRawContent(message.content, offset - 1);
        const cleaned: string = content.toLowerCase().replace(/[^a-z]/g, "");
        for (let i = 0; i < this.filter.length; i++) {
            const filtered = this.filter[i];
            if ((filtered.length <= 3
                && content.toLowerCase().includes(filtered))
                || (filtered.length > 3
                && cleaned.includes(filtered))) {
                throw new Error("Filtered words")
            }
        }
        return (await this.getAnonUser(message.author)).send(target, content)
    }

    public async acquireWebhook(channelID: Snowflake, user: AnonUser): Promise<Webhook> {
        return this.webhookHandler.acquireWebhook(channelID, user);
    }

    // Clear previously created Anon webhooks
    public async clearWebhooks(): Promise<void> {
        const webhooks = await this.guild.fetchWebhooks();
        let jobs = [];
        webhooks.forEach((webhook) => {
            if (this.webhookHandler.isAnonWebhook(webhook)) {
                jobs.push(webhook.delete());
            }
        });
        await Promise.all(jobs);
    }
}

export class AnonUser {
    readonly user: User;
    private anon: AnonModule;
    // public anonID: AnonID;
    public disableMessages: boolean;
    private lastIDChange: Date;
    private anonAlias: AnonAlias;
    private color: number;

    constructor(anon: AnonModule, user: User, anonAlias: AnonAlias, disableMessages: boolean) {
        this.anon = anon;
        this.user = user;
        this.anonAlias = anonAlias;
        this.disableMessages = disableMessages;
        // this.anonID = generateUID();
        this.color = randomColor();
    }

    public setColor(color: number): void {
        this.checkMuted();
        this.color = color;
    }

    public getAlias(): AnonAlias {
        return this.anonAlias;
    }

    public getColor(): number {
        return this.color;
    }

    public setAlias(alias: AnonAlias): void{
        this.checkMuted();
        const cooldown: number = this.anon.settingsN("cooldown");
        if (cooldown !== 0 && this.lastIDChange != null) {
            const diff: number = timeDiff(new Date(), this.lastIDChange) / 1000;
            if (diff < cooldown) {
                throw new Error("SAFE: Cooldown: You cannot set a new ID for another " +
                    formatInterval(cooldown - diff))
            }
        }
        this.anonAlias = alias;
        this.lastIDChange = new Date();
    }

    private buildMessage(title: string, content: string): MessageEmbed {
        return new MessageEmbed()
            .setTitle(title)
            .setDescription(content)
            .setColor(this.color)
    }

    private checkMuted() {
        if (this.anon.settingsHas("mutedRoles")) {
            this.anon.settingsArr("mutedRoles").forEach((roleID) => {
                if (this.anon.guild.member(this.user).roles.cache.has(roleID)) {
                    throw new Error("SAFE: You cannot use anon while muted");
                }
            });
        }
    }

    private async sendEmbed(channel: TextChannel | DMChannel, content: string) {
        let title: string = this.anonAlias.toString();
        if (channel instanceof DMChannel) {
            title += " (Private Message)";
        }
        const embed = this.buildMessage(title, content);
        const lastRecord: Record | void = this.anon.getLastRecord(channel.id);
        const res = await sendAndMerge(channel, embed,
            (lastMessage) => lastRecord instanceof Record
                && lastRecord.messageID === lastMessage.id
                && lastRecord.userID === this.user.id);
        if (lastRecord instanceof Record && res.merged) {
            this.anon.onAnonUpdate(lastRecord, res.message, embed);
        } else {
            this.anon.onAnonMessage(this, res.message, embed);
        }
    }

    public async send(target: TextChannel | AnonUser, content: string) {
        this.checkMuted();
        if (target instanceof AnonUser) {
            if (target.disableMessages) {
                return;
            }
            await this.sendEmbed(target.user.dmChannel || await target.user.createDM(), content);
        } else {
            await this.sendWebhook(target, content);
        }
    }

    public async sendWebhook(target: TextChannel, content: string) {
        await (await this.anon.acquireWebhook(target.id, this))
            .send(content, {disableMentions: "all"});
    }

    public static async createAvatar(color: number): Promise<string> {
        const canvas = createCanvas(128, 128);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = `#${color.toString(16)}`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(await loadImage("./user.svg"), 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL();
    }
}
