import {Module} from "../module";
import {Message, MessageReaction, Snowflake, User} from "discord.js";
import {Bot} from "../bot";
import {AuditModule} from "./audit";
import {PersistentChannelList, PersistentChannelListConfig} from "../util";
import {Pins} from "../database/models/pins";
import {Availability, Permission} from "./commands";
import {SettingsConfig} from "./settings.skip";

const settingsConfig: SettingsConfig = {
    emoji: {
        description: "The emoji used to pin messages. If you are using a custom emoji, enter the" +
            " emoji name."
    }
};

const commandConfig: PersistentChannelListConfig = {
    listName: "Pin Disabled Channels",
    parentModule: "pin",
    get: {
        command: "pin exclude get",
        usage: "Get channels with pinning disabled",
        permission: Permission.VerifiedGuildMember,
        availability: Availability.WhitelistedGuildChannelsOnly
    },
    add: {
        command: "pin exclude add",
        usage: "Disable pinning in a channel",
        permission: Permission.UserKick,
        availability: Availability.WhitelistedGuildChannelsOnly
    },
    remove: {
        command: "pin exclude remove",
        usage: "Enable pinning in a channel where pinning was previous disabled",
        permission: Permission.UserKick,
        availability: Availability.WhitelistedGuildChannelsOnly
    }
};

export class PinModule extends Module {
    private audit: AuditModule;
    public exclude: PersistentChannelList;

    constructor(bot: Bot) {
        super(bot, "pin", ["audit"], settingsConfig);
        this.exclude = new PersistentChannelList(this.bot, "pinExclude");
    }

    public async initialize() {
        await this.exclude.initialize();
        this.exclude.addCommands(commandConfig);
        this.audit = this.bot.getModule("audit") as AuditModule;
        this.listen("messageReactionAdd", this.messageReactionAdd.bind(this));
        this.listen("messageReactionRemove", this.messageReactionRemove.bind(this));
    }

    public async whoPinned(messageID: Snowflake): Promise<Snowflake | void> {
        const pin = await Pins.findByPk(messageID);
        if (pin == null) {
            return null;
        }
        return pin.userID;
    }

    // Unpin the given message. If creator is specified, make sure that the message pinner's ID
    // matches. Otherwise, unpin no matter who the original pinner was.
    private async unpin(message: Message, user?: User) {
        const pin: Pins | null = await Pins.findByPk(message.id);
        if (pin == null) { // Most likely this message was already manually pinned
            return;
        }
        const userID: Snowflake = pin.userID;
        if (user == null || userID === user.id) {
            const reactions: MessageReaction | void = message.reactions.cache.get(this.settings("emoji"));
            if (reactions == null || reactions.count === 0) {
                await pin.destroy();
                await message.unpin();
                if (pin.systemMessageID != null) {
                    await (await message.channel.messages.fetch(pin.systemMessageID)).delete();
                }
                if (user instanceof User) {
                    await this.audit.pinLog(user, message, "unpin");
                }
            } else {
                const other = (await reactions.users.fetch({limit: 1})).first();
                pin.update({
                    userID: other.id
                });
                if (user instanceof User) {
                    await this.audit.pinChangeLog(user, other, message);
                }
            }
        }
    }

    private async pin(message: Message, user: User) {
        let pinMessageListener: (Message) => Promise<void>;
        const pin: Pins = await Pins.create({
            messageID: message.id,
            userID: user.id
        });
        pinMessageListener = async (pinMessage: Message) => {
            if (pinMessage.system && pinMessage.type === "CHANNEL_PINNED_MESSAGE") {
                this.bot.client.off("message", pinMessageListener);
                await pin.update({
                    systemMessageID: pinMessage.id
                });
            }
        };
        this.bot.client.on("message", pinMessageListener);
        await message.pin();
        await this.audit.pinLog(user, message, "pin");
    }

    private async messageReactionAdd(reaction: MessageReaction, user: User) {
        if (reaction.message.partial) {
            await reaction.message.fetch();
        }
        if (await this.exclude.has(reaction.message.channel.id)) {
            return;
        }
        if (reaction.message.guild != null
            && !reaction.message.pinned
            && reaction.emoji.name === this.settings("emoji")) {
            return this.pin(reaction.message as Message, user);
        }
    }

    private async messageReactionRemove(reaction: MessageReaction, user: User) {
        if (reaction.message.partial) {
            await reaction.message.fetch();
        }
        if (await this.exclude.has(reaction.message.channel.id)) {
            return;
        }
        if (reaction.message.guild != null
            && reaction.message.pinned
            && reaction.emoji.name === this.settings("emoji")) {
            return this.unpin(reaction.message as Message, user);
        }
    }
}