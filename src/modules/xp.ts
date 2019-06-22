import {
    GuildMember,
    Message, PartialTextBasedChannelFields,
    RichEmbed,
    Snowflake,
    User
} from "discord.js";
import {Module} from "../module";
import {Bot} from "../bot";
import * as sqlite from "sqlite";
import {fromSQLiteDate, PersistentChannelList, timeDiff, toSQLiteDate} from "../util";

export type XP = number;

export class XPModule extends Module {
    // All time fields settings are in seconds

    public readonly exclude: PersistentChannelList;
    // The time interval until a block resets
    public blockInterval: number;
    // The maximum XP a single user can earn in a block
    // Must be greater than 1
    public blockMaximum: XP;
    // The time interval over which to calculate rolling XP
    public rollingInterval: number;
    // The time interval between decay checks
    public checkInterval: number;
    // The time interval between XP decays
    public decayInterval: number;
    // The number of XP decayed after every decayInterval
    public decayXp: number;
    // The minimum XP required for reward
    public rewardThreshold: XP;
    // The minimum rolling XP required for reward
    public rollingRewardThreshold: XP;
    // Reward role ID
    public reward: Snowflake;
    private readonly DB: sqlite.Database;

    constructor(bot: Bot) {
        super(bot, "xp");
        const config = this.bot.config.xp;
        this.DB = this.bot.DB;
        this.exclude = new PersistentChannelList(this.bot.DB, "xpExclude");
        this.blockInterval = config.blockInterval;
        this.blockMaximum = config.blockMaximum;
        this.checkInterval = config.checkInterval;
        this.rollingInterval = config.rollingInterval;
        this.decayInterval = config.decayInterval;
        this.decayXp = config.decayXp;
        this.rewardThreshold = config.rewardThreshold;
        this.rollingRewardThreshold = config.rollingRewardThreshold;
        this.reward = config.reward;
        this.bot.client.on("message", this.onMessage.bind(this));
        setInterval(this.checkDecay.bind(this), this.decayInterval * 1000);
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
        return xp >= this.rewardThreshold && rolling >= this.rollingRewardThreshold;
    }

    private async addReward(member: GuildMember): Promise<boolean> {
        if (member.roles.get(this.reward) == null) {
            await member.addRole(this.reward);
            return true;
        }
        return false;
    }

    private async removeReward(member: GuildMember): Promise<boolean> {
        if (member.roles.get(this.reward) != null) {
            await member.removeRole(this.reward);
            return true;
        }
        return false;
    }

    private async updateReward(user: Snowflake, notifyAdd?: PartialTextBasedChannelFields,
                               notifyRemove?: PartialTextBasedChannelFields):
        Promise<boolean> {
        let member: GuildMember;
        try {
            member = await this.bot.guild.fetchMember(user);
        } catch (e) {
            console.error("Error fetching member for " + user + " for reward update: " + e.stack);
            return false;
        }
        if (member == null) {
            return false;
        }
        if (await this.checkReward(user)) {
            if (await this.addReward(member) && notifyAdd != null) {
                await notifyAdd.send(new RichEmbed()
                    .setDescription(member.user.toString() + " You are now a regular!")
                    .setColor(this.bot.displayColor()));
            }
        } else {
            if (await this.removeReward(member) && notifyRemove != null) {
                await notifyRemove.send(new RichEmbed()
                    .setDescription("You lost regular in the UW discord due to inactivity")
                    .setColor(this.bot.displayColor()));
            }
        }
    }

    public async updateAll(): Promise<void> {
        const rewarded = await this.bot.guild.roles.get(this.reward).members.array();
        let jobs = [];
        for (let i = 0; i < rewarded.length; i++) {
            jobs.push((async () => {
                if (!(await this.checkReward(rewarded[i].id))) {
                    await this.removeReward(rewarded[i]);
                }
            })());
        }
        const maybeReward = await this.DB.all("SELECT userID from xp WHERE totalXp >= ?",
            this.rewardThreshold);
        for (let i = 0; i < maybeReward.length; i++) {
            jobs.push(this.updateReward(maybeReward[i].userID));
        }
        await Promise.all(jobs);
    }

    public async top(num: number, offset: number): Promise<{userID: Snowflake, totalXp: XP}[]> {
        return this.DB.all("SELECT userID, totalXp from xp ORDER BY totalXp DESC" +
            " LIMIT ? OFFSET ?", num, offset);
    }

    public async getXP(user: Snowflake): Promise<XP> {
        const res = await this.DB.get("SELECT totalXp from xp WHERE userID = ?", user);
        if (res == null) {
            return 0;
        } else {
            return res.totalXp;
        }
    }

