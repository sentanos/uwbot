import {Module} from "../module";
import {Bot} from "../bot";
import {Message, User} from "discord.js";
import {ModerationModule} from "moderation";
import {Duration} from "moment";

export class OomfModule extends Module {
    constructor(bot: Bot) {
        super(bot, "oomf");
    }

    public async initialize() {
        this.listen("message", this.onMessage.bind(this));
    }

    private async onMessage(message: Message): Promise<void> {
        if (message.guild != null && message.content != null && message.content.includes(" oomf ")) {
            let mod: User = this.bot.getUser("chessturo") ?? this.bot.client.user!;
            this.bot.getModule("moderation").punish("mute", mod, message.author, "Don't say oomf", moment.duration(1, "hour"), message);
            await message.channel.send(`Punished <@${message.author.id}> for saying "oomf"`);
        }
    }
}