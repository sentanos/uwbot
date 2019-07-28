import {
    Snowflake,
    User,
    Guild,
    Message,
    MessageEmbed,
    TextChannel,
    DMChannel
} from "discord.js"
import {createHash} from "crypto";
import {generateUID, random, randomColor, Queue} from "../util";
import {Module} from "../module";
import {Bot} from "../bot";
import {CommandsModule} from "./commands";
import {AuditModule} from "./audit";
import {Blacklist} from "../database/models/blacklist";

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
export type AnonID = string;
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

export class AnonModule extends Module {
    private users: Map<Snowflake, AnonUser>;
    public readonly guild: Guild;
    private readonly filter: string[];
    // Map of user IDs to message IDs
    private messageRecords: MessageRecords;
    private readonly maxID: number;
    private audit: AuditModule;

    // TODO: LOG IN AUDIT!

    constructor(bot: Bot) {
        super(bot, "anon", ["audit"]);
        this.guild = this.bot.guild;
        this.maxID = this.bot.config.anon.maxID;
        this.filter = this.bot.filter;
        this.users = new Map<Snowflake, AnonUser>();
        this.messageRecords = new MessageRecords(this.bot.config.anon.maxInactiveRecords,
            this.bot.config.anon.lifetime);
    }

    public async initialize() {
        this.audit = this.bot.getModule("audit") as AuditModule;
        await this.bot.getChannelByName("anonymous").send("I was restarted due to updates so IDs" +
            " have been reset");
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
        if (this.users.size >= this.maxID) {
            alias = this.users.size + 1;
            console.log("WARNING: IDs should be reset");
        } else {
            alias = random(this.maxID);
            while (this.aliasTaken(alias)) {
                alias = (alias + 1) % this.maxID
            }
        }
        return alias;
    }

    private async initAnonUser(user: User) {
        if (await this.isBlacklisted(user.id)) {
            throw new Error("SAFE: You are blacklisted")
        }
        this.users.set(user.id, new AnonUser(this, user, this.randomFreeAlias()));
    }

    // public async blacklistedBy(blacklistID: string): Promise<Snowflake | void> {
    //     const res = await this.DB.get("SELECT userID FROM logs WHERE modAction = 'blacklist' AND" +
    //         " target = ? ORDER BY actionTime DESC LIMIT 1", blacklistID);
    //     if (res == null) {
    //         return null;
    //     }
    //     return res.userID;
    // }

    public async isBlacklisted(userID: Snowflake): Promise<boolean> {
        const res: Blacklist | null = await Blacklist.findOne({
            where: {
                hashed: AnonModule.getHash(userID)
            }
        });
        return res != null;
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

    private async blacklistUser(userID: Snowflake): Promise<string> {
        if (await this.isBlacklisted(userID)) {
            throw new Error("SAFE: Target is already blacklisted");
        }
        const blacklistID = generateUID();
        await Blacklist.create({
            blacklistID: blacklistID,
            hashed: AnonModule.getHash(userID)
        });
        return blacklistID;
    }

    public async unblacklist(blacklistID: string, mod: User) {
        if (!(await this.blacklistIDExists(blacklistID))) {
            throw new Error("SAFE: ID not found")
        }
        await Blacklist.destroy({
            where: {blacklistID}
        });
        await this.audit.unblacklist(mod, blacklistID);
    }

    public newAlias(anonUser: AnonUser): void {
        anonUser.setAlias(this.randomFreeAlias());
        anonUser.setColor(randomColor());
    }

    public setAlias(anonUser: AnonUser, alias: AnonAlias): void {
        if (alias > this.maxID || alias < 0) {
            throw new Error("SAFE: ID out of bounds");
        }
        if (this.aliasTaken(alias)) {
            throw new Error("SAFE: This ID is taken");
        }
        anonUser.setAlias(alias);
        anonUser.setColor(randomColor());
    }

    public async doBlacklist(messageID: Snowflake, mod: User): Promise<BlacklistResponse> {
        const record: Record | void = this.messageRecords.getRecordByID(messageID);
        if (record instanceof Record) {
            const blacklistID = await this.blacklistUser(record.userID);
            this.deleteAnonUserByID(record.userID);
            await this.audit.blacklist(mod, blacklistID, record);
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

    public onAnonMessage(anonUser: AnonUser, message: Message) {
        this.messageRecords.addMessage(anonUser, message)
    }

    public static onAnonUpdate(lastRecord: Record, message: Message) {
        lastRecord.setTime(message.createdAt);
    }

    public getLastRecord(channel: Snowflake): Record | void {
        return this.messageRecords.getLastRecord(channel)
    }

    public async sendAnonMessage(channelOpt: string | TextChannel | DMChannel, message: Message,
                                 offset: number = 0) {
        let channel: TextChannel | DMChannel;
        if (typeof channelOpt === "string") {
            channel = this.bot.getChannelByName(channelOpt)
        } else {
            channel = channelOpt;
        }
        const handler: CommandsModule = this.bot.getModule("commands") as CommandsModule;
        const content: string = handler.getRawContent(message.content, offset);
        const cleaned: string = content.toLowerCase().replace(/[^a-z]/g, "");
        for (let i = 0; i < this.filter.length; i++) {
            if (cleaned.includes(this.filter[i])) {
                throw new Error("Filtered words")
            }
        }
        return (await this.getAnonUser(message.author)).send(
            channel, content)
    }
}

export class AnonUser {
    readonly user: User;
    private anon: AnonModule;
    // public anonID: AnonID;
    private anonAlias: AnonAlias;
    private color: number;

    constructor(anon: AnonModule, user: User, anonAlias: AnonAlias) {
        this.anon = anon;
        this.user = user;
        this.anonAlias = anonAlias;
        // this.anonID = generateUID();
        this.color = randomColor();
    }

    public setColor(color: number): void {
        this.color = color;
    }

    public getAlias(): AnonAlias {
        return this.anonAlias;
    }

    public setAlias(alias: AnonAlias): void{
        this.anonAlias = alias;
    }

    private buildMessage(content: string, prevContent?: string): MessageEmbed {
        if (prevContent != null) {
            content = prevContent + "\n" + content;
        }
        return new MessageEmbed()
            .setTitle(this.anonAlias)
            .setDescription(content)
            .setColor(this.color)
            // .setFooter(this.anonID)
    }

    public async send(channel: TextChannel | DMChannel, content: string) {
        const lastMessage: Message = (await channel.messages.fetch({limit: 1})).first();
        const lastRecord: Record | void = this.anon.getLastRecord(lastMessage.channel.id);
        if (lastRecord instanceof Record
            && lastRecord.messageID === lastMessage.id
            && lastRecord.userID === this.user.id
            && lastMessage.embeds[0].title === this.getAlias().toString()
            && lastMessage.embeds[0].color === this.color) {
            const message = await lastMessage.edit(this.buildMessage(content, lastMessage.embeds[0].description));
            AnonModule.onAnonUpdate(lastRecord, message);
            return
        }
        const message = await channel.send(this.buildMessage(content)) as Message;
        this.anon.onAnonMessage(this, message);
    }
}
