import {randomBytes} from "crypto";
import uuid from "uuid/v4";
import {BuildOptions, DataTypes, Model, Sequelize} from "sequelize";
import {Snowflake} from "discord.js";
import {Availability, CommandCategory, CommandsModule, Permission} from "./modules/commands";
import {Bot} from "./bot";
import {ChannelAddCommand, ChannelGetCommand, ChannelRemoveCommand} from "./commands/channels.tmpl";

const intervalUnits = [
    {
        name: "day",
        shorthands: ["d"],
        seconds: 86400
    },
    {
        name: "hour",
        shorthands: ["h", "hr"],
        seconds: 3600
    },
    {
        name: "minute",
        shorthands: ["m", "min"],
        seconds: 60
    },
    {
        name: "second",
        shorthands: ["s", "sec"],
        seconds: 1
    }
];

// A map of a unit name or shorthand to the number of seconds that unit represents
// The units added are:
//   - All names above
//   - All shorthands above
//   - All names above with an "s" appended (eg. seconds)
//   - All shorthands above with an "s" appended (eg. mins)
const unitMap = new Map<string, number>();
for (let i = 0; i < intervalUnits.length; i++) {
    const unit = intervalUnits[i];
    unitMap.set(unit.name, unit.seconds);
    unitMap.set(unit.name + "s", unit.seconds);
    for (let i = 0; i < unit.shorthands.length; i++) {
        const short = unit.shorthands[i];
        unitMap.set(short, unit.seconds);
        unitMap.set(short + "s", unit.seconds);
    }
}

// Returns items in the array separated by newlines or the string "_None_" if the array is empty
export const listOrNone = (arr: string[]): string => {
    return arr.length === 0 ? "_None_" : arr.join("\n");
};

// Returns a random integer from 0 to max
export const random = (max: number): number => {
    return Math.floor(Math.random() * max);
};

// Returns a random valid discord color in decimal form
export const randomColor = (): number => {
    return random(16777215);
};

export const generateUID = (): string => {
    return uuid();
};

// Returns the date in the future by the given number of seconds
export const dateAfterSeconds = (seconds: number): Date => {
    return new Date(new Date().getTime() + seconds * 1000);
};

// Returns the given array sorted in alphabetical order (a-z)
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

export const parseInterval = (intervalInput: string): number => {
    const matches = intervalInput.toLowerCase().match(/^(\d+)\s?([a-z]+)$/);
    if (matches != null && matches.length > 2) {
        const num = parseInt(matches[1], 10);
        if (!isNaN(num)) {
            const suffix = matches[2];
            if (unitMap.has(suffix)) {
                return num * unitMap.get(suffix);
            }
        }
    }
    throw new Error("SAFE: Invalid interval: interval must be a positive whole number with the" +
        " following suffixes supported: " + [...unitMap.keys()].join(", "))
};

// Given an interval in seconds, returns the number of days, hours, minutes, and seconds it
// is equal to.
//
// Units are included largest to smallest, plural if more than 1, delimited by commas, and the last
// unit is separated by "and". Units are only included if they are not 0.
//
// For example, 86401 seconds would be formatted as "1 day and 1 second" and 5410 seconds would
// be formatted as "1 hour, 30 minutes, and 10 seconds"
export const formatInterval = (seconds: number): string => {
    let parts: string[] = [];
    for (let i = 0; i < intervalUnits.length; i++) {
        const unit = intervalUnits[i];
        const div = Math.floor(seconds / unit.seconds);
        if (div !== 0) {
            parts.push(`${div} ${unit.name}${div > 1 ? "s" : ""}`);
            seconds -= div * unit.seconds;
        }
    }
    if (parts.length === 0) {
        throw new Error("Invalid input");
    } else if (parts.length === 1) {
        return parts[0];
    } else {
        const last = parts.pop();
        return `${parts.join(", ")}${parts.length > 2 ? "," : ""} and ${last}`;
    }
};

// Returns a cryptographically safe random string that uses hex characters
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

// Returns the nth index of substring within string
export const getNthIndex = (str: string, substr: string, n: number): number => {
    let i = -1;

    while (n-- && i++ < str.length) {
        i = str.indexOf(substr, i);
        if (i < 0) break;
    }

    return i;
};

// Fisher-Yates Shuffle
// From https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
export const shuffle = (array: any[]): void => {
    let currentIndex = array.length;
    let temporaryValue, randomIndex;

    while (0 !== currentIndex) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }
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

// A list of channels that automatically saves to the database and can add commands to manage and
// view the list
export class PersistentChannelList {
    private readonly DB: Sequelize;
    private readonly bot: Bot;
    private list: ChannelListStatic;
    private cache: Set<Snowflake>;

