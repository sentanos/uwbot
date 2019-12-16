import {Client, ColorResolvable, Guild, GuildMember, Message, TextChannel, User} from "discord.js";
import {readdir} from "fs";
import {join} from "path";
import {promisify} from "util";
import {Module, ModuleState} from "./module";
import {BotConfig} from "./config";
import {CommandsModule} from "./modules/commands";
import {Sequelize} from "sequelize";
import initializeDB from "./database";
import {SettingsModule} from "./modules/settings.skip";
import {Setting} from "./database/models/setting";

type Modules = {
    [name: string]: Module;
}

export class Bot {
    public readonly client: Client;
    public readonly DB: Sequelize;
    // The guild the bot will work in
    public readonly guild: Guild;
    public readonly config: BotConfig;
    public readonly filter: string[];
    // All modules
    public readonly modules: Modules;
    // Names of loaded modules
    private readonly loaded: Set<string>;
    // Names of enabled modules
    private readonly enabled: Set<string>;
    // Specified reference to the settings module
    private settings: SettingsModule;

    constructor(client: Client, sequelize: Sequelize, config: BotConfig, filter: string[]) {
        this.client = client;
        this.DB = sequelize;
        this.config = config;
        this.filter = filter;
        this.guild = client.guilds.get(config.guild);
        this.modules = {};
        this.loaded = new Set<string>();
        this.enabled = new Set<string>();
    }

    // Prepares the bot for use asynchronously
    public async initialize(): Promise<void> {
        const models = await initializeDB(this.DB);
        await this.DB.sync();
        const settingsMod: SettingsModule = new SettingsModule(this);
        this.addModule(settingsMod);
        await this.load(settingsMod);
        this.settings = settingsMod;
        const num = await this.loadModules();
        console.log("Initialized " + models + " models");
        console.log("Found " + num + " modules");
    }

    // Returns the display color of the client in the bot guild
    public displayColor(): ColorResolvable {
        return this.guild.member(this.client.user).displayColor;
    }

    // Returns a user based on their nickname/username/tag/userID
    // Returns null if no user is found
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

    // Returns a user based on their mention/nickname/username/tag/userID
    // Throws an error if no user was found
    public async getUserFromMessage(message: Message, overrideContent?: string): Promise<User> {
        if (message.mentions.members.size > 0) {
            return message.mentions.members.first().user;
        }
        const content: string = overrideContent != null ?
            overrideContent :
            (this.getModule("commands") as CommandsModule).getRawContent(message.content);
        const user: User | void = await this.getUser(this.guild, content);
        if (user instanceof User) {
            return user;
        } else {
            throw new Error("SAFE: User not found")
        }
    }

    // Returns the channel in the bot's guild with the given name.
    // Throws an error if such a channel does not exist.
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

    // Loads a module
    // No circular dependencies!
    private async load(module: Module): Promise<void> {
        if (this.loaded.has(module.name)) {
            // Already loaded
            return;
        }
        if (module.settingsConfig != null) {
            await this.settings.config(module.settingsConfig, module.name);
        }
        for (let i = 0; i < module.dependencies.length; i++) {
            let dependency = module.dependencies[i];
            let optional = dependency.startsWith("?");
            if (optional) {
                dependency = dependency.substring(1);
            }
            if (!this.loaded.has(dependency)) {
                await this.load(this.modules[dependency]);
            }
            this.modules[dependency].dependents.push(module.name);
        }
        if (await this.shouldBeEnabled(module)) {
            await this.enable(module);
        }
        this.loaded.add(module.name);
    }

    // Returns true if the module should be enabled based on whether or not it is required and
    // whether or not it has been persistently enabled in the past. Returns false if it should
    // not be enabled.
    private async shouldBeEnabled(module: Module): Promise<boolean> {
        if (module.state === ModuleState.Required) {
            return true;
        }
        const setting: Setting | void = await this.settings.persistentGet(
            `internal.modules.${module.name}.enabled`);
        if (setting instanceof Setting) {
            return setting.value === "true";
        } else {
            return false;
        }
    }

    // Persistently sets if the module with the given name should be enabled (enabled is true) or
    // disabled (enabled is false)
    public async setEnabled(moduleName: string, enabled: boolean): Promise<void> {
        await this.settings.persistentSet(`internal.modules.${moduleName}.enabled`,
            enabled ? "true": "false");
    }

    // Returns true if the module is enabled and false if it is not
    public isEnabled(moduleName: string): boolean {
        return this.enabled.has(moduleName);
    }

