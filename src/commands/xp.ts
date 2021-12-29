import {
    Availability,
    Command,
    CommandConfig,
    PartialCommandConfig,
    Permission
} from "../modules/commands";
import {Bot} from "../bot";
import {GuildMember, Message, MessageAttachment, MessageEmbed, Snowflake, User} from "discord.js";
import {XP, XPModule} from "../modules/xp";
import {
    DurationResponse,
    smartFindDuration,
    titlecase,
    formatDuration
} from "../util";
import moment from "moment-timezone";

class RequiresXP extends Command {
    protected xp: XPModule;

    constructor(bot: Bot, config: PartialCommandConfig) {
        let withCategory = config as CommandConfig;
        withCategory.category = "xp";
        super(bot, withCategory);
    }

    async run(message?: Message, ...args: string[]): Promise<Message | void> {
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

    async exec(message: Message, person?: string): Promise<Message> {
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
            .addField("Rolling XP", await this.xp.getRollingXP(user.id), true)
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

    async exec(message: Message, page?: string): Promise<Message> {
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
            let name;
            let inGuild = this.bot.guild.members.cache.has(row.userID);
            if (inGuild) {
                name = this.bot.guild.members.cache.get(row.userID).user.tag;
            } else {
                name = (await this.bot.client.users.fetch(row.userID)).tag;
            }
            users.push(`${!inGuild ? "~~" : ""}${i + 1 + (pageNum - 1) * pageSize}. ${name}: ` +
            `${row.totalXp} xp (Level ${XPModule.levelFromXp(row.totalXp)})${!inGuild ? "~~" : ""}`);
        }
        return message.channel.send(new MessageEmbed()
            .setTitle("XP Leaderboard")
            .setDescription(users.join("\n"))
            .setFooter("Page " + pageNum)
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
            permission: Permission.UserKickOrMaintainer,
            availability: Availability.GuildOnly
        });
    }

    async exec(message: Message): Promise<Message> {
        // await message.channel.startTyping();
        await this.xp.updateAll();
        // message.channel.stopTyping(true);
        return message.channel.send("Full user update complete");
    }
}

export class XPHistory extends RequiresXP {
    constructor(bot: Bot) {
        super(bot, {
            names: ["xph", "xphist", "xp history"],
            usages: {
                "Get your XP history for the past year": [],
                "Get your XP history for the given time interval": ["interval/all"],
                "Get the XP history of a specific user for the past year":
                    ["nickname/username/tag/userID"],
                "Get the XP history of a specific user for the given time interval":
                    ["nickname/username/tag/userID", "interval/all"]
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.GuildOnly
        });
    }

    async exec(message: Message, personOrInterval?: string): Promise<Message> {
        let user: User;
        let duration = null;
        let all = false;
        if (personOrInterval != null) {
            let resp: DurationResponse = null;
            try {
                resp = smartFindDuration(this.bot, message.content, true);
            } catch (e) {
                user = await this.bot.getUserFromMessage(message);
            }
            if (resp != null) {
                duration = resp.duration;
                all = resp.all;
                if (resp.raw.length > 0) {
                    user = await this.bot.getUserFromMessage(message, resp.raw)
                } else {
                    user = message.author;
                }
            }
        } else {
            user = message.author;
        }

        if (duration == null) {
            duration = moment.duration(1, "year");
        }

        let from: Date = null;
        if (!all) {
            from = new Date(new Date().getTime() - duration.asSeconds() * 1000);
        }
        const image = await this.xp.generateHistoryGraph(user.id, from, new Date());
        return message.channel.send(new MessageEmbed()
            .attachFiles([new MessageAttachment(image, "graph.png")])
            .setImage("attachment://graph.png")
            .setTitle(`XP History for ${user.tag}: ` +
                (all ? "All Data" : ("Past " + titlecase(formatDuration(duration)))))
            .setColor(this.bot.displayColor()));
    }
}
export class XPHistoryCSV extends RequiresXP {
    constructor(bot: Bot) {
        super(bot, {
            names: ["xp csv", "xp export", "xp data"],
            usages: {
                "Get your XP history in a CSV file for the past year": [],
                "Get your XP history in a CSV file for the given time interval": ["interval/all"]
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.GuildOnly
        });
    }

    async exec(message: Message, personOrInterval?: string): Promise<Message> {
        let user: User;
        let duration = null;
        let all = false;
        if (personOrInterval != null) {
            let resp: DurationResponse = null;
            try {
                resp = smartFindDuration(this.bot, message.content, true);
            } finally {
                user = message.author;
            }
            if (resp != null) {
                duration = resp.duration;
                all = resp.all;
            }
        } 
        
        user = message.author;

        if (duration == null) {
            duration = moment.duration(1, "year");
        }

        let from: Date = null;
        if (!all) {
            from = new Date(new Date().getTime() - duration.asSeconds() * 1000);
        }
        const csv = await this.xp.generateCSVBlob(user.id, from, new Date());
        return message.channel.send(new MessageEmbed()
            .attachFiles([new MessageAttachment(csv, "discordxpData.csv")])
            .setTitle(`XP History for ${user.tag}: ` +
                (all ? "All Data" : ("Past " + titlecase(formatDuration(duration)))))
            .setColor(this.bot.displayColor()));
    }
}


