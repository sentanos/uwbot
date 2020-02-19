import {Bot} from "../bot";
import {SettingsConfig} from "./settings.skip";
import {Module} from "../module";
import {CommandsModule, ParsedCommand} from "./commands";
import moment from "moment-timezone";

const settingsConfig: SettingsConfig = {
    timezone: {
        description: "The time zone for all time related commands and responses",
        default: "America/Los_Angeles"
    }
};

export type DateResponse = {
    date: Date,
    args: string[],
    offset: number,
    raw: string
}

export class TimeModule extends Module {
    constructor(bot: Bot) {
        super(bot, "time", null, settingsConfig, true);
    }

    // Format date in "YYYY-MM-DD h:mA z"
    public formatDate(date: Date): string {
        return moment(date).tz(this.settings("timezone")).format("YYYY-MM-DD h:mma z");
    }

    // Searches for a date with the given formats (see first block). Only finds dates at the end
    // of a string
    public smartFindDate(content: string): DateResponse {
        const handler = this.bot.getModule("commands") as CommandsModule;
        const res: ParsedCommand | void = handler.parseCommand(content);
        let args;
        if (res != null) {
            args = (res as ParsedCommand).args;
        } else {
            throw new Error("Fatal error");
        }

        const formats = [
            "YYYY-MM-DD h:mmA",
            "MM/DD/YYYY h:mmA",
            "YYYY-MM-DD H:mm",
            "MM/DD/YYYY H:mm",
            "YYYY-MM-DD",
            "MM/DD/YYY"
        ];
        let date = moment.tz(args[args.length - 1], formats, true, this.settings("timezone"));
        if (date.isValid()) {
            const raw = handler.getRawContent(content, -1);
            args.pop();
            return {
                date: date.toDate(),
                args: args,
                offset: -1,
                raw: raw
            }
        }

        date = moment.tz(args[args.length - 2] + " " + args[args.length - 1], formats, true,
            this.settings("timezone"));
        if (date.isValid()) {
            const raw = handler.getRawContent(content, -2);
            args.pop();
            args.pop();
            return {
                date: date.toDate(),
                args: args,
                offset: -2,
                raw: raw
            }
        }

        throw new Error("No date found");
    };
}