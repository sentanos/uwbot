import {
    Availability,
    Command,
    CommandAndAlias,
    CommandsModule,
    Permission
} from "../modules/commands";
import {Message, MessageEmbed} from "discord.js";

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
        return message.channel.send("pong");
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

    async exec(message: Message) {
        const embed: MessageEmbed = new MessageEmbed();
        const handler: CommandsModule = this.bot.getModule("commands") as CommandsModule;
        const search = handler.getRawContent(message.content);
        if (search === "") {
            embed.setTitle("Commands");
            handler.commands.forEach((command: Command) => {
                embed.addField(command.names.join(", "), command.toString());
            });
        } else {
            const maybe: CommandAndAlias | void = handler.findCommand(search);
            if (maybe == null) {
                throw new Error("SAFE: Command not found")
            }
            const command = (maybe as CommandAndAlias).command;
            embed.setTitle(command.names.join(", "));
            embed.setDescription(command.toString())
        }
        embed.setColor("#00ff00");
        if (message.guild != null) {
            return Promise.all([message.author.send(embed), message.delete()]);
        } else {
            return message.author.send(embed);
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
        return message.channel.send("My source code is here: https://github.com/sentanos/uwbot\nI" +
            " welcome contributions from anyone!");
    }
}
