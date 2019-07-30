import {Sequelize} from "sequelize";
import {initBlacklist} from "./models/blacklist";
import {initXpLogs} from "./models/xpLogs";
import {initXp} from "./models/xp";
import {initPins} from "./models/pins";
import {initLogs} from "./models/logs";
import {initSettings} from "./models/setting";

export default function (sequelize: Sequelize): void {
    initBlacklist(sequelize);
    initLogs(sequelize);
    initPins(sequelize);
    initXp(sequelize);
    initXpLogs(sequelize);
    initSettings(sequelize);
}