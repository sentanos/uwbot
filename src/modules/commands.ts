import {User, GuildMember, Message} from "discord.js";
import {Bot} from "../bot";
import {Module} from "../module";
import {getNthIndex} from "../util";
import {CommandsModuleConfig} from "../config";

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

export class CommandsModule extends Module {
    public readonly commands: Command[];
    public readonly config: CommandsModuleConfig;

    constructor(bot: Bot) {
        super(bot, "commands");
        this.config = this.bot.config.commands;
        this.commands = [];
        this.bot.client.on("message", this.onMessage.bind(this))
    }

    public async initialize() {
        const num: number = await this.loadCommands();
        console.log("Loaded " + num + " commands");
    }

    public async loadCommands(): Promise<number> {
        return this.bot.forEachClassInFile("./commands",
                (name: string, constructor: any): Promise<boolean> => {
            this.addCommand(new constructor(this.bot));
            return Promise.resolve(true);
        });
    }

    private addCommand(command: Command) {
        this.commands.push(command);
    }

    public findCommand(name: string): Command | void {
        return this.commands.find((command: Command) => {
            return command.names.includes(name.toLowerCase());
        })
    }

    public hasCommand(name: string): boolean {
        const command = this.findCommand(name);
        if (command instanceof Command) {
            return true;
        }
        return false;
    }

    public checkPermission(user: User | GuildMember, permission: Permission): boolean {
        switch(permission) {
            case Permission.None:
                return true;
        }
        if (user instanceof GuildMember) {
            switch (permission) {
                case Permission.UserKick:
                    if (user.guild.id === this.bot.guild.id
                        && user.hasPermission("KICK_MEMBERS")) {
                        return true;
                    }
                    return false;
            }
        }
        return false;
    };

    public onMessage(message: Message) {
        if (message.author.bot) {
            return
        }
        if (message.content.length > this.config.prefix.length + 1 &&
                message.content.startsWith(this.config.prefix)) {
            const parsed = this.parseContent(message.content);
            const command = this.findCommand(parsed.command);
            if (!(command instanceof Command)) {
                return;
            }
            command.run(message, ...parsed.args)
                .catch((err: Error) => {
                    let errMsg;
                    if (err.message.startsWith("SAFE: ")) {
                        errMsg = err.message.substring(err.message.indexOf(" ") + 1);
                    } else {
                        errMsg = "An unknown error occurred";
                        console.error(err.stack);
                    }
                    return message.channel.send("Error: " + errMsg);
                })
                .catch((err: Error) => {
                    console.error("Failed to send error message: " + err.stack);
                });
        }
    }

    // Given a message with a command, returns the raw content that comes after the message
    // For example: ">anon 123    456   7  " will preserve spaces correctly
    public getRawContent(content: string, offsetIndex: number = 0): string {
        const idx = getNthIndex(content, this.config.separator, offsetIndex + 1);
        if (idx < 0 || idx === content.length - 1) {
            return "";
        }
        return content.substring(idx + 1);
    }

    private parseContent(content: string): ParsedCommand {
        const args = content.split(this.config.separator);
        const command = args[0].substring(this.config.prefix.length);
        args.shift();
        return { command, args }
    }
}

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
        const handler: CommandsModule = this.bot.getModule("commands") as CommandsModule;

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
        if (!handler.checkPermission(rel, this.permission)) {
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
        const handler: CommandsModule = this.bot.getModule("commands") as CommandsModule;

        let res = "";
        let first = true;
        for (const description in this.usages) {
            if (!first) {
                res += "\n";
            } else {
                first = false;
            }
            const usages = this.usages[description];
            res += handler.config.prefix + this.names[0];
            if (usages.length > 0) {
                usages.forEach((part) => {
                    res += `${handler.config.separator}\`<${part}>\``;
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
