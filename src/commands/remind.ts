import {
    Availability,
    Command,
    CommandConfig, CommandsModule,
    PartialCommandConfig,
    Permission
} from "../modules/commands";
import {Bot} from "../bot";
import {Message} from "discord.js";
import {RemindModule} from "../modules/remind";
import {
    IntervalResponse,
    smartFindInterval
} from "../util";

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
                "Gives you a reminder after the given interval": ["interval", "reminder"]
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.All
        });
    }

    async exec(message: Message, input: string, _: string): Promise<Message> {
        const resp: IntervalResponse = smartFindInterval(this.bot, message.content, false);
        return await this.remind.createReminder(message, resp.raw, resp.interval);
    }
}