import {Availability, Command, Permission} from "../command";
import {Message, RichEmbed, Snowflake, TextChannel} from "discord.js";
import {AnonUser} from "../anon";
import {randomColor} from "../util";

export class AnonCommand extends Command {
    constructor(bot) {
        super(bot, {
            names: ["anon", "anonymous"],
            usages: {
                "Send an anonymous message to the anonymous channel": []
            },
            permission: Permission.None,
            availability: Availability.All
        })
    }

    async exec(message: Message) {
        return (await this.bot.anon.getAnonUser(message.author)).send(
            this.bot.anon.guild.channels.find(ch => ch.name === "anonymous") as TextChannel,
            this.bot.getRawContent(message.content)
        )
    }
}

export class NewID extends Command {
    constructor(bot) {
        super(bot, {
            names: ["newid"],
            usages: {
                "Get a random new anonymous ID": [],
                "Set your anonymous ID to the given ID": ["id"]
            },
            permission: Permission.None,
            availability: Availability.All
        })
    }

    async exec(message: Message, customID?: string) {
        const user = await this.bot.anon.getAnonUser(message.author);
        if (customID == null) {
            this.bot.anon.newAlias(user);
        } else {
            const parsed = parseInt(customID, 10);
            if (isNaN(parsed)) {
                throw new Error("SAFE: ID must be a number")
            }
            this.bot.anon.setAlias(user, parsed);
        }
        return message.author.send("You are now speaking under ID `" + user.getAlias() + "`");
    }
}

export class Blacklist extends Command {
    constructor(bot) {
        super(bot, {
            names: ["blacklist"],
            usages: {
                ["Blacklist the author of the given message. Returns a blacklistId which can be" +
                    " used to unblacklist the user."]: ["messageId"]
            },
            permission: Permission.UserKick,
            availability: Availability.GuildOnly
        })
    }

    async exec(message: Message, messageID: string) {
        const blacklistResponse = await this.bot.anon.blacklist(messageID, message.author);
        return message.reply(`Blacklisted \`${blacklistResponse.anonAlias}\`.
ID: ${blacklistResponse.blacklistID}`)
    }
}

export class Unblacklist extends Command {
    constructor(bot) {
        super(bot, {
            names: ["unblacklist"],
            usages: {
                ["Unblacklist a user with the blacklistId returned from when they were" +
                    " blacklisted"]: ["blacklistId"]
            },
            permission: Permission.UserKick,
            availability: Availability.GuildOnly
        })
    }

    async exec(message: Message, blacklistID: string) {
        await this.bot.anon.unblacklist(blacklistID, message.author);
        return message.reply("Unblacklisted");
    }
}

export class BlacklistedBy extends Command {
    constructor(bot) {
        super(bot, {
            names: ["blacklistedby", "blacklister"],
            usages: {
                "Show who blacklisted a certain user": ["blacklistId"]
            },
            permission: Permission.UserKick,
            availability: Availability.GuildOnly
        })
    }

    async exec(message: Message, blacklistID: string) {
        const id: Snowflake | void = await this.bot.anon.blacklistedBy(blacklistID);
        if (typeof id === "string") {
            const member = await this.bot.anon.guild.fetchMember(id);
            if (member == null) {
                return message.reply(id);
            } else {
                return message.reply(member.user.tag);
            }
        } else {
            throw new Error("SAFE: ID not found");
        }
    }
}

export class Reset extends Command {
    constructor(bot) {
        super(bot, {
            names: ["reset"],
            usages: {
                "Reset all anonymous IDs": []
            },
            permission: Permission.UserKick,
            availability: Availability.GuildOnly
        })
    }

    async exec(message: Message) {
        this.bot.anon.reset();
        return message.reply("Reset all IDs")
    }
}

export class SetColor extends Command {
    constructor(bot) {
        super(bot, {
            names: ["setcolor"],
            usages: {
                "Set anon color to a random color": [],
                "Set anon color to the given hex color": ["hex"],
                "Set anon color to the given r, g, b value": ["r", "g", "b"]
            },
            permission: Permission.None,
            availability: Availability.All
        })
    }

    async exec(message: Message, color?: string, g?: string, b?: string) {
        const anonUser: AnonUser = await this.bot.anon.getAnonUser(message.author);
        let colorDecimal: number;
        if (color == null) {
            anonUser.setColor(randomColor());
        } else if (g == null && b == null) {
            if (color.charAt(0) === "#") {
                color = color.substring(1);
            }
            colorDecimal = parseInt(color, 16);
            if (isNaN(colorDecimal) || colorDecimal < 0 || colorDecimal > 16777215) {
                throw new Error("SAFE: Invalid color. Must be hex or RGB.");
            }
        } else if (g != null && b != null) {
            const rd = parseInt(color, 10);
            const gd = parseInt(g, 10);
            const bd = parseInt(b, 10);
            if (isNaN(rd) || isNaN(gd) || isNaN(bd) || rd < 0 || gd < 0 || bd < 0 || rd > 255
                || gd > 255 || bd > 255) {
                throw new Error("Invalid color. Each component must be a number between 0 and 255")
            }
            colorDecimal = Math.pow(256, 2) * rd + 256 * gd + bd;
        } else {
            throw new Error("SAFE: Invalid parameters")
        }
        anonUser.setColor(colorDecimal);
        message.channel.send(new RichEmbed()
            .setTitle("Color set")
            .setColor(colorDecimal));
    }
}