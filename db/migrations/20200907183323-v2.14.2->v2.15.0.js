'use strict';

module.exports = {
   up: async (queryInterface, Sequelize) => {
      const transaction = await queryInterface.sequelize.transaction();
      try {
         await queryInterface.createTable(
            "xp_migrate",
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
               lastReward: {
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
            }, {transaction}
         );
         await queryInterface.addColumn(
            "xp",
            "lastReward",
            {
               type: Sequelize.DATE
            }, {transaction});
         await queryInterface.sequelize.query("UPDATE xp SET lastReward = CURRENT_TIMESTAMP," +
            " createdAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP",
            {transaction});
         await queryInterface.sequelize.query("INSERT INTO xp_migrate(userID, totalXp," +
            " lastBlock, blockXp, lastMessage, lastDecay, lastReward, updatedAt, createdAt)" +
            " SELECT userID, totalXp, lastBlock, blockXp, lastMessage, lastDecay, lastReward," +
            " updatedAt, createdAt" +
            " FROM xp", {transaction});
         await queryInterface.dropTable("xp", {transaction});
         await queryInterface.renameTable("xp_migrate", "xp", {transaction});
         await transaction.commit();
      } catch (err) {
         await transaction.rollback();
         console.error(err);
         throw err;
      }
   },

   down: async (queryInterface, Sequelize) => {
      const transaction = await queryInterface.sequelize.transaction();
      try {
         await queryInterface.createTable(
            "xp_migrate",
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
            }, {transaction}
         );
         await queryInterface.sequelize.query("INSERT INTO xp_migrate(userID, totalXp," +
            " lastBlock, blockXp, lastMessage, lastDecay, updatedAt, createdAt) SELECT userID," +
            " totalXp, lastBlock, blockXp, lastMessage, lastDecay, updatedAt, createdAt FROM xp",
            {transaction});
         await queryInterface.dropTable("xp", {transaction});
         await queryInterface.renameTable("xp_migrate", "xp", {transaction});
         await transaction.commit();
      } catch (err) {
         await transaction.rollback();
         throw err;
      }
   }
};
