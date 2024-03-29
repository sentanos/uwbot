import {
    Availability,
    Command,
    CommandConfig,
    PartialCommandConfig,
    Permission
} from "../modules/commands";
import {Message, MessageEmbed} from "discord.js";
import {Bot} from "../bot";
import {LocalSetting, SettingsModule} from "../modules/settings.skip";
import {listOrNone} from "../util";

class RequiresSettings extends Command {
    protected settings: SettingsModule;

    constructor(bot: Bot, config: PartialCommandConfig) {
        let withCategory = config as CommandConfig;
        withCategory.category = "settings";
        super(bot, withCategory);
    }

    async run(message?: Message, ...args: string[]): Promise<Message | void> {
        this.settings = this.bot.getModule("settings") as SettingsModule;
        return super.run(message, ...args);
    }
}

export class Settings extends RequiresSettings {
    constructor(bot) {
        super(bot, {
            names: ["settings"],
            usages: {
                "List settings namespaces": [],
                "List settings in a namespace": ["namespace"]
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.WhitelistedGuildChannelsOnly
        });
    }

    async exec(message: Message, namespace?: string): Promise<Message> {
        if (namespace == null) {
            const namespaces: string[] = this.settings.getNamespaces();
            return message.channel.send({embeds: [new MessageEmbed()
                .setTitle("Settings Namespaces")
                .setDescription(listOrNone(namespaces))
                .setColor(this.bot.displayColor())
            ]});
        } else {
            const settings: LocalSetting[] = this.settings.getInNamespace(namespace);
            const embed: MessageEmbed = new MessageEmbed()
                .setTitle("Settings > " + namespace)
                .setColor(this.bot.displayColor());
            if (settings.length === 0) {
                embed.setDescription("_None_");
            } else {
                for (let i = 0; i < settings.length; i++) {
                    const setting: LocalSetting = settings[i];
                    let val = "_Not set_";
                    if (setting.value !== "") {
                        val = setting.value;
                    }
                    embed.addField(`${setting.key}: ${val}`,
                        (setting.optional ? "(Optional) " : "") + setting.description);
                }
            }
            return message.channel.send({embeds: [embed]});
        }
    }
}

export class SettingsGet extends RequiresSettings {
    constructor(bot) {
        super(bot, {
            names: ["settings get"],
            usages: {
                "Get the value of a setting": ["setting"],
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.WhitelistedGuildChannelsOnly
        });
    }

    async exec(message: Message, key: string): Promise<Message> {
        if (!this.settings.exists(key)) {
            throw new Error("SAFE: Setting does not exist");
        }
        const value: string = this.settings.get(key);
        return message.channel.send({embeds: [new MessageEmbed()
            .setTitle(key)
            .setDescription(value === "" ? "_Not set_" : value)
            .setColor(this.bot.displayColor())
        ]})
    }
}

export class SettingsSet extends RequiresSettings {
    constructor(bot) {
        super(bot, {
            names: ["settings set"],
            usages: {
                "Set the value of a setting": ["setting", "value"],
            },
            permission: Permission.UserKickOrMaintainer,
            availability: Availability.WhitelistedGuildChannelsOnly
        });
    }

    async exec(message: Message, key: string, value: string): Promise<Message> {
        if (value === "") {
            throw new Error("SAFE: You must specify a value");
        }
        value = value.replace(/<space>/g, " ");
        this.settings.set(key, value);
        return message.channel.send({embeds: [new MessageEmbed()
            .setTitle(key)
            .setDescription(value)
            .setColor(this.bot.displayColor())
        ]})
    }
}

export class SettingsClear extends RequiresSettings {
    constructor(bot) {
        super(bot, {
            names: ["settings clear"],
            usages: {
                "Clears the value of an optional setting": ["setting"]
            },
            permission: Permission.UserKickOrMaintainer,
            availability: Availability.WhitelistedGuildChannelsOnly
        });
    }

    async exec(message: Message, key: string): Promise<Message> {
        const setting = this.settings.getSetting(key);
        if (!setting.optional) {
            throw new Error("SAFE: You may only clear the value of an optional setting");
        }
        this.settings.set(key, "");
        return message.channel.send({embeds: [new MessageEmbed()
            .setTitle(setting.key)
            .setDescription("_Cleared_")
            .setColor(this.bot.displayColor())
        ]});
    }
}
