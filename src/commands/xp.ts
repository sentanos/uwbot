import {Availability, Command, CommandConfig, Permission} from "../modules/commands";
import {Bot} from "../bot";
import {Message, RichEmbed, Snowflake} from "discord.js";
import {XP, XPModule} from "../modules/xp";
import {formatInterval} from "../util";

class RequiresXP extends Command {
    protected xp: XPModule;

    constructor(bot: Bot, config: CommandConfig) {
        super(bot, config);
    }

    async run(message?: Message, ...args: string[]): Promise<any> {
        this.xp = this.bot.getModule("xp") as XPModule;
        return super.run(message, ...args);
    }
}

export class XPCommand extends RequiresXP {
    constructor(bot: Bot) {
        super(bot, {
            names: ["xp"],
            usages: {
                "Find out how much XP you have": []
            },
            permission: Permission.None,
            availability: Availability.WhitelistedGuildChannelsOnly
        });
    }

    async exec(message: Message) {
        const embed: RichEmbed = new RichEmbed();
        const user = message.author;
        return message.channel.send(embed.setAuthor(user.tag, user.avatarURL)
            .setThumbnail(user.avatarURL)
            .addField("Total XP", await this.xp.getXP(user.id), true)
            .addField("Rolling XP", await this.xp.getRollingXP(user.id), true)
            .setFooter("XP updates every " + this.xp.blockInterval + " seconds")
            .setColor(this.bot.guild.member(user).displayColor));
    }
}

export class XPLeaderboard extends RequiresXP {
    constructor(bot: Bot) {
        super(bot, {
            names: ["xp leaderboard", "xplb"],
            usages: {
                "Get the top 10 users with the highest XP": []
            },
            permission: Permission.None,
            availability: Availability.WhitelistedGuildChannelsOnly
        });
    }

    async exec(message: Message) {
        const lb: {userID: Snowflake, totalXp: XP}[] = await this.xp.top(10);
        let users: string[] = [];
        for (let i = 0; i < lb.length; i++) {
            const row: {userID: Snowflake, totalXp: XP} = lb[i];
            let name = row.userID;
            if (this.bot.guild.members.has(row.userID)) {
                name = this.bot.guild.members.get(row.userID).user.tag;
            }
            users.push((i + 1) + ". " + name + ": " + row.totalXp);
        }
        const embed: RichEmbed = new RichEmbed();
        return message.channel.send(embed
            .setTitle("XP Leaderboard")
            .setDescription(users.join("\n"))
            .setColor("#208cff"));
    }
}

export class XPOptionsGet extends RequiresXP {
    constructor(bot: Bot) {
        super(bot, {
            names: ["xp options get"],
            usages: {
                "Gets all current XP options": []
            },
            permission: Permission.None,
            availability: Availability.WhitelistedGuildChannelsOnly
        });
    }

    async exec(message: Message) {
        return message.channel.send(new RichEmbed()
            .setTitle("XP Module Options")
            .setDescription("Users can receive XP up to a `Block Maximum` in one `Block" +
                " Interval`. Users also have rolling XP count which only includes the XP" +
                " received in the most recent `Rolling Interval`.")
            .addField("Block Interval", formatInterval(this.xp.blockInterval), true)
            .addField("Block Maximum", this.xp.blockMaximum, true)
            .addField("Rolling Interval", formatInterval(this.xp.rollingInterval), true)
            .setColor("#208cff"));
    }
}

export class XPExcludeGet extends RequiresXP {
    constructor(bot: Bot) {
        super(bot, {
            names: ["xp exclude get"],
            usages: {
                "Gets channels excluded from XP receiving": []
            },
            permission: Permission.None,
            availability: Availability.WhitelistedGuildChannelsOnly
        });
    }

    async exec(message: Message) {
        const ids: Snowflake[] = await this.xp.exclude.getChannels();
        let channels: string[] = [];
        for (let i = 0; i < ids.length; i++) {
            const id: Snowflake = ids[i];
            if (this.bot.guild.channels.has(id)) {
                channels.push("#" + this.bot.guild.channels.get(id).name)
            } else {
                channels.push(id);
            }
        }
        return message.channel.send(new RichEmbed()
            .setTitle("Excluded Channels")
            .setDescription(channels.join("\n"))
            .setColor("#208cff"));
    }
}

export class XPExcludeAdd extends RequiresXP {
    constructor(bot: Bot) {
        super(bot, {
            names: ["xp exclude add"],
            usages: {
                "Adds a channel to the XP exclude list": ["channelID"]
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
        await this.xp.exclude.add(channel);
        return message.channel.send("Added channel #" + message.guild.channels.get(channel).name +
            " to exclusion list")
    }
}

export class XPExcludeRemove extends RequiresXP {
    constructor(bot: Bot) {
        super(bot, {
            names: ["xp exclude remove"],
            usages: {
                "Removes a channel from the whitelist": ["channelID"]
            },
            permission: Permission.UserKick,
            availability: Availability.GuildOnly
        })
    }

    async exec(message: Message, channel: string) {
        await this.xp.exclude.remove(channel);
        return message.channel.send("Removed channel from exclusion list")
    }
}

