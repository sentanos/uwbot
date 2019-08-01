import {
    Availability,
    Command,
    CommandAndAlias,
    CommandsModule,
    Permission
} from "../modules/commands";
import {Message, MessageEmbed} from "discord.js";
import {alphabetical} from "../util";

export class Ping extends Command {
    constructor(bot) {
        super(bot, {
            names: ["ping"],
            usages: {
                "Pong": []
            },
            permission: Permission.None,
            availability: Availability.All,
            category: "bot"
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
                "Get a list of command categories": [],
                "Get all commands in a specific category": ["category"],
            },
            permission: Permission.None,
            availability: Availability.All,
            category: "bot"
        });
    }

    async exec(message: Message, category?: string) {
        const embed: MessageEmbed = new MessageEmbed();
        const handler: CommandsModule = this.bot.getModule("commands") as CommandsModule;
        if (category == null) {
            embed.setTitle("Command Categories");
            let categories = new Set<string>();
            handler.commands.forEach((command: Command) => {
                categories.add(command.category);
            });
            embed.setDescription(alphabetical([...categories]).join("\n"));
            embed.setFooter(`Use ${handler.settings("prefix")}cmds${handler.settings("separator")} \
            <category> to get commands in a category`);
        } else {
            let commands = [];
            handler.commands.forEach((command: Command) => {
                if (command.category === category) {
                    commands.push(command);
                }
            });
            if (commands.length === 0) {
                throw new Error("SAFE: Category not found");
            }
            commands.sort((a: Command, b: Command): number => {
                if (a.names[0] < b.names[0]) {
                    return -1;
                } else if (a.names[0] > b.names[0]) {
                    return 1;
                } else {
                    return 0;
                }
            });
            commands.forEach((command: Command) => {
                embed.addField(command.names.join(", "), command.toString());
            });
            embed.setTitle("Commands > " + category);
        }
        embed.setColor(this.bot.displayColor());
        if (message.guild != null) {
            return Promise.all([message.author.send(embed), message.delete()]);
        } else {
            return message.author.send(embed);
        }
    }
}

export class GetCommand extends Command {
    constructor(bot) {
        super(bot, {
            names: ["cmd", "command"],
            usages: {
                "Get information about a specific command": ["command"]
            },
            permission: Permission.None,
            availability: Availability.All,
            category: "bot"
        });
    }

    async exec(message: Message) {
        const embed: MessageEmbed = new MessageEmbed();
        const handler: CommandsModule = this.bot.getModule("commands") as CommandsModule;
        const search = handler.getRawContent(message.content);
        const maybe: CommandAndAlias | void = handler.findCommand(search);
        if (maybe == null) {
            throw new Error("SAFE: Command not found")
        }
        const command = (maybe as CommandAndAlias).command;
        embed.setTitle(command.names.join(", "))
            .setDescription(command.toString())
            .setColor(this.bot.displayColor());
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
            availability: Availability.All,
            category: "bot"
        });
    }

    async exec(message: Message) {
        return message.channel.send(new MessageEmbed()
            .setDescription("My source code is [here](https://github.com/sentanos/uwbot). I" +
                " welcome contributions from anyone!")
            .setFooter("Raw URL: https://github.com/sentanos/uwbot")
            .setColor(this.bot.displayColor()));
    }
}
