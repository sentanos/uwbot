import {randomBytes} from "crypto";
import {AnonID} from "./modules/anon";
import uuid from "uuid/v4";
import {Sequelize, Model, BuildOptions, DataTypes} from "sequelize";
import {Snowflake} from "discord.js";
import {Availability, CommandCategory, CommandsModule, Permission} from "./modules/commands";
import {Bot} from "./bot";
import {ChannelAddCommand, ChannelGetCommand, ChannelRemoveCommand} from "./commands/channels.tmpl";

export const listOrNone = (arr: string[]): string => {
    return arr.length === 0 ? "_None_" : arr.join("\n");
};

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

export const alphabetical = (arr: string[]): string[] => {
    return arr.sort((a: string, b: string): number => {
        if (a < b) {
            return -1;
        } else if (a > b) {
            return 1;
        } else {
            return 0;
        }
    });
};

export const formatInterval = (seconds: number): string => {
    let value: number;
    let unit: string;
    if (seconds % 86400 == 0) {
        value = seconds / 86400;
        unit = "day";
    } else if (seconds % 3600 == 0) {
        value = seconds / 3600;
        unit = "hour";
    } else if (seconds % 60 == 0) {
        value = seconds / 60;
        unit = "minute";
    } else {
        value = seconds;
        unit = "second";
    }
    if (value === 1) {
        return value + " " + unit;
    } else {
        return value + " " + unit + "s";
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

export type PersistentChannelListConfigPart = {
    command: string,
    usage: string,
    permission: Permission,
    availability: Availability
}

export type PersistentChannelListConfig = {
    listName: string,
    parentModule: CommandCategory,
    get: PersistentChannelListConfigPart,
    add: PersistentChannelListConfigPart,
    remove: PersistentChannelListConfigPart
}

interface ChannelList extends Model {
    readonly channelID: string;
}

type ChannelListStatic = typeof Model & {
    new (values?: object, options?: BuildOptions): ChannelList;
}

export class PersistentChannelList {
    private readonly DB: Sequelize;
    private readonly bot: Bot;
    private list: ChannelListStatic;
    private cache: Set<Snowflake>;

    constructor(bot: Bot, name: string) {
        this.DB = bot.DB;
        this.list = <ChannelListStatic>this.DB.define(name, {
            channelID: {
                primaryKey: true,
                type: DataTypes.STRING
            }
        }, {tableName: name});
        this.bot = bot;
        this.cache = new Set<Snowflake>();
    }

    public async initialize(): Promise<void> {
        await this.list.sync();
        (await this.list.findAll()).forEach((channel: ChannelList) => {
            this.cache.add(channel.channelID);
        });
    }

    public addCommands(config: PersistentChannelListConfig): void {
        const commandsMod = this.bot.getModule("commands") as CommandsModule;
        commandsMod.addCommand(new ChannelGetCommand(this.bot, config.parentModule, this,
            config.get, config.listName));
        commandsMod.addCommand(new ChannelAddCommand(this.bot, config.parentModule, this,
            config.add, config.listName.toLowerCase()));
        commandsMod.addCommand(new ChannelRemoveCommand(this.bot, config.parentModule, this,
            config.remove, config.listName.toLowerCase()));
    }

    public async getChannels(): Promise<Snowflake[]> {
        let channels: Snowflake[] = [];
        const rows = await this.list.findAll();
        for (let i = 0; i < rows.length; i++) {
            channels.push(rows[i].channelID);
        }
        return channels;
    }

    public async has(channel: Snowflake): Promise<boolean> {
        return this.cache.has(channel);
    }

    public async add(channel: Snowflake): Promise<void> {
        if (await this.has(channel)) {
            throw new Error("SAFE: Channel has already been added");
        }
        await this.list.create({
            channelID: channel
        });
        this.cache.add(channel);
    }

    public async remove(channel: Snowflake): Promise<void> {
        if (!(await this.has(channel))) {
            throw new Error("SAFE: Channel not in list");
        }
        await this.list.destroy({
            where: {
                channelID: channel
            }
        });
        this.cache.delete(channel);
    }
}
