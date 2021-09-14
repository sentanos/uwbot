import {
    Availability,
    Command,
    CommandConfig,
    PartialCommandConfig,
    Permission
} from "../modules/commands";
import {Bot} from "../bot";
import {
    Message,
    MessageEmbed,
    TextBasedChannels
} from "discord.js";
import {RankAndCategory, RanksModule} from "../modules/ranks";
import {alphabetical, listOrNone} from "../util";
import {Ranks} from "../database/models/ranks";
import {RankCategories} from "../database/models/rankCategories";

const getReadableNames = (verb: string, names: string[]): string => {
    if (names.length === 1) {
        return `${verb} rank ${names[0]}`;
    } else if (names.length <= 10) {
        return `${verb} ranks ${names.join(", ")}`;
    } else {
        return `${verb} ${names.length} ranks`;
    }
}

const attemptMultiple = async(names: string[], func: (rankName: string) => Promise<Ranks>):
    Promise<{successful: Ranks[], errors: {rank: string, error: Error}[]}> => {
    const res = await attemptMultipleWithCategory(
        names,
        "",
        async (rankName: string, _: string): Promise<RankAndCategory> => {
            const rank = await func(rankName);
            return {
                rank: rank,
                category: null
            }
        });
    return {
        successful: res.successful,
        errors: res.errors
    }
}

const attemptMultipleWithCategory = async (names: string[], category: string, func: (rankName: string, categoryName: string) => Promise<RankAndCategory>):
    Promise<{successful: Ranks[], category: RankCategories, errors: {rank: string, error: Error}[]}> => {
    let foundCategory : RankCategories = null;
    let successful: Ranks[] = [];
    let errors: {rank: string, error: Error}[] = [];
    for (let i = 0; i < names.length; i++) {
        try {
            const rankAndCategory = await func(names[i], category);
            foundCategory = rankAndCategory.category;
            successful.push(rankAndCategory.rank);
        } catch (err) {
            errors.push({
                rank: names[i],
                error: err
            });
        }
    }
    return {
        successful: successful,
        category: foundCategory,
        errors: errors
    }
}

const sendErrorMessages = async (verb: string, channel: TextBasedChannels, errors: {rank: string, error: Error}[], categoryPart?: string): Promise<void> => {
    let jobs = [];
    const cat = categoryPart == null ? "" : ` ${categoryPart} `;
    for (let i = 0; i < errors.length; i++) {
        let rawErr = errors[i].error.message;
        let err: string;
        if (rawErr.startsWith("SAFE: ")) {
            err = rawErr.substring(6);
        } else {
            err = "Unknown error";
            console.error(`Unknown error for ${verb} rank ${categoryPart}: ${rawErr}`);
        }
        jobs.push(channel.send({embeds: [new MessageEmbed()
            .setDescription(`Error ${verb} rank ${errors[i].rank}${cat}: ${err}`)
            .setColor("RED")
        ]}));
    }
    await Promise.all(jobs);
}

class RequiresRanks extends Command {
    protected ranks: RanksModule;

    constructor(bot: Bot, config: PartialCommandConfig) {
        let withCategory = config as CommandConfig;
        withCategory.category = "ranks";
        super(bot, withCategory);
    }

    async run(message?: Message, ...args: string[]): Promise<Message | void> {
        this.ranks = this.bot.getModule("ranks") as RanksModule;
        return super.run(message, ...args);
    }
}

export class RanksCommand extends RequiresRanks {
    constructor(bot: Bot) {
        super(bot, {
            names: ["ranks"],
            usages: {
                "Show all rank categories": [],
                ["Show all ranks in a category or show all ranks grouped by category or show all" +
                    " ranks not grouped"]: ["category/all/ungrouped"],
            },
            permission: Permission.None,
            availability: Availability.WhitelistedGuildChannelsOnly
        })
    }

