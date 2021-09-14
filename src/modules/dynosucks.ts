import {Module} from "../module";
import {Bot} from "../bot";
import {Message} from "discord.js";
import {timeDiff} from "../util";

const dynoID = "155149108183695360";
// Credit to Max for most of these wonderful insults
const insults = [
    "Dyno is bad and you should feel bad for trying to use it.",
    "Oh would you look at that! It seems Dyno is down once again... I wonder what alternative multi-function discord bot you could use.........",
    "Poor Dyno.",
    "You know... I can mute plebs too. In fact, some say I do it better than Dyno.",
    "You know what rhymes with Dyno? Rhino! And you know what a Rhino is? It's an oversized, dumb, thick animal that people kill because they using parts of it will finally make them horny.",
    "Sorry! It looks like Dyno is down. You should probably be using a better bot, like RoboDubs.",
    "Dyno down again? Are you surprised?",
    "Did you know that the developers of Dyno are horrible people? I heard one stepped on a puppy and liked it.",
    "Dyno is currently undergoing \"maintenance.\" That's secret code for \"the developers are shit.\"",
    "Error Code 666: Dyno is trash.",
    "I'm going to duel with Dyno to the death. Wanna watch?",
    "Dyno is currently down. I'm not, though. Isn't that neat?",
    "This command is unavailable at the moment due to an immense amount of stupidity on behalf of Dyno.",
    "Did you mean to use Dyno? Why would you do that? I wouldn't betray you by going offline like Dyno does.",
    "What if I... overthrew Dyno... as the superior Discord bot... Haha just kidding.... Unless..?",
    "Dyno is currently being bounded. We apologize for the inconvenience. In the meantime, why don't you try a more boundless bot?",
    "Unfortunately Dyno was rejected from CSE and killed itself. But don't fret! I convinced them I was diverse enough to let me in.",
    "If Dyno goes down again, I'm authorized to use lethal force."
];

export class DynoSucksModule extends Module {
    private lastActivationBlock: Date;
    private messagesSinceLastActivation: number;

    constructor(bot: Bot) {
        super(bot, "dynosucks");
    }

    public async initialize() {
        this.listen("message", this.onMessage.bind(this));
    }

    private onMessage(message: Message) {
        if (message.guild != null
            && message.content.startsWith("?")
            && message.content.length > 1
            && this.bot.guild.members.cache.get(dynoID) != null
            && this.bot.guild.members.cache.get(dynoID).presence.status === "offline") {
            // 🦀🦀🦀 dyno is dead 🦀🦀🦀
            if (this.lastActivationBlock == null
                || timeDiff(new Date(), this.lastActivationBlock) > 60000) {
                this.lastActivationBlock = new Date();
                this.messagesSinceLastActivation = 0;
            }
            if (this.messagesSinceLastActivation === 8) {
                message.channel.send("Don't spam me! That ruins the fun.")
                    .catch((err) => {
                        console.error("DynoSucks error: " + err.stack);
                    });
            } else if (this.messagesSinceLastActivation < 8) {
                message.channel.send(insults[Math.floor(Math.random() * insults.length)])
                    .catch((err) => {
                        console.error("DynoSucks error: " + err.stack);
                    });
            }
            this.messagesSinceLastActivation++;
        }
    }
}