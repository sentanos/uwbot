import {Module} from "../module";
import {Message, MessageReaction, Snowflake, User} from "discord.js";
import {PinModuleConfig} from "../config";
import {Database} from "sqlite";
import {Bot} from "../bot";
import {AuditModule} from "./audit";
import {PersistentChannelList} from "../util";

export class PinModule extends Module {
    private readonly config: PinModuleConfig;
    private readonly DB: Database;
    private audit: AuditModule;
    public exclude: PersistentChannelList;

    constructor(bot: Bot) {
        super(bot, "pin", ["audit"]);
        this.DB = this.bot.DB;
        this.config = this.bot.config.pin;
        this.exclude = new PersistentChannelList(this.bot.DB, "pinExclude");
    }

    public async initialize() {
        this.audit = this.bot.getModule("audit") as AuditModule;
        this.bot.client.on("messageReactionAdd", this.messageReactionAdd.bind(this));
        this.bot.client.on("messageReactionRemove", this.messageReactionRemove.bind(this));
    }

    // Unpin the given message. If creator is specified, make sure that the message pinner's ID
    // matches. Otherwise, unpin no matter who the original pinner was.
    private async unpin(message: Message, user?: User) {
        await this.bot.transactionLock.acquire();
        await this.DB.exec("BEGIN TRANSACTION");
        try {
            const data = (await this.DB.get(
                `SELECT userID, pinMessage FROM pinned WHERE messageID = ?`, message.id));
            if (data == null) { // Most likely this message was already manually pinned
                return;
            }
            const userID: Snowflake = data.userID;
            if (user == null || userID === user.id) {
                const reactions: MessageReaction | void = message.reactions.get(this.config.emoji);
                if (reactions == null || reactions.count === 0) {
                    await this.DB.run(`DELETE FROM pinned WHERE messageID = ?`,
                        message.id);
                    await message.unpin();
                    if (data.pinMessage != null) {
                        await (await message.channel.messages.fetch(data.pinMessage)).delete();
                    }
                    if (user instanceof User) {
                        let _ = this.audit.pinLog(user, message, "unpin");
                    }
                } else {
                    const other = (await reactions.users.fetch({limit: 1})).first();
                    await this.DB.run(`UPDATE pinned SET userID = ? WHERE messageID = ?`,
                        other.id, message.id);
                    if (user instanceof User) {
                        let _ = this.audit.pinChangeLog(user, other, message);
                    }
                }
            }
            await this.DB.exec("COMMIT TRANSACTION");
        } catch (err) {
            console.error("Error while processing transaction, rolling back: " + err.stack);
            await this.DB.exec("ROLLBACK TRANSACTION");
        }
        await this.bot.transactionLock.release();
    }

    private async pin(message: Message, user: User) {
        await this.bot.transactionLock.acquire();
        await this.DB.exec("BEGIN TRANSACTION");
        let pinMessageListener: (Message) => Promise<void>;
        try {
            await this.DB.run(`INSERT INTO pinned(messageID, userID) VALUES(?, ?)`,
                message.id, user.id);
            pinMessageListener = async (pinMessage: Message) => {
                // There is no way to actually check what the system message is... so we just
                // have to hope it is the pin message?
                if (pinMessage.system && pinMessage.type === "PINS_ADD") {
                    await this.DB.run(`UPDATE pinned SET pinMessage = ? WHERE messageID = ?`,
                        pinMessage.id, message.id);
                    await this.DB.exec("COMMIT TRANSACTION");
                    this.bot.client.off("message", pinMessageListener);
                }
            };
            this.bot.client.on("message", pinMessageListener);
            await message.pin();
            let _ = this.audit.pinLog(user, message, "pin");
        } catch (err) {
            console.error("Error while processing transaction, rolling back: " + err.stack);
            await this.DB.exec("ROLLBACK TRANSACTION");
            if (pinMessageListener != null) {
                this.bot.client.off("message", pinMessageListener);
            }
        }
        await this.bot.transactionLock.release();
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
            && reaction.emoji.name === this.config.emoji) {
            return this.pin(reaction.message, user);
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
            && reaction.emoji.name === this.config.emoji) {
            return this.unpin(reaction.message, user);
        }
    }
}