import {Sequelize} from "sequelize";
import {Bot} from "../bot";

export default async (sequelize: Sequelize): Promise<number> => {
    let after = [];
    const count = await Bot.forEachClassInFile("./database/models",
        async (name: string, func: any): Promise<boolean> => {
            if (name === "init") {
                func(sequelize);
                return true;
            } else if (name === "after") {
                after.push(func);
            }
            return false;
        });

    for (let i = 0; i < after.length; i++) {
        after[i]();
    }

    return count;
}