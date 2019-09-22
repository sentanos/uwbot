import {Sequelize, Model, DataTypes} from "sequelize";

export class XpLogs extends Model {
    public userID!: string;
    public xp!: number;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

export function init(sequelize: Sequelize): void {
    XpLogs.init({
        userID: {
            type: DataTypes.STRING,
            allowNull: false
        },
        xp: {
            type: DataTypes.INTEGER,
            allowNull: false
        }
    }, {
        sequelize: sequelize,
        modelName: "xpLogs",
        tableName: "xpLogs"
    });
};
