import {Sequelize, Model, DataTypes} from "sequelize";

export class Jobs extends Model {
    public id!: number;
    public date!: Date;
    public event!: string;
    public payload!: string;
    public module!: string;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

export function initJobs(sequelize: Sequelize): void {
    Jobs.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        date: {
            type: DataTypes.DATE,
            allowNull: false
        },
        event: {
            type: DataTypes.STRING,
            allowNull: false
        },
        payload: {
            type: DataTypes.STRING,
            allowNull: false
        },
        module: {
            type: DataTypes.STRING,
            allowNull: false
        }
    }, {
        sequelize: sequelize,
        modelName: "jobs",
        tableName: "jobs"
    });
};
