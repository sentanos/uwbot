import {Module} from "../module";
import {Bot} from "../bot";
import {AuditModule} from "./audit";
import {
    Channel,
    GuildChannel,
    GuildMember,
    Message,
    MessageEmbed,
    PermissionOverwriteOptions,
    Role,
    RoleData,
    Snowflake,
    User
} from "discord.js";
import {Punishments} from "../database/models/punishments";
import {dateAfterSeconds, formatDuration} from "../util";
import {SchedulerModule} from "./scheduler";
import {Duration} from "moment";
import {SettingsConfig} from "./settings.skip";
import {UserSettingsModule} from "./usersettings";

export type PunishmentRoleType = "mute" | "quarantine";

export type PreviousPunishment = {
    type: PunishmentRoleType,
    expire: Date
}

const PunishmentRoles: {
    name: PunishmentRoleType,
    roleData: RoleData,
    overwrites: PermissionOverwriteOptions
}[] = [
    {
        name: "mute",
        roleData: {
            name: "UW-Muted",
            permissions: BigInt(0)
        },
        overwrites: {
            ADD_REACTIONS: false,
            SEND_MESSAGES: false,
            SPEAK: false
        }
    },
    {
        name: "quarantine",
        roleData: {
            name: "UW-Quarantined",
            permissions: BigInt(0)
        },
        overwrites: {
            VIEW_CHANNEL: false,
            CONNECT: false,
            ADD_REACTIONS: false,
            SEND_MESSAGES: false,
            SPEAK: false
        }
    }
];

const settingsConfig: SettingsConfig = {
    reverseBoundRoles: {
        description: "A map (key:value,key2:value2) of punishment names to roles that are" +
            " reversely bound. That is, if the punishment role is added the given role is" +
            " removed and when the punishment role is removed the given role is added back. This" +
            " is to facilitate unusual permission overwrite settings. Note that even if the" +
            " punished user does not have the role to begin with, they will still receive it" +
            " when the punishment is removed.",
        optional: true
    },
    punishMessage: {
        description: "The message to send to users when they are punished. Use %t as a" +
            " placeholder for the type (mute or quarantine), %d for the duration, %m for" +
            " moderator tag, and %r for reason.",
        default: "You have been %td in the UW discord by %m for %d. Reason: %r"
    },
    unpunishMessage: {
        description: "The message to send to users when their punishment ends. Use %t as a" +
            " placeholder for the type (mute or quarantine). If not set, no message is sent.",
        default: "Your %t in the UW discord has ended",
        optional: true
    }
};

export class ModerationModule extends Module {
    private audit: AuditModule;
    private scheduler: SchedulerModule;
    private usettings: UserSettingsModule;
    private roles: Map<PunishmentRoleType, Role>;

    constructor(bot: Bot) {
        super(bot, "moderation", ["audit", "scheduler", "usersettings"], settingsConfig);
        this.roles = new Map<PunishmentRoleType, Role>();
    }

    public async initialize() {
        this.audit = this.bot.getModule("audit") as AuditModule;
        this.scheduler = this.bot.getModule("scheduler") as SchedulerModule;
        this.usettings = this.bot.getModule("usersettings") as UserSettingsModule;

        for (let i = 0; i < PunishmentRoles.length; i++) {
            let pRole = PunishmentRoles[i];
            let role = this.bot.guild.roles.cache.find(r => r.name === pRole.roleData.name);
            if (role == null) {
                role = await this.bot.guild.roles.create(pRole.roleData);
            }
            this.roles.set(pRole.name, role);
        }

        let channels = this.bot.guild.channels.cache;

        // Quarantine channel
        const part = channels.partition(channel => channel.name !== "quarantined");
        channels = part[0];
        if (part[1].size === 0) {
            await this.bot.guild.channels.create("quarantined", {
                permissionOverwrites: [
                    {
                        id: this.bot.client.user.id,
                        allow: ["MANAGE_CHANNELS"]
                    },
                    {
                        id: this.bot.guild.roles.everyone.id,
                        deny: ["VIEW_CHANNEL", "SEND_MESSAGES"]
                    },
                    {
                        id: this.roles.get("quarantine").id,
                        allow: ["VIEW_CHANNEL"]
                    }
                ]
            });
        }

        channels.each((channel: GuildChannel) => {
            this.updatePermissions(channel)
                .catch((err) => {
                    console.error("MODERATION: Error updating muted role permissions for channel " +
                        `${channel.id}: ${err.stack}`);
                });
        });
        (await Punishments.findAll()).forEach((p: Punishments) => {
            this.checkModeration(p.userID)
                .catch((err) => {
                    console.error("MODERATION: Error checking punishment for " + p.userID + ": " + err.stack);
                })
        });

        this.listen("channelCreate", this.channelCreate.bind(this));
        this.listen("guildMemberAdd", this.guildMemberAdd.bind(this));
        this.listen("typingStart", this.typingStart.bind(this));
        this.listen("message", this.onMessage.bind(this));
    }

    public async event(name: string, payload: string): Promise<void> {
        if (name === "UNPUNISH") {
            const {type, targetID}: {type: PunishmentRoleType, targetID: Snowflake}
                = JSON.parse(payload);
            const punishment = await this.doUnpunish(type, targetID);
            if (this.settingsHas("unpunishMessage")
                && this.bot.guild.members.cache.has(targetID)
                && (punishment.initiatorID !== punishment.userID
                    || (await this.usettings.get(targetID,
                    "moderation.disableselfnotification")) !== "true")) {
                this.bot.guild.members.cache.get(targetID).send({embeds: [new MessageEmbed()
                    .setDescription(this.settings("unpunishMessage").replace("%t", type))
                    .setColor(this.bot.displayColor())]})
                    .catch((err) => {
                        console.error(`Failed to send un${type} message to ${targetID}: ${err.stack}`);
                    });
            }
        }
    }

