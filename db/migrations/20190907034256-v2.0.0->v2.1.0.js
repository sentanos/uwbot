'use strict';

module.exports = {
   up: (queryInterface, Sequelize) => {
      return queryInterface.addColumn(
         "blacklist",
         "end",
         {
            type: Sequelize.DATE
         });
   },

   down: async (queryInterface, Sequelize) => {
      const transaction = await queryInterface.sequelize.transaction();
      try {
         await queryInterface.createTable(
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
            }, {transaction}
         );
         await queryInterface.sequelize.query("INSERT INTO blacklist_migrate(blacklistID, hashed," +
            " createdAt, updatedAt) SELECT blacklistID, hashed, createdAt, updatedAt FROM" +
            " blacklist", {transaction});
         await queryInterface.dropTable("blacklist", {transaction});
         await queryInterface.renameTable("blacklist_migrate", "blacklist", {transaction});
         await transaction.commit();
      } catch (err) {
         await transaction.rollback();
         throw err;
      }
   }
};
