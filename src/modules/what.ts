import {Module} from "../module";
import {Bot} from "../bot";
import {Message} from "discord.js";

export class WhatModule extends Module {
    constructor(bot: Bot) {
        super(bot, "what");
    }

    public async initialize() {
        this.listen("message", this.onMessage.bind(this));
    }

    private async onMessage(message: Message): Promise<void> {
        if (message.guild != null && message.mentions.has(this.bot.client.user)) {
            await message.channel.send("What?");
        }
    }
}