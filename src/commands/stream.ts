import {
    Availability,
    Command,
    CommandConfig, CommandsModule,
    PartialCommandConfig,
    Permission
} from "../modules/commands";
import {Message, MessageEmbed} from "discord.js";
import {Bot} from "../bot";
import {StreamData, StreamModule} from "../modules/stream";
import {AnonModule, AnonUser} from "../modules/anon";

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

    activateStream(message: Message, data: StreamData): Promise<Message> {
        this.stream.addStreamer(data);
        return message.channel.send(new MessageEmbed()
            .setColor(this.bot.displayColor())
            .setTitle("Streaming mode enabled")
            .setDescription("All messages you send through DMs (excluding commands) will be" +
                " automatically sent as an anonymous message. All messages sent in the anonymous" +
                " channel will be sent back to you through DMs. To end streaming mode use the" +
                " command " + this.handler.commandTip("stream end")));
    }
}

export class StreamCommand extends RequiresStream {
    constructor(bot) {
        super(bot, {
            names: ["stream"],
            usages: {
                ["Enables anonymous message streaming mode to the anonymous channel. In streaming" +
                    " mode, every message you send to the bot (excluding commands) will" +
                    " automatically be sent as an anonymous message. All messages sent in the" +
                    " anonymous channel will be sent through bot DMs as well."]: [],
                "Enables streaming mode for a specific channel": ["channel"]
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.ChatOnly
        });
    }

    async exec(message: Message, channel?: string): Promise<Message> {
        if (channel == null) {
            channel = "anonymous"
        }
        if (!this.stream.settingsArr("streamableChannels").includes(channel)) {
            throw new Error("SAFE: The given channel can not be streamed. Make sure to use the" +
                " full channel name.");
        }
        return this.activateStream(message, {
            user: message.author,
            type: "channel",
            target: channel
        });
    }
}

export class StreamMessageCommand extends RequiresStream {
    constructor(bot) {
        super(bot, {
            names: ["stream message"],
            usages: {
                "Enables streaming mode for private messaging an anonymous user (see stream)": ["user"]
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.ChatOnly
        });
    }

    async exec(message: Message, target: string): Promise<Message> {
        const anon: AnonModule = this.bot.getModule("anon") as AnonModule;
        const user = parseInt(target, 10);
        if (!(anon.getAnonUserByAlias(user) instanceof AnonUser)) {
            throw new Error("SAFE: The given user does not exist");
        }
        return this.activateStream(message, {
            user: message.author,
            type: "message",
            target: user
        });
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
