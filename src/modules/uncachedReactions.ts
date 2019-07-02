import {Module} from "../module";
import {Bot} from "../bot";
import {Channel, DMChannel, Emoji, MessageReaction, TextChannel} from "discord.js";

export class UncachedReactionsModule extends Module {
    private readonly events;

    constructor(bot: Bot) {
        super(bot, "uncachedReactions");
        this.events = {
            MESSAGE_REACTION_ADD: 'messageReactionAdd',
            MESSAGE_REACTION_REMOVE: 'messageReactionRemove',
        };
        this.bot.client.on("raw", this.raw.bind(this));
    }

    // WARNING: USES UNDOCUMENTED FUNCTIONALITY OF DISCORD.JS
    //
    // Based off of:
    // https://discordjs.guide/popular-topics/reactions.html#emitting-the-event-s-yourself
    private async raw(event: any) {
        if (!this.events.hasOwnProperty(event.t)) return;

        const { d: data } = event;
        const user = this.bot.client.users.get(data.user_id);
        const rawChannel: Channel | DMChannel = this.bot.client.channels.get(data.channel_id) ||
            await user.createDM();

        let channel: TextChannel | DMChannel;
        if (rawChannel instanceof Channel) {
            channel = rawChannel as TextChannel
        } else {
            channel = rawChannel;
        }

        if (channel.messages.has(data.message_id)) return;

        const message = await channel.fetchMessage(data.message_id);
        const emojiKey = (data.emoji.id) ? `${data.emoji.name}:${data.emoji.id}` : data.emoji.name;
        let rawReaction: MessageReaction | void = message.reactions.get(emojiKey);
        let reaction: MessageReaction;

        if (rawReaction == null) {
            const emoji = new Emoji(this.bot.client.guilds.get(data.guild_id), data.emoji);
            reaction = new MessageReaction(message, emoji, 1, data.user_id === this.bot.client.user.id);
        } else {
            reaction = rawReaction;
        }

        this.bot.client.emit(this.events[event.t], reaction, user);
    }
}