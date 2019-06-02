import {Availability, Command, CommandsModule, Permission} from "../modules/commands";
import {Message, RichEmbed} from "discord.js";

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
        const embed: RichEmbed = new RichEmbed();
        const handler: CommandsModule = this.bot.getModule("commands") as CommandsModule;
        if (search == null) {
            embed.setTitle("Command");
            handler.commands.forEach((command: Command) => {
                embed.addField(command.names.join(", "), command.toString());
            });
        } else {
            const command: Command | void = handler.findCommand(search);
            if (command instanceof Command) {
                embed.setTitle(command.names.join(", "));
                embed.setDescription(command.toString())
            } else {
                throw new Error("SAFE: Command not found")
            }
        }
        embed.setColor("#00ff00");
        if (message.guild != null) {
            return Promise.all([message.author.send(embed), message.delete()]);
        } else {
            return message.author.send(embed);
        }
    }
}

export class PinnedBy extends Command {
    constructor(bot) {
        super(bot, {
            names: ["pinnedby", "pinner", "whopinned"],
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

export class Source extends Command {
    constructor(bot) {
        super(bot, {
            names: ["source"],
            usages: {
                "Get a link to the bot's source code": []
            },
            permission: Permission.None,
            availability: Availability.All
        });
    }

    async exec(message: Message) {
        message.channel.send("My source code is here: https://github.com/sentanos/uwbot\nI" +
            " welcome contributions from anyone!");
    }
}
