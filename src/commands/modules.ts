import {Availability, Command, Permission} from "../modules/commands";
import {Message, MessageEmbed} from "discord.js";
import {Module, ModuleState} from "../module";
import {listOrNone} from "../util";

export class Modules extends Command {
    constructor(bot) {
        super(bot, {
            names: ["modules"],
            usages: {
                "List modules": []
            },
            permission: Permission.VerifiedGuildMember,
            availability: Availability.WhitelistedGuildChannelsOnly,
            category: "modules"
        });
    }

    async exec(message: Message): Promise<Message> {
        let required = [];
        let enabled = [];
        let disabled = [];
        for (const moduleName in this.bot.modules) {
            const module: Module = this.bot.modules[moduleName];
            switch(module.state) {
                case ModuleState.Required:
                    required.push(moduleName);
                    break;
                case ModuleState.Enabled:
                    enabled.push(moduleName);
                    break;
                case ModuleState.Disabled:
                    disabled.push(moduleName);
                    break;
            }
        }
        const embed: MessageEmbed = new MessageEmbed()
            .setTitle("Modules")
            .setDescription(`\
            **Required Modules - Cannot be disabled**
            ${listOrNone(required)}
            
            **Enabled Modules**
            ${listOrNone(enabled)}
            
            **Disabled Modules**
            ${listOrNone(disabled)}`)
            .setColor(this.bot.displayColor());
        return message.channel.send(embed);
    }
}

export class ModulesEnable extends Command {
    constructor(bot) {
        super(bot, {
            names: ["modules enable"],
            usages: {
                "Enable a module": ["module"]
            },
            permission: Permission.UserKick,
            availability: Availability.WhitelistedGuildChannelsOnly,
            category: "modules"
        });
    }

    async exec(message: Message, moduleName: string): Promise<Message> {
        let module: Module | void = this.bot.modules[moduleName];
        if (module instanceof Module) {
            await this.bot.enable(module);
            await this.bot.setEnabled(module.name, true);
            return message.channel.send("Enabled module " + moduleName);
        } else {
            throw new Error("SAFE: Module does not exist");
        }
    }
}

export class ModulesDisable extends Command {
    constructor(bot) {
        super(bot, {
            names: ["modules disable"],
            usages: {
                "Disable a module": ["module"]
            },
            permission: Permission.UserKick,
            availability: Availability.WhitelistedGuildChannelsOnly,
            category: "modules"
        });
    }

    async exec(message: Message, moduleName: string): Promise<Message> {
        let module: Module | void = this.bot.modules[moduleName];
        if (module instanceof Module) {
            await this.bot.disable(module);
            await this.bot.setEnabled(module.name, false);
            return message.channel.send("Disabled module " + moduleName);
        } else {
            throw new Error("SAFE: Module does not exist");
        }
    }
}

export class ModulesReload extends Command {
    constructor(bot) {
        super(bot, {
            names: ["modules reload"],
            usages: {
                "Reload a module and its dependents": ["module"]
            },
            permission: Permission.UserKick,
            availability: Availability.WhitelistedGuildChannelsOnly,
            category: "modules"
        });
    }

    async exec(message: Message, moduleName: string): Promise<Message> {
        let module: Module | void = this.bot.modules[moduleName];
        if (module instanceof Module) {
            await this.bot.reload(module);
            return message.channel.send("Reloaded module " + moduleName);
        } else {
            throw new Error("SAFE: Module does not exist");
        }
    }
}
