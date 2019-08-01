'use strict';

module.exports = {
   async up (queryInterface, Sequelize) {
      const settings = {
         "pin.emoji": "\uD83D\uDCCC",
         "audit.channel": "546264496197468170",
         "commands.requiredRole": "546284932557963284",
         "suggestions.channel": "602691378484609024",
         "suggestions.resultsChannels": "546392923093336094",
         "suggestions.voteInterval": "259200",
         "suggestions.upvoteEmoji": "546284372173783052",
         "suggestions.downvoteEmoji": "546284370575753217",
         "suggestions.disallowRole": "546261092293279755",
         "xp.reward": "584272569557843969",
         "internal.modules.audit.enabled": "true",
         "internal.modules.anon.enabled": "true",
         "internal.modules.xp.enabled": "true",
         "internal.modules.pin.enabled": "true",
         "internal.modules.whitelist.enabled": "true",
         "internal.modules.scheduler.enabled": "true",
         "internal.modules.suggestions.enabled": "true"
      };
      let records = [];
      for (const key in settings) {
         records.push({
            key: key,
            value: settings[key],
            namespace: key.substring(0, key.indexOf(".")),
            createdAt: new Date(),
            updatedAt: new Date()
         });
      }
      await queryInterface.bulkInsert("settings", records, {});
   },

   async down (queryInterface, Sequelize) {
      await queryInterface.bulkDelete("settings", null, {});
   }
};
