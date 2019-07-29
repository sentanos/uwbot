import {GuildMember, Message} from "discord.js";
import {Bot} from "../bot";
import {Module} from "../module";
import {getNthIndex} from "../util";
import {WhitelistModule} from "./whitelist";
import {SettingsConfig} from "./settings.skip";

export type ParsedCommand = {
    command: Command,
    alias: string,
    args: string[]
}

// A command and the alias that was used to call it
export type CommandAndAlias = {
    command: Command,
    alias: string
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
    VerifiedGuildMember,
    None
}

export enum Availability {
    ChatOnly,
    GuildOnly,
    WhitelistedGuildChannelsOnly,
    All
}

const settingsConfig: SettingsConfig = {
    prefix: {
        description: "The prefix for commands",
        default: ">"
    },
    separator: {
        description: "The string that separates arguments of commands",
        default: " "
    },
    requiredRole: {
        description: "The role required for the VerifiedGuildMember permission",
        optional: true
    }
};

export class CommandsModule extends Module {
    public readonly commands: Command[];
    private whitelist: WhitelistModule;

    constructor(bot: Bot) {
        super(bot, "commands", ["whitelist"], settingsConfig, true);
        this.commands = [];
    }

    public async initialize() {
        this.listen("message", this.onMessage.bind(this));
        this.whitelist = this.bot.getModule("whitelist") as WhitelistModule;
        const num: number = await this.loadCommands();
        console.log("Loaded " + num + " commands");
    }

    public async loadCommands(): Promise<number> {
        return this.bot.forEachClassInFile("./commands",
            (name: string, constructor: any): Promise<boolean> => {
                this.addCommand(new constructor(this.bot));
                return Promise.resolve(true);
            }, (filename: string): boolean => filename.endsWith(".js") &&
                !filename.endsWith(".tmpl.js"));
    }


    public addCommand(command: Command): void {
        this.commands.push(command);
    }

    // Find the command specific in content.
    public findCommand(content: string):
        CommandAndAlias | void {
        let found: boolean = false;
        let res: CommandAndAlias;
        for (let i = 0; i < this.commands.length; i++) {
            const command = this.commands[i];
            for (let j = 0; j < command.names.length; j++) {
                const name = command.names[j];
                if (content.toLowerCase() === name
                    || (content.toLowerCase().startsWith(name + this.settings("separator")))) {
                    if (!found || name.length > res.alias.length) {
                        found = true;
                        res = {command: command, alias: name};
                    }
                }
            }
        }
        if (!found) {
            return null;
        }
        return res;
    }

    // Receives GuildMember _of the bot guild_
    public checkPermission(user: GuildMember, permission: Permission): boolean {
        switch(permission) {
            case Permission.None:
                return true;
            case Permission.VerifiedGuildMember:
                if (this.settingsHas("requiredRole")) {
                    return user.roles.has(this.settings("requiredRole"));
                } else {
                    return true;
                }
            case Permission.UserKick:
                return user.hasPermission("KICK_MEMBERS");
        }
        return false;
    };

    public checkAvailability = async (message: Message, availability: Availability):
        Promise<boolean> => {
        switch (availability) {
            case Availability.ChatOnly:
                return message.guild == null;
            case Availability.GuildOnly:
                return message.guild != null;
            case Availability.WhitelistedGuildChannelsOnly:
                if (message.guild == null) {
                    return false;
                }
                return this.whitelist.channels.has(message.channel.id);
            case Availability.All:
                return true;
            default:
                return false;
        }
    };

    public onMessage(message: Message) {
        if (message.author.bot) {
            return
        }
        if (message.content.length > this.settings("prefix").length + 1 &&
                message.content.startsWith(this.settings("prefix"))) {
            const maybe: ParsedCommand | void = this.parseCommand(message.content);
            if (maybe == null) {
                return
            }
            const parsed = maybe as ParsedCommand;
            parsed.command.run(message, ...parsed.args)
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
        const maybe: CommandAndAlias | void = this.findCommand(content.substring(
            this.settings("prefix").length));
        if (maybe == null) {
            throw new Error("Content does not seem to contain a command");
        }
        const command = maybe as CommandAndAlias;
        const afterCommand: string = content.substring(command.alias.length +
            this.settings("prefix").length + this.settings("separator").length);
        const idx = getNthIndex(afterCommand, this.settings("separator"), offsetIndex);
        if (idx === -1) {
            return afterCommand;
        }
        return afterCommand.substring(idx + this.settings("separator").length);
    }

    private parseCommand(content: string): ParsedCommand | void {
        const maybe: CommandAndAlias | void = this.findCommand(content.substring(
            this.settings("prefix").length));
        if (maybe == null) {
            return null;
        }
        const command = maybe as CommandAndAlias;
        const args = content.substring(command.alias.length + this.settings("prefix").length)
            .split(this.settings("separator"));
        args.shift();
        return {
            command: command.command,
            alias: command.alias,
            args: args
        }
    }

}

export abstract class Command {
    public readonly names: string[];
    public readonly usages: CommandUsage;
    public readonly permission: Permission;
    public readonly availability: Availability;
    public readonly bot: Bot;

    protected constructor(bot: Bot, config: CommandConfig) {
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

        let resolved : GuildMember | void;
        let member: GuildMember;
        const user = message.author;
        resolved = this.bot.guild.member(user);
        if (resolved instanceof GuildMember) {
            member = resolved;
        } else {
            throw new Error("SAFE: You must be a member of the UW discord to run commands")
        }

        if (!(await handler.checkAvailability(message, this.availability))) {
            if (this.availability === Availability.ChatOnly) {
                throw new Error("SAFE: You may only use that command from DMs");
            } else if (this.availability === Availability.GuildOnly) {
                throw new Error("SAFE: You may only use that command from a guild");
            } else if (this.availability === Availability.WhitelistedGuildChannelsOnly) {
                await message.author.send("Error: You may only use that command from specific" +
                    " guild channels. Use \"" + handler.settings("prefix") + "whitelist get\" to" +
                    " get a list of these channels.");
                return;
            } else {
                throw new Error("SAFE: Command is unavailable in current context");
            }
        }
        if (!handler.checkPermission(member, this.permission)) {
            throw new Error("SAFE: You do not have permission to run that command");
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
            res += handler.settings("prefix") + this.names[0];
            if (usages.length > 0) {
                usages.forEach((part) => {
                    res += `${handler.settings("separator")}\`<${part}>\``;
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
