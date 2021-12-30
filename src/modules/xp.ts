import {
    GuildMember,
    Message,
    MessageEmbed,
    PartialTextBasedChannelFields,
    Snowflake
} from "discord.js";
import {Module} from "../module";
import {Bot} from "../bot";
import {
    formatDate,
    PersistentChannelList,
    PersistentChannelListConfig,
    timeDiff
} from "../util";
import {Xp} from "../database/models/xp";
import {FindOptions, Op, Sequelize, Transaction} from "sequelize";
import {XpLogs} from "../database/models/xpLogs";
import {Availability, Permission} from "./commands";
import {SettingsConfig} from "./settings.skip";
import {compile} from "vega-lite";
import {loader, parse, View, Warn} from "vega";
import {Stream} from "stream";
import {Canvas} from "canvas";

const XPGraphTemplate = require("../templates/xptime.json");

export type XP = number;

type RawXPHistoryRecord = {
    date: string,
    sum: number
}

type XPHistoryRecord = {
    date: Date,
    sum: number
};

const settingsConfig: SettingsConfig = {
    blockInterval: {
        description: "The number of seconds a single XP block lasts",
        default: "300"
    },
    blockMaximum: {
        description: "The maximum XP that can be earned in a single XP block",
        default: "1"
    },
    rollingInterval: {
        description: "The number of seconds in a rolling interval, which determines the rolling" +
            " XP by including XP earned in the past rolling interval",
        default: "604800"
    },
    decayInterval: {
        description: "The number of seconds where if a user does not send a message their XP" +
            " decays",
        default: "86400"
    },
    rewardInterval: {
        description: "The minimum number of seconds between gaining and losing the reward role," +
            " including between the user's first message and when they can gain the reward role",
        default: "604800"
    },
    decayXP: {
        description: "The XP removed if a user's XP decays",
        default: "6"
    },
    checkInterval: {
        description: "The number of seconds that determines how often decay is checked for all" +
            " users",
        default: "60"
    },
    upperRewardThreshold: {
        description: "The minimum XP required to earn the reward role",
        default: "198"
    },
    lowerRewardThreshold: {
        description: "The minimum XP required to keep the reward role",
        default: "168"
    },
    upperRollingRewardThreshold: {
        description: "The minimum rolling XP required to earn the reward role",
        default: "15"
    },
    lowerRollingRewardThreshold: {
        description: "The minimum rolling XP required to keep the reward role",
        default: "8"
    },
    reward: {
        description: "The reward role ID"
    }
};

const commandConfig: PersistentChannelListConfig = {
    listName: "XP Disabled Channels",
    parentModule: "xp",
    get: {
        command: "xp exclude get",
        usage: "Get channels with XP disabled",
        permission: Permission.VerifiedGuildMember,
        availability: Availability.WhitelistedGuildChannelsOnly
    },
    add: {
        command: "xp exclude add",
        usage: "Disable XP earning in a channel",
        permission: Permission.UserKick,
        availability: Availability.WhitelistedGuildChannelsOnly
    },
    remove: {
        command: "xp exclude remove",
        usage: "Enable XP earning in a channel where earning was previous disabled",
        permission: Permission.UserKick,
        availability: Availability.WhitelistedGuildChannelsOnly
    }
};

export class XPModule extends Module {
    public readonly exclude: PersistentChannelList;
    private readonly DB: Sequelize;

    constructor(bot: Bot) {
        super(bot, "xp", null, settingsConfig);
        this.DB = this.bot.DB;
        this.exclude = new PersistentChannelList(this.bot, "xpExclude");
        this.exclude.addCommands(commandConfig);
    }

    public async initialize() {
        await this.exclude.initialize();
        this.listen("message", this.onMessage.bind(this));
        this.interval(this.checkDecay.bind(this),
            this.settingsN("checkInterval") * 1000);
    }

    public static levelFromXp(xp: XP): number {
        return Math.floor(0.85519 * Math.sqrt(xp)) + 1;
    }

