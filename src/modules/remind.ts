import {Module} from "../module";
import {Bot} from "../bot";
import {SchedulerModule} from "./scheduler";
import {Message, MessageEmbed, Snowflake, TextChannel, User} from "discord.js";
import {SettingsConfig} from "./settings.skip";
import {TimeModule} from "./time";

const settingsConfig: SettingsConfig = {
    emoji: {
        description: "The emoji used for reminders. If you are using a custom emoji, enter the" +
            " emoji ID."
    }
};

export class RemindModule extends Module {
    private scheduler: SchedulerModule;

    constructor(bot: Bot) {
        super(bot, "remind", ["scheduler"], settingsConfig);
    }

    public async initialize() {
        this.scheduler = this.bot.getModule("scheduler") as SchedulerModule;
    }

    public async schedule(authorID: Snowflake, content: string, triggerDate: Date,
                          reminderMessage: Message): Promise<void> {
        await this.scheduler.schedule("remind", triggerDate, "REMIND_TRIGGER",
            JSON.stringify({
                authorID: authorID,
                content: content,
                reminderMessageID: reminderMessage.id,
                context: reminderMessage.channel.type === "DM" ? "DM" : "GUILD",
                channelID: reminderMessage.channel.id
            }));
    }

    public async createReminder(commandMessage: Message, content: string, date: Date):
        Promise<Message> {
        const timeModule = this.bot.getModule("time") as TimeModule;
        const reminder = await commandMessage.channel.send({embeds: [new MessageEmbed()
            .setTitle("Reminder Set")
            .setDescription(`I will remind you of "${content}" on ${timeModule.formatDate(date)}.\
            React to this message with ${this.settings("emoji")} to also get this reminder.`)
            .setFooter("Reminder set for")
            .setTimestamp(date)
            .setColor(this.bot.displayColor())
        ]});
        await reminder.react(this.settings("emoji"));
        await this.schedule(commandMessage.author.id, content, date, reminder);
        return reminder;
    }

    private async sendReminder(user: User, reminder: string, permalink: string): Promise<void> {
        try {
            await user.send({embeds: [new MessageEmbed()
                .setTitle("Reminder")
                .setDescription(`This is your reminder for: ${reminder}\n\n\
                [Jump to reminder](${permalink})`)
                .setColor(this.bot.displayColor())
            ]})
        } catch (err) {
            if (err.message !== "Cannot send messages to this user") {
                throw err;
            }
        }
    }

    public async event(name: string, payload: string): Promise<void> {
        if (name === "REMIND_TRIGGER") {
            const reminder: {authorID: Snowflake, content: string, reminderMessageID: Snowflake,
                context: "DM" | "GUILD", channelID: Snowflake} =
                JSON.parse(payload);
            let jobs: Promise<void>[] = [];
            let user: User;
            try {
                user = await this.bot.client.users.fetch(reminder.authorID);
            } catch (err) {
                if (err.message !== "Unknown User") {
                    throw err;
                }
            }
            let message: Message;
            if (reminder.context === "DM") {
                message = await (await user.createDM()).messages.fetch(reminder.reminderMessageID);
            } else {
                message = await (this.bot.guild.channels.cache.get(reminder.channelID) as TextChannel)
                    .messages.fetch(reminder.reminderMessageID);
            }
            jobs.push(this.sendReminder(user, reminder.content, message.url));
            if (reminder.context !== "DM"
                && message.reactions.cache.has(this.settings("emoji"))) {
                const targets = (await message.reactions.cache.get(this.settings("emoji"))
                    .users.fetch()).values();
                for (const user of targets) {
                    if (user.id !== this.bot.client.user.id
                        && user.id !== reminder.authorID) {
                        jobs.push(this.sendReminder(user, reminder.content, message.url));
                    }
                }
            }
            await Promise.all(jobs);
        }
    }
}