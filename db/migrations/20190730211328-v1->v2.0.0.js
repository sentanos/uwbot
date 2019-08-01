'use strict';

const basicMigrate = async (table, attributes, transaction, queryInterface, Sequelize) => {
   let jobs = [];
   jobs.push(queryInterface.createTable(
      table + "_migrate",
      attributes, {transaction})
   );
   jobs.push(queryInterface.addColumn(
      table,
      "updatedAt",
      {
         type: Sequelize.DATE
      }, {transaction})
   );
   jobs.push(queryInterface.addColumn(
      table,
      "createdAt",
      {
         type: Sequelize.DATE
      }, {transaction})
   );
   await Promise.all(jobs);
   await queryInterface.sequelize.query("UPDATE " + table + " SET createdAt =" +
      " CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP", {transaction});

   await queryInterface.sequelize.query("INSERT INTO " + table + "_migrate SELECT * FROM " + table, 
      {transaction});
   await queryInterface.dropTable(table, {transaction});
   await queryInterface.renameTable(table + "_migrate", table, {transaction});
};

module.exports = {
   async up(queryInterface, Sequelize) {
      const transaction = await queryInterface.sequelize.transaction();
      try {
         let jobs = [];


         // Blacklist
         jobs.push(queryInterface.createTable(
            "blacklist_migrate",
            {
               blacklistID: {
                  type: Sequelize.STRING,
                  primaryKey: true
               },
               hashed: {
                  type: Sequelize.TEXT,
                  unique: true,
                  allowNull: false
               },
               createdAt: {
                  type: Sequelize.DATE,
                  allowNull: false
               },
               updatedAt: {
                  type: Sequelize.DATE,
                  allowNull: false
               }
            }, {transaction})
         );
         jobs.push(queryInterface.addColumn(
            "blacklist",
            "updatedAt",
            {
               type: Sequelize.DATE
            }, {transaction})
         );
         await Promise.all(jobs);
         jobs = [];
         await queryInterface.sequelize.query("UPDATE blacklist SET updatedAt =" +
            " CURRENT_TIMESTAMP", {transaction});

         await queryInterface.sequelize.query("INSERT INTO blacklist_migrate(blacklistID, hashed," +
            " createdAt, updatedAt) SELECT blacklistID, hashed, blacklistedAt, updatedAt FROM" +
            " blacklist", {transaction});
         await queryInterface.dropTable("blacklist", {transaction});
         await queryInterface.renameTable("blacklist_migrate", "blacklist", {transaction});


         // Logs
         jobs.push(queryInterface.createTable(
            "logs_migrate",
            {
               id: {
                  type: Sequelize.INTEGER,
                  primaryKey: true,
                  autoIncrement: true
               },
               userID: {
                  type: Sequelize.STRING,
                  allowNull: false
               },
               action: {
                  type: Sequelize.STRING,
                  allowNull: false
               },
               target: {
                  type: Sequelize.STRING
               },
               detail: {
                  type: Sequelize.TEXT,
               },
               createdAt: {
                  type: Sequelize.DATE,
                  allowNull: false
               },
               updatedAt: {
                  type: Sequelize.DATE,
                  allowNull: false
               }
            }, {transaction})
         );
         jobs.push(queryInterface.addColumn(
            "logs",
            "updatedAt",
            {
               type: Sequelize.DATE
            }, {transaction})
         );
         await Promise.all(jobs);
         jobs = [];
         await queryInterface.sequelize.query("UPDATE logs SET updatedAt = CURRENT_TIMESTAMP," +
            " modAction = UPPER(modAction)",
            {transaction});

         await queryInterface.sequelize.query("INSERT INTO logs_migrate(userID, action, target," +
            " createdAt, updatedAt) SELECT userID, modAction, target, actionTime, updatedAt FROM" +
            " logs", {transaction});
         await queryInterface.sequelize.query("UPDATE logs_migrate SET detail = 'Legacy log'",
            {transaction});
         await queryInterface.dropTable("logs", {transaction});
         await queryInterface.renameTable("logs_migrate", "logs", {transaction});


         // Pinned
         jobs.push(queryInterface.createTable(
            "pins",
            {
               messageID: {
                  type: Sequelize.STRING,
                  primaryKey: true
               },
               userID: {
                  type: Sequelize.STRING,
                  allowNull: false
               },
               systemMessageID: {
                  type: Sequelize.STRING
               },
               createdAt: {
                  type: Sequelize.DATE,
                  allowNull: false
               },
               updatedAt: {
                  type: Sequelize.DATE,
                  allowNull: false
               }
            }, {transaction})
         );
         jobs.push(queryInterface.addColumn(
            "pinned",
            "updatedAt",
            {
               type: Sequelize.DATE
            }, {transaction})
         );
         await Promise.all(jobs);
         jobs = [];
         await queryInterface.sequelize.query("UPDATE pinned SET updatedAt = CURRENT_TIMESTAMP",
            {transaction});

         await queryInterface.sequelize.query("INSERT INTO pins(messageID, userID," +
            " systemMessageID, createdAt, updatedAt) SELECT messageID, userID, pinMessage," +
            " pinnedAt, updatedAt FROM pinned", {transaction});
         await queryInterface.dropTable("pinned", {transaction});


         // XP Logs
         jobs.push(queryInterface.createTable(
            "xpLogs",
            {
               id: {
                  type: Sequelize.INTEGER,
                  primaryKey: true,
                  autoIncrement: true
               },
               userID: {
                  type: Sequelize.STRING,
                  allowNull: false
               },
               xp: {
                  type: Sequelize.INTEGER,
                  allowNull: false
               },
               createdAt: {
                  type: Sequelize.DATE,
                  allowNull: false
               },
               updatedAt: {
                  type: Sequelize.DATE,
                  allowNull: false
               }
            }, {transaction})
         );
         jobs.push(queryInterface.addColumn(
            "xpHistory",
            "updatedAt",
            {
               type: Sequelize.DATE
            }, {transaction})
         );
         await Promise.all(jobs);
         jobs = [];
         await queryInterface.sequelize.query("UPDATE xpHistory SET updatedAt = CURRENT_TIMESTAMP",
            {transaction});

         await queryInterface.sequelize.query("INSERT INTO xpLogs(userID, xp, createdAt," +
            " updatedAt) SELECT userID, xp, addTime, updatedAt FROM xpHistory", {transaction});
         await queryInterface.dropTable("xpHistory", {transaction});


         // XP
         await basicMigrate(
            "xp",
            {
               userID: {
                  type: Sequelize.STRING,
                  primaryKey: true
               },
               totalXp: {
                  type: Sequelize.INTEGER,
                  defaultValue: 0,
                  allowNull: false
               },
               lastBlock: {
                  type: Sequelize.DATE,
                  allowNull: false
               },
               blockXp: {
                  type: Sequelize.INTEGER,
                  allowNull: false
               },
               lastMessage: {
                  type: Sequelize.DATE,
                  allowNull: false
               },
               lastDecay: {
                  type: Sequelize.DATE,
                  defaultValue: Sequelize.NOW,
                  allowNull: false
               },
               createdAt: {
                  type: Sequelize.DATE,
                  allowNull: false
               },
               updatedAt: {
                  type: Sequelize.DATE,
                  allowNull: false
               }
            },
            transaction,
            queryInterface,
            Sequelize
         );


         // Persistent channel lists
         let tables = ["whitelist", "xpExclude", "pinExclude"];
         for (let i = 0; i < tables.length; i++) {
            await basicMigrate(
               tables[i],
               {
                  channelID: {
                     type: Sequelize.STRING,
                     primaryKey: true
                  },
                  createdAt: {
                     type: Sequelize.DATE,
                     allowNull: false
                  },
                  updatedAt: {
                     type: Sequelize.DATE,
                     allowNull: false
                  }
               },
               transaction,
               queryInterface,
               Sequelize
            )
         }


         await queryInterface.createTable("settings", {
            key: {
               type: Sequelize.STRING,
               primaryKey: true
            },
            value: {
               type: Sequelize.TEXT,
               allowNull: false
            },
            namespace: {
               type: Sequelize.STRING,
               allowNull: false
            },
            createdAt: {
               type: Sequelize.DATE,
               allowNull: false
            },
            updatedAt: {
               type: Sequelize.DATE,
               allowNull: false
            }
         }, {transaction});


         await transaction.commit();
      } catch (err) {
         await transaction.rollback();
         throw err;
      }
   },

   async down (queryInterface, Sequelize) {
      throw new Error("ONE-WAY MIGRATION");
   }
};
