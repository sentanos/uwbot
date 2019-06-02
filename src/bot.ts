import {
    Client,
    Guild,
    TextChannel
} from "discord.js";
import * as sqlite from "sqlite";
import {readdir} from "fs";
import {join} from "path";
import {promisify} from "util";
import {Module} from "./module";
import {BotConfig} from "./config";

type Modules = {
    [name: string]: Module;
}

export class Bot {
    public readonly client: Client;
    public readonly DB: sqlite.Database;
    public readonly guild: Guild;
    public readonly config: BotConfig;
    private readonly modules: Modules;

    constructor(client: Client, DB: sqlite.Database, config: BotConfig) {
        this.client = client;
        this.DB = DB;
        this.config = config;
        this.guild = client.guilds.get(config.guild);
        this.modules = {};
    }

    public async initialize(): Promise<void> {
        const num = await this.loadModules();
        console.log("Loaded " + num + " modules");
    }

    // Returns the channel in the bot's guild with the given name. Errors if such a channel does
    // not exist.
    public getChannelByName(name: string): TextChannel {
        const channel: TextChannel | void = this.guild.channels.find(
            ch => ch.name === name) as TextChannel;
        if (channel == null) {
            throw new Error("Channel not found")
        }
        return channel
    }

    private addModule(module: Module) {
        this.modules[module.name] = module;
    }

    public async loadModules(): Promise<number> {
        return this.forEachClassInFile("./modules",
                async (name: string, constructor: any): Promise<boolean> => {
            if (name.endsWith("Module")) {
                const module: Module = new constructor(this);
                await module.initialize();
                this.addModule(module);
                return true;
            }
            return false;
        })
    }

    public getModule(name: string): Module {
        return this.modules[name];
    }

    public async forEachClassInFile(location: string, func: (name: string, aClass: any) => Promise<boolean>):
            Promise<number> {
        const files = await promisify(readdir)(join(__dirname, location));
        let num = 0;
        for (let i = 0; i < files.length; i++) {
            const filename = files[i];
            if (filename.endsWith(".js")) {
                const items = await import(join(__dirname, location, filename));
                for (const className in items) {
                    if (className != "__esModule") {
                        if (await func(className, items[className])) {
                            num++;
                        }
                    }
                }
            }
        }
        return num;
    }
}
