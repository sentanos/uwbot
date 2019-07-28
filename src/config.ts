import {ClientOptions, Snowflake} from "discord.js";

export type CommandsModuleConfig = {
    prefix: string,
    separator: string,
    requiredRole: string
}

export type AnonModuleConfig = {
    maxID: number,
    maxInactiveRecords: number,
    lifetime: number
}

export type PinModuleConfig = {
    emoji: string
}

// All interval fields are in seconds
export type XPModuleConfig = {
    // The time interval until a block resets
    blockInterval: number,
    // The maximum XP a single user can earn in a block
    // Must be greater than 1
    blockMaximum: number,
    // The time interval over which to calculate rolling XP
    rollingInterval: number,
    // The time interval between decay checks
    checkInterval: number,
    // The time interval between XP decays
    decayInterval: number,
    // The number of XP decayed after every decayInterval
    decayXp: number,
    // The minimum XP required for reward
    rewardThreshold: number,
    // The minimum rolling XP required for reward
    rollingRewardThreshold: number,
    // Reward role ID
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