    public async getPunishment(userID: Snowflake): Promise<Punishments | void> {
        return await Punishments.findByPk(userID);
    }

    public async checkModeration(userID: Snowflake): Promise<void> {
        const punishment = await this.getPunishment(userID);
        if (punishment instanceof Punishments) {
            await this.setPunishmentRole(punishment.type, userID, true);
        }
    }

    private clearJobs(event: string, type: PunishmentRoleType, targetID: Snowflake): Promise<void> {
        return this.scheduler.deleteJobsByContent(event, JSON.stringify({type, targetID}));
    }

    public async punish(type: PunishmentRoleType, moderator: User, target: User, reason: string,
                        duration: Duration, commandMessage: Message): Promise<PreviousPunishment | void> {
        const res = await this.doPunish(type, moderator.id, target.id, duration.asSeconds());
        if (moderator.id !== target.id) { // Do not audit log or send messages for self punishments
            await this.audit.genericPunishment(type, moderator, target, reason, commandMessage,
                duration);
            const message = this.settings("punishMessage")
                .replace("%t", type)
                .replace("%m", moderator.tag)
                .replace("%d", formatDuration(duration))
                .replace("%r", reason)
                + `\n\n[Jump to ${type}](${commandMessage.url})`;
            target.send({embeds: [new MessageEmbed()
                .setDescription(message)
                .setColor(this.bot.displayColor())]})
                .catch((err) => {
                    console.error(`Failed to send mute message to ${target.id}: ${err.stack}`);
                });
        }
        return res;
    }

    // If a previous punishment exists, completely replaces it and cancels unpunishment jobs
    private async doPunish(type: PunishmentRoleType, initiatorID: Snowflake, targetID: Snowflake,
                           interval: number): Promise<PreviousPunishment | void> {
        if (interval === 0) {
            throw new Error("SAFE: Interval must be greater than 0 seconds");
        }
        await this.clearJobs(`UNPUNISH`, type, targetID);
        await this.setPunishmentRole(type, targetID, true);
        let prev: PreviousPunishment | void = null;
        let punishment: Punishments | void = await this.getPunishment(targetID);
        if (punishment instanceof Punishments) {
            if (punishment.initiatorID !== targetID) {
                prev = {type: punishment.type, expire: punishment.expiration};
            }
            await this.clearJobs(`UNPUNISH`, punishment.type, targetID);
        } else {
            punishment = Punishments.build();
        }
        punishment.type = type;
        punishment.userID = targetID;
        punishment.expiration = dateAfterSeconds(interval);
        punishment.initiatorID = initiatorID;
        await punishment.save();
        await this.scheduler.schedule("moderation", punishment.expiration,
            "UNPUNISH", JSON.stringify({type, targetID}));
        return prev;
    }

    // Gives the given punishment role
    // Removes all other roles
    private async setPunishmentRole(name: PunishmentRoleType, userID: Snowflake, enable: boolean):
        Promise<void> {
        if (!this.roles.has(name)) {
            throw new Error("Role not found");
        }
        const hasRBound = this.settingsHas("reverseBoundRoles");
        let rBound;
        if (hasRBound) {
            rBound = this.settingsMap("reverseBoundRoles");
        }
        for (let i = 0; i < PunishmentRoles.length; i++) {
            const role = PunishmentRoles[i];
            let roleEnable = false;
            if (role.name === name) {
                roleEnable = enable;
            }
            await this.setRole(this.roles.get(role.name), userID, roleEnable);
            if (hasRBound && rBound.has(role.name)) {
                await this.setRole(this.bot.guild.roles.cache.get(rBound.get(role.name)), userID,
                    !roleEnable);
            }
        }
    }

    private async setRole(role: Role, userID: Snowflake, enable: boolean): Promise<void> {
        if (this.bot.guild.members.cache.has(userID)) {
            const roleStore = this.bot.guild.members.cache.get(userID).roles;
            if (enable) {
                await roleStore.add(role);
            } else {
                await roleStore.remove(role);
            }
        }
    }

    public async unpunish(type: PunishmentRoleType, moderator: User, target: User,
                          commandMessage: Message): Promise<Punishments> {
        await this.clearJobs("UNPUNISH", type, target.id);
        const res = await this.doUnpunish(type, target.id);
        await this.audit.genericUnpunishment(type, moderator, target, commandMessage);
        return res;
    }

    // Does NOT clear jobs
    private async doUnpunish(type: PunishmentRoleType, userID: Snowflake): Promise<Punishments> {
        const user: Punishments | void = await Punishments.findByPk(userID);
        if (user == null) {
            throw new Error(`SAFE: User does not have a ${type}`);
        } else if (user.type !== type) {
            throw new Error(`SAFE: User currently has a ${user.type}, not a ${type}`);
        }
        await this.setPunishmentRole(type, userID, false);
        await user.destroy();
        return user;
    }

    private async updatePermissions(channel: GuildChannel) {
        for (let i = 0; i < PunishmentRoles.length; i++) {
            let role = PunishmentRoles[i];
            await channel.permissionOverwrites.edit(this.roles.get(role.name), role.overwrites);
        }
    }

    public async channelCreate(channel: Channel) {
        if (channel instanceof GuildChannel) {
            await this.updatePermissions(channel);
        }
    }

    public async guildMemberAdd(member: GuildMember) {
        await this.checkModeration(member.user.id);
    }

    public async typingStart(channel: Channel, user: User) {
        if (channel.type === "GUILD_TEXT") {
            await this.checkModeration(user.id);
        }
    }

    public async onMessage(message: Message) {
        if (message.channel.type === "GUILD_TEXT") {
            await this.checkModeration(message.author.id);
        }
    }
}