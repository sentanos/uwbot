import {Module} from "../module";
import {Bot} from "../bot";
import {Message, MessageEmbed, TextChannel, User} from "discord.js";
import {AnonAlias, Record} from "./anon";
import {SettingsConfig} from "./settings.skip";

const settingsConfig: SettingsConfig = {
    channel: {
        description: "The channel audit logs are output to"
    }
};

export class AuditModule extends Module {
    constructor(bot: Bot) {
        super(bot, "audit", null, settingsConfig);
    }

    public async log(title: string, author: User | void, description: string,
        targetMessage: string, url: string, ...fields: {name: string, value: string}[]) :
        Promise<void> {
        const channel = this.bot.guild.channels.get(this.settings("channel")) as TextChannel;
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
        await channel.send(embed);
    }

    public async pinLog(user: User, message: Message, type: "pin" | "unpin"): Promise<void> {
        return this.log("Message " + (type === "pin" ? "Pinned" : "Unpinned"), user,
            `User ${user.tag} \`(ID: ${user.id})\` ${type}ned the following message \
            \`(ID: ${message.id})\`:`, message.content, message.url);
    }

    public async pinChangeLog(user: User, other: User, message: Message): Promise<void> {
        return this.log("Message Pin Change", user,
            `User ${user.tag} \`(ID: ${user.id})\` removed their pin reaction from the \
            message \`(ID: ${message.id})\` below, which makes user ${other.tag} \
            \`(ID: ${other.id})\` the new owner of the pin.`, message.content, message.url);
    }

    public async blacklist(user: User, blacklistID: string, record: Record) {
        const alias: AnonAlias = record.alias;
        const message: Message = (this.bot.guild.channels.get(record.channelID) as TextChannel)
            .messages.get(record.messageID);
        return this.log("Anon User Blacklisted", user, `User ${user.tag} \
            \`(ID: ${user.id})\` blacklisted anon **${alias}** \`(blacklist ID: ${blacklistID})\` \
            because of the following message \`(ID: ${message.id})\`:`,
            message.embeds[0].description, message.url)
    }

    public async unblacklist(user: User, blacklistID: string) {
        return this.log("Anon User Unblacklisted", user, `User ${user.tag} \
            \`(ID: ${user.id})\` unblacklisted the anon user with blacklist ID \`${blacklistID}\`.`,
            "", "");
    }
}