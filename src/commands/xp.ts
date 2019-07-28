import {Availability, Command, CommandConfig, Permission} from "../modules/commands";
import {Bot} from "../bot";
import {GuildMember, Message, MessageEmbed, Snowflake, User} from "discord.js";
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
            permission: Permission.VerifiedGuildMember,
            availability: Availability.WhitelistedGuildChannelsOnly
        });
    }

    async exec(message: Message, person?: string) {
        const embed: MessageEmbed = new MessageEmbed();
        let user: User;
        if (person != null) {
            user = await this.bot.getUserFromMessage(message);
        } else {
            user = message.author;
        }
        const member: GuildMember | void = this.bot.guild.member(user);
        const xp: XP = await this.xp.getXP(user.id);
        return message.channel.send(embed.setAuthor(user.tag, user.avatarURL())
            .setThumbnail(user.avatarURL())
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
            permission: Permission.VerifiedGuildMember,
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
            if (pageNum <= 0) {
                throw new Error("SAFE: Page must be a positive nonzero number");
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
        return message.channel.send(new MessageEmbed()
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
            permission: Permission.VerifiedGuildMember,
            availability: Availability.WhitelistedGuildChannelsOnly
        });
    }

    async exec(message: Message) {
        const config = this.xp.config;
        return message.channel.send(new MessageEmbed()
            .setTitle("XP Module Options")
            .setDescription("Users can receive XP up to a `Block Maximum` in one `Block" +
                " Interval`. Users also have rolling XP count which only includes the XP" +
                " received in the most recent `Rolling Interval`. If a user doesn't send a" +
                " message after `Decay Interval`, they lose `Decay XP` every `Decay Interval`" +
                " (decay is checked for all users after every `Check Interval`. `Reward Role`" +
                " will be given to uses who have a higher XP count than `Reward Threshold` and a" +
                " higher rolling XP count than `Rolling Reward Threshold`.")
            .addField("Block Interval", formatInterval(config.blockInterval), true)
            .addField("Block Maximum", config.blockMaximum + " XP", true)
            .addField("Rolling Interval", formatInterval(config.rollingInterval), true)
            .addField("Decay Interval", formatInterval(config.decayInterval), true)
            .addField("Decay XP", config.decayXp + " XP", true)
            .addField("Check Interval", formatInterval(config.checkInterval), true)
            .addField("Reward Threshold", config.rewardThreshold + " XP", true)
            .addField("Rolling Reward Threshold", config.rollingRewardThreshold + " XP", true)
            .addField("Reward Role", this.bot.guild.roles.get(config.reward).name +
                " (" + config.reward + ")")
            .setColor(this.bot.displayColor()));
    }
}

export class XPUpdateAll extends RequiresXP {
    constructor(bot: Bot) {
        super(bot, {
            names: ["xp updateall"],
            usages: {
                ["Bring all users up to date for XP rewards. Use only when options have had" +
                    " major changes"]: []
            },
            permission: Permission.UserKick,
            availability: Availability.GuildOnly
        });
    }

    async exec(message: Message) {
        await message.channel.startTyping();
        await this.xp.updateAll();
        message.channel.stopTyping();
        return message.channel.send("Full user update complete");
    }
}

