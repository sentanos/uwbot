import {
    Availability,
    Command,
    CommandConfig,
    PartialCommandConfig,
    Permission
} from "../modules/commands";
import {Bot} from "../bot";
import {Message} from "discord.js";
import {RemindModule} from "../modules/remind";
import {TimeModule} from "../modules/time";
import {dateAfter, smartFindDuration} from "../util";

class RequiresRemind extends Command {
    protected remind: RemindModule;

    constructor(bot: Bot, config: PartialCommandConfig) {
        let withCategory = config as CommandConfig;
        withCategory.category = "remind";
        super(bot, withCategory);
    }

    async run(message?: Message, ...args: string[]): Promise<Message | void> {
        this.remind = this.bot.getModule("remind") as RemindModule;
        return super.run(message, ...args);
    }
}

export class RemindMe extends RequiresRemind {
    constructor(bot: Bot) {
        super(bot, {
            names: ["remindme", "remind"],
            usages: {
                "Gives you a reminder after the given interval": ["reminder", "interval"],
                ["Gives you a reminder on a certain date and (optionally) time. Supported" +
                " formats for date: YYYY-MM-DD, MM/DD/YYY. Supported formats for time: 23:59," +
                " 11:59pm"]: ["reminder", "date", "time"]
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.All
        });
    }

    async exec(message: Message, input: string, _: string): Promise<Message> {
        const timeModule = this.bot.getModule("time") as TimeModule;
        let raw;
        let date;
        try {
            const resp = timeModule.smartFindDate(message.content);
            raw = resp.raw;
            date = resp.date;
        } catch (e) {
            const resp = smartFindDuration(this.bot, message.content, false);
            raw = resp.raw;
            date = dateAfter(resp.duration);
        }
        return await this.remind.createReminder(message, raw, date);
    }
}