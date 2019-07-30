import {Module} from "../module";
import {Bot} from "../bot";
import {Message, MessageEmbed, TextChannel, User} from "discord.js";
import {AnonAlias, Record} from "./anon";
import {SettingsConfig} from "./settings.skip";
import {Logs} from "../database/models/logs";

const settingsConfig: SettingsConfig = {
    channel: {
        description: "The channel audit logs are output to"
    }
};

export class AuditModule extends Module {
    constructor(bot: Bot) {
        super(bot, "audit", null, settingsConfig);
    }

    public async log(action: string, title: string, author: User, description: string,
        message?: Message, target?: string, ...fields: {name: string, value: string}[]) :
        Promise<void> {
        const channel = this.bot.guild.channels.get(this.settings("channel")) as TextChannel;
        const embed = new MessageEmbed();
        embed.setTitle(title);
        if (message != null) {
            let content;
            if (message.embeds.length > 0) {
                content = message.embeds[0].description;
            } else {
                content = message.content;
            }
            description += "\n```\n" + content + "\n```";
        }
        if (message != null) {
            description += "\n[Jump to message](" + message.url + ")";
        }
        embed.setDescription(description);
        for (let i = 0; i < fields.length; i++) {
            embed.addField(fields[i].name, fields[i].value);
        }
        embed.setAuthor(author.tag, author.avatarURL());
        embed.setColor(this.bot.displayColor());
        const log = Logs.create({
            userID: author.id,
            action: action,
            target: target != null ? target : (message != null ? message.id : null),
            detail: description
        });
        await Promise.all([channel.send(embed), log]);
    }

    private idenUser(user: User): string {
        return `${user.tag} \`(ID: ${user.id})`;
    }

    private idenMessage(message: Message): string {
        return `\`(ID: ${message.id})\``;
    }

    public async pinLog(user: User, message: Message, type: "pin" | "unpin"): Promise<void> {
        return this.log("PIN_MESSAGE", "Message " + (type === "pin" ? "Pinned" : "Unpinned"),
            user, `User ${this.idenUser(user)} ${type}ned the following message \
            ${this.idenMessage(message)}:`, message);
    }

    public async pinChangeLog(user: User, other: User, message: Message): Promise<void> {
        return this.log("PIN_OWNER_CHANGE", "Message Pin Change", user,
            `User ${this.idenUser(user)} removed their pin reaction from the \
            message ${this.idenMessage(message)} below, which makes user ${this.idenUser(other)} \
            the new owner of the pin.`, message);
    }

    public async blacklist(user: User, blacklistID: string, record: Record) {
        const alias: AnonAlias = record.alias;
        const message: Message = (this.bot.guild.channels.get(record.channelID) as TextChannel)
            .messages.get(record.messageID);
        return this.log("BLACKLIST", "Anon User Blacklisted", user, `User \
            ${this.idenUser(user)} blacklisted anon **${alias}** \`(blacklist ID: ${blacklistID}) \
            because of the following message ${this.idenMessage(message)}:`, message, blacklistID)
    }

    public async unblacklist(user: User, blacklistID: string) {
        return this.log("UNBLACKLIST", "Anon User Unblacklisted", user, `User \
            ${this.idenUser(user)} unblacklisted the anon user with blacklist ID \`${blacklistID}\`.`,
            null, blacklistID);
    }
}