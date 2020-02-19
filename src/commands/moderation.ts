import {
    Availability,
    Command,
    CommandConfig, CommandsModule,
    PartialCommandConfig,
    Permission
} from "../modules/commands";
import {Bot} from "../bot";
import {Message, MessageEmbed, User} from "discord.js";
import {ModerationModule} from "../modules/moderation";
import {
    dateAfter, formatDuration, formatInterval,
    parseDuration,
    smartFindDuration,
    timeDiff
} from "../util";
import {Mutes} from "../database/models/mutes";

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

export class SelfMute extends RequiresModeration {
    constructor(bot) {
        super(bot, {
            names: ["selfmute"],
            usages: {
                "Mute yourself for a given amount of time": ["duration"],
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.GuildOnly
        })
    }

    async exec(message: Message): Promise<Message> {
        if (await this.mod.isMuted(message.author.id)) {
            throw new Error("SAFE: You are already muted");
        }
        const duration = parseDuration((this.bot.getModule("commands") as CommandsModule)
            .getRawContent(message.content));
        await this.mod.mute(message.author, message.author, "Self mute", duration,
            message);
        return message.channel.send(new MessageEmbed()
            .setDescription(`${message.author.tag} self muted for ${formatDuration(duration)}`)
            .setFooter("Mute ends on")
            .setTimestamp(dateAfter(duration))
            .setColor(this.bot.displayColor()));
    }
}

export class Mute extends RequiresModeration {
    constructor(bot) {
        super(bot, {
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

    async exec(message: Message, user: string): Promise<Message> {
        const target: User = await this.bot.getUserFromMessage(message, user);
        const response = smartFindDuration(this.bot, message.content, false, 1);
        const reason = response.raw.length > 0 ? response.raw : "No reason provided";
        const prevDate: Date | void = await this.mod.mute(message.author, target, reason,
            response.duration, message);
        let embed = new MessageEmbed();
        if (prevDate instanceof Date) {
            const prevInterval = timeDiff(prevDate, new Date()) / 1000;
            embed.setDescription(`${target.tag} was already muted with ` +
                `${formatInterval(prevInterval)} remaining. Their mute time has now been ` +
                `changed to ${formatDuration(response.duration)}.`);
        } else {
            embed.setDescription(`Muted ${target.tag} for ${formatDuration(response.duration)}`)
        }
        embed.setFooter("Mute ends on")
            .setTimestamp(dateAfter(response.duration))
            .setColor(this.bot.displayColor());
        return message.channel.send(embed);
    }
}

export class Unmute extends RequiresModeration {
    constructor(bot) {
        super(bot, {
            names: ["unmute"],
            usages: {
                "Unmute a user": ["mention/userID"]
            },
            permission: Permission.UserKick,
            availability: Availability.GuildOnly
        })
    }

    async exec(message: Message): Promise<Message> {
        const user: User = await this.bot.getUserFromMessage(message);
        const mute: Mutes = await this.mod.unmute(message.author, user, message);
        const embed = new MessageEmbed();
        const remaining = formatInterval(timeDiff(mute.expiration, new Date()) / 1000);
        if (mute.initiatorID === mute.userID) {
            embed.setDescription(`Unmuted ${user.tag}. Their self mute had ${remaining} remaining.`)
        } else {
            const initiator = await this.bot.client.users.fetch(mute.initiatorID);
            embed.setDescription(`Unmuted ${user.tag}. Their mute, created by ${initiator.tag}, had ` +
                `${remaining} remaining.`)
        }
        return message.channel.send(embed.setColor(this.bot.displayColor()));
    }
}
