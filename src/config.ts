import {ClientOptions, Snowflake} from "discord.js";

export type BotConfig = {
    guild: Snowflake,
    client: ClientOptions,
    maintainer?: Snowflake
}