    public static xpFromLevel(level: number): XP {
        return Math.ceil(Math.pow((level - 1) / 0.85519, 2))
    }

    public static levelSummary(xp: number): string {
        const level: number = XPModule.levelFromXp(xp);
        const nextLevel: number = XPModule.xpFromLevel(level + 1) - XPModule.xpFromLevel(level);
        const progress: XP = xp - XPModule.xpFromLevel(level);
        return "Level " + level + " (" + progress + "/" + nextLevel + ")";
    }

    private async checkReward(member: GuildMember): Promise<boolean> {
        const xp: XP = await this.getXP(member.id);
        const rolling: XP = await this.getRollingXP(member.id);
        const isRegular: boolean = (await member.roles.cache.get(this.settings("reward"))) != null;
        if (isRegular) {
            return (xp >= this.settingsN("lowerRewardThreshold") &&
                rolling >= this.settingsN("lowerRollingRewardThreshold"));
        } else {
            return xp >= this.settingsN("upperRewardThreshold") &&
                rolling >= this.settingsN("upperRollingRewardThreshold");
        }
    }

    private async updateRewardTime(user: Snowflake): Promise<void> {
        await Xp.update({
            lastReward: new Date()
        }, {
            where: {
                userID: user
            }
        });
    }

    private async addReward(member: GuildMember): Promise<boolean> {
        if (member.roles.cache.get(this.settings("reward")) == null) {
            await member.roles.add(this.settings("reward"));
            await this.updateRewardTime(member.id);
            return true;
        }
        return false;
    }

    private async removeReward(member: GuildMember): Promise<boolean> {
        if (member.roles.cache.get(this.settings("reward")) != null) {
            await member.roles.remove(this.settings("reward"));
            await this.updateRewardTime(member.id);
            return true;
        }
        return false;
    }

    private async updateReward(user: Snowflake, notifyAdd?: PartialTextBasedChannelFields,
                               notifyRemove?: PartialTextBasedChannelFields):
        Promise<boolean> {
        let member: GuildMember;
        if (!this.bot.guild.members.cache.has(user)) {
            return false;
        }
        member = this.bot.guild.members.cache.get(user);
        const lastReward: Date = await this.getLastRewardTime(member.id);
        const hasReward: boolean = await this.checkReward(member);
        const canUpdateReward: boolean = timeDiff(new Date(), lastReward) >
            this.settingsN("rewardInterval") * 1000;
        if (hasReward && canUpdateReward) {
            if (await this.addReward(member) && notifyAdd != null) {
                await notifyAdd.send({embeds: [new MessageEmbed()
                    .setDescription(member.user.toString() + " You are now a regular!")
                    .setColor(this.bot.displayColor())
                ]});
            }
        } else if (!hasReward && canUpdateReward) {
            if (await this.removeReward(member) && notifyRemove != null) {
                await notifyRemove.send({embeds: [new MessageEmbed()
                    .setDescription("You lost regular in the UW discord due to inactivity")
                    .setColor(this.bot.displayColor())
                ]});
            }
        }
    }

    // Note: Ignores lastReward when removing
    public async updateAll(): Promise<void> {
        const rewarded = await this.bot.guild.roles.cache.get(this.settings("reward")).members.values();
        let jobs = [];
        for (const member of rewarded) {
            jobs.push((async () => {
                if (!(await this.checkReward(member))) {
                    await this.removeReward(member);
                }
            })());
        }
        const maybeReward = await Xp.findAll({
            where: {
                totalXp: {
                    [Op.gte]: this.settingsN("rewardThreshold")
                }
            }
        });
        for (let i = 0; i < maybeReward.length; i++) {
            jobs.push(this.updateReward(maybeReward[i].userID));
        }
        await Promise.all(jobs);
    }

    public async top(num: number, offset: number): Promise<{userID: Snowflake, totalXp: XP}[]> {
        return Xp.findAll({
            order: [["totalXp", "DESC"]],
            limit: num,
            offset: offset
        });
    }

