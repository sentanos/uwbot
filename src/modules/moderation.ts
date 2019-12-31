import {Module} from "../module";
import {Bot} from "../bot";
import {AuditModule} from "./audit";
import {
    Channel,
    GuildChannel,
    GuildMember,
    Message,
    MessageEmbed,
    Role,
    Snowflake,
    User
} from "discord.js";
import {Mutes} from "../database/models/mutes";
import {dateAfterSeconds, formatInterval} from "../util";
import {SchedulerModule} from "./scheduler";

const MutedRoleName = "UW-Muted";

export class ModerationModule extends Module {
    private audit: AuditModule;
    private scheduler: SchedulerModule;
    private role: Role;

    constructor(bot: Bot) {
        super(bot, "moderation", ["audit", "scheduler"]);
    }

    public async initialize() {
        this.audit = this.bot.getModule("audit") as AuditModule;
        this.scheduler = this.bot.getModule("scheduler") as SchedulerModule;

        let role = this.bot.guild.roles.find(r => r.name === MutedRoleName);
        if (role == null) {
            role = await this.bot.guild.roles.create({
                data: {
                    name: "UW-Muted",
                    permissions: 0
                }
            });
        }
        this.role = role;

        this.listen("channelCreate", this.channelCreate.bind(this));
        this.listen("guildMemberAdd", this.guildMemberAdd.bind(this));
        this.bot.guild.channels.each((channel: GuildChannel) => {
            this.updatePermissions(channel)
                .catch((err) => {
                    console.error("MODERATION: Error updating muted role permissions for channel " +
                        `${channel.id}: ${err.stack}`);
                });
        });
        (await Mutes.findAll()).forEach((mute: Mutes) => {
            this.checkMute(mute.userID)
                .catch((err) => {
                    console.error("MODERATION: Error checking mute for " + mute.userID + ": " + err.stack);
                })
        });
    }

    public async event(name: string, payload: string): Promise<void> {
        if (name === "MOD_UNMUTE") {
            await this.doUnmute(payload);
            if (this.bot.guild.members.has(payload)) {
                this.bot.guild.members.get(payload).send(new MessageEmbed()
                    .setDescription("Your mute in the UW discord has ended")
                    .setColor(this.bot.displayColor()))
                .catch((err) => {
                    console.error(`Failed to send unmute message to ${payload}: ${err.stack}`);
                });
            }
        }
    }

    public async isMuted(userID: Snowflake): Promise<boolean> {
        return await Mutes.findByPk(userID) instanceof Mutes;
    }

    public async checkMute(userID: Snowflake): Promise<void> {
        if (await this.isMuted(userID)) {
            await this.applyMute(userID);
        }
    }

    private async clearJobs(userID: Snowflake): Promise<void> {
        await this.scheduler.deleteJobsByContent("MOD_UNMUTE", userID);
    }

    public async mute(moderator: User, target: User, reason: string, interval: number,
                      commandMessage: Message): Promise<Date | void> {
        await this.clearJobs(target.id);
        const res = await this.doMute(moderator.id, target.id, interval);
        if (moderator.id !== target.id) {
            await this.audit.mute(moderator, target, reason, commandMessage, interval);
            target.send(new MessageEmbed()
                .setDescription(`You have been muted in the UW discord by ${moderator.tag} for ` +
                    `${formatInterval(interval)}. Reason: ${reason}\n\n[Jump to mute]` +
                    `(${commandMessage.url})`)
                .setColor(this.bot.displayColor()))
                .catch((err) => {
                    console.error(`Failed to send mute message to ${target.id}: ${err.stack}`);
                });
        }
        return res;
    }

    private async doMute(initiatorID: Snowflake, targetID: Snowflake, interval: number): Promise<Date | void> {
        await this.applyMute(targetID);
        let prev: Date | void = null;
        let mute: Mutes | void = await Mutes.findByPk(targetID);
        if (mute != null) {
            if (mute.initiatorID !== mute.userID) {
                prev = mute.expiration;
            }
        } else {
            mute = Mutes.build();
        }
        mute.userID = targetID;
        mute.expiration = dateAfterSeconds(interval);
        mute.initiatorID = initiatorID;
        await mute.save();
        await this.scheduler.schedule("moderation", mute.expiration, "MOD_UNMUTE", targetID);
        return prev;
    }

    private async applyMute(userID: Snowflake): Promise<void> {
        if (this.bot.guild.members.has(userID)) {
            await this.bot.guild.members.get(userID).roles.add(this.role);
        }
    }

    private async applyUnmute(userID: Snowflake): Promise<void> {
        if (this.bot.guild.members.has(userID)) {
            await this.bot.guild.members.get(userID).roles.remove(this.role);
        }
    }

    public async unmute(moderator: User, target: User, commandMessage: Message): Promise<Mutes> {
        await this.clearJobs(target.id);
        const res = await this.doUnmute(target.id);
        await this.audit.unmute(moderator, target, commandMessage);
        return res;
    }

    // Does NOT clear jobs
    private async doUnmute(userID: Snowflake): Promise<Mutes> {
        await this.applyUnmute(userID);
        const user: Mutes | void = await Mutes.findByPk(userID);
        if (user == null) {
            throw new Error("SAFE: User is not muted");
        }
        await user.destroy();
        return user;
    }

    private async updatePermissions(channel: GuildChannel) {
        await channel.updateOverwrite(this.role, {
            ADD_REACTIONS: false,
            SEND_MESSAGES: false,
            SPEAK: false
        });
    }

    public async channelCreate(channel: Channel) {
        if (channel instanceof GuildChannel) {
            await this.updatePermissions(channel);
        }
    }

    public async guildMemberAdd(member: GuildMember) {
        await this.checkMute(member.user.id);
    }
}