import {Availability, Command, Permission} from "../modules/commands";
import {Message, MessageEmbed} from "discord.js";

export class Rank extends Command {
    constructor(bot) {
        super(bot, {
            names: ["rank", "role"],
            usages: {
                "Get a rank": ["name"]
            },
            permission: Permission.None,
            availability: Availability.GuildOnly,
            category: "bot"
        });
    }

    async exec(message: Message, roleName: string): Promise<Message> {
        if (roleName.toLowerCase() !== "husko") {
            throw new Error("SAFE: Currently, only setting Husko is permitted")
        }
        const role = this.bot.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
        const member = this.bot.guild.member(message.author);
        if (member == null) {
            throw new Error("Member not found for ranking");
        }
        let action;
        if (member.roles.cache.has(role.id)) {
            action = "left";
            await member.roles.remove(role);
        } else {
            action = "joined";
            await member.roles.add(role);
        }
        return message.channel.send(new MessageEmbed()
            .setDescription(`${message.author.toString()}, you ${action} ${role.name}`)
            .setColor(this.bot.displayColor()))
    }
}
