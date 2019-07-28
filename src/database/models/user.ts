import {Sequelize, Model, DataTypes, } from "sequelize";
import {
    Association,
    HasOneGetAssociationMixin,
    HasManyGetAssociationsMixin,
    HasManyCreateAssociationMixin
} from "sequelize";
import {XpLogs} from "./xpLogs";
import {Xp} from "./xp";
import {Pins} from "./pins";
import {Logs} from "./logs";

export class User extends Model {
    public userID!: string;

    public getXpLogs!: HasManyGetAssociationsMixin<XpLogs>;
    public getXp!: HasOneGetAssociationMixin<Xp>;
    public createXpLog!: HasManyCreateAssociationMixin<XpLogs>;
    public getPins!: HasManyGetAssociationsMixin<Pins>;
    public getLogs!: HasManyGetAssociationsMixin<Logs>;
    public createPin!: HasManyCreateAssociationMixin<Pins>;
    public createLog!: HasManyCreateAssociationMixin<Logs>;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    public static associations: {
        xpLogs: Association<User, XpLogs>,
        xp: Association<User, Xp>,
        pins: Association<User, Pins>,
        logs: Association<User, Logs>
    }
}

export function initUser(sequelize: Sequelize): typeof User {
    User.init({
        userID: {
            type: DataTypes.STRING,
            primaryKey: true
        }
    }, {sequelize: sequelize, modelName: "user"});
    return User;
};
