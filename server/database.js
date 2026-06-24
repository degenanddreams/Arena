// database.js — SQLite connection and schema init (schema per CLAUDE.md Section 3)
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'arena.db');

function initDatabase() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      wallet_address TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      gender TEXT DEFAULT 'male',
      hair_color TEXT DEFAULT 'brunette',
      skin_tone TEXT DEFAULT 'tan',
      clothing_color TEXT DEFAULT 'green',
      attack_xp INTEGER DEFAULT 0,
      strength_xp INTEGER DEFAULT 0,
      defense_xp INTEGER DEFAULT 0,
      current_hp INTEGER DEFAULT 100,
      gold INTEGER DEFAULT 1,
      tutorial_complete INTEGER DEFAULT 0,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      slot INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      FOREIGN KEY (player_id) REFERENCES players(wallet_address),
      UNIQUE(player_id, slot)
    );

    CREATE TABLE IF NOT EXISTS bank (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      slot INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      FOREIGN KEY (player_id) REFERENCES players(wallet_address),
      UNIQUE(player_id, slot)
    );

    CREATE TABLE IF NOT EXISTS equipped (
      player_id TEXT PRIMARY KEY,
      helmet_id INTEGER,
      chestplate_id INTEGER,
      platelegs_id INTEGER,
      shield_id INTEGER,
      weapon_id INTEGER,
      FOREIGN KEY (player_id) REFERENCES players(wallet_address)
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      tier INTEGER DEFAULT 0,
      slot_type TEXT,
      accuracy_stat INTEGER DEFAULT 0,
      strength_stat INTEGER DEFAULT 0,
      defense_stat INTEGER DEFAULT 0,
      attack_req INTEGER DEFAULT 0,
      defense_req INTEGER DEFAULT 0,
      gold_value INTEGER DEFAULT 0,
      stackable INTEGER DEFAULT 0,
      description TEXT
    );

    -- Wager challenges (Phase 3). Record-keeping only — live challenge state
    -- lives in server memory (worldState), per the Phase 2 architecture pattern.
    CREATE TABLE IF NOT EXISTS wager_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenger_wallet TEXT NOT NULL,
      accepter_wallet TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  seedItems(db);
  return db;
}

