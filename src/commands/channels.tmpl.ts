import {Command} from "../modules/commands";
import {PersistentChannelList, PersistentChannelListConfigPart} from "../util";
import {Bot} from "../bot";
import {Message, MessageEmbed, Snowflake} from "discord.js";

class ChannelCommand extends Command {
    public readonly channels: PersistentChannelList;
    public readonly listName: string;

    constructor(bot: Bot, channels: PersistentChannelList, config: PersistentChannelListConfigPart,
                listName: string, args: string[]) {
        super(bot, {
            names: [config.command],
            usages: {
                [config.usage]: args
            },
            permission: config.permission,
            availability: config.availability
        });

        this.channels = channels;
        this.listName = listName;
    }
}

export class ChannelGetCommand extends ChannelCommand {
    constructor(bot: Bot, channels: PersistentChannelList, config: PersistentChannelListConfigPart,
                listName: string) {
        super(bot, channels, config, listName, []);
    }

    async exec(message: Message) {
        const ids: Snowflake[] = await this.channels.getChannels();
        let channels: string[] = [];
        for (let i = 0; i < ids.length; i++) {
            const id: Snowflake = ids[i];
            if (this.bot.guild.channels.has(id)) {
                channels.push("#" + this.bot.guild.channels.get(id).name)
            } else {
                channels.push(id);
            }
        }
        return message.channel.send(new MessageEmbed()
            .setTitle(this.listName)
            .setDescription(channels.join("\n"))
            .setColor(this.bot.displayColor()));
    }
}

export class ChannelAddCommand extends ChannelCommand {
    constructor(bot: Bot, channels: PersistentChannelList, config: PersistentChannelListConfigPart,
                listName: string) {
        super(bot, channels, config, listName, ["channelID"]);
    }

    async exec(message: Message, channel: string) {
        if (!this.bot.guild.channels.has(channel)) {
            throw new Error("SAFE: Channel does not exist. Make sure to use the channel ID, NOT" +
                " the channel name.");
        }
        await this.channels.add(channel);
        return message.channel.send("Added channel #" + message.guild.channels.get(channel).name +
            " to " + this.listName)
    }
}

export class ChannelRemoveCommand extends ChannelCommand {
    constructor(bot: Bot, channels: PersistentChannelList, config: PersistentChannelListConfigPart,
                listName: string) {
        super(bot, channels, config, listName, ["channelID"]);
    }

    async exec(message: Message, channel: string) {
        await this.channels.remove(channel);
        return message.channel.send("Removed channel from " + this.listName)
    }
}