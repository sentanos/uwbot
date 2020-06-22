import {Module} from "../module";
import {Bot} from "../bot";
import {Ranks} from "../database/models/ranks";
import {GuildMember, Role, Snowflake, User} from "discord.js";
import {RankCategories} from "../database/models/rankCategories";
import {Sequelize, Transaction} from "sequelize";

export type RankAndCategory = {
    rank: Ranks,
    category: RankCategories
}

// Ranks are considered separate from discord "roles" and can only be given/removed if they are
// added as an existing role or created as a new role.
//
// Ranks can have multiple categories and categories can have multiple ranks.
// Ranks can be uncategorized, but categories cannot have no ranks (if the last rank is deleted
// from a category, the category is deleted as well).
//
// The "Uncategorized" category exists if there are ranks with no categories and cannot be
// deleted or modified.
// Ranks are automatically de-associated with this category if they are assigned to any category
// and re-associated if they are removed from all categories.
export class RanksModule extends Module {
    // RI: All ranks must be in at least one category and all categories must have at least one rank

    constructor(bot: Bot) {
        super(bot, "ranks");
    }

    public async initialize() {
        const ranks = await Ranks.findAll();
        for (let i = 0; i < ranks.length; i++) {
            if (!this.bot.guild.roles.cache.has(ranks[i].roleID)) {
                await this.deleteRank(ranks[i]);
            } else if (this.bot.guild.roles.cache.get(ranks[i].roleID).name !== ranks[i].rankName) {
                await this.renameRank(ranks[i], this.bot.guild.roles.cache.get(ranks[i].roleID).name);
            }
        }
        this.listen("roleDelete", this.roleDelete.bind(this));
        this.listen("roleUpdate", this.roleUpdate.bind(this));
    }

    private async roleDelete(role: Role) {
        if (role.guild.id !== this.bot.guild.id) {
            return;
        }
        const rank = await this.getRankByRoleID(role.id);
        if (rank != null) {
            await this.deleteRank(rank);
        }
    }

    private async roleUpdate(_, role: Role) {
        if (role.guild.id !== this.bot.guild.id) {
            return;
        }
        const rank = await this.getRankByRoleID(role.id);
        if (rank != null && role.name !== rank.rankName) {
            await this.renameRank(rank, role.name);
        }
    }

    private async renameRank(rank: Ranks, newName: string): Promise<void> {
        await rank.update({
            rankName: newName
        });
    }

    public async renameCategoryByName(oldName: string, newName: string): Promise<{oldName: string, newName: string}> {
        const oldCategory = await this.getCategory(oldName);
        const old = oldCategory.categoryName;
        const newCategory = await oldCategory.update({
            categoryName: newName
        });
        return {
            oldName: old,
            newName: newCategory.categoryName
        };
    }

    // Creates a new rank (and corresponding role) with the given name
    // The role has no additional settings (no permissions, lowest position)
    public async createRank(name: string, category?: string): Promise<RankAndCategory> {
        const role: Role = await this.bot.guild.roles.create({
            data: { name },
            reason: "Rank module"
        });
        return await this.addRankFromRole(role, category);
    }

    public async hasRank(name: string): Promise<boolean> {
        return await this.getRank(name) != null;
    }

    // role must exist (throws error)
    // role name must not be ambiguous (throws error)
    //
    // Create a rank from an existing role based on either its ID or its name.
    public async addRole(nameOrId: string, category?: string): Promise<RankAndCategory> {
        const lower = nameOrId.toLowerCase();
        let foundRole: Role;
        if (this.bot.guild.roles.cache.has(nameOrId)) {
            foundRole = this.bot.guild.roles.cache.get(nameOrId);
        } else {
            let foundRoles: Role[] = [];
            this.bot.guild.roles.cache.forEach((role) => {
                if (role.name.toLowerCase() === lower) {
                    foundRoles.push(role);
                }
            });
            if (foundRoles.length > 1) {
                throw new Error("SAFE: There are multiple roles with the name " + nameOrId +
                    ", please run the command with the ID of the role. Here are the role IDs of" +
                    " the roles with that name: " + foundRoles.map(r => r.id).join(", "))
            } else if (foundRoles.length === 0) {
                throw new Error("SAFE: Role does not exist");
            }
            foundRole = foundRoles[0];
        }
        return await this.addRankFromRole(foundRole, category);
    }