// Master item definitions per CLAUDE.md Section 4 — IDs must be stable
function seedItems(db) {
  // INSERT OR REPLACE so the master definitions stay authoritative across
  // restarts — name/tier/value edits (e.g. the Leather renumber) apply to an
  // existing arena.db without a manual reset. IDs are fixed PKs, and no FK
  // references items, so REPLACE is safe.
  const insert = db.prepare(`
    INSERT OR REPLACE INTO items
      (id, name, type, tier, slot_type, accuracy_stat, strength_stat, defense_stat,
       attack_req, defense_req, gold_value, stackable, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const items = [
    // id, name, type, tier, slot, acc, str, def, atkReq, defReq, goldVal, stackable, description
    // Tiering: Tier 1 = Leather (19-22), Tier 2 = Bronze, Tier 3 = Iron. gold_value tracks tier.
    [1,  'Bronze Helmet',     'armor',  2, 'helmet',     1,  1, 1, 0,  0,  2, 0, 'A basic bronze helmet.'],
    [2,  'Bronze Chestplate', 'armor',  2, 'chestplate', 2,  2, 2, 0,  0,  2, 0, 'A basic bronze chestplate.'],
    [3,  'Bronze Platelegs',  'armor',  2, 'platelegs',  2,  2, 2, 0,  0,  2, 0, 'Basic bronze platelegs.'],
    [4,  'Bronze Shield',     'armor',  2, 'shield',     1,  1, 1, 0,  0,  2, 0, 'A basic bronze shield.'],
    [5,  'Iron Helmet',       'armor',  3, 'helmet',     1,  1, 1, 0,  20, 3, 0, 'A sturdy iron helmet.'],
    [6,  'Iron Chestplate',   'armor',  3, 'chestplate', 5,  5, 5, 0,  20, 3, 0, 'A sturdy iron chestplate.'],
    [7,  'Iron Platelegs',    'armor',  3, 'platelegs',  4,  4, 4, 0,  20, 3, 0, 'Sturdy iron platelegs.'],
    [8,  'Iron Shield',       'armor',  3, 'shield',     3,  3, 3, 0,  20, 3, 0, 'A sturdy iron shield.'],
    [9,  'Bronze Kopesh',     'weapon', 2, 'weapon',     5,  0, 0, 0,  0,  2, 0, 'A curved bronze blade.'],
    [10, 'Bronze Stiletto',   'weapon', 2, 'weapon',     5,  0, 0, 0,  0,  2, 0, 'A slim bronze dagger.'],
    [11, 'Bronze Battleaxe',  'weapon', 2, 'weapon',     5,  0, 0, 0,  0,  2, 0, 'A heavy bronze axe.'],
    [12, 'Bronze Warhammer',  'weapon', 2, 'weapon',     5,  0, 0, 0,  0,  2, 0, 'A crushing bronze hammer.'],
    [13, 'Iron Kopesh',       'weapon', 3, 'weapon',     13, 1, 0, 20, 0,  3, 0, 'A curved iron blade.'],
    [14, 'Iron Stiletto',     'weapon', 3, 'weapon',     13, 1, 0, 20, 0,  3, 0, 'A slim iron dagger.'],
    [15, 'Iron Battleaxe',    'weapon', 3, 'weapon',     13, 1, 0, 20, 0,  3, 0, 'A heavy iron axe.'],
    [16, 'Iron Warhammer',    'weapon', 3, 'weapon',     13, 1, 0, 20, 0,  3, 0, 'A crushing iron hammer.'],
    [17, 'Cooked Chicken',    'food',   0, null,         0,  0, 0, 0,  0,  0, 1, 'Heals 5 HP. Stacks in bank only.'],
    [18, 'Gold',              'gold',   0, null,         0,  0, 0, 0,  0,  0, 1, 'Shiny currency.'],
    // Tier 1: Leather starter set (no requirements, stats just below Bronze)
    [19, 'Leather Helmet',      'armor', 1, 'helmet',     1, 0, 1, 0, 0, 1, 0, 'A simple leather coif.'],
    [20, 'Leather Jerkin',      'armor', 1, 'chestplate', 1, 1, 1, 0, 0, 1, 0, 'A padded leather jerkin.'],
    [21, 'Leather Platelegs',   'armor', 1, 'platelegs',  1, 1, 1, 0, 0, 1, 0, 'Hardened leather leg guards.'],
    [22, 'Leather Kite Shield', 'armor', 1, 'shield',     1, 0, 1, 0, 0, 1, 0, 'A light leather-bound shield.'],
    // Tiers 4-11: Steel -> Eternal (spec gear ladder, placeholder visuals). IDs 23-86.
    [23, 'Steel Helmet',       'armor',  4, 'helmet',    3,  3, 3, 0,  30, 4, 0, 'Tier 4 steel helmet.'],
    [24, 'Steel Chestplate',   'armor',  4, 'chestplate',10, 10,10,0,  30, 4, 0, 'Tier 4 steel chestplate.'],
    [25, 'Steel Platelegs',    'armor',  4, 'platelegs', 8,  8, 8, 0,  30, 4, 0, 'Tier 4 steel platelegs.'],
    [26, 'Steel Shield',       'armor',  4, 'shield',    5,  5, 5, 0,  30, 4, 0, 'Tier 4 steel shield.'],
    [27, 'Steel Kopesh',       'weapon', 4, 'weapon',    25, 1, 0, 30,0,  4, 0, 'Tier 4 steel kopesh.'],
    [28, 'Steel Stiletto',     'weapon', 4, 'weapon',    25, 1, 0, 30,0,  4, 0, 'Tier 4 steel stiletto.'],
    [29, 'Steel Battleaxe',    'weapon', 4, 'weapon',    25, 1, 0, 30,0,  4, 0, 'Tier 4 steel battleaxe.'],
    [30, 'Steel Warhammer',    'weapon', 4, 'weapon',    25, 1, 0, 30,0,  4, 0, 'Tier 4 steel warhammer.'],
    [31, 'Titanium Helmet',    'armor',  5, 'helmet',    4,  4, 4, 0,  50, 5, 0, 'Tier 5 titanium helmet.'],
    [32, 'Titanium Chestplate','armor',  5, 'chestplate',15, 15,15,0,  50, 5, 0, 'Tier 5 titanium chestplate.'],
    [33, 'Titanium Platelegs', 'armor',  5, 'platelegs', 11, 11,11,0,  50, 5, 0, 'Tier 5 titanium platelegs.'],
    [34, 'Titanium Shield',    'armor',  5, 'shield',    8,  8, 8, 0,  50, 5, 0, 'Tier 5 titanium shield.'],
    [35, 'Titanium Kopesh',    'weapon', 5, 'weapon',    38, 2, 0, 50,0,  5, 0, 'Tier 5 titanium kopesh.'],
    [36, 'Titanium Stiletto',  'weapon', 5, 'weapon',    38, 2, 0, 50,0,  5, 0, 'Tier 5 titanium stiletto.'],
    [37, 'Titanium Battleaxe', 'weapon', 5, 'weapon',    38, 2, 0, 50,0,  5, 0, 'Tier 5 titanium battleaxe.'],
    [38, 'Titanium Warhammer', 'weapon', 5, 'weapon',    38, 2, 0, 50,0,  5, 0, 'Tier 5 titanium warhammer.'],
    [39, 'Tungsten Helmet',    'armor',  6, 'helmet',    5,  5, 5, 0,  60, 6, 0, 'Tier 6 tungsten helmet.'],
    [40, 'Tungsten Chestplate','armor',  6, 'chestplate',21, 21,21,0,  60, 6, 0, 'Tier 6 tungsten chestplate.'],
    [41, 'Tungsten Platelegs', 'armor',  6, 'platelegs', 16, 16,16,0,  60, 6, 0, 'Tier 6 tungsten platelegs.'],
    [42, 'Tungsten Shield',    'armor',  6, 'shield',    11, 11,11,0,  60, 6, 0, 'Tier 6 tungsten shield.'],
    [43, 'Tungsten Kopesh',    'weapon', 6, 'weapon',    53, 1, 0, 60,0,  6, 0, 'Tier 6 tungsten kopesh.'],
    [44, 'Tungsten Stiletto',  'weapon', 6, 'weapon',    53, 1, 0, 60,0,  6, 0, 'Tier 6 tungsten stiletto.'],
    [45, 'Tungsten Battleaxe', 'weapon', 6, 'weapon',    53, 1, 0, 60,0,  6, 0, 'Tier 6 tungsten battleaxe.'],
    [46, 'Tungsten Warhammer', 'weapon', 6, 'weapon',    53, 1, 0, 60,0,  6, 0, 'Tier 6 tungsten warhammer.'],
    [47, 'Obsidian Helmet',    'armor',  7, 'helmet',    7,  7, 7, 0,  70, 7, 0, 'Tier 7 obsidian helmet.'],
    [48, 'Obsidian Chestplate','armor',  7, 'chestplate',28, 28,28,0,  70, 7, 0, 'Tier 7 obsidian chestplate.'],
    [49, 'Obsidian Platelegs', 'armor',  7, 'platelegs', 21, 21,21,0,  70, 7, 0, 'Tier 7 obsidian platelegs.'],
    [50, 'Obsidian Shield',    'armor',  7, 'shield',    14, 14,14,0,  70, 7, 0, 'Tier 7 obsidian shield.'],
    [51, 'Obsidian Kopesh',    'weapon', 7, 'weapon',    70, 2, 0, 70,0,  7, 0, 'Tier 7 obsidian kopesh.'],
    [52, 'Obsidian Stiletto',  'weapon', 7, 'weapon',    70, 2, 0, 70,0,  7, 0, 'Tier 7 obsidian stiletto.'],
    [53, 'Obsidian Battleaxe', 'weapon', 7, 'weapon',    70, 2, 0, 70,0,  7, 0, 'Tier 7 obsidian battleaxe.'],
    [54, 'Obsidian Warhammer', 'weapon', 7, 'weapon',    70, 2, 0, 70,0,  7, 0, 'Tier 7 obsidian warhammer.'],
    [55, 'Dragonite Helmet',   'armor',  8, 'helmet',    9,  9, 9, 0,  80, 8, 0, 'Tier 8 dragonite helmet.'],
    [56, 'Dragonite Chestplate','armor',  8, 'chestplate',35, 35,35,0,  80, 8, 0, 'Tier 8 dragonite chestplate.'],
    [57, 'Dragonite Platelegs','armor',  8, 'platelegs', 26, 26,26,0,  80, 8, 0, 'Tier 8 dragonite platelegs.'],
    [58, 'Dragonite Shield',   'armor',  8, 'shield',    18, 18,18,0,  80, 8, 0, 'Tier 8 dragonite shield.'],
    [59, 'Dragonite Kopesh',   'weapon', 8, 'weapon',    88, 2, 0, 80,0,  8, 0, 'Tier 8 dragonite kopesh.'],
    [60, 'Dragonite Stiletto', 'weapon', 8, 'weapon',    88, 2, 0, 80,0,  8, 0, 'Tier 8 dragonite stiletto.'],
    [61, 'Dragonite Battleaxe','weapon', 8, 'weapon',    88, 2, 0, 80,0,  8, 0, 'Tier 8 dragonite battleaxe.'],
    [62, 'Dragonite Warhammer','weapon', 8, 'weapon',    88, 2, 0, 80,0,  8, 0, 'Tier 8 dragonite warhammer.'],
    [63, 'Celestial Helmet',   'armor',  9, 'helmet',    11, 11,11,0,  85, 9, 0, 'Tier 9 celestial helmet.'],
    [64, 'Celestial Chestplate','armor',  9, 'chestplate',43, 43,43,0,  85, 9, 0, 'Tier 9 celestial chestplate.'],
    [65, 'Celestial Platelegs','armor',  9, 'platelegs', 32, 32,32,0,  85, 9, 0, 'Tier 9 celestial platelegs.'],
    [66, 'Celestial Shield',   'armor',  9, 'shield',    21, 21,21,0,  85, 9, 0, 'Tier 9 celestial shield.'],
    [67, 'Celestial Kopesh',   'weapon', 9, 'weapon',    107,3, 0, 85,0,  9, 0, 'Tier 9 celestial kopesh.'],
    [68, 'Celestial Stiletto', 'weapon', 9, 'weapon',    107,3, 0, 85,0,  9, 0, 'Tier 9 celestial stiletto.'],
    [69, 'Celestial Battleaxe','weapon', 9, 'weapon',    107,3, 0, 85,0,  9, 0, 'Tier 9 celestial battleaxe.'],
    [70, 'Celestial Warhammer','weapon', 9, 'weapon',    107,3, 0, 85,0,  9, 0, 'Tier 9 celestial warhammer.'],
    [71, 'Void Helmet',        'armor',  10, 'helmet',    13, 13,13,0,  90, 10,0, 'Tier 10 void helmet.'],
    [72, 'Void Chestplate',    'armor',  10, 'chestplate',51, 51,51,0,  90, 10,0, 'Tier 10 void chestplate.'],
    [73, 'Void Platelegs',     'armor',  10, 'platelegs', 38, 38,38,0,  90, 10,0, 'Tier 10 void platelegs.'],
    [74, 'Void Shield',        'armor',  10, 'shield',    26, 26,26,0,  90, 10,0, 'Tier 10 void shield.'],
    [75, 'Void Kopesh',        'weapon', 10, 'weapon',    128,4, 0, 90,0,  10,0, 'Tier 10 void kopesh.'],
    [76, 'Void Stiletto',      'weapon', 10, 'weapon',    128,4, 0, 90,0,  10,0, 'Tier 10 void stiletto.'],
    [77, 'Void Battleaxe',     'weapon', 10, 'weapon',    128,4, 0, 90,0,  10,0, 'Tier 10 void battleaxe.'],
    [78, 'Void Warhammer',     'weapon', 10, 'weapon',    128,4, 0, 90,0,  10,0, 'Tier 10 void warhammer.'],
    [79, 'Eternal Helmet',     'armor',  11, 'helmet',    15, 15,15,0,  100,11,0, 'Tier 11 eternal helmet.'],
    [80, 'Eternal Chestplate', 'armor',  11, 'chestplate',60, 60,60,0,  100,11,0, 'Tier 11 eternal chestplate.'],
    [81, 'Eternal Platelegs',  'armor',  11, 'platelegs', 45, 45,45,0,  100,11,0, 'Tier 11 eternal platelegs.'],
    [82, 'Eternal Shield',     'armor',  11, 'shield',    30, 30,30,0,  100,11,0, 'Tier 11 eternal shield.'],
    [83, 'Eternal Kopesh',     'weapon', 11, 'weapon',    150,5, 0, 100,0,  11,0, 'Tier 11 eternal kopesh.'],
    [84, 'Eternal Stiletto',   'weapon', 11, 'weapon',    150,5, 0, 100,0,  11,0, 'Tier 11 eternal stiletto.'],
    [85, 'Eternal Battleaxe',  'weapon', 11, 'weapon',    150,5, 0, 100,0,  11,0, 'Tier 11 eternal battleaxe.'],
    [86, 'Eternal Warhammer',  'weapon', 11, 'weapon',    150,5, 0, 100,0,  11,0, 'Tier 11 eternal warhammer.'],
  ];

  const seedAll = db.transaction(() => {
    for (const row of items) insert.run(row);
  });
  seedAll();
}

module.exports = { initDatabase };