    // Gets raw XP history from the database. Has gaps where no messages were sent.
    private async getRawHistory(userID: Snowflake, from?: Date, to?: Date): Promise<RawXPHistoryRecord[]> {
        let opt: FindOptions = {
            attributes: [[Sequelize.fn("strftime", "%Y-%m-%d", Sequelize.col("createdAt")), "date"],
                [Sequelize.fn("sum", Sequelize.col("xp")), "sum"]],
            group: ["date"],
            where: {
                userID: userID
            },
            order: Sequelize.literal("date ASC"),
            raw: true
        };
        if (from != null && to != null) {
            opt.where['createdAt'] = {
                [Op.and]: {
                    [Op.gte]: from,
                    [Op.lte]: to
                }
            }
        } else if (from != null) {
            opt.where['createdAt'] = {
                [Op.gte]: from
            }
        } else if (to != null) {
            opt.where['createdAt'] = {
                [Op.lte]: to
            }
        }
        return await XpLogs.findAll(opt) as unknown as RawXPHistoryRecord[];
    }

    // Return XP history with date gaps filled in
    private processHistory(values: RawXPHistoryRecord[], from: Date, to: Date): XPHistoryRecord[] {
        const data: XPHistoryRecord[] = [];

        let end = to;
        let i = 0;
        let current: Date = values.length > 0 ? new Date(values[0].date) : null;
        for (let d = new Date(from); d <= end; d.setDate(d.getDate() + 1)) {
            if (current != null
                && d.getFullYear() === current.getFullYear()
                && d.getMonth() === current.getMonth()
                && d.getDate() === current.getDate()) {
                data.push({
                    date: current,
                    sum: values[i].sum
                });
                i++;
                if (i < values.length) {
                    current = new Date(values[i].date);
                } else {
                    current = null;
                }
            } else {
                data.push({
                    date: new Date(d),
                    sum: 0
                });
            }
        }

        return data;
    }

    public async getHistory(userID: Snowflake, from?: Date, to?: Date): Promise<XPHistoryRecord[]> {
        const values = await this.getRawHistory(userID, from, to);

        let start: Date;
        let end: Date;

        if (values.length > 0) {
            start = new Date(values[0].date);
        } else if (from != null) {
            start = from
        } else {
            start = new Date();
        }

        if (to != null) {
            end = to;
        } else if (values.length > 0) {
            end = new Date(values[values.length - 1].date);
        } else {
            end = new Date();
        }

        return this.processHistory(values, start, end);
    }

    public async generateHistoryCsv(userID: Snowflake, from?: Date, to?: Date) : Promise<Buffer> {
        let csv = "date,xp";
        const values = await this.getHistory(userID, from, to);
        for (const value of values) {
            csv += `\n${formatDate(value.date)},${value.sum}`;
        }
        return Buffer.from(csv, "utf-8");
    }

    public async generateHistoryGraph(userID: Snowflake, from?: Date, to?: Date): Promise<Stream> {
        let template = XPGraphTemplate;

        const values = await this.getHistory(userID, from, to);
        template.data = { values };
        const res = compile(template);

        return ((await new View(parse(res.spec), {
            loader: loader(),
            logLevel: Warn,
            renderer: 'none'
        })
        .initialize()
        .toCanvas()) as unknown as Canvas).createPNGStream();
    }

    public async getXP(user: Snowflake): Promise<XP> {
        const res: Xp = await Xp.findByPk(user);
        if (res == null) {
            return 0;
        } else {
            return res.totalXp;
        }
    }

    private async getLastRewardTime(user: Snowflake): Promise<Date> {
        const res: Xp = await Xp.findByPk(user);
        if (res == null) {
            return new Date();
        } else {
            return res.lastReward;
        }
    }

