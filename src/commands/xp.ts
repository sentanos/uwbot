import {Availability, Command, CommandConfig, Permission} from "../modules/commands";
import {Bot} from "../bot";
import {GuildMember, Message, RichEmbed, Snowflake, User} from "discord.js";
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
                "Get your XP profile": [],
                "Get another user's XP profile": ["nickname/username/tag/userID"]
            },
            permission: Permission.None,
            availability: Availability.WhitelistedGuildChannelsOnly
        });
    }

    async exec(message: Message, person?: string) {
        const embed: RichEmbed = new RichEmbed();
        let user: User;
        if (person != null) {
            user = await this.bot.getUserFromMessage(message);
        } else {
            user = message.author;
        }
        const member: GuildMember | void = this.bot.guild.member(user);
        const xp: XP = await this.xp.getXP(user.id);
        return message.channel.send(embed.setAuthor(user.tag, user.avatarURL)
            .setThumbnail(user.avatarURL)
            .addField("Total XP", xp, true)
            .addField("Weekly XP", await this.xp.getRollingXP(user.id), true)
            .addField("Level", XPModule.levelSummary(xp))
            .setColor(member != null ? member.displayColor : this.bot.displayColor()));
    }
}

export class XPLeaderboard extends RequiresXP {
    constructor(bot: Bot) {
        super(bot, {
            names: ["xp leaderboard", "xplb"],
            usages: {
                "Get the top 10 users with the highest XP": [],
                "Get a specific page of the XP leaderboard. Each page has 10 users.": ["page"]
            },
            permission: Permission.None,
            availability: Availability.WhitelistedGuildChannelsOnly
        });
    }

    async exec(message: Message, page?: string) {
        const pageSize = 10;
        let pageNum: number;
        if (page != null) {
            pageNum = parseInt(page, 10);
            if (isNaN(pageNum)) {
                throw new Error("SAFE: Page must be a number");
            }
        } else {
            pageNum = 1;
        }
        const lb: {userID: Snowflake, totalXp: XP}[] = await this.xp.top(pageSize,
            (pageNum - 1) * pageSize);
        if (lb.length == 0) {
            throw new Error("SAFE: No users found. You may have selected a page that is out of" +
                " range.")
        }
        let users: string[] = [];
        for (let i = 0; i < lb.length; i++) {
            const row: {userID: Snowflake, totalXp: XP} = lb[i];
            let name = row.userID;
            if (this.bot.guild.members.has(row.userID)) {
                name = this.bot.guild.members.get(row.userID).user.tag;
            }
            users.push((i + 1 + (pageNum - 1) * pageSize) + ". " + name + ": " + row.totalXp +
                "xp (Level " + XPModule.levelFromXp(row.totalXp) + ")");
        }
        return message.channel.send(new RichEmbed()
            .setTitle("XP Leaderboard")
            .setDescription(users.join("\n"))
            .setFooter("Page " + pageNum)
            .setColor(this.bot.displayColor()));
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
                " received in the most recent `Rolling Interval`. If a user doesn't send a" +
                " message after `Decay Interval`, they lose `Decay XP` every `Decay Interval`" +
                " (decay is checked for all users after every `Check Interval`. `Reward Role`" +
                " will be given to uses who have a higher XP count than `Reward Threshold` and a" +
                " higher rolling XP count than `Rolling Reward Threshold`.")
            .addField("Block Interval", formatInterval(this.xp.blockInterval), true)
            .addField("Block Maximum", this.xp.blockMaximum + " XP", true)
            .addField("Rolling Interval", formatInterval(this.xp.rollingInterval), true)
            .addField("Decay Interval", formatInterval(this.xp.decayInterval), true)
            .addField("Decay XP", this.xp.decayXp + " XP", true)
            .addField("Check Interval", formatInterval(this.xp.checkInterval), true)
            .addField("Reward Threshold", this.xp.rewardThreshold + " XP", true)
            .addField("Rolling Reward Threshold", this.xp.rollingRewardThreshold + " XP", true)
            .addField("Reward Role", this.bot.guild.roles.get(this.xp.reward).name +
                " (" + this.xp.reward + ")")
            .setColor(this.bot.displayColor()));
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
            .setColor(this.bot.displayColor()));
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
        });
    }

    async exec(message: Message, channel: string) {
        if (!this.bot.guild.channels.has(channel)) {
            throw new Error("SAFE: Channel does not exist. Make sure to use the channel ID, NOT" +
                " the channel name.");
        }
        await this.xp.exclude.add(channel);
        return message.channel.send("Added channel #" + message.guild.channels.get(channel).name +
            " to exclusion list");
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
        });
    }

    async exec(message: Message, channel: string) {
        await this.xp.exclude.remove(channel);
        return message.channel.send("Removed channel from exclusion list");
    }
}

export class XPUpdateAll extends RequiresXP {
    constructor(bot: Bot) {
        super(bot, {
            names: ["xp updateall"],
            usages: {
                "Bring all users up to date for XP rewards": []
            },
            permission: Permission.UserKick,
            availability: Availability.GuildOnly
        });
    }

    async exec(message: Message) {
        message.channel.startTyping();
        await this.xp.updateAll();
        message.channel.stopTyping();
        return message.channel.send("Full user update complete");
    }
}

