import {User, GuildMember, Message} from "discord.js";
import {Bot} from "./bot";

export type ParsedCommand = {
    command: string,
    args: string[]
}

// Description: [Parameters]
export type CommandUsage = {
    [key: string]: string[]
}

export type CommandConfig = {
    names: string[],
    usages: CommandUsage,
    permission: Permission,
    availability: Availability
}

export enum Permission {
    UserKick,
    None,
}

export enum Availability {
    ChatOnly,
    GuildOnly,
    All
}

export const checkAvailability = (message: Message, availability: Availability): boolean => {
    switch(availability) {
        case Availability.ChatOnly:
            return message.guild == null;
        case Availability.GuildOnly:
            return message.guild != null;
        case Availability.All:
            return true;
        default:
            return false;
    }
};

// Represents a command
export class Command {
    public readonly names: string[];
    public readonly usages: CommandUsage;
    public readonly permission: Permission;
    public readonly availability: Availability;
    public readonly bot: Bot;

    constructor(bot: Bot, config: CommandConfig) {
        this.bot = bot;
        this.names = config.names;
        this.usages = config.usages;
        this.permission = config.permission;
        this.availability = config.availability;
    }

    // exec is the raw source of the command, and does not perform any checks
    async exec(message?: Message, ...args: string[]): Promise<any> {}

    // run runs the command and performs all command-related checks
    async run(message?: Message, ...args: string[]): Promise<any> {
        let rel: User | GuildMember;
        const user = message.author;
        if (message.guild != null) {
            rel = message.guild.member(user);
        } else {
            rel = user;
        }

        if (!checkAvailability(message, this.availability)) {
            if (this.availability === Availability.ChatOnly) {
                throw new Error("SAFE: You may only use this command from DMs");
            } else if (this.availability === Availability.GuildOnly) {
                throw new Error("SAFE: You may only use this command from a guild")
            } else {
                throw new Error("SAFE: Command is unavailable in current context");
            }
        }
        if (!this.bot.checkPermission(rel, this.permission)) {
            throw new Error("SAFE: You do not have permission to run this command");
        }

        let found = false;
        for (const key in this.usages) {
            const usage: string[] = this.usages[key];
            if (args.length >= usage.length) {
                found = true;
                break;
            }
        }
        if (!found) {
            throw new Error("SAFE: Invalid number of arguments for this command");
        }

        return this.exec(message, ...args);
    }

    toString(): string {
        let res = "";
        let first = true;
        for (const description in this.usages) {
            if (!first) {
                res += "\n";
            } else {
                first = false;
            }
            const usages = this.usages[description];
            res += this.bot.prefix + this.names[0];
            if (usages.length > 0) {
                usages.forEach((part) => {
                    res += `${this.bot.separator}\`<${part}>\``;
                });
            }
            res += ": " + description;
            // if (this.names.length > 1) {
            //     res += ` _aliases: [${this.names.slice(1).join(", ")}]_`;
            // }
        }
        return res;
    }
}
