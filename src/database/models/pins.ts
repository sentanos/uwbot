import {Sequelize, Model, DataTypes} from "sequelize";

export class Pins extends Model {
    public messageID!: string;
    public userID!: string;
    public systemMessageID: string | null;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

export function init(sequelize: Sequelize): void {
    Pins.init({
        messageID: {
            type: DataTypes.STRING,
            primaryKey: true
        },
        userID: {
            type: DataTypes.STRING,
            allowNull: false
        },
        systemMessageID: {
            type: DataTypes.STRING
        }
    }, {
        sequelize: sequelize,
        modelName: "pins",
        tableName: "pins"
    });
};
