import {Bot} from "../bot";
import {Availability, Command, CommandConfig, Permission} from "../modules/commands";
import {Message, MessageEmbed, Snowflake} from "discord.js";
import {PinModule} from "../modules/pin";

class RequiresPin extends Command {
    protected pin: PinModule;

    constructor(bot: Bot, config: CommandConfig) {
        super(bot, config);
    }

    async run(message?: Message, ...args: string[]): Promise<any> {
        this.pin = this.bot.getModule("pin") as PinModule;
        return super.run(message, ...args);
    }
}

export class PinExcludeGet extends RequiresPin {
    constructor(bot: Bot) {
        super(bot, {
            names: ["pin exclude get"],
            usages: {
                "Gets channels excluded from having pins enabled": []
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.WhitelistedGuildChannelsOnly
        });
    }

    async exec(message: Message) {
        const ids: Snowflake[] = await this.pin.exclude.getChannels();
        let channels: string[] = [];
        for (let i = 0; i < ids.length; i++) {
            const id: Snowflake = ids[i];
            if (this.bot.guild.channels.has(id)) {
                channels.push("#" + this.bot.guild.channels.get(id).name)
            } else {
                channels.push(id);
            }
        }
        return message.channel.send(new MessageEmbed()
            .setTitle("Excluded Channels")
            .setDescription(channels.join("\n"))
            .setColor(this.bot.displayColor()));
    }
}

export class PinExcludeAdd extends RequiresPin {
    constructor(bot: Bot) {
        super(bot, {
            names: ["pin exclude add"],
            usages: {
                "Adds a channel to the pin exclusion list": ["channelID"]
            },
            permission: Permission.UserKick,
            availability: Availability.GuildOnly
        });
    }

    async exec(message: Message, channel: string) {
        if (!this.bot.guild.channels.has(channel)) {
            throw new Error("SAFE: Channel does not exist. Make sure to use the channel ID, NOT" +
                " the channel name.");
        }
        await this.pin.exclude.add(channel);
        return message.channel.send("Added channel #" + message.guild.channels.get(channel).name +
            " to exclusion list");
    }
}

export class PinExcludeRemove extends RequiresPin {
    constructor(bot: Bot) {
        super(bot, {
            names: ["pin exclude remove"],
            usages: {
                "Removes a channel from the pin exclusion list": ["channelID"]
            },
            permission: Permission.UserKick,
            availability: Availability.GuildOnly
        });
    }

    async exec(message: Message, channel: string) {
        await this.pin.exclude.remove(channel);
        return message.channel.send("Removed channel from exclusion list");
    }
}

export class PinnedBy extends Command {
    constructor(bot) {
        super(bot, {
            names: ["pinnedby", "pinner", "whopinned"],
            usages: {
                "Show who pinned a message using the pin feature": ["messageID"]
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.GuildOnly
        });
    }

    async exec(message: Message, messageID: string) {
        const row = await this.bot.DB.get(`SELECT userID FROM pinned WHERE messageID = ?`,
            messageID);
        if (row == null) {
            throw new Error("SAFE: Message not found")
        }
        const member = await this.bot.guild.members.fetch(row.userID);
        if (member == null) {
            return message.reply(row.userID);
        } else {
            return message.reply(member.user.tag);
        }
    }
}
