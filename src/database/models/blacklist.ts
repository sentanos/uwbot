import {Sequelize, Model, DataTypes} from "sequelize";

export class Blacklist extends Model {
    public blacklistID!: string;
    public hashed!: string;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

export function initBlacklist(sequelize: Sequelize): typeof Blacklist {
    Blacklist.init({
        blacklistID: {
            type: DataTypes.STRING,
            primaryKey: true
        },
        hashed: {
            type: DataTypes.TEXT,
            unique: true,
            allowNull: false
        }
    }, {sequelize: sequelize, modelName: "blacklist"});
    return Blacklist;
};

