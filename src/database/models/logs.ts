import {Sequelize, Model, DataTypes} from "sequelize";

export class Logs extends Model {
    public userID!: string;
    public modAction!: string;
    public target: string | null;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

export function initLogs(sequelize: Sequelize): typeof Logs {
    Logs.init({
        userID: {
            type: DataTypes.STRING,
            allowNull: false
        },
        modAction: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        target: {
            type: DataTypes.STRING
        }
    }, {sequelize: sequelize, modelName: "logs"});
    return Logs;
};
