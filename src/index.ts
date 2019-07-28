import {Client} from "discord.js"
import {Bot} from "./bot"
import {readFileSync} from "fs";
import {BotConfig} from "./config";
import {Sequelize} from "sequelize";

const token = process.env.DISCORD_TOKEN;
if (token == null) {
    throw new Error("No token provided");
}
const configPath = process.env.CONFIG_PATH;
if (configPath == null) {
    throw new Error("No configuration file specified");
}
const databasePath = process.env.DATABASE_PATH;
if (databasePath == null) {
    throw new Error("No database file specified");
}

const filterPath = process.env.FILTER_PATH;
if (filterPath == null) {
    throw new Error("No filter file specified");
}

(async () => {
    const config: BotConfig = JSON.parse(readFileSync(configPath, "utf8"));
    const filter: string[] = JSON.parse(readFileSync(filterPath, "utf8"));

    const client = new Client(config.client);

    const sequelize: Sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: databasePath
    });

    client.once("ready", async () => {
        const bot = new Bot(client, sequelize, config, filter);
        await bot.initialize();
        console.log("Bot ready");
    });
    client.on("ready", () => {
        console.log("Client ready");
    });
    client.on("error", (err: Error) => {
        console.error("Client error: " + err.message)
    });
    client.login(token)
        .catch((err: Error) => {
            console.error("Error logging in: " + err)
        });
})()
.catch((err: Error) => {
    console.error("Startup error: " + err.stack)
});

