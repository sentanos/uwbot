import {Availability, Command, CommandConfig, Permission} from "../modules/commands";
import {Message, MessageEmbed, Snowflake} from "discord.js";
import {AnonModule, AnonUser} from "../modules/anon";
import {randomColor} from "../util";
import {Bot} from "../bot";

class RequiresAnon extends Command {
    protected anon: AnonModule;

    constructor(bot: Bot, config: CommandConfig) {
        super(bot, config);
    }

    async run(message?: Message, ...args: string[]): Promise<any> {
        this.anon = this.bot.getModule("anon") as AnonModule;
        return super.run(message, ...args);
    }
}

export class AnonCommand extends RequiresAnon {
    constructor(bot) {
        super(bot, {
            names: ["anon", "anonymous"],
            usages: {
                "Send an anonymous message to the #anonymous channel": ["message"]
            },
            permission: Permission.None,
            availability: Availability.All
        })
    }

    async exec(message: Message) {
        return this.anon.sendAnonMessage("anonymous", message);
    }
}

export class Relationships extends RequiresAnon {
    constructor(bot) {
        super(bot, {
            names: ["rel", "relationships"],
            usages: {
                "Send an anonymous message to the #relationships channel": ["message"]
            },
            permission: Permission.None,
            availability: Availability.All
        })
    }

    async exec(message: Message) {
        return this.anon.sendAnonMessage("relationships", message);
    }
}

export class Serious extends RequiresAnon {
    constructor(bot) {
        super(bot, {
            names: ["serious"],
            usages: {
                "Send an anonymous message to the #serious channel": ["message"]
            },
            permission: Permission.None,
            availability: Availability.All
        })
    }

    async exec(message: Message) {
        return this.anon.sendAnonMessage("serious", message);
    }
}

export class MessageCommand extends RequiresAnon {
    constructor(bot) {
        super(bot, {
            names: ["message"],
            usages: {
                "Send an anonymous message to another anonymous user": ["id", "message"]
            },
            permission: Permission.None,
            availability: Availability.All
        })
    }

    async exec(message: Message, alias: string) {
        const id: number = parseInt(alias, 10);
        if (isNaN(id)) {
            throw new Error("SAFE: ID must be a number")
        }
        const anonUser: AnonUser | void = this.anon.getAnonUserByAlias(id);
        if (anonUser instanceof AnonUser) {
            return this.anon.sendAnonMessage(anonUser.user.dmChannel ||
                await anonUser.user.createDM(), message, 1);
        } else {
            throw new Error("SAFE: User not found");
        }
    }
}

export class NewID extends RequiresAnon {
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
        const user = await this.anon.getAnonUser(message.author);
        if (customID == null) {
            this.anon.newAlias(user);
        } else {
            const parsed = parseInt(customID, 10);
            if (isNaN(parsed)) {
                throw new Error("SAFE: ID must be a number")
            }
            this.anon.setAlias(user, parsed);
        }
        return message.author.send("You are now speaking under ID `" + user.getAlias() + "`");
    }
}

export class Blacklist extends RequiresAnon {
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
        const blacklistResponse = await this.anon.blacklist(messageID, message.author);
        return message.reply(`Blacklisted \`${blacklistResponse.anonAlias}\`.
ID: ${blacklistResponse.blacklistID}`)
    }
}

export class Unblacklist extends RequiresAnon {
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
        await this.anon.unblacklist(blacklistID, message.author);
        return message.reply("Unblacklisted");
    }
}

export class BlacklistedBy extends RequiresAnon {
    constructor(bot) {
        super(bot, {
            names: ["blacklistedby", "blacklister", "whoblacklisted"],
            usages: {
                "Show who blacklisted a certain user": ["blacklistId"]
            },
            permission: Permission.UserKick,
            availability: Availability.GuildOnly
        })
    }

    async exec(message: Message, blacklistID: string) {
        const id: Snowflake | void = await this.anon.blacklistedBy(blacklistID);
        if (typeof id === "string") {
            const member = await this.anon.guild.members.fetch(id);
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

export class Reset extends RequiresAnon {
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
        this.anon.reset();
        return message.reply("Reset all IDs")
    }
}

export class SetColor extends RequiresAnon {
    constructor(bot) {
        super(bot, {
            names: ["setcolor", "set_color"],
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
        const anonUser: AnonUser = await this.anon.getAnonUser(message.author);
        let colorDecimal: number;
        if (color == null) {
            colorDecimal = randomColor();
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
        return message.channel.send(new MessageEmbed()
            .setTitle("Color set")
            .setColor(colorDecimal));
    }
}