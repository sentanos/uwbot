import {
    Client, ColorResolvable,
    Guild, GuildMember, Message, TextChannel, User
} from "discord.js";
import * as sqlite from "sqlite";
import {readdir} from "fs";
import {join} from "path";
import {promisify} from "util";
import {Module} from "./module";
import {BotConfig} from "./config";
import {CommandsModule} from "./modules/commands";
import {Lock} from "./util";

type Modules = {
    [name: string]: Module;
}

export class Bot {
    public readonly client: Client;
    public readonly DB: sqlite.Database;
    public readonly guild: Guild;
    public readonly config: BotConfig;
    public readonly transactionLock: Lock;
    private readonly modules: Modules;
    private readonly loaded: Set<string>;

    constructor(client: Client, DB: sqlite.Database, config: BotConfig) {
        this.client = client;
        this.DB = DB;
        this.config = config;
        this.guild = client.guilds.get(config.guild);
        this.transactionLock = new Lock();
        this.modules = {};
        this.loaded = new Set<string>();
    }

    public async initialize(): Promise<void> {
        const num = await this.loadModules();
        console.log("Loaded " + num + " modules");
    }

    public displayColor(): ColorResolvable {
        return this.guild.member(this.client.user).displayColor;
    }

    // Get a user's ID based on their nickname/username/tag/userID
    public async getUser(guild: Guild, find: string): Promise<User | void> {
        find = find.toLowerCase();
        let member: GuildMember;
        member = guild.members.find(m => m.nickname != null && m.nickname.toLowerCase() === find);
        if (member == null) {
            member = guild.members.find(m => m.user.username.toLowerCase() === find);
        }
        if (member == null) {
            member = guild.members.find(m => m.user.tag.toLowerCase() === find);
        }
        if (member == null) {
            try {
                return await this.client.users.fetch(find);
            } catch (err) {
                console.error("Error fetching user from \"" + find + "\": " + err.stack);
                return null;
            }
        }
        return member.user;
    }

    public async getUserFromMessage(message: Message): Promise<User> {
        if (message.mentions.members.size > 0) {
            return message.mentions.members.first().user;
        }
        const content: string = (this.getModule("commands") as CommandsModule)
            .getRawContent(message.content);
        const user: User | void = await this.getUser(this.guild, content);
        if (user instanceof User) {
            return user;
        } else {
            throw new Error("SAFE: User not found")
        }
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

    // No circular dependencies!
    private async load(module: Module): Promise<void> {
        if (this.loaded.has(module.name)) {
            return;
        }
        for (let i = 0; i < module.dependencies.length; i++) {
            if (!this.loaded.has(module.dependencies[i])) {
                await this.load(this.modules[module.dependencies[i]]);
            }
        }
        await module.initialize();
        this.loaded.add(module.name);
    }

    public async loadModules(): Promise<number> {
        const num: number = await this.forEachClassInFile("./modules",
                async (name: string, constructor: any): Promise<boolean> => {
            if (name.endsWith("Module")) {
                const module: Module = new constructor(this);
                this.addModule(module);
                return true;
            }
            return false;
        });
        for (const module in this.modules) {
            await this.load(this.modules[module]);
        }
        return num;
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
