import {Sequelize, Model, DataTypes} from "sequelize";

export class Setting extends Model {
    public key!: string;
    public value!: string;
    public namespace!: string;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

export function initSettings(sequelize: Sequelize): void {
    Setting.init({
        key: {
            type: DataTypes.STRING,
            primaryKey: true
        },
        value: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        namespace: {
            type: DataTypes.STRING,
            allowNull: false
        }
    }, {sequelize: sequelize, modelName: "settings"});
}