    // Given a role, adds it to the rank list
    // Throws error if the given role already exists as a rank
    private async addRankFromRole(role: Role, categoryName: string = "Uncategorized"): Promise<RankAndCategory> {
        const testRank: Ranks | null = await Ranks.findOne({where: {
            roleID: role.id
        }});
        if (testRank != null) {
            throw new Error("SAFE: That role already exists as a rank");
        }
        const testRank2: Ranks | null = await this.getRank(role.name);
        if (testRank2 != null) {
            throw new Error("SAFE: A rank with that name already exists");
        }

        let rank: Ranks = null;
        const category = await this.bot.DB.transaction({type: Transaction.TYPES.IMMEDIATE}, (transaction) => {
            return Ranks.create({
                roleID: role.id,
                rankName: role.name
            }, { transaction }).then((r) => {
                rank = r;
                return this.addRankModelToCategory(r, categoryName, transaction);
            });
        });
        return { rank, category }
    }

    // Deletes the rank with the given name (case insensitive)
    public async deleteRankByName(rankName: string): Promise<Ranks> {
        const rank = await this.getRankT(rankName);
        if (rank == null) {
            throw new Error("SAFE: Rank does not exist");
        }
        await this.deleteRank(rank);
        return rank;
    }

    public async deleteRankByRoleID(roleID: Snowflake): Promise<Ranks> {
        const rank = await this.getRankByRoleID(roleID);
        if (rank == null) {
            throw new Error("SAFE: Rank with ID " + roleID + " does not exist");
        }
        await this.deleteRank(rank);
        return rank;
    }

    // Deletes the rank with the given rank ID
    private async deleteRank(rank: Ranks): Promise<void> {
        return this.bot.DB.transaction({type: Transaction.TYPES.IMMEDIATE}, async (transaction) => {
            await rank.destroy({ transaction });
            await this.cleanCategories(transaction)
        });
    }

    // Deletes the category with the given name (case insensitive)
    // The Uncategorized category cannot be deleted
    public async deleteCategory(categoryName: string): Promise<RankCategories> {
        if (categoryName.toLowerCase() === "uncategorized") {
            throw new Error("SAFE: Uncategorized cannot be deleted");
        }

        return this.bot.DB.transaction({type: Transaction.TYPES.IMMEDIATE}, (transaction) => {
            return this.getCategoryT(categoryName, transaction).then(async (category) => {
                if (category == null) {
                    throw new Error("SAFE: Category does not exist");
                }
                await category.destroy({ transaction });
                await this.cleanRanks(transaction);
                return category;
            })
        });
    }

    // Adds ranks with no categories to the "Uncategorized" category
    private async cleanRanks(transaction: Transaction): Promise<void> {
        return Ranks.findAll({ transaction }).then(async (ranks) => {
            let jobs = [];
            let added = false;
            const uncat = await this.findOrCreateCategory("Uncategorized", transaction);
            for (let i = 0; i < ranks.length; i++) {
                jobs.push(ranks[i].countCategories({ transaction }).then(async (num) => {
                    if (num === 0) {
                        await ranks[i].addCategory(uncat, { transaction });
                        added = true;
                    }
                }));
            }
            await Promise.all(jobs);
            if (!added) {
                await uncat.destroy({ transaction });
            }
        });
    }

    // Deletes categories with no ranks in them
    private async cleanCategories(transaction: Transaction): Promise<void> {
        return RankCategories.findAll({ transaction }).then(async (categories) => {
            let jobs = [];
            for (let i = 0; i < categories.length; i++) {
                jobs.push(categories[i].countRanks({ transaction }).then(async (num) => {
                    if (num === 0) {
                        await categories[i].destroy({ transaction });
                    }
                }));
            }
            await Promise.all(jobs);
        });
    }

    // Adds the rank with the given name (case insensitive) to the given category (case
    // insensitive for search, case sensitive for creation).
    // If the category does not exist, creates a new category with the rank
    // The category "Uncategorized" cannot be added to manually
    public async addRankToCategory(rankName: string, categoryName: string): Promise<RankAndCategory> {
        if (categoryName.toLowerCase() === "uncategorized") {
            throw new Error("SAFE: You cannot add to the Uncategorized category");
        }
        const rank = await this.getRank(rankName);
        if (rank == null) {
            throw new Error("SAFE: Rank does not exist");
        }
        const category = await this.bot.DB.transaction({type: Transaction.TYPES.IMMEDIATE}, async (t) => {
            return await this.addRankModelToCategory(rank, categoryName, t);
        });
        return { rank, category };
    }

    // Adds a rank to a category and returns the category
    // Detaches Uncategorized category from rank if it is in it
    private async addRankModelToCategory(rank: Ranks, categoryName: string, transaction: Transaction): Promise<RankCategories> {
        const category = await this.findOrCreateCategory(categoryName, transaction);
        await rank.addCategory(category, { transaction });
        const categories = await rank.getCategories();
        for (let i = 0; i < categories.length; i++) {
            if (categories[i].categoryName === "Uncategorized") {
                await categories[i].removeRank(rank, { transaction });
            }
        }
        await this.cleanCategories(transaction);
        return category;
    }

