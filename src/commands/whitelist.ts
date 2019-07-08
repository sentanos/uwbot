import {Availability, Command, CommandConfig, Permission} from "../modules/commands";
import {Bot} from "../bot";
import {Message, MessageEmbed, Snowflake} from "discord.js";
import {WhitelistModule} from "../modules/whitelist";

class RequiresWhitelist extends Command {
    protected whitelist: WhitelistModule;

    constructor(bot: Bot, config: CommandConfig) {
        super(bot, config);
    }

    async run(message?: Message, ...args: string[]): Promise<any> {
        this.whitelist = this.bot.getModule("whitelist") as WhitelistModule;
        return super.run(message, ...args);
    }
}

export class WhitelistGet extends RequiresWhitelist {
    constructor(bot: Bot) {
        super(bot, {
            names: ["whitelist get"],
            usages: {
                "Gets whitelisted channels for certain bot commands": []
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.All
        });
    }

    async exec(message: Message) {
        const ids: Snowflake[] = await this.whitelist.channels.getChannels();
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
            .setTitle("Whitelisted Channels")
            .setDescription(channels.join("\n"))
            .setColor("#ffffff"));
    }
}

export class WhitelistAdd extends RequiresWhitelist {
    constructor(bot: Bot) {
        super(bot, {
            names: ["whitelist add"],
            usages: {
                "Adds a channel to the whitelist": ["channelID"]
            },
            permission: Permission.UserKick,
            availability: Availability.GuildOnly
        })
    }

    async exec(message: Message, channel: string) {
        if (!this.bot.guild.channels.has(channel)) {
            throw new Error("SAFE: Channel does not exist. Make sure to use the channel ID, NOT" +
                " the channel name.");
        }
        await this.whitelist.channels.add(channel);
        return message.channel.send("Added channel #" + message.guild.channels.get(channel).name +
            " to whitelist")
    }
}

export class WhitelistRemove extends RequiresWhitelist {
    constructor(bot: Bot) {
        super(bot, {
            names: ["whitelist remove"],
            usages: {
                "Removes a channel from the whitelist": ["channelID"]
            },
            permission: Permission.UserKick,
            availability: Availability.GuildOnly
        })
    }

    async exec(message: Message, channel: string) {
        await this.whitelist.channels.remove(channel);
        return message.channel.send("Removed channel from whitelist")
    }
}
