import {
    Availability,
    Command,
    CommandConfig, CommandsModule,
    PartialCommandConfig,
    Permission
} from "../modules/commands";
import {Bot} from "../bot";
import {Message, MessageEmbed, User} from "discord.js";
import {ModerationModule, PreviousPunishment, PunishmentRoleType} from "../modules/moderation";
import {
    dateAfter,
    formatDuration,
    formatInterval,
    parseDuration,
    smartFindDuration,
    timeDiff,
    titlecase
} from "../util";
import {Punishments} from "../database/models/punishments";

class RequiresModeration extends Command {
    protected mod: ModerationModule;

    constructor(bot: Bot, config: PartialCommandConfig) {
        let withCategory = config as CommandConfig;
        withCategory.category = "moderation";
        super(bot, withCategory);
    }

    async run(message?: Message, ...args: string[]): Promise<Message | void> {
        this.mod = this.bot.getModule("moderation") as ModerationModule;
        return super.run(message, ...args);
    }
}

class GenericPunish extends RequiresModeration {
    private readonly type: PunishmentRoleType;

    constructor(bot, type: PunishmentRoleType, config: PartialCommandConfig) {
        super(bot, config);
        this.type = type;
    }

    async exec(message: Message, user: string): Promise<Message> {
        const target: User = await this.bot.getUserFromMessage(message, user);
        const response = smartFindDuration(this.bot, message.content, false, 1);
        const reason = response.raw.length > 0 ? response.raw : "No reason provided";
        const maybe: PreviousPunishment | void = await this.mod.punish(this.type, message.author,
            target, reason, response.duration, message);
        let embed = new MessageEmbed();
        if (maybe != null) {
            const prev = maybe as PreviousPunishment;
            const prevInterval = timeDiff(prev.expire, new Date()) / 1000;
            embed.setDescription(`${target.tag} was already ${prev.type}d with ` +
                `${formatInterval(prevInterval)} remaining. ` + (prev.type === this.type ? (`Their `
                + `${this.type} time has now been changed to ${formatDuration(response.duration)}.`)
                : `They have now been ${this.type}d for ${formatDuration(response.duration)}.`));
        } else {
            embed.setDescription(`${titlecase(this.type)}d ${target.tag} for ` +
                formatDuration(response.duration))
        }
        embed.setFooter(`${titlecase(this.type)} ends on`)
            .setTimestamp(dateAfter(response.duration))
            .setColor(this.bot.displayColor());
        return message.channel.send(embed);
    }
}

class GenericUnpunish extends RequiresModeration {
    private readonly type: PunishmentRoleType;

    constructor(bot, type: PunishmentRoleType, config: PartialCommandConfig) {
        super(bot, config);
        this.type = type;
    }

    async exec(message: Message): Promise<Message> {
        const user: User = await this.bot.getUserFromMessage(message);
        const punishment: Punishments = await this.mod.unpunish(this.type, message.author, user,
            message);
        const embed = new MessageEmbed();
        const remaining = formatInterval(timeDiff(punishment.expiration, new Date()) / 1000);
        if (punishment.initiatorID === punishment.userID) {
            embed.setDescription(`Un${this.type}d ${user.tag}. Their self ${this.type} had ` +
                `${remaining} remaining.`)
        } else {
            const initiator = await this.bot.client.users.fetch(punishment.initiatorID);
            embed.setDescription(`Un${this.type}d ${user.tag}. Their ${this.type}, created by ` +
                `${initiator.tag}, had ${remaining} remaining.`)
        }
        return message.channel.send(embed.setColor(this.bot.displayColor()));
    }
}

class GenericSelfPunish extends RequiresModeration {
    private readonly type: PunishmentRoleType;

    constructor(bot, type: PunishmentRoleType, config: PartialCommandConfig) {
        super(bot, config);
        this.type = type;
    }

    async exec(message: Message): Promise<Message> {
        const duration = parseDuration((this.bot.getModule("commands") as CommandsModule)
            .getRawContent(message.content));
        await this.mod.punish(this.type, message.author, message.author, `Self ${this.type}`,
            duration, message);
        return message.channel.send(new MessageEmbed()
            .setDescription(`${message.author.tag} self ${this.type}d for ${formatDuration(duration)}`)
            .setFooter(`${titlecase(this.type)} ends on`)
            .setTimestamp(dateAfter(duration))
            .setColor(this.bot.displayColor()));
    }
}

export class SelfMute extends GenericSelfPunish {
    constructor(bot) {
        super(bot, "mute", {
            names: ["selfmute"],
            usages: {
                "Mute yourself for a given amount of time": ["duration"],
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.GuildOnly
        })
    }
}

export class SelfQuarantine extends GenericSelfPunish {
    constructor(bot) {
        super(bot, "quarantine", {
            names: ["selfquarantine", "selfq"],
            usages: {
                "Quarantine yourself for a given amount of time": ["duration"],
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.GuildOnly
        })
    }
}

export class Mute extends GenericPunish {
    constructor(bot) {
        super(bot, "mute", {
            names: ["mute"],
            usages: {
                "Mute a user for a certain amount of time": ["mention/userID", "duration"],
                "Mute a user for a certain amount of time with a given reason":
                    ["mention/userID", "duration", "reason"]
            },
            permission: Permission.UserKick,
            availability: Availability.GuildOnly
        })
    }
}

export class Quarantine extends GenericPunish {
    constructor(bot) {
        super(bot, "quarantine", {
            names: ["quarantine"],
            usages: {
                "Quarantine a user for a certain amount of time (they cannot see any channels)":
                    ["mention/userID", "duration"],
                "Quarantine a user for a certain amount of time with a given reason":
                    ["mention/userID", "duration", "reason"]
            },
            permission: Permission.UserKick,
            availability: Availability.GuildOnly
        })
    }
}

export class Unmute extends GenericUnpunish {
    constructor(bot) {
        super(bot, "mute", {
            names: ["unmute"],
            usages: {
                "Unmute a user": ["mention/userID"]
            },
            permission: Permission.UserKick,
            availability: Availability.GuildOnly
        })
    }
}

export class Unquarantine extends GenericUnpunish {
    constructor(bot) {
        super(bot, "quarantine", {
            names: ["unquarantine", "unq"],
            usages: {
                "Unquarantine a user": ["mention/userID"]
            },
            permission: Permission.UserKick,
            availability: Availability.GuildOnly
        })
    }
}
