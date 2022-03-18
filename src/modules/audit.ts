import {Module} from "../module";
import {Bot} from "../bot";
import {Message, MessageEmbed, TextChannel, User} from "discord.js";
import {AnonAlias, Record} from "./anon";
import {SettingsConfig} from "./settings.skip";
import {Logs} from "../database/models/logs";
import {formatDuration, formatTime, titlecase} from "../util";
import moment, {Duration} from "moment";
import {PunishmentRoleType} from "./moderation";

const settingsConfig: SettingsConfig = {
    channel: {
        description: "The channel audit logs are output to"
    },
    logDeletes: {
        description: "If true, log message deletions to the audit channel. Otherwise do not.",
        default: "false"
    }
};

type Reason = {
    content?: string,
    location?: string,
    embeds: MessageEmbed[],
    jumpType: "message" | "action"
}

export class AuditModule extends Module {
    constructor(bot: Bot) {
        super(bot, "audit", null, settingsConfig);
    }

    public async initialize(): Promise<void> {
        if (this.settings("logDeletes") === "true") {
            this.listen("messageDelete", this.onDelete.bind(this));
        }
    }

    public static messageToReason(message: Message): Reason {
        return {
            content: message.content,
            location: message.url,
            jumpType: "message",
            embeds: message.embeds
        };
    }

    // action: The action being logged, such as "MUTE" or "BAN"
    // title: The title of the audit log embed
    // author: The user responsible for whatever action is being logged
    // description: A detailed description of the action (the log entry)
    // reason (optional): A reason for the action. The jumpType is required if a location is
    //     provided, which determines if the link is "Jump to message" or "Jump to action".
    //     Content may be the content of a message that is linked to the reason, or a manually
    //     entered reason. Location is a link to the related item, which may be a message made
    //     by an offender (message jumpType) or a command made by a moderator (action jumpType)
    // target (optional): If applicable, the target of the action.
    // color (optional): A custom color for the log embed. Default is display color.
    // fields (optional): Additional embed fields
    public async log(action: string, title: string, description: string, author?: User,
                     reason?: Reason, target?: string, color?: number, mmm?: Message,
                     ...fields: {name: string, value: string}[]) : Promise<void> {
        const channel = this.bot.guild.channels.cache.get(this.settings("channel")) as TextChannel;
        const embed = new MessageEmbed();
        embed.setTitle(title);
        if (reason != null && reason.content) {
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
        let authorID = "(unknown)";
        if (author) {
            embed.setAuthor(author.tag, author.avatarURL());
            authorID = author.id;
        }
        embed.setColor(color != null ? color : this.bot.displayColor());
        const log = Logs.create({
            userID: authorID,
            action: action,
            target: target != null ? target :
                ((reason != null && reason.location != null) ? reason.location : null),
            detail: description
        });
        await Promise.all([channel.send({embeds: [embed, ...(reason ? reason.embeds : [])]}), log]);
    }

    private static idenUser(user: User): string {
        return `${user.tag} \`(ID: ${user.id})\``;
    }

    private static idenMessage(message: Message): string {
        return `\`(ID: ${message.id})\``;
    }

    public async pinLog(user: User, message: Message, type: "pin" | "unpin"): Promise<void> {
        return this.log("PIN_MESSAGE", "Message " + (type === "pin" ? "Pinned" : "Unpinned"),
             `User ${AuditModule.idenUser(user)} ${type}ned the following message ` +
            `${AuditModule.idenMessage(message)}:`, user, AuditModule.messageToReason(message));
    }

    public async pinChangeLog(user: User, other: User, message: Message): Promise<void> {
        return this.log("PIN_OWNER_CHANGE", "Message Pin Change",
            `User ${AuditModule.idenUser(user)} removed their pin reaction from the ` +
            `message ${AuditModule.idenMessage(message)} below, which makes user ` +
            `${AuditModule.idenUser(other)} the new owner of the pin.`, user,
            AuditModule.messageToReason(message));
    }

    public async blacklist(user: User, blacklistID: string, record: Record) {
        const alias: AnonAlias = record.alias;
        const message: Message = await (this.bot.guild.channels.cache.get(record.channelID) as TextChannel)
            .messages.fetch(record.messageID);
        return this.log("BLACKLIST", "Anon User Blacklisted",
            `User ${AuditModule.idenUser(user)} blacklisted anon **${alias}** ` +
            `\`(blacklist ID: ${blacklistID})\` ` +
            `because of the following message ${AuditModule.idenMessage(message)}:`,
            user, AuditModule.messageToReason(message), blacklistID)
    }

    public async timeout(user: User, blacklistID: string, record: Record, duration: Duration) {
        const alias: AnonAlias = record.alias;
        const message: Message = await (this.bot.guild.channels.cache.get(record.channelID) as TextChannel)
            .messages.fetch(record.messageID);
        return this.log("TIMEOUT", "Anon User Timed Out",
            `User ${AuditModule.idenUser(user)} timed out anon **${alias}** ` +
            `\`(blacklist ID: ${blacklistID})\` ` +
            `for ${formatDuration(duration)} because of the following message ` +
            `${AuditModule.idenMessage(message)}:`, user, AuditModule.messageToReason(message),
            blacklistID)
    }

    public async genericPunishment(type: PunishmentRoleType, moderator: User, target: User,
                                   reason: string, moderationMessage: Message, duration: Duration) {
        return this.log(type.toUpperCase(), `User ${titlecase(type)}d`,
            `Moderator ${AuditModule.idenUser(moderator)} ${type}d user ` +
            `${AuditModule.idenUser(target)} for ${formatDuration(duration)} for the following reason:`,
            moderator,
            {content: reason, location: moderationMessage.url, jumpType: "action", embeds: []},
            target.id, 16711680)
    }

    public async genericUnpunishment(type: PunishmentRoleType, moderator: User, target: User,
                                     moderationMessage: Message) {
        return this.log(`UN${type.toUpperCase()}`, `User Un${type}d`,
            `Moderator ${AuditModule.idenUser(moderator)} un${type}d user ` +
            AuditModule.idenUser(target), moderator,
            {location: moderationMessage.url, jumpType: "action", embeds: []}, target.id, 16711680)
    }

    public async unblacklist(user: User, blacklistID: string) {
        return this.log("UNBLACKLIST", "Anon User Unblacklisted", `User ` +
            `${AuditModule.idenUser(user)} unblacklisted the anon user with blacklist ID ` +
            `\`${blacklistID}\`.`, user, null, blacklistID);
    }

    public async onDelete(message: Message) {
        console.log(message);
        let channel = "an unknown channel";
        try {
            channel = `#${this.bot.guild.channels.cache.get(message.channelId).name}`;
        } catch (e) {}
        let description = `Message ${AuditModule.idenMessage(message)} created on ` +
            `${formatTime(moment(message.createdTimestamp))} was deleted from ${channel} ` +
            `(ID: ${message.channelId}). `;
        let reason: Reason = null;
        if (message.partial) {
            description += "Message content is unavailable because the message was too old.";
        } else {
            if (message.embeds.length > 0) {
                description += "The message contained an embed with: "
            } else {
                description += "The message was: "
            }
            reason = AuditModule.messageToReason(message);
            reason.location = null;
        }
        return this.log("DELETE", "Message Deleted", description, message.author, reason,
            message.id, 16711680);
    }
}