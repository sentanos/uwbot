CREATE TABLE blacklist(
    blacklistID TEXT PRIMARY KEY,
    hashed TEXT UNIQUE NOT NULL,
    blacklistedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE logs(
    userID TEXT NOT NULL,
    modAction TEXT NOT NULL,
    actionTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    target TEXT
);
CREATE TABLE pinned(
    messageID TEXT PRIMARY KEY,
    pinMessage TEXT,
    userID TEXT NOT NULL,
    pinnedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE xp(
    userID TEXT PRIMARY KEY,
    totalXp INTEGER NOT NULL DEFAULT 0,
    lastBlock TIMESTAMP NOT NULL,
    blockXp INTEGER NOT NULL,
    lastMessage TIMESTAMP NOT NULL,
    lastDecay TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE xpHistory(
    userID TEXT NOT NULL,
    xp INTEGER NOT NULL,
    addTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE whitelist(
    channelID TEXT PRIMARY KEY
);
CREATE TABLE xpExclude(
    channelID TEXT PRIMARY KEY
);
CREATE TABLE pinExclude(
    channelID TEXT PRIMARY KEY
);