    async exec(message: Message): Promise<Message> {
        const tip = "Use " + this.handler.commandTip("rank", "name") + " to join a rank";
        const category = this.handler.getRawContent(message.content);
        if (category === "") {
            const categories = await this.ranks.getCategories();
            let names = categories.map(c => c.categoryName);
            if (names.length > 0) {
                names.unshift("All");
            }
            const desc = listOrNone(names);
            return message.channel.send({embeds: [new MessageEmbed()
                .setTitle("Categories")
                .setDescription(desc)
                .setFooter("Use " + this.handler.commandTip("ranks", "category") +
                    " to show all ranks in a category")
                .setColor(this.bot.displayColor())
            ]});
        } else if (category.toLowerCase() === "all") {
            const categories = await this.ranks.getCategories();
            const ranksByCategory: Map<string, string[]> = new Map();
            let jobs = [];
            for (let i = 0; i < categories.length; i++) {
                const category = categories[i];
                jobs.push(category.getRanks()
                    .then((ranks) => {
                        ranksByCategory.set(category.categoryName, alphabetical(ranks.map(r => r.rankName)));
                    }));
            }
            await Promise.all(jobs);

            const base = new MessageEmbed()
                .setTitle("Ranks")
                .setFooter(tip)
                .setColor(this.bot.displayColor());

            // Discord has a max of 25 fields, so if there are more categories than that we have to
            // use an alternative display
            if (categories.length === 0) {
                base.setDescription("_None_");
            } else if (categories.length > 25) {
                let groups = [];
                for (let i = 0; i < categories.length; i++) {
                    const categoryName = categories[i].categoryName;
                    const categoryRanks = ranksByCategory.get(categoryName);
                    groups.push(`**${categoryName}**\n${listOrNone(categoryRanks)}`);
                }
                base.setDescription(groups.join("\n\n"));
            } else {
                for (let i = 0; i < categories.length; i++) {
                    const categoryName = categories[i].categoryName;
                    const categoryRanks = ranksByCategory.get(categoryName);
                    base.addField(categoryName, listOrNone(categoryRanks))
                }
            }
            return message.channel.send({embeds: [base]});
        } else if (category === "ungrouped") {
            const ranks = await this.ranks.getRanks();
            return message.channel.send({embeds: [new MessageEmbed()
                .setTitle("Ranks")
                .setDescription(listOrNone(ranks.map(r => r.rankName)))
                .setFooter(tip)
                .setColor(this.bot.displayColor())
            ]});
        } else {
            const res = await this.ranks.getRanksInCategory(category);
            return message.channel.send({embeds: [new MessageEmbed()
                .setTitle("Ranks > " + res.category)
                .setDescription(listOrNone(alphabetical(res.ranks.map(r => r.rankName))))
                .setFooter(tip)
                .setColor(this.bot.displayColor())
            ]});
        }
    }
}

export class RenameCategory extends RequiresRanks {
    constructor(bot: Bot) {
        super(bot, {
            names: ["renamecategory", "renamecat"],
            usages: {
                "Rename a category": ["oldName", "newName"],
            },
            permission: Permission.UserKickOrMaintainer,
            availability: Availability.WhitelistedGuildChannelsOnly
        })
    }

    async exec(message: Message, oldName: string, newName: string) {
        const category = await this.ranks.renameCategoryByName(oldName, newName);
        return message.channel.send({embeds: [new MessageEmbed()
            .setDescription("Renamed category " + category.oldName + " to " + category.newName)
            .setColor(this.bot.displayColor())
        ]});
    }
}

export class DeleteCategory extends RequiresRanks {
    constructor(bot: Bot) {
        super(bot, {
            names: ["deletecategory", "delcat"],
            usages: {
                "Deletes the given category": ["category"],
            },
            permission: Permission.UserKickOrMaintainer,
            availability: Availability.WhitelistedGuildChannelsOnly
        })
    }

    async exec(message: Message, categoryName: string) {
        const category = await this.ranks.deleteCategory(categoryName);
        return message.channel.send({embeds: [new MessageEmbed()
            .setDescription("Deleted category " + category.categoryName)
            .setColor("RED")
        ]});
    }
}

export class CreateRank extends RequiresRanks {
    constructor(bot: Bot) {
        super(bot, {
            names: ["createrank"],
            usages: {
                "Create a new rank and corresponding role": ["name"],
                "Create a new rank and corresponding role in the given category":
                    ["name", "category"],
            },
            permission: Permission.UserKickOrMaintainer,
            availability: Availability.WhitelistedGuildChannelsOnly
        })
    }

    async exec(message: Message, name: string, category?: string) {
        const rankAndCategory = await this.ranks.createRank(name, category);
        let desc = "Created rank " + rankAndCategory.rank.rankName;
        if (category != null) {
            desc += " in category " + rankAndCategory.category.categoryName;
        }
        return message.channel.send({embeds: [new MessageEmbed()
            .setDescription(desc)
            .setColor(this.bot.displayColor())
        ]});
    }
}


export class AddRank extends RequiresRanks {
    constructor(bot: Bot) {
        super(bot, {
            names: ["addrank"],
            usages: {
                "Create a rank from an existing role": ["name"],
                "Create a rank from many existing roles": ["name,name,name,..."],
                "Create a rank from an existing role and add it to the given category":
                    ["name", "category"],
                "Create a rank from many existing roles and all of them to the given category":
                    ["name,name,name,...", "category"]
            },
            permission: Permission.UserKickOrMaintainer,
            availability: Availability.WhitelistedGuildChannelsOnly
        })
    }

