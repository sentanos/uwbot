import {Module} from "../module";
import {Bot} from "../bot";
import {PersistentChannelList, PersistentChannelListConfig} from "../util";
import {Availability, Permission} from "./commands";

const commandConfig: PersistentChannelListConfig = {
    listName: "Whitelist",
    parentModule: "whitelist",
    get: {
        command: "whitelist get",
        usage: "Gets whitelisted channels for certain bot commands",
        permission: Permission.VerifiedGuildMember,
        availability: Availability.All
    },
    add: {
        command: "whitelist add",
        usage: "Adds a channel to the whitelist",
        permission: Permission.UserKick,
        availability: Availability.GuildOnly
    },
    remove: {
        command: "whitelist remove",
        usage: "Removes a channel from the whitelist",
        permission: Permission.UserKick,
        availability: Availability.GuildOnly
    }
};

export class WhitelistModule extends Module {
    public readonly channels: PersistentChannelList;

    constructor(bot: Bot) {
        super(bot, "whitelist");
        this.channels = new PersistentChannelList(this.bot, "whitelist");
        this.channels.addCommands(commandConfig);
    }

    public async initialize() {
        await this.channels.initialize();
    }
}