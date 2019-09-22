import {Sequelize} from "sequelize";
import {Bot} from "../bot";

export default (sequelize: Sequelize): Promise<number> => {
    return Bot.forEachClassInFile("./database/models",
        async (name: string, init: any): Promise<boolean> => {
            if (name === "init") {
                init(sequelize);
                return true;
            }
            return false;
        });
}