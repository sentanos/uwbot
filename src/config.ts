import {Snowflake} from "discord.js";

export type CommandsModuleConfig = {
    prefix: string,
    separator: string
}

export type AnonModuleConfig = {
    maxID: number,
    maxInactiveRecords: number,
    lifetime: number
}

export type PinModuleConfig = {
    emoji: string
}

export type XPModuleConfig = {
    blockInterval: number,
    blockMaximum: number,
    rollingInterval: number
}

export type BotConfig = {
    guild: Snowflake,
    commands: CommandsModuleConfig,
    anon: AnonModuleConfig,
    pin: PinModuleConfig,
    xp: XPModuleConfig
}