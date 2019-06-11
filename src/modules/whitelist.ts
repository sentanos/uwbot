import {Module} from "../module";
import {Bot} from "../bot";
import {PersistentChannelList} from "../util";

export class WhitelistModule extends Module {
    public readonly channels: PersistentChannelList;

    constructor(bot: Bot) {
        super(bot, "whitelist");
        this.channels = new PersistentChannelList(this.bot.DB, "whitelist");
    }
}