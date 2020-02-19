import {GuildMember, Message} from "discord.js";
import {Bot} from "../bot";
import {Module} from "../module";
import {CaseInsensitiveTernaryTrie, getLastNthIndex, getNthIndex} from "../util";
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

// Possible usages of a given command where the key is a description of the command and the
// value is an array of strings with each parameter of the command.
// For example: ["Send an anonymous message to another anonymous user"]: ["id", "message"]
export type CommandUsage = {
    [key: string]: string[]
}

// The category the command belongs to
export type CommandCategory =
    "bot"
    | "anon"
    | "whitelist"
    | "pin"
    | "xp"
    | "modules"
    | "settings"
    | "remind"
    | "moderation"

export type PartialCommandConfig = {
    names: string[],
    usages: CommandUsage,
    permission: Permission,
    availability: Availability
}

// Command configuration. See individual types for more details
export type CommandConfig = {
    // An array of names the command can be called by, with the first name being preferred
    names: string[],
    usages: CommandUsage,
    permission: Permission,
    availability: Availability,
    category: CommandCategory
}

// Determines what is required for a user to run a command
export enum Permission {
    // Allowed if the user has kick permissions in the bot guild
    UserKick,
    // All users with UserKick permission as well as maintainers
    UserKickOrMaintainer,
    // If a role ID is specified in the "commands.requiredRole" setting, permission is only
    // given to those who are both in the bot guild and have the required role in that guild
    //
    // IF A ROLE ID IS NOT SPECIFIED, BEHAVES LIKE THE NONE PERMISSION
    VerifiedGuildMember,
    // All users have permission
    None
}

// Determines where a command can be used and is checked before permission
export enum Availability {
    // Can only be used in DMs to the bot
    ChatOnly,
    // Can only be used in the bot guild
    GuildOnly,
    // If the whitelist module is enabled, will only be allowed in whitelisted channels.
    //
    // IF THE WHITELIST MODULE IS NOT ENABLED, BEHAVES LIKE GUILDONLY
    WhitelistedGuildChannelsOnly,
    // Can be used anywhere
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
        description: "The role ID required for the VerifiedGuildMember permission",
        optional: true
    }
};

export class CommandsModule extends Module {
    // Map all command names to commands, including aliases
    public readonly commands: Map<string, Command>;
    private commandTrie: CaseInsensitiveTernaryTrie;
    private whitelist: WhitelistModule;
    private whitelistEnabled: boolean;

    constructor(bot: Bot) {
        super(bot, "commands", ["?whitelist"], settingsConfig, true);
        this.commands = new Map<string, Command>();
    }

    public async initialize() {
        this.listen("message", this.onMessage.bind(this));
        this.whitelistEnabled = this.bot.isEnabled("whitelist");
        if (this.whitelistEnabled) {
            this.whitelist = this.bot.getModule("whitelist") as WhitelistModule;
        }
        const num: number = await this.loadCommands();
        this.commandTrie = new CaseInsensitiveTernaryTrie([...this.commands.keys()]);
        console.log("Loaded " + num + " commands");
    }

    // Loads all commands from the commands folder EXCEPT those that end with ".tmpl.js" which
    // means they are a template that should not be loaded but may be used as a dependency for
    // something else
    public async loadCommands(): Promise<number> {
        return Bot.forEachClassInFile("./commands",
            (name: string, constructor: any): Promise<boolean> => {
                this.addCommand(new constructor(this.bot));
                return Promise.resolve(true);
            }, (filename: string): boolean => filename.endsWith(".js") &&
                !filename.endsWith(".tmpl.js"));
    }

    // Adds the given command, making it available for use
    public addCommand(command: Command): void {
        const trieInsert: boolean = this.commandTrie != null;
        for (let i = 0; i < command.names.length; i++) {
            const alias = command.names[i];
            this.commands.set(alias, command);
            if (trieInsert) {
                this.commandTrie.add(alias);
            }
        }
    }

    // Find the command specified in content
    // Because command names may contain the command separator and may also contain the name of
    // other commands, command matching works by finding the longest command name that matches
    // the one used in content
    public findCommand(content: string):
        CommandAndAlias | void {
        let match = this.commandTrie.longestCommonPrefix(content);
        if (match.length === 0) {
            return null;
        }
        return {
            alias: match,
            command: this.commands.get(match)
        }
    }

