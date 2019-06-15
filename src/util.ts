import {randomBytes} from "crypto";
import {AnonID} from "./modules/anon";
import * as uuid from "uuid/v4";
import {Snowflake} from "discord.js";
import * as sqlite from "sqlite";

// Returns a random integer from 0 to max
export const random = (max: number): number => {
    return Math.floor(Math.random() * max);
};

export const randomColor = (): number => {
    return random(16777215);
};

export const generateUID = (): AnonID => {
    return uuid();
};

export const formatInterval = (seconds: number): string => {
    if (seconds % 86400 == 0) {
        return seconds / 86400 + " days";
    } else if (seconds % 3600 == 0) {
        return seconds / 3600 + " hours";
    } else if (seconds % 60 == 0) {
        return seconds / 60 + " minutes";
    } else {
        return seconds + " seconds";
    }
};

export const randomString = (length: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        randomBytes(length, (err: Error, buf: Buffer) => {
            if (err != null) {
                reject(err);
                return
            }
            resolve(buf.toString("hex"));
        })
    });
};

// Returns the difference t1 - t2 in milliseconds
export const timeDiff = (t1: Date, t2: Date): number => {
    return t1.getTime() - t2.getTime();
};

export const toSQLiteDate = (date: Date): string => {
    return date.toISOString().replace("T", " ").replace("Z","");
};

export const fromSQLiteDate = (date: string): Date => {
    return new Date(date + " UTC");
};

export const getNthIndex = (str: string, substr: string, n: number): number => {
    let i = -1;

    while (n-- && i++ < str.length) {
        i = str.indexOf(substr, i);
        if (i < 0) break;
    }

    return i;
};

export class Queue<T> {
    private queue: T[];
    private offset: number;

    constructor() {
        this.queue = [];
        this.offset = 0;
    }

    public size(): number {
        return this.queue.length - this.offset;
    }

    public isEmpty(): boolean {
        return this.size() === 0;
    }

    public enqueue(item: T): void {
        this.queue.push(item);
    }

    public dequeue(): T | void {
        if (this.isEmpty()) {
            return undefined;
        }

        const item: T = this.queue[this.offset];
        this.offset++;
        if (this.offset * 2 >= this.queue.length) {
            this.queue = this.queue.slice(this.offset);
            this.offset = 0;
        }

        return item;
    }

    public peek(): T | void {
        return !this.isEmpty() ? this.queue[this.offset] : undefined;
    }

    // Yeah these are nonstandard, open to better ideas if anyone has them

    public toArray(): T[] {
        return this.queue.slice(this.offset);
    }
}

export class PersistentChannelList {
    private readonly DB: sqlite.Database;
    private readonly table: string;

    constructor(DB: sqlite.Database, table: string) {
        this.DB = DB;
        this.table = table;
    }

    public async getChannels(): Promise<Snowflake[]> {
        let channels: Snowflake[] = [];
        const rows = await this.DB.all(`SELECT channelID FROM ${this.table}`);
        for (let i = 0; i < rows.length; i++) {
            channels.push(rows[i].channelID);
        }
        return channels;
    }

    public async has(channel: Snowflake): Promise<boolean> {
        const res = await this.DB.get(`SELECT channelID FROM ${this.table} WHERE channelID = ?`,
            channel);
        if (res == null) {
            return false;
        }
        return true;
    }

    public async add(channel: Snowflake): Promise<void> {
        await this.DB.exec("BEGIN TRANSACTION");
        try {
            if (await this.has(channel)) {
                throw new Error("SAFE: Channel is already whitelisted");
            }
            await this.DB.run(`INSERT INTO ${this.table}(channelID) VALUES(?)`, channel);
            await this.DB.exec("COMMIT TRANSACTION")
        } catch (err) {
            console.error("Error while whitelisting, rolling back: " + err.stack);
            await this.DB.exec("ROLLBACK TRANSACTION");
            throw err;
        }
    }

    public async remove(channel: Snowflake): Promise<void> {
        await this.DB.exec("BEGIN TRANSACTION");
        try {
            if (!(await this.has(channel))) {
                throw new Error("SAFE: Channel is not whitelisted");
            }
            await this.DB.run(`DELETE FROM ${this.table} WHERE channelID = ?`, channel);
            await this.DB.exec("COMMIT TRANSACTION")
        } catch (err) {
            console.error("Error while whitelisting, rolling back: " + err.stack);
            await this.DB.exec("ROLLBACK TRANSACTION");
            throw err;
        }
    }
}
