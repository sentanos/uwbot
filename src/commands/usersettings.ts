import {
    Availability,
    Command,
    CommandConfig,
    PartialCommandConfig,
    Permission
} from "../modules/commands";
import {Message, MessageEmbed} from "discord.js";
import {Bot} from "../bot";
import {LocalSetting} from "../modules/settings.skip";
import {AllSettings, UserSettingsModule} from "../modules/usersettings";
import {AnonModule} from "../modules/anon";

class RequiresUserSettings extends Command {
    protected usettings: UserSettingsModule;

    constructor(bot: Bot, config: PartialCommandConfig) {
        let withCategory = config as CommandConfig;
        withCategory.category = "settings";
        super(bot, withCategory);
    }

    async run(message?: Message, ...args: string[]): Promise<Message | void> {
        this.usettings = this.bot.getModule("usersettings") as UserSettingsModule;
        return super.run(message, ...args);
    }
}

export class UserSettings extends RequiresUserSettings {
    constructor(bot) {
        super(bot, {
            names: ["usettings", "usersettings"],
            usages: {
                "List user settings": []
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.WhitelistedGuildChannelsOnly
        });
    }

    async exec(message: Message): Promise<Message> {
        const settings: LocalSetting[] = await this.usettings.getAll(message.author.id);
        const embed: MessageEmbed = new MessageEmbed()
            .setTitle("User Settings")
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
                embed.addField(`${setting.key}: ${val}`, setting.description);
            }
        }
        return message.channel.send(embed);
    }
}

export class UserSettingsGet extends RequiresUserSettings {
    constructor(bot) {
        super(bot, {
            names: ["usettings get", "usersetings get"],
            usages: {
                "Get the value of a user setting": ["setting"],
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.WhitelistedGuildChannelsOnly
        });
    }

    async exec(message: Message, key: string): Promise<Message> {
        if (AllSettings[key] == null) {
            throw new Error("SAFE: Setting does not exist");
        }
        const value: string = await this.usettings.get(message.author.id, key);
        return message.channel.send(new MessageEmbed()
            .setTitle(key)
            .setDescription(value === "" ? "_Not set_" : value)
            .setColor(this.bot.displayColor()))
    }
}

export class UserSettingsSet extends RequiresUserSettings {
    constructor(bot) {
        super(bot, {
            names: ["usettings set", "usersettings set"],
            usages: {
                "Set the value of a user setting": ["setting", "value"],
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.WhitelistedGuildChannelsOnly
        });
    }

    async exec(message: Message, key: string, value: string): Promise<Message> {
        if (AllSettings[key] == null) {
            throw new Error("SAFE: Setting does not exist");
        }
        if (value === "") {
            throw new Error("SAFE: You must specify a value");
        }
        if (key === "anon.disablemessages") {
            (this.bot.getModule("anon") as AnonModule).setDisableMessages(message.author,
                value === "true")
        }
        value = value.replace(/<space>/g, " ");
        await this.usettings.set(message.author.id, key, value);
        return message.channel.send(new MessageEmbed()
            .setTitle(key)
            .setDescription(value)
            .setColor(this.bot.displayColor()))
    }
}

/* export class UserSettingsClear extends RequiresUserSettings {
    constructor(bot) {
        super(bot, {
            names: ["usettings clear", "usersettings clear"],
            usages: {
                "Clears the value of a setting": ["setting"]
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.WhitelistedGuildChannelsOnly
        });
    }

    async exec(message: Message, key: string): Promise<Message> {
        if (AllSettings[key] == null) {
            throw new Error("SAFE: Setting does not exist");
        }
        await this.usettings.set(message.author.id, key, "");
        return message.channel.send(new MessageEmbed()
            .setTitle(key)
            .setDescription("_Cleared_")
            .setColor(this.bot.displayColor()));
    }
} */
