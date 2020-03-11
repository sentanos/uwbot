import {Module} from "../module";
import {Bot} from "../bot";
import {Snowflake} from "discord.js";
import {LocalSetting, SettingsConfig, SettingsModule} from "./settings.skip";
import {Setting} from "../database/models/setting";

const namespaceRoot = "internal-usersettings-users_public";

export const AllSettings: SettingsConfig = {
    "anon.disablemessages": {
        description: "A boolean (true or false). If true, don't allow messages to your anon" +
            " user. There will be no notification to the sender or you that a message was" +
            " blocked, you will simply never receive it."
    },
    "moderation.disableselfnotification": {
        description: "A boolean (true or false). If true, you will not be notified when self" +
            " punishments (self bans or self mutes) end. Does not apply to mutes or other" +
            " punishments given by moderators."
    }
};

export class UserSettingsModule extends Module {
    public settingsMod: SettingsModule;

    constructor(bot: Bot) {
        super(bot, "usersettings", ["settings"], null, true);
    }

    async initialize() {
        this.settingsMod = this.bot.getModule("settings") as SettingsModule;
    }

    private namespaceForID(ID: Snowflake): string {
        return `${namespaceRoot}-${ID}`;
    }

    // Get all _set_ settings for a user
    getAllRaw(userID: Snowflake): Promise<Setting[]> {
        return this.settingsMod.persistentGetInNamespace(this.namespaceForID(userID));
    }

    // Get all settings, including those that are not set, for a user
    async getAll(userID: Snowflake): Promise<LocalSetting[]> {
        const raw = await this.getAllRaw(userID);
        let all: LocalSetting[] = [];
        const keys = new Set<String>();
        for (let i = 0; i < raw.length; i++) {
            const setting: Setting = raw[i];
            const key = SettingsModule.getKeyWithoutNamespace(setting.key);
            const record = AllSettings[key];
            all.push({
                key: key,
                value: setting.value,
                description: record == null ? "_Unknown_" : record.description
            });
            keys.add(key);
        }
        for (const key in AllSettings) {
            if (!keys.has(key)) {
                all.push({
                    key: key,
                    value: "",
                    description: AllSettings[key].description
                });
            }
        }
        return all;
    }

    async get(userID: Snowflake, key: string): Promise<string> {
        const setting: Setting | void = await this.settingsMod.persistentGet(
            `${this.namespaceForID(userID)}.${key}`);
        if (setting instanceof Setting) {
            return setting.value;
        } else {
            return "";
        }
    }

    set(userID: Snowflake, key: string, value: string): Promise<void> {
        return this.settingsMod.persistentSet(`${this.namespaceForID(userID)}.${key}`, value);
    }
}