import {Message, Snowflake} from "discord.js";
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
    private readonly DB: sqlite.Database;

    constructor(bot: Bot) {
        super(bot, "xp");
        const config = this.bot.config.xp;
        this.DB = this.bot.DB;
        this.exclude = new PersistentChannelList(this.bot.DB, "xpExclude");
        this.blockInterval = config.blockInterval;
        this.blockMaximum = config.blockMaximum;
        this.rollingInterval = config.rollingInterval;
        this.bot.client.on("message", this.onMessage.bind(this));
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

    private async checkReward(user: Snowflake): Promise<void> {
        // TODO
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

    private async addBlockXP(user: Snowflake): Promise<void> {
        await this.DB.exec("BEGIN TRANSACTION");
        try {
            const add = 1;
            let addJob: Promise<any>;
            const res = await this.DB.get("SELECT totalXp, lastBlock, blockXp FROM xp WHERE userID =" +
                " ?", user);
            const newBlock: boolean = timeDiff(new Date(), fromSQLiteDate(res.lastBlock)) >
                this.blockInterval * 1000;
            const unfinishedBlock: boolean = res.blockXp < this.blockMaximum;
            if (res == null || newBlock || unfinishedBlock) {
                if (res == null) {
                    addJob = this.DB.run("INSERT INTO xp(userID, totalXp, lastBlock, blockXp) VALUES(?," +
                        " ?, ?, ?)", user, add, toSQLiteDate(new Date()), add);
                } else if (newBlock) {
                    addJob = this.DB.run("UPDATE xp SET totalXp = ?, lastBlock = ?, blockXp = ? WHERE" +
                        " userID = ?", res.totalXp + add, toSQLiteDate(new Date()), add, user)
                } else if (unfinishedBlock) {
                    addJob = this.DB.run("UPDATE xp SET totalXp = ?, blockXp = ? WHERE userID = ?",
                        res.totalXp + add, res.blockXp + add, user)
                }
                const addHistoryJob = this.DB.run(
                    "INSERT INTO xpHistory(userID, xp) VALUES(?, ?)", user, add);
                await Promise.all([addJob, addHistoryJob]);
            }
            await this.DB.exec("COMMIT TRANSACTION");
        } catch (err) {
            console.error("Error adding XP for user " + user + ": " + err.stack);
            await this.DB.exec("ROLLBACK TRANSACTION");
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
        await this.addBlockXP(message.author.id);
    }
}