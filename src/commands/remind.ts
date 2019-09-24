import {
    Availability,
    Command,
    CommandConfig, CommandsModule,
    PartialCommandConfig,
    Permission
} from "../modules/commands";
import {Bot} from "../bot";
import {Message, MessageEmbed} from "discord.js";
import {RemindModule} from "../modules/remind";
import {dateAfterSeconds, formatInterval, parseInterval} from "../util";

class RequiresRemind extends Command {
    protected remind: RemindModule;

    constructor(bot: Bot, config: PartialCommandConfig) {
        let withCategory = config as CommandConfig;
        withCategory.category = "remind";
        super(bot, withCategory);
    }

    async run(message?: Message, ...args: string[]): Promise<any> {
        this.remind = this.bot.getModule("remind") as RemindModule;
        return super.run(message, ...args);
    }
}

export class RemindMe extends RequiresRemind {
    constructor(bot: Bot) {
        super(bot, {
            names: ["remindme", "remind"],
            usages: {
                "Gives you a reminder after the given interval": ["interval", "reminder"]
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.All
        });
    }

    async exec(message: Message, input: string, _: string) {
        const content = (this.bot.getModule("commands") as CommandsModule)
            .getRawContent(message.content, 1);
        const interval = parseInterval(input);
        const triggerDate = dateAfterSeconds(interval);
        const reminder = await message.channel.send(new MessageEmbed()
            .setTitle("Reminder Set")
            .setDescription(`I will remind you of "${content}" in ${formatInterval(interval)}.\
            React to this message to also get this reminder.`)
            .setFooter("Reminder set for")
            .setTimestamp(triggerDate)
            .setColor(this.bot.displayColor())
        );
        await this.remind.schedule(message.author.id, content, triggerDate, reminder);
    }
}