import {Module} from "../module";
import {Bot} from "../bot";
import {Message, MessageEmbed, Snowflake, TextChannel, User} from "discord.js";
import {AnonAlias, Record} from "./anon";

export class AuditModule extends Module {
    public readonly channel: TextChannel;

    constructor(bot: Bot) {
        super(bot, "audit");
        this.channel = this.bot.client.channels.get(this.bot.config.audit.channel) as TextChannel;
    }

    private getPermaLink(guild: Snowflake, channel: Snowflake, message: Snowflake) {
        return `https://discordapp.com/channels/${guild}/${channel}/${message}`;
    }

    private getPermaLinkFromMessage(message: Message) {
        return this.getPermaLink(message.guild.id, message.channel.id, message.id);
    }

    public async log(title: string, author: User | void, description: string,
        targetMessage: string, url: string, ...fields: {name: string, value: string}[]) :
        Promise<void> {
        const embed = new MessageEmbed();
        embed.setTitle(title);
        if (targetMessage !== "") {
            description += "\n```\n" + targetMessage + "\n```";
        }
        if (url !== "") {
            description += "\n[Jump to message](" + url + ")";
        }
        embed.setDescription(description);
        for (let i = 0; i < fields.length; i++) {
            embed.addField(fields[i].name, fields[i].value);
        }
        if (author instanceof User) {
            embed.setAuthor(author.tag, author.avatarURL());
        }
        embed.setColor(this.bot.displayColor());
        await this.channel.send(embed);
    }

    public async pinLog(user: User, message: Message, type: "pin" | "unpin"): Promise<void> {
        return this.log("Message " + (type === "pin" ? "Pinned" : "Unpinned"), user,
            `User ${user.tag} \`(ID: ${user.id})\` ${type}ned the following message \
            \`(ID: ${message.id})\`:`, message.content, this.getPermaLinkFromMessage(message));
    }

    public async pinChangeLog(user: User, other: User, message: Message): Promise<void> {
        return this.log("Message Pin Change", user,
            `User ${user.tag} \`(ID: ${user.id})\` removed their pin reaction from the \
            message \`(ID: ${message.id})\` below, which makes user ${other.tag} \
            \`(ID: ${other.id})\` the new owner of the pin.`, message.content,
            this.getPermaLinkFromMessage(message));
    }

    public async blacklist(user: User, blacklistID: string, record: Record) {
        const alias: AnonAlias = record.alias;
        const message: Message = (this.bot.guild.channels.get(record.channelID) as TextChannel)
            .messages.get(record.messageID);
        return this.log("Anon User Blacklisted", user, `User ${user.tag} \
            \`(ID: ${user.id})\` blacklisted anon **${alias}** \`(blacklist ID: ${blacklistID})\` \
            because of the following message \`(ID: ${message.id})\`:`,
            message.embeds[0].description, this.getPermaLinkFromMessage(message))
    }

    public async unblacklist(user: User, blacklistID: string) {
        return this.log("Anon User Unblacklisted", user, `User ${user.tag} \
            \`(ID: ${user.id})\` unblacklisted the anon user with blacklist ID \`${blacklistID}\`.`,
            "", "");
    }
}