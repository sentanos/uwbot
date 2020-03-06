import {Sequelize, Model, DataTypes} from "sequelize";
import {PunishmentRoleType} from "../../modules/moderation";

export class Punishments extends Model {
    public userID!: string;
    public initiatorID!: string;
    public type!: PunishmentRoleType;
    public expiration!: Date;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

export function init(sequelize: Sequelize): void {
    Punishments.init({
        userID: {
            type: DataTypes.STRING,
            primaryKey: true
        },
        initiatorID: {
            type: DataTypes.STRING,
            allowNull: false
        },
        type: {
            type: DataTypes.STRING,
            allowNull: false
        },
        expiration: {
            type: DataTypes.DATE,
            allowNull: false
        }
    }, {
        sequelize: sequelize,
        modelName: "punishments",
        tableName: "punishments"
    });
};

