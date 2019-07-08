import {ClientOptions, Snowflake} from "discord.js";

export type CommandsModuleConfig = {
    prefix: string,
    separator: string,
    requiredRole: string
}

export type AnonModuleConfig = {
    maxID: number,
    maxInactiveRecords: number,
    lifetime: number,
    filterLocation: string
}

export type PinModuleConfig = {
    emoji: string
}

export type XPModuleConfig = {
    blockInterval: number,
    blockMaximum: number,
    rollingInterval: number,
    checkInterval: number,
    decayInterval: number,
    decayXp: number,
    rewardThreshold: number,
    rollingRewardThreshold: number,
    reward: Snowflake
}

export type AuditModuleConfig = {
    channel: Snowflake
}

export type BotConfig = {
    guild: Snowflake,
    client: ClientOptions,
    commands: CommandsModuleConfig,
    anon: AnonModuleConfig,
    pin: PinModuleConfig,
    xp: XPModuleConfig,
    audit: AuditModuleConfig
}