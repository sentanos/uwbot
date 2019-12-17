import {randomBytes} from "crypto";
import uuid from "uuid/v4";
import {BuildOptions, DataTypes, Model, Sequelize} from "sequelize";
import {DMChannel, Message, MessageEmbed, Snowflake, TextChannel} from "discord.js";
import {
    Availability,
    CommandCategory,
    CommandsModule,
    Permission
} from "./modules/commands";
import {Bot} from "./bot";
import {ChannelAddCommand, ChannelGetCommand, ChannelRemoveCommand} from "./commands/channels.tmpl";

const intervalUnits = [
    {
        name: "year",
        shorthands: ["y"],
        seconds: 31536000
    },
    {
        name: "month",
        shorthands: ["mo"],
        seconds: 2592000
    },
    {
        name: "week",
        shorthands: ["w", "wk"],
        seconds:  604800
    },
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

// Returns an interval if it can be parsed, or -1 if it cannot be
// Returns -2 if the interval is "all"
const tryInterval = (content: string): number => {
    if (content === "all") {
        return -2;
    }
    try {
        return parseInterval(content);
    } catch (e) {
        return -1;
    }
};

export type IntervalResponse = {
    interval: number,
    args: string[],
    offset: number,
    raw: string
}

// Extracts time interval from a command and returns the interval, a list of arguments that come
// before or after it (before if it is at the end, after if it is at the beginning), and the raw
// content of those arguments.
// Works when the interval has spaces. Offset is the number of arguments before the time
// interval can appear. The interval will be found if it is either the first argument after
// others or the last argument.
// This includes the additional interval "all" which returns an interval value of -2.
export const smartFindInterval = (bot: Bot, content: string, includeAll: boolean, offset: number = 0):
    IntervalResponse => {
    const handler = bot.getModule("commands") as CommandsModule;
    const after = handler.getRawContent(content, offset);
    const sep = handler.settings("separator");

    let firstSep = after.indexOf(sep);
    if (firstSep < 0) {
        firstSep = after.length;
    }
    const beginningNoSpaces = tryInterval(after.substring(0, firstSep));
    if (includeAll ? beginningNoSpaces != -1 : beginningNoSpaces > 0) {
        const raw = after.substring(firstSep + sep.length);
        return {
            interval: beginningNoSpaces,
            args: raw.split(sep),
            offset: 1,
            raw: raw
        }
    }

    let secondSep = after.indexOf(sep, firstSep + sep.length);
    if (secondSep < 0) {
        secondSep = after.length;
    }
    const beginningSpaces = tryInterval(after.substring(0, secondSep));
    if (includeAll ? beginningSpaces != -1 : beginningSpaces > 0) {
        const raw = after.substring(secondSep + sep.length);
        return {
            interval: beginningSpaces,
            args: raw.split(sep),
            offset: 2,
            raw: raw
        }
    }

    const lastSep = after.lastIndexOf(sep);
    if (lastSep >= 0) {
        const lastNoSpaces = tryInterval(after.substring(lastSep + sep.length));
        if (includeAll ? lastNoSpaces != -1 : lastNoSpaces > 0) {
            const raw = after.substring(0, lastSep);
            return {
                interval: lastNoSpaces,
                args: raw.split(sep),
                offset: 0,
                raw: raw
            }
        }
        const secondLastSep = after.lastIndexOf(sep, lastSep - 1);
        if (secondLastSep >= 0) {
            const lastSpaces = tryInterval(after.substring(secondLastSep + sep.length));
            if (includeAll ? lastSpaces != -1 : lastSpaces > 0) {
                const raw = after.substring(0, secondLastSep);
                return {
                    interval: lastSpaces,
                    args: raw.split(sep),
                    offset: 0,
                    raw: raw
                }
            }
        }
    }

    parseIntervalErr();
};

const parseIntervalErr = (): void => {
    throw new Error("SAFE: Invalid interval: interval must be a positive whole number with the" +
        " following suffixes supported: " + [...unitMap.keys()].join(", "))
};

// Capitalizes the first alphabetic letter
export const titlecase = (s: string): string => {
    const idx = s.search('[a-zA-Z]');
    if (idx < 0) {
        return s;
    }
    return s.substring(0, idx) + s.charAt(idx).toUpperCase() + s.substring(idx + 1);
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
    parseIntervalErr();
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

// Check if the embeds are equal excluding fields, files, and description.
export const embedMetaEquals = (a: MessageEmbed, b: MessageEmbed): boolean =>
    ((a.author == null && b.author == null)
    || (a.author != null && b.author != null
        && a.author.iconURL == b.author.iconURL
        && a.author.name == b.author.name
        && a.author.url == b.author.url))
    && a.color == b.color
    && ((a.footer == null && b.footer == null)
    || (a.footer != null && b.footer != null
        && a.footer.text == b.footer.text
        && a.footer.iconURL == b.footer.iconURL
        && a.provider.name == b.provider.name))
    && ((a.provider == null && b.provider == null)
    || (a.provider != null && b.provider != null
        && a.provider.name == b.provider.name
        && a.provider.url == b.provider.url))
    && ((a.thumbnail == null && b.thumbnail == null)
    || (a.thumbnail != null && b.thumbnail != null
        && a.thumbnail.url == b.thumbnail.url
        && a.thumbnail.height == b.thumbnail.height
        && a.thumbnail.width == b.thumbnail.width))
    && a.title == b.title
    // && a.type === b.type
    && a.url == b.url
    && ((a.video == null && b.video == null)
    || (a.video.url == b.video.url
        && a.video.height == b.video.height
        && a.video.width == b.video.width));

// Send the given embed to the given channel and merge if possible.
//
// If the previous message in the channel is an embed where all metadata is the same (everything
// except description), that message is edited to append the description of the embed.
//
// If check is specified, it is called with the lastMessage and its result is used as an
// additional check for merging. It is guaranteed that check will only be called if an embed
// exists and passes all metadata checks. If check returns false, the message will not be merged.
// If it returns true, the message can be merged (if other checks pass as well).
//
// Returns the message that was either sent or merged with.
export const sendAndMerge = async (channel: TextChannel | DMChannel, embed: MessageEmbed,
                                   check?: (lastMessage: Message) => boolean):
    Promise<{message: Message, merged: boolean}> => {
    const lastMessage: Message = (await channel.messages.fetch({limit: 1})).first();
    if (lastMessage.embeds.length > 0
        && embedMetaEquals(lastMessage.embeds[0], embed)
        && (check == null || check(lastMessage))) {
        const proxy = new MessageEmbed(embed);
        proxy.setDescription(lastMessage.embeds[0].description + "\n" + embed.description);
        return {
            message: await lastMessage.edit(proxy),
            merged: true
        };
    }
    return {
        message: await channel.send(embed),
        merged: false
    };
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

