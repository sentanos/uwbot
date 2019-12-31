import {Sequelize, Model, DataTypes} from "sequelize";

export class Mutes extends Model {
    public userID!: string;
    public initiatorID!: string;
    public expiration!: Date;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

export function init(sequelize: Sequelize): void {
    Mutes.init({
        userID: {
            type: DataTypes.STRING,
            primaryKey: true
        },
        initiatorID: {
            type: DataTypes.STRING,
            allowNull: false
        },
        expiration: {
            type: DataTypes.DATE,
            allowNull: false
        }
    }, {
        sequelize: sequelize,
        modelName: "mutes",
        tableName: "mutes"
    });
};

