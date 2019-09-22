import {Sequelize, Model, DataTypes} from "sequelize";

export class Logs extends Model {
    public userID!: string;
    public action!: string;
    public target: string | null;
    public detail: string | null;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

export function init(sequelize: Sequelize): void {
    Logs.init({
        userID: {
            type: DataTypes.STRING,
            allowNull: false
        },
        action: {
            type: DataTypes.STRING,
            allowNull: false
        },
        target: {
            type: DataTypes.STRING
        },
        detail: {
            type: DataTypes.TEXT,
        }
    }, {
        sequelize: sequelize,
        modelName: "logs",
        tableName: "logs"
    });
};
