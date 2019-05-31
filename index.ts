import {Client} from "discord.js"
import {Bot, BotConfig} from "./src/bot"
import {readFileSync, existsSync} from "fs";
import * as sqlite from "sqlite";

const client = new Client();
const initializePath = "./db/create.sql";

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
    throw new Error("No database file location specified");
}

(async () => {
    const config: BotConfig = JSON.parse(readFileSync(configPath, "utf8"));

    const mustInitializeDB: boolean = !existsSync(databasePath);
    const DB: sqlite.Database = await sqlite.open(databasePath);
    if (mustInitializeDB) {
        const commands = readFileSync(initializePath, "utf8");
        await DB.exec(commands);
    }

    client.once("ready", async () => {
        const bot = new Bot(client, DB, config);
        let num: number;
        try {
            num = await bot.loadCommands()
        } catch (err) {
            console.error("Error loading commands: " + err.stack);
            return
        }
        console.log("Loaded " + num + " commands");
        await bot.initializeUser();
        client.on("message", bot.onMessage.bind(bot));
        client.on("messageReactionAdd", bot.messageReactionAdd.bind(bot));
        client.on("messageReactionRemove", bot.messageReactionRemove.bind(bot));
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

