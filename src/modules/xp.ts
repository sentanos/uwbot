import {Message, Snowflake} from "discord.js";
import {Module} from "../module";
import {Bot} from "../bot";
import * as sqlite from "sqlite";
import {PersistentChannelList} from "../util";

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
    private cache: Map<Snowflake, XP>;
    private lastBlock: Date;
    private readonly DB: sqlite.Database;

    constructor(bot: Bot) {
        super(bot, "xp");
        const config = this.bot.config.xp;
        this.DB = this.bot.DB;
        this.exclude = new PersistentChannelList(this.bot.DB, "xpExclude");
        this.blockInterval = config.blockInterval;
        this.blockMaximum = config.blockMaximum;
        this.rollingInterval = config.rollingInterval;
        this.resetBlock();
        setInterval(this.upload.bind(this), this.blockInterval * 1000);
        this.bot.client.on("message", this.onMessage.bind(this));
    }

    private resetBlock(): void {
        this.lastBlock = new Date();
        this.cache = new Map<Snowflake, XP>();
    }

    private async checkReward(user: Snowflake): Promise<void> {
        // TODO
    }

    public async top(num: number): Promise<{userID: Snowflake, totalXp: XP}[]> {
        return this.DB.all("SELECT userID, totalXp from xp ORDER BY totalXp DESC" +
            " LIMIT ?", num);
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
            " addTime > ?", user, after.toISOString().replace("T", " ").replace("Z",""));
        if (res.sum == null) {
            return 0;
        }
        return res.sum;
    }

    private async upload(): Promise<void> {
        const cache = new Map(this.cache);
        this.resetBlock();
        let jobs: Promise<void>[] = [];
        for (const [user, add] of cache.entries()) {
            jobs.push((async () => {
                let currentTotal: XP;
                let addHistoryJob = this.DB.run(
                    "INSERT INTO xpHistory(userID, xp) VALUES(?, ?)", user, add);
                let addJob: Promise<any>;
                const res = await this.DB.get("SELECT totalXp FROM xp WHERE userID = ?", user);
                if (res == null) {
                    addJob = this.DB.run("INSERT INTO xp(userID, totalXp) VALUES(?, ?)", user, add);
                } else {
                    currentTotal = res.totalXp;
                    addJob = this.DB.run("UPDATE xp SET totalXp = ? WHERE userID = ?",
                        currentTotal + add, user)
                }
                await Promise.all([addJob, addHistoryJob]);
            })());
        }
        await Promise.all(jobs);
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
        if (!this.cache.has(message.author.id)) {
            this.cache.set(message.author.id, 1);
        } else {
            const current: XP = this.cache.get(message.author.id);
            if (current < this.blockMaximum) {
                this.cache.set(message.author.id, current + 1);
            }
        }
    }
}