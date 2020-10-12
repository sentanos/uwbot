import {Sequelize, Model, DataTypes} from "sequelize";

export class Xp extends Model {
    public userID!: string;
    public totalXp!: number;
    public lastBlock!: Date;
    public blockXp!: number;
    public lastMessage!: Date;
    public lastDecay!: Date;
    public lastReward!: Date;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

export function init(sequelize: Sequelize): void {
    Xp.init({
        userID: {
            type: DataTypes.STRING,
            primaryKey: true
        },
        totalXp: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
            allowNull: false
        },
        lastBlock: {
            type: DataTypes.DATE,
            allowNull: false
        },
        blockXp: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        lastMessage: {
            type: DataTypes.DATE,
            allowNull: false
        },
        lastDecay: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            allowNull: false
        },
        lastReward: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            allowNull: false
        }
    }, {
        sequelize: sequelize,
        modelName: "xp",
        tableName: "xp"
    });
};
