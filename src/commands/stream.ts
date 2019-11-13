import {
    Availability,
    Command,
    CommandConfig, CommandsModule,
    PartialCommandConfig,
    Permission
} from "../modules/commands";
import {Message, MessageEmbed} from "discord.js";
import {Bot} from "../bot";
import {StreamModule} from "../modules/stream";

class RequiresStream extends Command {
    protected stream: StreamModule;

    constructor(bot: Bot, config: PartialCommandConfig) {
        let withCategory = config as CommandConfig;
        withCategory.category = "anon";
        super(bot, withCategory);
    }

    async run(message?: Message, ...args: string[]): Promise<Message | void> {
        this.stream = this.bot.getModule("stream") as StreamModule;
        return super.run(message, ...args);
    }
}

export class StreamCommand extends RequiresStream {
    constructor(bot) {
        super(bot, {
            names: ["stream"],
            usages: {
                ["Enables anonymous message streaming mode. In streaming mode, every message you" +
                    " sent to the bot (excluding commands) will automatically be sent as an" +
                    " anonymous message. All messages sent in the anonymous channel will be sent" +
                    " through bot DMs as well. To end streaming mode use the command >stream end"]: []
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.ChatOnly
        });
    }

    async exec(message: Message): Promise<Message> {
        const handler: CommandsModule = this.bot.getModule("commands") as CommandsModule;
        this.stream.addStreamer(message.author);
        return message.channel.send(new MessageEmbed()
            .setColor(this.bot.displayColor())
            .setTitle("Streaming mode enabled")
            .setDescription("All messages you send through DMs (excluding commands) will be" +
                " automatically sent as an anonymous message. All messages sent in the anonymous" +
                " channel will be sent back to you through DMs. To end streaming mode use the" +
                " command " + handler.settings("prefix") + "stream end"));
    }
}

export class StreamEndCommand extends RequiresStream {
    constructor(bot) {
        super(bot, {
            names: ["stream end"],
            usages: {
                "Disable streaming mode": []
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.ChatOnly
        });
    }

    async exec(message: Message): Promise<Message> {
        this.stream.removeStreamer(message.author);
        return message.channel.send(new MessageEmbed()
            .setColor(this.bot.displayColor())
            .setTitle("Streaming mode disabled"));
    }
}