    private async findOrCreateCategory(categoryName: string, transaction?: Transaction): Promise<RankCategories> {
        let category = await this.getCategoryT(categoryName, transaction);
        if (category == null) {
            category = await RankCategories.create({ categoryName }, { transaction });
        }
        return category;
    }

    public async removeRankFromCategory(rankName: string, categoryName: string): Promise<RankAndCategory> {
        if (categoryName.toLowerCase() === "uncategorized") {
            throw new Error("SAFE: You cannot add to the Uncategorized category");
        }
        const rank = await this.getRank(rankName);
        if (rank == null) {
            throw new Error("SAFE: Rank does not exist");
        }
        const category = await this.getCategory(categoryName);
        if (category == null) {
            throw new Error("SAFE: Category does not exist");
        }
        await this.bot.DB.transaction({type: Transaction.TYPES.IMMEDIATE}, async (transaction) => {
            await category.removeRank(rank, { transaction });
            await this.cleanRanks(transaction);
            await this.cleanCategories(transaction);
        });
        return { rank, category };
    }

    // Gets ranks in a category (case insensitive) and returns both the category and the ranks
    // (ranks in alphabetical order)
    public async getRanksInCategory(categoryName: string):
        Promise<{category: string, ranks: Ranks[]}> {
        const category = await this.getCategory(categoryName);
        if (category == null) {
            throw new Error("SAFE: Category does not exist");
        }
        return {
            category: category.categoryName,
            ranks: await category.getRanks({
                order: [["rankName", "ASC"]]
            })
        };
    }

    public async getCategoriesOfRank(rankName: string): Promise<RankCategories[]> {
        const rank = await this.getRank(rankName);
        if (rank == null) {
            throw new Error("SAFE: Rank does not exist");
        }
        return rank.getCategories({
            order: [["categoryName", "ASC"]]
        });
    }

    private async getCategoryT(name: string, t?: Transaction): Promise<RankCategories | null> {
        return RankCategories.findOne({
            where: Sequelize.where(
                Sequelize.fn("lower", Sequelize.col("categoryName")),
                name.toLowerCase()
            ),
            transaction: t
        })
    }

    // Gets a category by name (case insensitive)
    // If category does not exist, returns null
    public async getCategory(name: string): Promise<RankCategories | null> {
        return this.getCategoryT(name);
    }

    private async getRankT(name: string, t?: Transaction): Promise<Ranks | null> {
        return Ranks.findOne({
            where: Sequelize.where(
                Sequelize.fn("lower", Sequelize.col("rankName")),
                name.toLowerCase()
            ),
            transaction: t
        });
    }

    // Gets a rank by name (case insensitive)
    // If a rank does not exist, returns null
    public async getRank(name: string): Promise<Ranks | null> {
        return this.getRankT(name);
    }

    public async getRankByRoleID(roleID: Snowflake): Promise<Ranks | null> {
        return Ranks.findOne({
            where: { roleID }
        });
    }

    // Gets all ranks in case-insensitive alphabetical order
    public async getRanks(): Promise<Ranks[]> {
        return Ranks.findAll({
            order: [[Sequelize.fn("lower", Sequelize.col("rankName")), "ASC"]]
        });
    }

    // Gets all categories in case-insensitive alphabetical order
    public async getCategories(): Promise<RankCategories[]> {
        return RankCategories.findAll({
            order: [[Sequelize.fn("lower", Sequelize.col("categoryName")), "ASC"]]
        });
    }

    // rank must be a valid rank (throws error if not)
    //
    // Returns the bot guild role corresponding to the given rank
    public async getRole(rankName: string): Promise<Role> {
        const rank = await this.getRank(rankName);
        if (rank == null) {
            throw new Error("SAFE: Rank does not exist or you do not have permission to set it");
        }
        return this.bot.guild.roles.cache.get(rank.roleID);
    }

    // rank must be a valid rank (throws error if not)
    // user must be a member of the bot guild (throws error if not)
    //
    // Returns true if the rank was added to the user and false if it was removed from the user
    public async toggleRank(user: User, rank: string): Promise<boolean> {
        const member: GuildMember | void = this.bot.guild.member(user);
        if (member == null) {
            throw new Error("Guild member not found");
        }
        const role = await this.getRole(rank);
        if (await member.roles.cache.has(role.id)) {
            await member.roles.add(role);
            return true;
        } else {
            await member.roles.remove(role);
            return false;
        }
    }
}