    public async getRollingXP(user: Snowflake): Promise<XP> {
        const after: Date = new Date(new Date().getTime() - this.settingsN("rollingInterval") * 1000);
        const res: number = await XpLogs.sum("xp", {
            where: {
                [Op.and]: {
                    userID: user,
                    createdAt: {
                        [Op.gt]: after
                    }
                }
            }
        });
        if (isNaN(res)) {
            return 0;
        }
        return res;
    }

    private async addBlockXP(user: Snowflake, message?: Message): Promise<boolean | void> {
        const add = 1;
        let added = false;
        return this.DB.transaction({type: Transaction.TYPES.IMMEDIATE}, (t) => {
            return Xp.findByPk(user, {transaction: t}).then((userXp) => {
                if (userXp == null) {
                    added = true;
                    return Xp.create({
                        userID: user,
                        totalXp: add,
                        lastBlock: new Date(),
                        blockXp: add,
                        lastMessage: new Date()
                    }, {transaction: t});
                } else {
                    const newBlock: boolean = timeDiff(new Date(), userXp.lastBlock) >
                        this.settingsN("blockInterval") * 1000;
                    const unfinishedBlock: boolean = userXp.blockXp < this.settingsN("blockMaximum");
                    if (newBlock || unfinishedBlock) {
                        userXp.totalXp += add;
                        userXp.blockXp += add;
                        added = true;
                    }
                    if (newBlock) {
                        userXp.lastBlock = new Date();
                    }
                    userXp.lastMessage = new Date();
                    return userXp.save({transaction: t});
                }
            });
        }).then(async () => {
            if (added) {
                await XpLogs.create({
                    userID: user,
                    xp: add
                });
            }
            return this.updateReward(user, message.channel);
        }).catch((err) => {
            console.error(`Block XP failed for user ${user}: ${err.stack}`);
        });
    }

    private async checkDecay(): Promise<void> {
        let rewardCheckUsers = [];
        let rewardChecks = [];
        const interval = this.settingsN("decayInterval") / 86400;
        const userXps: Xp[] = await Xp.findAll({
            where: Sequelize.and(
                Sequelize.where(Sequelize.literal("julianday(datetime('now')) -" +
                    " julianday(lastMessage)"), ">", Sequelize.literal(interval.toString())),
                Sequelize.where(Sequelize.literal("julianday(datetime('now')) -" +
                    " julianday(lastDecay)"), ">", Sequelize.literal(interval.toString()))
            )
        });
        let jobs = [];
        for (let i = 0; i < userXps.length; i++) {
            const userXp: Xp = userXps[i];
            const xp: XP = userXp.totalXp;
            if (xp > 0) {
                const newXp: XP = Math.max(0, xp - this.settingsN("decayXP"));
                const decay: XP = Math.max(xp * -1, this.settingsN("decayXP") * -1);
                jobs.push(userXp.update({
                    totalXp: newXp,
                    lastDecay: new Date()
                }));
                jobs.push(XpLogs.create({
                    userID: userXp.userID,
                    xp: decay
                }));
                rewardCheckUsers.push(userXp.userID);
            }
        }
        await Promise.all(jobs)
            .catch((err) => {
                console.error(`Decay error: ${err.stack}`);
            });
        if (rewardCheckUsers.length > 0) {
            for (let i = 0; i < rewardCheckUsers.length; i++) {
                const userID: Snowflake = rewardCheckUsers[i];
                try {
                    let user = await this.bot.client.users.fetch(userID);
                    rewardChecks.push(this.updateReward(userID, null, user));
                } catch (err) {
                    if (err.message !== "Unknown User") {
                        throw err;
                    }
                }
            }
            await Promise.all(rewardChecks);
        }
    }

    public async onMessage(message: Message) {
        if (message.author.bot) {
            return
        }
        if (!message.guild || message.guild.id !== this.bot.guild.id) {
            return
        }
        if (await this.exclude.has(message.channel.id)) {
            return
        }
        await this.addBlockXP(message.author.id, message);
    }
}