import {Module} from "../module";
import {SettingsConfig} from "./settings.skip";
import {GuildMember, Message, MessageEmbed, TextChannel, User} from "discord.js";
import {SchedulerModule} from "./scheduler";
import {Bot} from "../bot";
import {listOrNone} from "../util";

const settingsConfig: SettingsConfig = {
    channel: {
        description: "The suggestions channel ID"
    },
    resultsChannel: {
        description: "The channel ID where voting results are sent"
    },
    voteInterval: {
        description: "The time interval in seconds during which votes are accepted for a suggestion"
    },
    upvoteEmoji: {
        description: "The upvote emoji"
    },
    downvoteEmoji: {
        description: "The downvote emoji"
    },
    disallowRole: {
        description: "Role ID that is not allowed to vote",
        optional: true
    }
};

type Disqualification = {
    user: User,
    reason: string
}

export class SuggestionsModule extends Module {
    private scheduler: SchedulerModule;

    constructor(bot: Bot) {
        super(bot, "suggestions", ["scheduler"], settingsConfig);
    }

    public async initialize() {
        this.scheduler = this.bot.getModule("scheduler") as SchedulerModule;
        this.listen("message", this.onMessage.bind(this));
    }

    private eligible(member: GuildMember): boolean {
        return !this.settingsHas("disallowRole") || member.roles.has(this.settings("disallowRole"));
    }

    private checkEligible(user: User, dq: Disqualification[]): boolean {
        if (user.id === this.bot.client.user.id) {
            return false;
        }
        if (!this.bot.guild.members.has(user.id)) {
            dq.push({
                user: user,
                reason: "User left the guild"
            });
            return false;
        } else {
            let member = this.bot.guild.member(user);
            if (!this.eligible(member)) {
                dq.push({
                    user: user,
                    reason: "Moderators are not allowed to vote"
                });
                return false;
            }
        }
        return true;
    }

    private async voteComplete(suggestion: Message, voting: Message): Promise<void> {
        const upReact = voting.reactions.get(this.settings("upvoteEmoji"));
        const downReact = voting.reactions.get(this.settings("downvoteEmoji"));
        let up = new Set<string>(upReact.users.keyArray());
        let down = new Set<string>(downReact.users.keyArray());
        let dq: Disqualification[] = [];

        for (const id of up) {
            if (down.has(id) && id !== this.bot.client.user.id) {
                dq.push({
                    user: upReact.users.get(id),
                    reason: "User both upvoted and downvoted"
                });
                up.delete(id);
                down.delete(id);
            } else {
                if (!this.checkEligible(upReact.users.get(id), dq)) {
                    up.delete(id);
                }
            }
        }
        for (const id of down) {
            if (!this.checkEligible(downReact.users.get(id), dq)) {
                down.delete(id);
            }
        }

        let upTags: string[] = [...up].map(id => upReact.users.get(id).tag);
        let downTags: string[] = [...down].map(id => downReact.users.get(id).tag);
        let dqTags: string[] = dq.map(dqd => `${dqd.user.tag} (${dqd.reason})`);

        const channel = this.bot.guild.channels.get(this.settings("resultsChannel")) as TextChannel;
        const results = await channel.send(new MessageEmbed()
            .setTitle("Voting Ended")
            .setDescription(`Voting has ended for the following suggestion and the results are below: \
            \`\`\`${suggestion.content}\`\`\``)
            .addField(`For - ${up.size}`, listOrNone(upTags), true)
            .addField(`Against - ${down.size}`, listOrNone(downTags), true)
            .addField(`Not Counted`, listOrNone(dqTags) +
                `\n\n[Jump to suggestion](${suggestion.url})`)
            .setAuthor(suggestion.author.tag, suggestion.author.avatarURL())
            .setColor(this.bot.displayColor())) as Message;
        await voting.edit(new MessageEmbed()
            .setDescription("Voting has ended for the above suggestion. [Click here for the" +
                " results.](" + results.url + ")")
            .setAuthor(suggestion.author.tag, suggestion.author.avatarURL())
            .setColor(this.bot.displayColor()));
    }

    public async event(name: string, payload: string) {
        if (name === "SUGGESTIONS_VOTECOMPLETE") {
            const channel = this.bot.guild.channels.get(this.settings("channel")) as TextChannel;
            const data: {suggestion: string, voting: string} = JSON.parse(payload);
            const suggestion = await channel.messages.fetch(data.suggestion);
            const voting = await channel.messages.fetch(data.voting);
            await this.voteComplete(suggestion, voting);
        }
    }

    public async onMessage(message: Message) {
        if (message.author.bot
            || message.channel.id !== this.settings("channel")) {
            return;
        }
        const end = new Date(new Date().getTime() + (this.settingsN("voteInterval") * 1000));
        const voting: Message = await message.channel.send(new MessageEmbed()
            .setDescription("Vote here for the above suggestion")
            .setFooter(`Voting will end at ${end.toLocaleString()}`)
            .setAuthor(message.author.tag, message.author.avatarURL())
            .setColor(this.bot.displayColor())) as Message;
        await this.scheduler.schedule("suggestions", end, "SUGGESTIONS_VOTECOMPLETE",
            JSON.stringify({
                suggestion: message.id,
                voting: voting.id
            }));
        await voting.react(this.settings("upvoteEmoji"));
        await voting.react(this.settings("downvoteEmoji"));
    }
}