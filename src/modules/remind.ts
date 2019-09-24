import {Module} from "../module";
import {Bot} from "../bot";
import {SchedulerModule} from "./scheduler";
import {Message, MessageEmbed, Snowflake, TextChannel, User} from "discord.js";
import {SettingsConfig} from "./settings.skip";

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
        await reminderMessage.react(this.settings("emoji"));
        await this.scheduler.schedule("remind", triggerDate, "REMIND_TRIGGER",
            JSON.stringify({
                authorID: authorID,
                content: content,
                reminderMessageID: reminderMessage.id,
                context: reminderMessage.channel.type === "dm" ? "DM" : "GUILD",
                channelID: reminderMessage.channel.id
            }));
    }

    private async sendReminder(user: User, reminder: string): Promise<void> {
        try {
            await user.send(new MessageEmbed()
                .setTitle("Reminder")
                .setDescription(`This is your reminder for: ${reminder}`)
                .setColor(this.bot.displayColor())
            )
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
            let user;
            try {
                user = await this.bot.client.users.fetch(reminder.authorID);
            } catch (err) {
                if (err.message !== "Unknown User") {
                    throw err;
                }
            }
            jobs.push(this.sendReminder(user, reminder.content));
            if (reminder.context !== "DM") {
                const message = await (this.bot.guild.channels.get(reminder.channelID) as TextChannel)
                    .messages.fetch(reminder.reminderMessageID);
                if (message.reactions.has(this.settings("emoji"))) {
                    const targets = (await message.reactions.get(this.settings("emoji"))
                        .users.fetch()).array();
                    for (let i = 0; i < targets.length; i++) {
                        if (targets[i].id !== this.bot.client.user.id
                            && targets[i].id !== reminder.authorID) {
                            jobs.push(this.sendReminder(targets[i], reminder.content));
                        }
                    }
                }
            }
            await Promise.all(jobs);
        }
    }
}