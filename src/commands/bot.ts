import {
    Availability,
    Command,
    CommandConfig,
    PartialCommandConfig,
    Permission
} from "../modules/commands";
import {Message, MessageEmbed} from "discord.js";
import {alphabetical} from "../util";
import {Bot} from "../bot";
import {WhitelistModule} from "../modules/whitelist";

class RequiresCommand extends Command {
    constructor(bot: Bot, config: PartialCommandConfig) {
        let withCategory = config as CommandConfig;
        withCategory.category = "bot";
        super(bot, withCategory);
    }

    async sendCommandsMessage(sourceMessage: Message, newMessage: MessageEmbed):
        Promise<Message> {
        if (sourceMessage.guild == null
            || (
                this.bot.isEnabled("whitelist")
                && await (this.bot.getModule("whitelist") as WhitelistModule).
                    channels.has(sourceMessage.channel.id)
            )) {
            return await sourceMessage.channel.send({embeds: [newMessage]});
        } else {
            return (await Promise.all([sourceMessage.author.send({embeds: [newMessage]}),
                sourceMessage.delete()]))[0];
        }
    }
}


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

    async exec(message: Message): Promise<Message> {
        return message.channel.send("pong " + new Date());
    }
}

export class Commands extends RequiresCommand {
    constructor(bot) {
        super(bot, {
            names: ["cmds", "commands", "help"],
            usages: {
                "Get a list of command categories": [],
                "Get all commands in a specific category": ["category"],
            },
            permission: Permission.None,
            availability: Availability.All
        });
    }

    async exec(message: Message, category?: string): Promise<Message> {
        const embed: MessageEmbed = new MessageEmbed();
        if (category == null) {
            embed.setTitle("Command Categories");
            let categories = new Set<string>();
            this.handler.commands.forEach((command: Command) => {
                categories.add(command.category);
            });
            embed.setDescription(alphabetical([...categories]).join("\n"));
            embed.setFooter(`Use ${this.handler.commandTip("cmds", "category")} to get commands in a category`);
        } else {
            let primaryNames = new Set<string>();
            this.handler.commands.forEach((command: Command) => {
                if (command.category === category) {
                    primaryNames.add(command.names[0]);
                }
            });
            if (primaryNames.size === 0) {
                throw new Error("SAFE: Category not found");
            }
            let commands = [...primaryNames.keys()];
            alphabetical(commands);
            commands.forEach((name: string) => {
                const command = this.handler.commands.get(name);
                embed.addField(command.names.join(", "), command.toString());
            });
            embed.setTitle("Commands > " + category);
        }
        embed.setColor(this.bot.displayColor());
        return this.sendCommandsMessage(message, embed);
    }
}

export class GetCommand extends RequiresCommand {
    constructor(bot) {
        super(bot, {
            names: ["cmd", "command"],
            usages: {
                "Get information about a specific command": ["command"]
            },
            permission: Permission.None,
            availability: Availability.All
        });
    }

    async exec(message: Message): Promise<Message> {
        const embed: MessageEmbed = new MessageEmbed();
        const search = this.handler.getRawContent(message.content);
        if (!this.handler.commands.has(search)) {
            throw new Error("SAFE: Command not found")
        }
        const command = this.handler.commands.get(search);
        embed.setTitle(command.names.join(", "))
            .setDescription(command.toString())
            .setColor(this.bot.displayColor());
        return this.sendCommandsMessage(message, embed);
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

    async exec(message: Message): Promise<Message> {
        return message.channel.send({embeds: [new MessageEmbed()
            .setDescription("My source code is [here](https://github.com/sentanos/uwbot). I" +
                " welcome contributions from anyone!")
            .setFooter("Raw URL: https://github.com/sentanos/uwbot")
            .setColor(this.bot.displayColor())
        ]});
    }
}
