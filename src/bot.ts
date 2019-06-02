import {Command, ParsedCommand, Permission} from "./command";
import {
    Client,
    Guild,
    GuildMember,
    Message,
    MessageReaction, PartialTextBasedChannelFields,
    Snowflake,
    TextChannel,
    User
} from "discord.js";
import * as sqlite from "sqlite";
import {readdir} from "fs";
import {join} from "path";
import {promisify} from "util";
import {Anon} from "./modules/anon";
import {getNthIndex} from "./util";

export type BotConfig = {
    nickname?: string,
    prefix: string,
    separator: string,
    pin: string,
    avatarPath?: string,
    guild: Snowflake,
    anon: {
        maxID: number,
        maxInactiveRecords: number,
        lifetime: number
    }
}

export class Bot {
    public readonly commands: Command[];
    public readonly anon: Anon;
    public readonly client: Client;
    public readonly DB: sqlite.Database;
    public readonly guild: Guild;
    public readonly prefix: string;
    public readonly separator: string;
    public readonly pin: string;
    public readonly avatarPath: string;
    public readonly nickname: string;

    constructor(client: Client, DB: sqlite.Database, config: BotConfig) {
        this.client = client;
        this.DB = DB;
        this.guild = client.guilds.get(config.guild);
        this.prefix = config.prefix;
        this.separator = config.separator;
        this.pin = config.pin;
        this.avatarPath = config.avatarPath;
        this.nickname = config.nickname;
        this.commands = [];
        this.anon = new Anon(DB, this.guild, config.anon.maxID,
                             config.anon.maxInactiveRecords, config.anon.lifetime);
        this.getChannelByName("anonymous").send("I was restarted due to updates so IDs have been" +
            " reset");
    }

    public async initializeUser() {
        if (this.nickname != null) {
            await this.guild.member(this.client.user).setNickname(this.nickname);
        }
        if (this.avatarPath != null) {
            await this.client.user.setAvatar(this.avatarPath)
        }
    }

    // Returns the channel in the bot's guild with the given name. Errors if such a channel does
    // not exist.
    private getChannelByName(name: string): TextChannel {
        const channel: TextChannel | void = this.guild.channels.find(
            ch => ch.name === name) as TextChannel;
        if (channel == null) {
            throw new Error("Channel not found")
        }
        return channel
    }

    public async sendAnonMessage(channelOpt: string | PartialTextBasedChannelFields, message: Message,
                                 offset: number = 0) {
        let channel: PartialTextBasedChannelFields;
        if (typeof channelOpt === "string") {
            channel = this.getChannelByName(channelOpt)
        } else {
            channel = channelOpt;
        }
        return (await this.anon.getAnonUser(message.author)).send(
            channel,
            this.getRawContent(message.content, offset)
        )
    }

    private addCommand(command: Command) {
        this.commands.push(command);
    }

    public async loadCommands(): Promise<number> {
        const files = await promisify(readdir)(join(__dirname, "./commands"));
        let commands = 0;
        for (let i = 0; i < files.length; i++) {
            const filename = files[i];
            if (filename.endsWith(".js")) {
                const items = await import(join(__dirname, "./commands", filename));
                for (const className in items) {
                    if (className != "__esModule") {
                        this.addCommand(new items[className](this));
                        commands++;
                    }
                }
            }
        }
        return commands;
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
                    if (user.guild.id === this.guild.id
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
        if (message.content.length > this.prefix.length + 1 &&
                message.content.startsWith(this.prefix)) {
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

    public async messageReactionAdd(reaction: MessageReaction, user: User) {
        if (reaction.message.guild != null
            && !reaction.message.pinned
            && reaction.emoji.name === this.pin) {
            try {
                await this.DB.run(`INSERT INTO pinned(messageID, userID) VALUES(?, ?)`,
                    reaction.message.id, user.id);
            } catch (err) {
                console.error("Error pinning by database: " + err.stack);
                return
            }
            await reaction.message.pin()
        }
    }

    public async messageReactionRemove(reaction: MessageReaction, user: User) {
        if (reaction.message.guild != null
            && reaction.message.pinned
            && reaction.emoji.name === this.pin) {
            await this.DB.exec("BEGIN TRANSACTION");
            try {
                const userID: Snowflake = (await this.DB.get(`SELECT userID FROM pinned WHERE messageID = ?`,
                    reaction.message.id)).userID;
                if (userID === user.id) {
                    if (reaction.count === 0) {
                        await this.DB.run(`DELETE FROM pinned WHERE messageID = ?`,
                            reaction.message.id);
                        await reaction.message.unpin();
                    } else {
                        const other = (await reaction.fetchUsers(1)).first();
                        await this.DB.run(`UPDATE pinned SET userID = ? WHERE messageID = ?`,
                            other.id, reaction.message.id);
                    }
                }
                await this.DB.exec("COMMIT TRANSACTION")
            } catch (err) {
                console.error("Error while processing transaction, rolling back: " + err.stack);
                await this.DB.exec("ROLLBACK TRANSACTION")
            }
        }
    }

    // Given a message with a command, returns the raw content that comes after the message
    // For example: ">anon 123    456   7  " will preserve spaces correctly
    public getRawContent(content: string, offsetIndex: number = 0): string {
        const idx = getNthIndex(content, this.separator, offsetIndex + 1);
        if (idx < 0 || idx === content.length - 1) {
            return "";
        }
        return content.substring(idx + 1);
    }

    private parseContent(content: string): ParsedCommand {
        const args = content.split(this.separator);
        const command = args[0].substring(this.prefix.length);
        args.shift();
        return { command, args }
    }
}
