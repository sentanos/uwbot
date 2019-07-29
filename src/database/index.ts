import {Sequelize} from "sequelize";
import {initBlacklist} from "./models/blacklist";
import {initXpLogs} from "./models/xpLogs";
import {initXp} from "./models/xp";
import {initPins} from "./models/pins";
import {initLogs} from "./models/logs";
import {initSettings} from "./models/setting";
// import {initUser, User} from "./models/user";

export default function (sequelize: Sequelize): void {
    initBlacklist(sequelize);
    initLogs(sequelize);
    initPins(sequelize);
    // initUser(sequelize);
    initXp(sequelize);
    initXpLogs(sequelize);
    initSettings(sequelize);

    // User.hasMany(Logs, {
    //     sourceKey: "userID",
    //     foreignKey: "userID",
    //     as: "logs"
    // });
    // User.hasMany(Pins, {
    //     sourceKey: "userID",
    //     foreignKey: "userID",
    //     as: "pins"
    // });
    // User.hasMany(XpLogs, {
    //     sourceKey: "userID",
    //     foreignKey: "userID",
    //     as: "xpLogs"
    // });

    // Xp.belongsTo(User, {targetKey: "userID"});
    // User.hasOne(Xp, {sourceKey: "userID"});
}