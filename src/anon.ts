import {
    Snowflake,
    User,
    Guild,
    TextChannel,
    Message,
    RichEmbed,
    TextBasedChannelFields, PartialTextBasedChannelFields
} from "discord.js"
import {createHash} from "crypto";
import * as sqlite from "sqlite";
import {generateUID, random, randomColor} from "./util";
import Queue from "./queue";

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
    readonly maxInactiveRecords: number;
    readonly lifetime: number;

    constructor(maxInactiveRecords: number, lifetime: number) {
        this.maxInactiveRecords = maxInactiveRecords;
        this.lifetime = lifetime;
        this.records = new Queue<Record>();
    }

    private prune(): void {
        while(this.records.size() > this.maxInactiveRecords
              && this.records.peek() instanceof Record
              && (this.records.peek() as Record).expired()) {
            this.records.dequeue();
        }
    }

    public addMessage(anonUser: AnonUser, message: Message): void {
        const record = new Record(anonUser.user.id, message.id, anonUser.getAlias(),
            message.createdAt, this.lifetime);
        this.records.enqueue(record);
        this.prune();
    }

    public getRecordByID(messageID: Snowflake): Record | void {
        const records = this.records.toArray();
        return records.find((record) => {
            return record.messageID == messageID;
        });
    }

    public front(): Record | void {
        return this.records.front();
    }
}


export class Record {
    readonly userID: Snowflake;
    private time: Date;
    readonly messageID: Snowflake;
    readonly alias: AnonAlias;
    // Number of seconds after time until record expires.
    readonly lifetime: number;

    constructor(userID: Snowflake, messageID: Snowflake, alias: AnonAlias, time: Date,
                lifetime: number) {
        this.userID = userID;
        this.messageID = messageID;
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

export class Anon {
    private users: Map<Snowflake, AnonUser>;
    readonly guild: Guild;
    // Map of user IDs to message IDs
    private messageRecords: MessageRecords;
    readonly maxID: number;
    private readonly DB: sqlite.Database;

    constructor(DB: sqlite.Database, guild: Guild, maxID: number, maxInactiveRecords: number, lifetime: number) {
        this.DB = DB;
        this.guild = guild;
        this.users = new Map<Snowflake, AnonUser>();
        this.maxID = maxID;
        this.messageRecords = new MessageRecords(maxInactiveRecords, lifetime);
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
        if (this.users.size > this.maxID) {
            alias = this.users.size + 1;
            console.log("WARNING: IDs should be reset");
        } else {
            alias = random(this.maxID);
            while (this.aliasTaken(alias)) {
                alias = random(this.maxID);
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

    public async blacklistedBy(blacklistID: string): Promise<Snowflake | void> {
        const res = await this.DB.get("SELECT userID FROM logs WHERE modAction = 'blacklist' AND" +
            " target = ? ORDER BY actionTime DESC LIMIT 1", blacklistID);
        if (res == null) {
            return null;
        }
        return res.userID;
    }

    public async isBlacklisted(userID: Snowflake): Promise<boolean> {
        const res = await this.DB.get("SELECT 1 AS exist FROM blacklist WHERE hashed = ?",
            Anon.getHash(userID));
        return res != null && res.exist === 1;
    }

    private async blacklistIDExists(blacklistID: string): Promise<boolean> {
        const res = await this.DB.get("SELECT 1 AS exist FROM blacklist WHERE blacklistID" +
            " = ?", blacklistID);
        return res != null && res.exist === 1;
    }

    private static getHash(ID: Snowflake) {
        return createHash('sha256').update(ID +
        `71a6152717d16d421e862dd923c9ba8f1d306f6c3ddd8f368abd40cef1b3ab1456e4f2965a5f3e08cc2d0f1b32c
        fcc3bff5667955f805feccada825e0c1352e071e3e63ce7e29c7b2e6b7e29c11fe5347ee7da69e0b7d38c57346c
        c8e47263502cfe33a7a60bc01410fd66ff4cd86931cd69b2002662ffd0e53cfadf903147c2`)
            .digest('base64');
    }

    private async blacklistUser(userID: Snowflake, mod: User): Promise<string> {
        if (await this.isBlacklisted(userID)) {
            throw new Error("SAFE: Target is already blacklisted");
        }
        const blacklistID = generateUID();
        const add = this.DB.run("INSERT INTO blacklist(blacklistID, hashed)" +
            " VALUES(?, ?)", blacklistID, Anon.getHash(userID));
        const log = this.DB.run("INSERT INTO logs(userID, modAction, target) VALUES(?, ?, ?)",
            mod.id, "blacklist", blacklistID);
        await Promise.all([add, log]);
        return blacklistID;
    }

    public async unblacklist(blacklistID: string, mod: User) {
        if (!(await this.blacklistIDExists(blacklistID))) {
            throw new Error("SAFE: ID not found")
        }
        const deletes = this.DB.run("DELETE FROM blacklist WHERE blacklistID = ?",
            blacklistID);
        const log = this.DB.run("INSERT INTO logs(userID, modAction, target) VALUES(?, ?, ?)",
            mod.id, "unblacklist", blacklistID);
        await Promise.all([deletes, log]);
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

    public async blacklist(messageID: Snowflake, mod: User): Promise<BlacklistResponse> {
        const record: Record | void = this.messageRecords.getRecordByID(messageID);
        if (record instanceof Record) {
            this.deleteAnonUserByID(record.userID);
            return {
                blacklistID: await this.blacklistUser(record.userID, mod),
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

    public getLastRecord(): Record | void {
        return this.messageRecords.front();
    }
}

export class AnonUser {
    readonly user: User;
    private anon: Anon;
    // public anonID: AnonID;
    private anonAlias: AnonAlias;
    private color: number;

    constructor(anon: Anon, user: User, anonAlias: AnonAlias) {
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

    private buildMessage(content: string, prevContent?: string): RichEmbed {
        if (prevContent != null) {
            content = prevContent + "\n" + content;
        }
        return new RichEmbed()
            .setTitle(this.anonAlias)
            .setDescription(content)
            .setColor(this.color)
            // .setFooter(this.anonID)
    }

    public async send(channel: TextBasedChannelFields | PartialTextBasedChannelFields, content: string) {
        if ("fetchMessages" in channel) {
            const lastMessage: Message = (await channel.fetchMessages({limit: 1})).first();
            const lastRecord: Record | void = this.anon.getLastRecord();
            if (lastRecord instanceof Record
                && lastRecord.messageID === lastMessage.id
                && lastRecord.userID === this.user.id
                && lastMessage.embeds[0].title === this.getAlias().toString()
                && lastMessage.embeds[0].color === this.color) {
                const message = await lastMessage.edit(this.buildMessage(content, lastMessage.embeds[0].description));
                Anon.onAnonUpdate(lastRecord, message);
                return
            }
        }
        const message = await channel.send(this.buildMessage(content)) as Message;
        this.anon.onAnonMessage(this, message);
    }
}