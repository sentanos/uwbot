import {Sequelize, Model, DataTypes} from "sequelize";

export class Blacklist extends Model {
    public blacklistID!: string;
    public hashed!: string;
    public end: Date | null;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

export function init(sequelize: Sequelize): void {
    Blacklist.init({
        blacklistID: {
            type: DataTypes.STRING,
            primaryKey: true
        },
        hashed: {
            type: DataTypes.TEXT,
            unique: true,
            allowNull: false
        },
        end: {
            type: DataTypes.DATE
        }
    }, {
        sequelize: sequelize,
        modelName: "blacklist",
        tableName: "blacklist"
    });
};

