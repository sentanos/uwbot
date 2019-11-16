import {Module} from "../module";
import {Bot} from "../bot";
import {
    Channel,
    DMChannel,
    GuildChannel,
    Message,
    MessageEmbed,
    Snowflake,
    User
} from "discord.js";
import {AnonAlias, AnonModule, AnonUser} from "./anon";
import {CommandsModule} from "./commands";
import {sendAndMerge} from "../util";
import {SettingsConfig} from "./settings.skip";

export type StreamData = {
    user: User,
    type: "channel" | "message",
    target: string | AnonAlias
}

const settingsConfig: SettingsConfig = {
    streamableChannels: {
        description: "A comma separated list of channel _names_ that can be streamed.",
        default: "anonymous"
    }
};

export class StreamModule extends Module {
    private anon: AnonModule;
    private commands: CommandsModule;
    private readonly streamers: Map<Snowflake, StreamData>;
    // Map of user ID to the last stream message sent to that user
    private readonly lastMessageCache: Map<Snowflake, Snowflake>;

    constructor(bot: Bot) {
        super(bot, "stream", ["anon"], settingsConfig);
        this.streamers = new Map<Snowflake, StreamData>();
        this.lastMessageCache = new Map<Snowflake, Snowflake>();
    }

    public async initialize() {
        this.anon = this.bot.getModule("anon") as AnonModule;
        this.commands = this.bot.getModule("commands") as CommandsModule;
        this.listen("message", this.onMessage.bind(this));
    }

    public addStreamer(data: StreamData): void {
        this.streamers.set(data.user.id, data);
    }

    public removeStreamer(user: User): void {
        this.streamers.delete(user.id);
    }

    private buildEmbed(newMessage: Message | MessageEmbed, prevContent?: string): MessageEmbed {
        let content = "";
        if (newMessage instanceof MessageEmbed) {
            if (prevContent != null) {
                newMessage.setDescription(prevContent + "\n" + newMessage.description);
            }
            return newMessage;
        }
        if (prevContent != null) {
            content += prevContent + "\n";
        }
        content += newMessage.content;
        let author = newMessage.author;
        return new MessageEmbed()
            .setAuthor(author.tag, author.avatarURL())
            .setDescription(content)
            .setColor(this.bot.guild.member(author).displayColor);
    }

    private async addMessage(message: Message | MessageEmbed, target: DMChannel): Promise<Message> {
       const res = await sendAndMerge(target, this.buildEmbed(message), (lastMessage) =>
            lastMessage.id === this.lastMessageCache.get(target.recipient.id));
       if (!res.merged) {
           this.lastMessageCache.set(target.recipient.id, res.message.id);
       }
       return res.message;
    }

    public async broadcast(source: GuildChannel, message: Message | MessageEmbed,
                           exclude?: Set<Snowflake>): Promise<void> {
        let jobs = [];
        for (const [id, streamer] of this.streamers) {
            if (streamer.type === "channel"
                && streamer.target === source.name
                && (exclude == null || !exclude.has(id))) {
                jobs.push(this.addMessage(message,
                    streamer.user.dmChannel || await streamer.user.createDM()));
            }
        }
        await Promise.all(jobs);
    }

    private async onMessage(message: Message) {
        if (message.guild != null
            && message.guild.id === this.bot.guild.id) {
            const gc = (message.channel) as GuildChannel;
            if (this.settingsArr("streamableChannels").includes(gc.name)
                && message.author.id !== this.bot.client.user.id) {
                await this.broadcast(gc, message);
            }
        } else if (this.streamers.has(message.author.id)) {
            const prefix = this.commands.settings("prefix");
            const streamer = this.streamers.get(message.author.id);
            if (!message.content.startsWith(prefix)
                || this.commands.findCommand(message.content.substring(prefix.length)) == null) {
                if (streamer.type === "channel" && typeof streamer.target === "string") {
                    await this.anon.sendAnonMessage(streamer.target, message, 0);
                } else if (streamer.type === "message" && typeof streamer.target === "number") {
                    const target = this.anon.getAnonUserByAlias(streamer.target);
                    if (target instanceof AnonUser) {
                        await this.anon.sendAnonMessage(target, message, 0);
                    } else {
                        await message.channel.send("Error: Anon user does not exist. They may" +
                            " have changed their ID since the stream started.")
                    }
                } else {
                    console.error("Unknown streamer data: " + streamer);
                }
            }
        }
    }
}