import {Availability, Command, Permission} from "../command";
import {Message} from "discord.js";

export class Ping extends Command {
    constructor(bot) {
        super(bot, {
            names: ["ping"],
            usages: {
                "Pong": []
            },
            permission: Permission.None,
            availability: Availability.All
        });
    }

    async exec(message: Message) {
        return message.channel.send("pong (" + Math.round(this.bot.client.ping) + "ms)");
    }
}

export class Commands extends Command {
    constructor(bot) {
        super(bot, {
            names: ["cmds", "commands", "help"],
            usages: {
                "Get a list of all commands": [],
                "Get the usage of a specific command": ["command"]
            },
            permission: Permission.None,
            availability: Availability.All
        });
    }

    async exec(message: Message, search?: string) {
        let res = "";
        if (search == null) {
            this.bot.commands.forEach((command: Command) => {
                res += command.toString() + "\n\n";
            });
        } else {
            const command: Command | void = this.bot.findCommand(search);
            if (command instanceof Command) {
                res += command.toString();
            } else {
                res += "Error: Specified command not found";
            }
        }
        if (message.guild != null) {
            return Promise.all([message.author.send(res), message.delete()]);
        } else {
            return message.author.send(res);
        }
    }
}

export class WhoPinned extends Command {
    constructor(bot) {
        super(bot, {
            names: ["whopinned"],
            usages: {
                "Show who pinned a message using the pin feature": ["messageID"]
            },
            permission: Permission.None,
            availability: Availability.GuildOnly
        });
    }

    async exec(message: Message, messageID: string) {
        const row = await this.bot.DB.get(`SELECT userID FROM pinned WHERE messageID = ?`,
            messageID);
        if (row == null) {
            throw new Error("SAFE: Message not found")
        }
        const member = await this.bot.guild.fetchMember(row.userID);
        if (member == null) {
            return message.reply(row.userID);
        } else {
            return message.reply(member.user.tag);
        }
    }
}