    // Given a GuildMember _of the bot guild_, checks if they have the given permission. Returns
    // true if they do and false if they do not.
    public checkPermission(user: GuildMember, permission: Permission): boolean {
        // noinspection FallThroughInSwitchStatementJS
        switch(permission) {
            case Permission.None:
                return true;
            case Permission.VerifiedGuildMember:
                if (this.settingsHas("requiredRole")) {
                    return user.roles.has(this.settings("requiredRole"));
                } else {
                    return true;
                }
            case Permission.UserKickOrMaintainer:
                if (this.bot.config.maintainer != null
                    && user.id === this.bot.config.maintainer) {
                    return true;
                }
                // fallthrough
            case Permission.UserKick:
                return user.hasPermission("KICK_MEMBERS");
            default:
                return false;
        }
    };

    // Given a message and availability, returns true if the message matches the availability
    // and false if it does not
    public checkAvailability = async (message: Message, availability: Availability):
        Promise<boolean> => {
        switch (availability) {
            case Availability.ChatOnly:
                return message.guild == null;
            case Availability.GuildOnly:
                return message.guild != null;
            case Availability.WhitelistedGuildChannelsOnly:
                return message.guild != null && (!this.whitelistEnabled ||
                    await this.whitelist.channels.has(message.channel.id));
            case Availability.All:
                return true;
            default:
                return false;
        }
    };

    // Event listener
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

    // Given a message with a command, returns the raw content that comes after the message with
    // the given offset of arguments.
    //
    // If offsetIndex < 0, strips a number of arguments from the end equal to the absolute value of
    // offsetIndex.
    //
    // For example: if the prefix is > and the separator is a space then ">message 123 hello world"
    // and an offset index of 1 would return "hello world" with an offset index of -1 it would
    // return "123 hello"
    public getRawContent(content: string, offsetIndex: number = 0): string {
        const maybe: CommandAndAlias | void = this.findCommand(content.substring(
            this.settings("prefix").length));
        if (maybe == null) {
            throw new Error("Content does not seem to contain a command");
        }
        const command = maybe as CommandAndAlias;
        const afterCommand: string = content.substring(command.alias.length +
            this.settings("prefix").length + this.settings("separator").length);
        let idx;
        if (offsetIndex >= 0) {
            idx = getNthIndex(afterCommand, this.settings("separator"), offsetIndex);
        } else {
            idx = getLastNthIndex(afterCommand, this.settings("separator"), offsetIndex * -1);
        }
        if (idx === -1) {
            return afterCommand;
        }
        if (offsetIndex >= 0) {
            return afterCommand.substring(idx + this.settings("separator").length);
        } else {
            return afterCommand.substring(0, idx);
        }
    }

    // Given a message, returns a command, the alias used, and command arguments.
    // If no command was called in the message, returns null.
    public parseCommand(content: string): ParsedCommand | void {
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
    // An array of names which the command can be called by, with the first name being preferred
    public readonly names: string[];
    // A reference to the bot the command belongs to
    public readonly bot: Bot;

    // For descriptions of the below fields, refer to CommandConfig

    public readonly usages: CommandUsage;
    public readonly permission: Permission;
    public readonly availability: Availability;
    public readonly category: CommandCategory;

    protected constructor(bot: Bot, config: CommandConfig) {
        this.bot = bot;
        this.names = config.names;
        this.usages = config.usages;
        this.permission = config.permission;
        this.availability = config.availability;
        this.category = config.category;
    }

    // exec is the raw source of the command, and does not perform any checks
    async exec(message?: Message, ...args: string[]): Promise<Message | void> {}

    // run runs the command and performs all command-related checks
    async run(message?: Message, ...args: string[]): Promise<Message | void> {
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

    // Includes usages with examples that use the preferred command name and the current prefix and
    // separator.
    // Example result if the prefix is > and the separator is a space:
    //
    // >setcolor: Set anon color to a random color
    // >setcolor <hex>: Set anon color to the given hex color
    // >setcolor <r> <g> <b>: Set anon color to the given r, g, b value
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
        }
        return res;
    }
}