    public async getRollingXP(user: Snowflake): Promise<XP> {
        const after: Date = new Date(new Date().getTime() - this.rollingInterval * 1000);
        const res = await this.DB.get("SELECT SUM(xp) as sum FROM xpHistory WHERE userID = ? AND" +
            " addTime > ?", user, toSQLiteDate(after));
        if (res.sum == null) {
            return 0;
        }
        return res.sum;
    }

    private async addBlockXP(user: Snowflake, message?: Message): Promise<void> {
        await this.bot.transactionLock.acquire();
        await this.DB.exec("BEGIN TRANSACTION");
        try {
            const add = 1;
            let addJob: Promise<any>;
            const res = await this.DB.get("SELECT totalXp, lastBlock, blockXp FROM xp WHERE userID =" +
                " ?", user);
            const newBlock: boolean = res != null && timeDiff(new Date(),
                fromSQLiteDate(res.lastBlock)) > this.blockInterval * 1000;
            const unfinishedBlock: boolean = res != null && res.blockXp < this.blockMaximum;
            if (res == null || newBlock || unfinishedBlock) {
                if (res == null) {
                    addJob = this.DB.run("INSERT INTO xp(userID, totalXp, lastBlock, blockXp," +
                        " lastMessage) VALUES(?, ?, ?, ?, ?)", user, add, toSQLiteDate(new Date()),
                        add, toSQLiteDate(new Date()));
                } else if (newBlock) {
                    addJob = this.DB.run("UPDATE xp SET totalXp = ?, lastBlock = ?, blockXp = ?," +
                        " lastMessage = ? WHERE userID = ?", res.totalXp + add,
                        toSQLiteDate(new Date()), add, toSQLiteDate(new Date()), user)
                } else if (unfinishedBlock) {
                    addJob = this.DB.run("UPDATE xp SET totalXp = ?, blockXp = ?, lastMessage =" +
                        " ? WHERE userID = ?", res.totalXp + add, res.blockXp + add,
                        toSQLiteDate(new Date()), user)
                }
                const addHistoryJob = this.DB.run(
                    "INSERT INTO xpHistory(userID, xp) VALUES(?, ?)", user, add);
                await Promise.all([addJob, addHistoryJob]);
            } else {
                await this.DB.run("UPDATE xp SET lastMessage = ? WHERE userID = ?",
                    toSQLiteDate(new Date()), user);
            }
            await this.DB.exec("COMMIT TRANSACTION");
        } catch (err) {
            console.error("Error adding XP for user " + user + ": " + err.stack);
            await this.DB.exec("ROLLBACK TRANSACTION");
        }
        await this.bot.transactionLock.release();
        await this.updateReward(user, message.channel);
    }

    private async checkDecay(): Promise<void> {
        await this.bot.transactionLock.acquire();
        await this.DB.exec("BEGIN TRANSACTION");
        let rewardCheckUsers = [];
        let rewardChecks = [];
        try {
            const rows = await this.DB.all("SELECT userID, totalXp from xp WHERE" +
                " julianday(datetime('now')) - julianday(lastMessage) > ? AND" +
                " julianday(datetime('now')) - julianday(lastDecay) > ?",
                this.decayInterval / 86400, this.decayInterval / 86400);
            let jobs = [];
            for (let i = 0; i < rows.length; i++) {
                const user = rows[i].userID;
                const xp = rows[i].totalXp;
                if (xp > 0) {
                    const newXp: XP = Math.max(0, xp - this.decayXp);
                    const decay: XP = Math.max(xp * -1, this.decayXp * -1);
                    jobs.push(this.DB.run("UPDATE xp SET totalXp = ?, lastDecay = ? WHERE userID" +
                        " = ?", newXp, toSQLiteDate(new Date()), user));
                    jobs.push(this.DB.run("INSERT INTO xpHistory(userID, xp) VALUES(?, ?)", user,
                        decay));
                    rewardCheckUsers.push(user);
                }
            }
            await Promise.all(jobs);
            await this.DB.exec("COMMIT TRANSACTION");
        } catch (err) {
            console.error("Error running XP decay: " + err.stack);
            await this.DB.exec("ROLLBACK TRANSACTION");
        }
        await this.bot.transactionLock.release();
        if (rewardCheckUsers.length > 0) {
            for (let i = 0; i < rewardCheckUsers.length; i++) {
                const userID: Snowflake = rewardCheckUsers[i];
                let user: User;
                try {
                    user = await this.bot.client.fetchUser(userID);
                    rewardChecks.push(this.updateReward(userID, null, user));
                } catch (err) {
                    console.error("Update for user " + userID + " for decay failed: " + err.stack);
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