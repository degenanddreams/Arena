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
  ];

  const seedAll = db.transaction(() => {
    for (const row of items) insert.run(row);
  });
  seedAll();
}

module.exports = { initDatabase };