    // Note: Both initialize and the constructor must be called to fully load the class
    constructor(bot: Bot, name: string) {
        this.DB = bot.DB;
        // The table used in the database is the name of the given channel list. Care should be
        // taken to not give it the same name as an existing table.
        this.list = <ChannelListStatic>this.DB.define(name, {
            channelID: {
                primaryKey: true,
                type: DataTypes.STRING
            }
        }, {tableName: name});
        this.bot = bot;
        this.cache = new Set<Snowflake>();
    }

    // Asynchronously prepares the class
    public async initialize(): Promise<void> {
        await this.list.sync();
        (await this.list.findAll()).forEach((channel: ChannelList) => {
            this.cache.add(channel.channelID);
        });
    }

    // Given a configuration, creates the following commands:
    //     get: Shows the channel list with the names of the channels if possible and the IDs of
    //          the channels if they do not exist
    //     set: Given a channel ID, adds it to the list
    //     remove: Given a channel ID, removes it from the list
    // Each command is created with the name, usage description, permission, and availability
    // specified in the config.
    public addCommands(config: PersistentChannelListConfig): void {
        const commandsMod = this.bot.getModule("commands") as CommandsModule;
        commandsMod.addCommand(new ChannelGetCommand(this.bot, config.parentModule, this,
            config.get, config.listName));
        commandsMod.addCommand(new ChannelAddCommand(this.bot, config.parentModule, this,
            config.add, config.listName.toLowerCase()));
        commandsMod.addCommand(new ChannelRemoveCommand(this.bot, config.parentModule, this,
            config.remove, config.listName.toLowerCase()));
    }

    // Returns an array of channel IDs that are in the list
    public async getChannels(): Promise<Snowflake[]> {
        let channels: Snowflake[] = [];
        const rows = await this.list.findAll();
        for (let i = 0; i < rows.length; i++) {
            channels.push(rows[i].channelID);
        }
        return channels;
    }

    // Returns true if the given channel ID is in the list, false otherwise
    public async has(channel: Snowflake): Promise<boolean> {
        return this.cache.has(channel);
    }

    // Adds the given channel ID to the list
    // Throws an error if the channel has already been added to the list
    public async add(channel: Snowflake): Promise<void> {
        if (await this.has(channel)) {
            throw new Error("SAFE: Channel has already been added");
        }
        await this.list.create({
            channelID: channel
        });
        this.cache.add(channel);
    }

    // Removes a channel ID from the list
    // Throws an error if the channel is not in the list
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

export interface Trie {
    has(string): boolean;
    hasPrefix(string): boolean;
    longestCommonPrefix(string): string;
}

class TrieNode {
    public letter: string;
    public before: TrieNode;
    public after: TrieNode;
    public next: TrieNode;
    public isKey: boolean;

    constructor(letter: string) {
        if (letter.length > 1) {
            throw new Error("Letter must be of length 1");
        }
        this.isKey = false;
        this.letter = letter;
    }
}

export class CaseInsensitiveTernaryTrie implements Trie {
    private root: TrieNode;

    constructor(words: string[]) {
        // Randomizing the insertion order helps avoid a worst case tree
        shuffle(words);
        for (let i = 0; i < words.length; i++) {
            this.add(words[i]);
        }
    }

    private addNode(current: TrieNode, remaining: string): TrieNode {
        if (remaining.length === 0) {
            return;
        }
        if (current == null) {
            current = new TrieNode(remaining.charAt(0));
        }
        const first = remaining.charAt(0);
        const compare = first.localeCompare(current.letter);
        if (compare < 0) {
            current.before = this.addNode(current.before, remaining);
        } else if (compare > 0) {
            current.after = this.addNode(current.after, remaining);
        } else {
            if (remaining.length === 1) {
                current.isKey = true;
            } else {
                current.next = this.addNode(current.next, remaining.substring(1));
            }
        }
        return current;
    }

    public add(word: string) {
        this.root = this.addNode(this.root, word.toLowerCase());
    }

    public has(word: string): boolean {
        word = word.toLowerCase();
        let current = this.root;
        while (current != null) {
            const first = word.charAt(0);
            const compare = first.localeCompare(current.letter);
            if (compare < 0) {
                current = current.before;
            } else if (compare > 0) {
                current = current.after;
            } else {
                if (word.length === 1) {
                    return current.isKey;
                } else {
                    current = current.next;
                    word = word.substring(1);
                }
            }
        }
        return false;
    }

    public hasPrefix(word: string): boolean {
        return this.longestCommonPrefix(word) !== "";
    }

    public longestCommonPrefix(word: string): string {
        word = word.toLowerCase();
        let current = this.root;
        let longest = "";
        let build = "";
        while (current != null) {
            const first = word.charAt(0);
            const compare = first.localeCompare(current.letter);
            if (compare < 0) {
                current = current.before;
            } else if (compare > 0) {
                current = current.after;
            } else {
                build += first;
                if (current.isKey) {
                    longest = build;
                }
                current = current.next;
                word = word.substring(1);
            }
        }
        return longest;
    }
}

