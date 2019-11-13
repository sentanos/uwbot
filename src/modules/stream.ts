import {Module} from "../module";
import {Bot} from "../bot";
import {
    DMChannel,
    GuildChannel,
    Message,
    MessageEmbed,
    Snowflake,
    User
} from "discord.js";
import {AnonModule} from "./anon";
import {CommandsModule} from "./commands";

export class StreamModule extends Module {
    private anon: AnonModule;
    private commands: CommandsModule;
    private readonly streamers: Map<Snowflake, User>;
    // Map of user ID to the last stream message sent to that user
    private readonly lastMessageCache: Map<Snowflake, Snowflake>;

    constructor(bot: Bot) {
        super(bot, "stream", ["anon"]);
        this.streamers = new Map<Snowflake, User>();
        this.lastMessageCache = new Map<Snowflake, Snowflake>();
    }

    public async initialize() {
        this.anon = this.bot.getModule("anon") as AnonModule;
        this.commands = this.bot.getModule("commands") as CommandsModule;
        this.listen("message", this.onMessage.bind(this));
    }

    public addStreamer(user: User): void {
        this.streamers.set(user.id, user);
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

    public async updateMessage(original: Message, add: Message | MessageEmbed): Promise<void> {
        await original.edit(this.buildEmbed(add, original.embeds[0].description));
    }

    private async addMessage(message: Message | MessageEmbed, target: DMChannel): Promise<Message> {
        if (this.lastMessageCache.has(target.recipient.id)) {
            const lastMessage: Message = (await target.messages.fetch({limit: 1})).first();
            if (lastMessage.id === this.lastMessageCache.get(target.recipient.id)
                && lastMessage.embeds.length > 0
                && ((message instanceof Message
                        && lastMessage.embeds[0].author != null
                        && lastMessage.embeds[0].author.name === message.author.tag)
                    || (message instanceof MessageEmbed
                        && message.title === lastMessage.embeds[0].title
                        && message.color === lastMessage.embeds[0].color))) {
                await this.updateMessage(lastMessage, message);
                return lastMessage;
            }
        }
        const last = await target.send(this.buildEmbed(message));
        this.lastMessageCache.set(target.recipient.id, last.id);
        return last;
    }

    public async broadcast(message: Message | MessageEmbed, exclude?: Set<Snowflake>): Promise<void> {
        let jobs = [];
        for (const [id, streamer] of this.streamers) {
            if (exclude == null || !exclude.has(id)) {
                jobs.push(this.addMessage(message, streamer.dmChannel || await streamer.createDM()));
            }
        }
        await Promise.all(jobs);
    }

    private async onMessage(message: Message) {
        if (message.guild != null
            && message.guild.id === this.bot.guild.id) {
            if (((message.channel) as GuildChannel).name === "anonymous"
                && message.author.id !== this.bot.client.user.id) {
                await this.broadcast(message);
            }
        } else if (this.streamers.has(message.author.id)) {
            const prefix = this.commands.settings("prefix");
            if (!message.content.startsWith(prefix)
                || this.commands.findCommand(message.content.substring(prefix.length)) == null) {
                await this.anon.sendAnonMessage("anonymous", message, 0);
            }
        }
    }
}