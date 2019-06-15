import {Module} from "../module";
import {Message, MessageReaction, Snowflake, User} from "discord.js";
import {PinModuleConfig} from "../config";
import {Database} from "sqlite";
import {Bot} from "../bot";

export class PinModule extends Module {
    private readonly config: PinModuleConfig;
    private readonly DB: Database;

    constructor(bot: Bot) {
        super(bot, "pin");
        this.DB = this.bot.DB;
        this.config = this.bot.config.pin;
        // this.bot.client.on("messageReactionAdd", this.messageReactionAdd.bind(this));
        // this.bot.client.on("messageReactionRemove", this.messageReactionRemove.bind(this));
    }

    // Unpin the given message. If creator is specified, make sure that the message pinner's ID
    // matches. Otherwise, unpin no matter who the original pinner was.
    public async unpin(message: Message, creator?: Snowflake) {
        await this.bot.transactionLock.acquire();
        await this.DB.exec("BEGIN TRANSACTION");
        try {
            const userID: Snowflake = (await this.DB.get(
                `SELECT userID FROM pinned WHERE messageID = ?`, message.id)).userID;
            if (creator == null || userID === creator) {
                if (message.reactions.get(this.config.emoji).count === 0) {
                    await this.DB.run(`DELETE FROM pinned WHERE messageID = ?`,
                        message.id);
                    await message.unpin();
                } else {
                    const other = (await message.reactions.get(this.config.emoji)
                        .fetchUsers(1)).first();
                    await this.DB.run(`UPDATE pinned SET userID = ? WHERE messageID = ?`,
                        other.id, message.id);
                }
            }
            await this.DB.exec("COMMIT TRANSACTION")
        } catch (err) {
            console.error("Error while processing transaction, rolling back: " + err.stack);
            await this.DB.exec("ROLLBACK TRANSACTION")
        }
        await this.bot.transactionLock.release();
    }

    public async messageReactionAdd(reaction: MessageReaction, user: User) {
        if (reaction.message.guild != null
            && !reaction.message.pinned
            && reaction.emoji.name === this.config.emoji) {
            try {
                await this.DB.run(`INSERT INTO pinned(messageID, userID) VALUES(?, ?)`,
                    reaction.message.id, user.id);
            } catch (err) {
                console.error("Error pinning by database: " + err.stack);
                return
            }
            await reaction.message.pin()
        }
    }

    public async messageReactionRemove(reaction: MessageReaction, user: User) {
        if (reaction.message.guild != null
            && reaction.message.pinned
            && reaction.emoji.name === this.config.emoji) {
            return this.unpin(reaction.message, user.id);
        }
    }
}