    async exec(message: Message, ranks: string, category?: string) {
        const names = ranks.split(",");
        const res = await attemptMultipleWithCategory(names, category, this.ranks.addRole.bind(this.ranks));

        await sendErrorMessages("adding", message.channel, res.errors);

        if (res.successful.length === 0) {
            return message.channel.send({embeds: [new MessageEmbed()
                .setDescription("No ranks were affected")
                .setColor("RED")
            ]});
        }

        let desc: string = getReadableNames("Added", res.successful.map(r => r.rankName));
        if (category != null) {
            desc += " with category " + res.category.categoryName;
        }
        return message.channel.send({embeds: [new MessageEmbed()
            .setDescription(desc)
            .setColor(this.bot.displayColor())
        ]});
    }
}

export class DeleteRank extends RequiresRanks {
    constructor(bot: Bot) {
        super(bot, {
            names: ["deleterank", "delrank"],
            usages: {
                "Delete a rank (note: does not delete the role)": ["rank"],
                "Delete many ranks (note: does not delete the roles)": ["rank,rank,rank,..."],
            },
            permission: Permission.UserKickOrMaintainer,
            availability: Availability.WhitelistedGuildChannelsOnly
        })
    }

    async exec(message: Message, ranks: string) {
        const names = ranks.split(",");
        const res = await attemptMultiple(names, this.ranks.deleteRankByName.bind(this.ranks));

        await sendErrorMessages("deleting", message.channel, res.errors);

        if (res.successful.length === 0) {
            return message.channel.send({embeds: [new MessageEmbed()
                .setDescription("No ranks were affected")
                .setColor("RED")
            ]});
        }

        let desc: string = getReadableNames("Deleted", res.successful.map(r => r.rankName));
        return message.channel.send({embeds: [new MessageEmbed()
            .setDescription(desc)
            .setColor("RED")
        ]});
    }
}

export class AssignCategory extends RequiresRanks {
    constructor(bot: Bot) {
        super(bot, {
            names: ["assigncategory", "usecategory", "addtocategory", "atcat"],
            usages: {
                "Add the given rank to the given category": ["rank", "category"],
                "Add multiple ranks to a category": ["rank,rank,rank,...", "category"]
            },
            permission: Permission.UserKickOrMaintainer,
            availability: Availability.WhitelistedGuildChannelsOnly
        })
    }

    async exec(message: Message, ranks: string, category: string) {
        const names = ranks.split(",");
        const res = await attemptMultipleWithCategory(names, category, this.ranks.addRankToCategory.bind(this.ranks));

        await sendErrorMessages("adding", message.channel, res.errors, "to category");

        if (res.successful.length === 0) {
            return message.channel.send({embeds: [new MessageEmbed()
                .setDescription("No ranks were affected")
                .setColor("RED")
            ]});
        }

        let desc: string = getReadableNames("Added", res.successful.map(r => r.rankName));
        desc += " to category " + res.category.categoryName;
        return message.channel.send({embeds: [new MessageEmbed()
            .setDescription(desc)
            .setColor(this.bot.displayColor())
        ]});
    }
}

export class UnassignCategory extends RequiresRanks {
    constructor(bot: Bot) {
        super(bot, {
            names: ["unassigncategory", "unusecategory", "removefromcategory", "rfcat"],
            usages: {
                "Remove the given rank from the given category": ["rank", "category"]
            },
            permission: Permission.UserKickOrMaintainer,
            availability: Availability.WhitelistedGuildChannelsOnly
        })
    }

    async exec(message: Message, ranks: string, category: string) {
        const names = ranks.split(",");
        const res = await attemptMultipleWithCategory(names, category, this.ranks.removeRankFromCategory.bind(this.ranks));

        await sendErrorMessages("removing", message.channel, res.errors, "from category");

        if (res.successful.length === 0) {
            return message.channel.send({embeds: [new MessageEmbed()
                .setDescription("No ranks were affected")
                .setColor("RED")
            ]});
        }

        let desc: string = getReadableNames("Removed", res.successful.map(r => r.rankName));
        desc += " from category " + res.category.categoryName;
        return message.channel.send({embeds: [new MessageEmbed()
            .setDescription(desc)
            .setColor(this.bot.displayColor())
        ]});
    }
}

export class Rank extends RequiresRanks {
    constructor(bot: Bot) {
        super(bot, {
            names: ["rank"],
            usages: {
                "Join or leave a rank": ["name"]
            },
            permission: Permission.None,
            availability: Availability.GuildOnly
        });
    }

    async exec(message: Message): Promise<Message> {
        const rankName = await this.handler.getRawContent(message.content);
        const role = await this.ranks.getRole(rankName);
        let action: string;
        if (await this.ranks.toggleRank(message.author, rankName)) {
            action = "joined";
        } else {
            action = "left";
        }
        return message.channel.send({embeds: [new MessageEmbed()
            .setDescription(`${message.author.toString()}, you ${action} ${role.name}`)
            .setColor(this.bot.displayColor())
        ]})
    }
}
