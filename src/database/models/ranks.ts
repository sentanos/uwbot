import {
    Sequelize,
    Model,
    DataTypes,
    Association,
    BelongsToManyGetAssociationsMixin,
    BelongsToManyAddAssociationMixin,
    BelongsToManyCountAssociationsMixin,
    BelongsToManyRemoveAssociationMixin
} from "sequelize";
import {RankCategories} from "./rankCategories";

export class Ranks extends Model {
    public rankID!: number;
    public roleID!: string;
    public rankName!: string;

    public getCategories!: BelongsToManyGetAssociationsMixin<RankCategories>;
    public addCategory!: BelongsToManyAddAssociationMixin<RankCategories, number>;
    public removeCategory!: BelongsToManyRemoveAssociationMixin<RankCategories, number>
    public countCategories!: BelongsToManyCountAssociationsMixin;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    public static associations: {
        categories: Association<Ranks, RankCategories>;
    };
}

export function init(sequelize: Sequelize): void {
    Ranks.init({
        rankID: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        roleID: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        rankName: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        }
    }, {
        sequelize: sequelize,
        modelName: "ranks",
        tableName: "ranks"
    });
}

export function after(): void {
    Ranks.belongsToMany(RankCategories, {as: "categories", through: "rankCategoriesJunction"});
}