    // Checks if the required settings for a particular are set and throws an error if they are not.
    private async checkSettings(module: Module): Promise<void> {
        if (module.settingsConfig != null) {
            if (!(await this.settings.config(module.settingsConfig, module.name))) {
                throw new Error("SAFE: Not all settings have been set up for this module")
            }
            module.settings = this.settings.withNamespace(module.name);
            module.settingsHas = this.settings.withNamespaceHas(module.name);
        }
    }

    // Enables a module
    // Throws an error if: the module is already enabled, a dependency of the module is not
    // enabled, or not all the module settings have been set yet
    public async enable(module: Module): Promise<boolean> {
        if (module.state === ModuleState.Enabled) {
            throw new Error("SAFE: Module is already enabled");
        }
        for (let i = 0; i < module.dependencies.length; i++) {
            const name: string = module.dependencies[i];
            if (!name.startsWith("?") && !this.enabled.has(name)) {
                throw new Error(`SAFE: Dependency "${name}" is not enabled`);
            }
        }
        await this.checkSettings(module);
        await module.initialize();
        this.enabled.add(module.name);
        if (module.state !== ModuleState.Required) {
            module.state = ModuleState.Enabled;
        }
        return true;
    }

    // Disables a module
    // Throws an error if: the module is required, the module is already enabled, or a dependent
    // of the module is still enabled.
    public async disable(module: Module): Promise<void> {
        if (module.state === ModuleState.Required) {
            throw new Error("SAFE: Cannot disable required module");
        }
        if (module.state === ModuleState.Disabled) {
            throw new Error("SAFE: Module is already disabled");
        }
        let reloads: Module[] = [];
        for (let i = 0; i < module.dependents.length; i++) {
            const dependent = this.modules[module.dependents[i]];
            let optional = false;
            for (let i = 0; i < dependent.dependencies.length; i++) {
                if (dependent.dependencies[i] === "?" + module.name) {
                    optional = true;
                    break;
                }
            }
            if (optional) {
                reloads.push(dependent);
            } else if (this.enabled.has(dependent.name)) {
                throw new Error("SAFE: Module \"" + dependent.name + "\" depends on this module" +
                    " and is still enabled. Please disable all dependents first.");
            }
        }
        await module.unload();
        this.enabled.delete(module.name);
        module.state = ModuleState.Disabled;
        for (let i = 0; i < reloads.length; i++) {
            await reloads[i].reload();
        }
    }

    // Reloads (disable and then immediately enable) a module
    // Unlike disable, can be used on required modules
    public async reload(module: Module): Promise<void> {
        await module.unload();
        await module.initialize();
        for (let i = 0; i < module.dependents.length; i++) {
            const dependent: string = module.dependents[i];
            if (this.enabled.has(dependent)) {
                await this.reload(this.modules[dependent]);
            }
        }
    }

    // Loads all modules in the modules folder
    public async loadModules(): Promise<number> {
        const num: number = await Bot.forEachClassInFile("./modules",
                async (name: string, constructor: any): Promise<boolean> => {
            if (name.endsWith("Module")) {
                const module: Module = new constructor(this);
                this.addModule(module);
                return true;
            }
            return false;
        }, (filename: string) => {
                return filename.endsWith(".js") && !filename.endsWith(".skip.js");
            });
        for (const module in this.modules) {
            try {
                await this.load(this.modules[module]);
            } catch (err) {
                console.error(`Error loading module ${module}: ${err.stack}`);
            }
        }
        for (const module in this.modules) {
            try {
                await this.modules[module].modulesEnabled()
            } catch (err) {
                console.error(`Error executing modulesEnabled for ${module}: ${err.stack}`)
            }
        }
        return num;
    }

    // Get a module by its name
    public getModule(name: string): Module {
        const module: Module = this.modules[name];
        if (module.state === ModuleState.Disabled) {
            throw new Error("SAFE: Module is disabled");
        }
        return module;
    }

    // Given a location relative to src, imports all applicable files and calls func with the
    // name of every class in the file and the class itself (which can be created with new). func
    // should return true if the class was created or false if it was not.
    //
    // If validate is not specified, applicable files are all .js files. Otherwise, whether or
    // not a file is applicable will be determined by the validate function. It is called with
    // the filename. If it returns true, the file will be loaded; otherwise, it will not.
    //
    // Returns the number of classes successfully loaded (determined by the result of func).
    public static async forEachClassInFile(location: string, func: (name: string, aClass: any) =>
        Promise<boolean>, validate?: (filename: string) => boolean): Promise<number> {
        if (validate == null) {
            validate = (filename: string) => {
                return filename.endsWith(".js");
            }
        }
        const files = await promisify(readdir)(join(__dirname, location));
        let num = 0;
        for (let i = 0; i < files.length; i++) {
            const filename = files[i];
            if (validate(filename)) {
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
