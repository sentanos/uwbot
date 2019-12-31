import {Module} from "../module";
import {Bot} from "../bot";
import {Message, MessageEmbed, TextChannel, User} from "discord.js";
import {AnonAlias, Record} from "./anon";
import {SettingsConfig} from "./settings.skip";
import {Logs} from "../database/models/logs";
import {formatInterval} from "../util";

const settingsConfig: SettingsConfig = {
    channel: {
        description: "The channel audit logs are output to"
    }
};

type Reason = {
    content?: string,
    location?: string,
    jumpType: "message" | "action"
}

export class AuditModule extends Module {
    constructor(bot: Bot) {
        super(bot, "audit", null, settingsConfig);
    }

    public static messageToReason(message: Message): Reason {
        let content;
        if (message.embeds.length > 0) {
            content = message.embeds[0].description;
        } else {
            content = message.content;
        }
        return {
            content: content,
            location: message.url,
            jumpType: "message"
        };
    }

    // action: The action being logged, such as "MUTE" or "BAN"
    // title: The title of the audit log embed
    // author: The user responsible for whatever action is being logged
    // description: A detailed description of the action (the log entry)
    // reason (optional): A reason for the action. The jumpType is required if a reason is
    //     provided, which determines if the link is "Jump to message" or "Jump to action".
    //     Content may be the content of a message that is linked to the reason, or a manually
    //     entered reason. Location is a link to the related item, which may be a message made
    //     by an offender (message jumpType) or a command made by a moderator (action jumpType)
    // target (optional): If applicable, the target of the action.
    // color (optional): A custom color for the log embed. Default is display color.
    // fields (optional): Additional embed fields
    public async log(action: string, title: string, author: User, description: string,
        reason?: Reason, target?: string, color?: number,  ...fields: {name: string, value: string}[]) :
        Promise<void> {
        const channel = this.bot.guild.channels.get(this.settings("channel")) as TextChannel;
        const embed = new MessageEmbed();
        embed.setTitle(title);
        if (reason != null && reason.content != null) {
            description += "\n```\n" + reason.content + "\n```";
        }
        if (reason != null && reason.location != null) {
            if (reason.content == null) {
                description += "\n";
            }
            description += `\n[Jump to ${reason.jumpType}](${reason.location})`;
        }
        embed.setDescription(description);
        for (let i = 0; i < fields.length; i++) {
            embed.addField(fields[i].name, fields[i].value);
        }
        embed.setAuthor(author.tag, author.avatarURL());
        embed.setColor(color != null ? color : this.bot.displayColor());
        const log = Logs.create({
            userID: author.id,
            action: action,
            target: target != null ? target : (reason != null ? reason.location : null),
            detail: description
        });
        await Promise.all([channel.send(embed), log]);
    }

    private static idenUser(user: User): string {
        return `${user.tag} \`(ID: ${user.id})\``;
    }

    private static idenMessage(message: Message): string {
        return `\`(ID: ${message.id})\``;
    }

    public async pinLog(user: User, message: Message, type: "pin" | "unpin"): Promise<void> {
        return this.log("PIN_MESSAGE", "Message " + (type === "pin" ? "Pinned" : "Unpinned"),
            user, `User ${AuditModule.idenUser(user)} ${type}ned the following message ` +
            `${AuditModule.idenMessage(message)}:`, AuditModule.messageToReason(message));
    }

    public async pinChangeLog(user: User, other: User, message: Message): Promise<void> {
        return this.log("PIN_OWNER_CHANGE", "Message Pin Change", user,
            `User ${AuditModule.idenUser(user)} removed their pin reaction from the ` +
            `message ${AuditModule.idenMessage(message)} below, which makes user ` +
            `${AuditModule.idenUser(other)} the new owner of the pin.`,
            AuditModule.messageToReason(message));
    }

    public async blacklist(user: User, blacklistID: string, record: Record) {
        const alias: AnonAlias = record.alias;
        const message: Message = await (this.bot.guild.channels.get(record.channelID) as TextChannel)
            .messages.fetch(record.messageID);
        return this.log("BLACKLIST", "Anon User Blacklisted", user,
            `User ${AuditModule.idenUser(user)} blacklisted anon **${alias}** ` +
            `\`(blacklist ID: ${blacklistID})\` ` +
            `because of the following message ${AuditModule.idenMessage(message)}:`,
            AuditModule.messageToReason(message), blacklistID)
    }

    public async timeout(user: User, blacklistID: string, record: Record, interval: number) {
        const alias: AnonAlias = record.alias;
        const message: Message = await (this.bot.guild.channels.get(record.channelID) as TextChannel)
            .messages.fetch(record.messageID);
        return this.log("TIMEOUT", "Anon User Timed Out", user,
            `User ${AuditModule.idenUser(user)} timed out anon **${alias}** ` +
            `\`(blacklist ID: ${blacklistID})\` ` +
            `for ${formatInterval(interval)} because of the following message ` +
            `${AuditModule.idenMessage(message)}:`, AuditModule.messageToReason(message), blacklistID)
    }

    public async mute(moderator: User, target: User, reason: string, moderationMessage: Message,
                      interval: number) {
        return this.log("MUTE", "User Muted", moderator,
        `Moderator ${AuditModule.idenUser(moderator)} muted user ${AuditModule.idenUser(target)} ` +
        `for ${formatInterval(interval)} for the following reason:`,
        {content: reason, location: moderationMessage.url, jumpType: "action"}, target.id, 16711680)
    }

    public async unmute(moderator: User, target: User, moderationMessage: Message) {
        return this.log("UNMUTE", "User Unmuted", moderator,
        `Moderator ${AuditModule.idenUser(moderator)} unmuted user ` +
            AuditModule.idenUser(target),
            {location: moderationMessage.url, jumpType: "action"}, target.id, 16711680)
    }

    public async kick(moderator: User, target: User, reason: string, moderationMessage: Message) {
        return this.log("KICK", "User Kicked", moderator, `Moderator ` +
        `${AuditModule.idenUser(moderator)} kicked user ${AuditModule.idenUser(target)} ` +
        `for the following reason:`, {content: reason, location: moderationMessage.url, jumpType: "action"},
        target.id, 16711680)
    }

    public async ban(moderator: User, target: User, reason: string, moderationMessage: Message) {
        return this.log("BAN", "User Banned", moderator, `Moderator ` +
        `${AuditModule.idenUser(moderator)} banned user ${AuditModule.idenUser(target)} for the ` +
        `following reason:`, {content: reason, location: moderationMessage.url, jumpType: "action"},
        target.id, 16711680)
    }

    public async tempBan(moderator: User, target: User, reason: string, moderationMessage: Message,
                      interval: number) {
        return this.log("TEMP_BAN", "User Temporarily Banned", moderator, `Moderator ` +
        `${AuditModule.idenUser(moderator)} temporarily banned user ${AuditModule.idenUser(target)} ` +
        `for ${formatInterval(interval)} for the following reason:`,
        {content: reason, location: moderationMessage.url, jumpType: "action"}, target.id, 16711680)
    }

    public async unblacklist(user: User, blacklistID: string) {
        return this.log("UNBLACKLIST", "Anon User Unblacklisted", user, `User ` +
            `${AuditModule.idenUser(user)} unblacklisted the anon user with blacklist ID ` +
            `\`${blacklistID}\`.`, null, blacklistID);
    }
}