import {Module} from "../module";
import {Bot} from "../bot";
import {Setting} from "../database/models/setting";

export type SettingsConfig = {
    [key: string]: {
        description: string,
        default?: string,
        optional?: boolean
    }
}

export type SettingsHelper = (key: string) => string;
export type SettingsHasHelper = (key: string) => boolean;

export type LocalSetting = {
    key: string,
    value: string,
    description: string,
    default?: string,
    optional?: boolean
}

export class SettingsModule extends Module {
    public cache: Map<string, LocalSetting>;

    constructor(bot: Bot) {
        super(bot, "settings", null, null, true);
        this.cache = new Map<string, LocalSetting>();
    }

    public async require(key: string, description: string, def?: string,
                         optional: boolean = false): Promise<boolean> {
        if (!this.has(key)) {
            const find: Setting | void = await this.persistentGet(key);
            if (find instanceof Setting) {
                this.setLocal(key, {key: key, value: find.value, description: description,
                    optional: optional});
            } else {
                this.setLocal(key, {key: key, value: def != null ? def : "",
                    description: description, optional: optional});
                if (def != null) {
                    await this.persistentSet(key, def);
                    return true;
                }
                return optional;
            }
        }
        return true;
    }

    public async config(config: SettingsConfig, namespace: string): Promise<boolean> {
        let success = true;
        for (const setting in config) {
            const key = `${namespace}.${setting}`;
            const settingConfig = config[setting];
            success = await this.require(key, settingConfig.description, settingConfig.default,
                settingConfig.optional) && success;
        }
        return success;
    }

    public getNamespaces(): string[] {
        const namespaces: Set<string> = new Set<string>();
        for (const key of this.cache.keys()) {
            namespaces.add(SettingsModule.getNamespace(key));
        }
        return [...namespaces];
    };

    // public async getNamespaces(): Promise<string[]> {
    //     let namespaces: string[] = [];
    //     const settings: Setting[] = await Setting.findAll({
    //         attributes: ["namespace"],
    //         group: ["namespace"]
    //     });
    //     for (let i = 0; i < settings.length; i++) {
    //         namespaces.push(settings[i].namespace);
    //     }
    //     return namespaces;
    // }

    public getInNamespace(namespace: string): LocalSetting[] {
        let settings: LocalSetting[] = [];
        for (const key of this.cache.keys()) {
            if (SettingsModule.getNamespace(key) === namespace) {
                settings.push(this.getSetting(key));
            }
        }
        return settings;
    }

    public withNamespace(namespace: string): SettingsHelper {
        return ((key: string): string => {
            return this.get(`${namespace}.${key}`);
        }).bind(this);
    }

    public withNamespaceHas(namespace: string): SettingsHasHelper {
        return ((key: string): boolean => {
            return this.has(`${namespace}.${key}`);
        }).bind(this);
    }

    public get(key: string): string {
        let setting: LocalSetting | void = this.getSetting(key);
        if (setting != null) {
            return setting.value;
        }
        return "";
    }

    public getSetting(key: string): LocalSetting {
        return this.cache.get(key);
    }

    public setLocal(key: string, setting: LocalSetting): void {
        this.cache.set(key, setting);
    }

    public set(key: string, value: string): void {
        if (!this.exists(key)) {
            throw new Error("Setting has not been created")
        }
        this.getSetting(key).value = value;
        this.persistentSet(key, value);
    }

    public has(key: string): boolean {
        return this.exists(key) && this.getSetting(key).value !== "";
    }

    public exists(key: string): boolean {
        return this.cache.has(key);
    }

    public static getNamespace(key: string): string {
        return key.substring(0, key.indexOf("."));
    }

    public async persistentGet(key: string): Promise<Setting | void> {
        return Setting.findByPk(key);
    }

    public async persistentSet(key: string, value: string): Promise<void> {
        const namespace: string = SettingsModule.getNamespace(key);
        await Setting.upsert({key, value, namespace});
    }
}