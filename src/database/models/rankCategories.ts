import {
    Sequelize,
    Model,
    DataTypes,
    Association,
    BelongsToManyCountAssociationsMixin,
    BelongsToManyAddAssociationMixin,
    BelongsToManyGetAssociationsMixin, BelongsToManyRemoveAssociationMixin
} from "sequelize";
import {Ranks} from "./ranks";

export class RankCategories extends Model {
    public categoryID!: number
    public categoryName!: string;

    public getRanks!: BelongsToManyGetAssociationsMixin<Ranks>;
    public addRank!: BelongsToManyAddAssociationMixin<Ranks, number>;
    public removeRank!: BelongsToManyRemoveAssociationMixin<Ranks, number>
    public countRanks!: BelongsToManyCountAssociationsMixin;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    public static associations: {
        ranks: Association<RankCategories, Ranks>;
    };
}

export function init(sequelize: Sequelize): void {
    RankCategories.init({
        categoryID: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        categoryName: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        }
    }, {
        sequelize: sequelize,
        modelName: "rankCategories",
        tableName: "rankCategories"
    });
}

export function after(): void {
    RankCategories.belongsToMany(Ranks, {as: "ranks", through: "rankCategoriesJunction"});
}

