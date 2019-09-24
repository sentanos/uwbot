import {
    GuildMember,
    Message, PartialTextBasedChannelFields,
    MessageEmbed,
    Snowflake
} from "discord.js";
import {Module} from "../module";
import {Bot} from "../bot";
import {PersistentChannelList, PersistentChannelListConfig, timeDiff} from "../util";
import {Xp} from "../database/models/xp";
import {Sequelize, Op} from "sequelize";
import {XpLogs} from "../database/models/xpLogs";
import {Availability, Permission} from "./commands";
import {SettingsConfig} from "./settings.skip";

export type XP = number;

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
    decayXP: {
        description: "The XP removed if a user's XP decays",
        default: "6"
    },
    checkInterval: {
        description: "The number of seconds that determines how often decay is checked for all" +
            " users",
        default: "60"
    },
    rewardThreshold: {
        description: "The minimum XP required to earn the reward role",
        default: "168"
    },
    rollingRewardThreshold: {
        description: "The minimum rolling XP required to earn the reward role",
        default: "5"
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
            this.settingsN("decayInterval") * 1000);
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

    private async checkReward(user: Snowflake): Promise<boolean> {
        const xp: XP = await this.getXP(user);
        const rolling: XP = await this.getRollingXP(user);
        return xp >= this.settingsN("rewardThreshold") && rolling >
            this.settingsN("rollingRewardThreshold");
    }

    private async addReward(member: GuildMember): Promise<boolean> {
        if (member.roles.get(this.settings("reward")) == null) {
            await member.roles.add(this.settings("reward"));
            return true;
        }
        return false;
    }

    private async removeReward(member: GuildMember): Promise<boolean> {
        if (member.roles.get(this.settings("reward")) != null) {
            await member.roles.remove(this.settings("reward"));
            return true;
        }
        return false;
    }

    private async updateReward(user: Snowflake, notifyAdd?: PartialTextBasedChannelFields,
                               notifyRemove?: PartialTextBasedChannelFields):
        Promise<boolean> {
        let member: GuildMember;
        if (!this.bot.guild.members.has(user)) {
            return false;
        }
        member = this.bot.guild.members.get(user);
        if (await this.checkReward(user)) {
            if (await this.addReward(member) && notifyAdd != null) {
                await notifyAdd.send(new MessageEmbed()
                    .setDescription(member.user.toString() + " You are now a regular!")
                    .setColor(this.bot.displayColor()));
            }
        } else {
            if (await this.removeReward(member) && notifyRemove != null) {
                await notifyRemove.send(new MessageEmbed()
                    .setDescription("You lost regular in the UW discord due to inactivity")
                    .setColor(this.bot.displayColor()));
            }
        }
    }

    public async updateAll(): Promise<void> {
        const rewarded = await this.bot.guild.roles.get(this.settings("reward")).members.array();
        let jobs = [];
        for (let i = 0; i < rewarded.length; i++) {
            jobs.push((async () => {
                if (!(await this.checkReward(rewarded[i].id))) {
                    await this.removeReward(rewarded[i]);
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

    public async getXP(user: Snowflake): Promise<XP> {
        const res: Xp = await Xp.findByPk(user);
        if (res == null) {
            return 0;
        } else {
            return res.totalXp;
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

    private async addBlockXP(user: Snowflake, message?: Message) {
        const add = 1;
        let added = false;
        return this.DB.transaction((t) => {
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
                const newXp: XP = Math.max(0, xp - this.settingsN("decayXp"));
                const decay: XP = Math.max(xp * -1, this.settingsN("decayXp") * -1);
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
        await Promise.all(jobs);
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