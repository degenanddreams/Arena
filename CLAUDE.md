# CLAUDE.md — Arena Local Build

> **READ THIS ENTIRE FILE BEFORE TOUCHING ANY CODE.**
> This is the single source of truth for every architectural, mechanical, and data decision in this project.
> Do not invent, approximate, or assume anything not explicitly defined here.
> If something is not in this file, ask before implementing.

---

## 0. What This Project Is

Arena is a browser-based top-down RPG game inspired by Old School RuneScape. It is a **local single-player build** for development and testing purposes. The full game includes a Solana blockchain wagering system — that is **out of scope for this build**. All blockchain/wallet interactions are mocked with a hardcoded local test player.

The game has three zones:
1. **The Lobby** — central hub with NPCs (bank, merchants, shops)
2. **The Training Grounds** — combat training area with dummies
3. **The Boss Cave** — group boss encounter area

Players have three skills (Attack, Strength, Defense), equip gear, eat food, fight training dummies for XP, and fight a group boss for loot drops.

---

## 1. Tech Stack — Non-Negotiable

| Layer | Technology | Notes |
|---|---|---|
| Game engine | **Phaser 3** (latest stable) | CDN or npm. Handles tiles, sprites, camera, input |
| Renderer | **WebGL** with Canvas fallback | Phaser default |
| View | **Top-down overhead** (not isometric) | Similar to early Zelda / OSRS overhead angle |
| Frontend | HTML + vanilla JS | No React, no Vue, no frameworks |
| Backend | **Node.js + Express** | REST API only |
| Database | **SQLite** via `better-sqlite3` | Local file `arena.db` in `/server` |
| Package manager | **npm** | No yarn, no pnpm |
| No blockchain | All wallet calls mocked | `wallet_address = "test_wallet_001"` hardcoded |
| No localStorage | Never use localStorage or sessionStorage | All state in SQLite or server memory |
| No TypeScript | Plain JavaScript only | No .ts files, no type annotations |

---

## 2. Folder Structure — Create Exactly This

```
/arena
  CLAUDE.md               ← this file
  README.md
  package.json            ← root package (runs both server and client)
  /server
    server.js             ← Express entry point
    database.js           ← SQLite connection and schema init
    routes/
      player.js           ← /api/player routes
      items.js            ← /api/items routes
      combat.js           ← /api/combat routes (boss damage log etc)
    arena.db              ← SQLite database file (auto-created)
  /client
    index.html            ← game entry point, loads Phaser
    /js
      main.js             ← Phaser game config and scene list
      /scenes
        BootScene.js      ← preloads assets, checks for player record
        CharacterCreateScene.js
        GameScene.js      ← main game world (all three zones)
        UIScene.js        ← HUD overlay (runs parallel to GameScene)
        TutorialScene.js  ← tutorial boxes overlay
      /systems
        CombatSystem.js   ← all combat math (accuracy, max hit, damage rolls)
        XPSystem.js       ← XP formula, level derivation, level-up detection
        InventorySystem.js ← inventory/bank/equipment logic
        FoodSystem.js     ← eat mechanic, cooldown tracking
        BossSystem.js     ← boss HP, AOE, damage log, loot rolls
      /ui
        InventoryPanel.js
        SkillsPanel.js
        EquipmentPanel.js
        PlayerInfoPanel.js
        ChatLog.js
        HUD.js
      /config
        items.js          ← master item definitions
        dummies.js        ← dummy tier definitions
        boss.js           ← boss parameters
        xpTable.js        ← precomputed XP lookup table levels 0-100
      /assets
        /tilemaps
        /sprites
        /ui
```

---

## 3. Database Schema — Implement Exactly

### Table: `players`
```sql
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
```

> **Note:** Levels are DERIVED from XP using the XP formula — never store level as a separate column. Always compute level from XP at read time.

### Table: `inventory`
```sql
CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  quantity INTEGER DEFAULT 1,
  FOREIGN KEY (player_id) REFERENCES players(wallet_address),
  UNIQUE(player_id, slot)
);
```

> Inventory has 20 slots (0–19). No stacking in inventory. Each row = one item in one slot. Gold and food each occupy one slot per unit — no stacking.

### Table: `bank`
```sql
CREATE TABLE IF NOT EXISTS bank (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  quantity INTEGER DEFAULT 1,
  FOREIGN KEY (player_id) REFERENCES players(wallet_address),
  UNIQUE(player_id, slot)
);
```

> Bank has 100 slots (0–99). Items with the same item_id stack — increment quantity rather than creating a new row. Gear does not stack (each piece is a unique instance — do not stack gear).

### Table: `equipped`
```sql
CREATE TABLE IF NOT EXISTS equipped (
  player_id TEXT PRIMARY KEY,
  helmet_id INTEGER,
  chestplate_id INTEGER,
  platelegs_id INTEGER,
  shield_id INTEGER,
  weapon_id INTEGER,
  FOREIGN KEY (player_id) REFERENCES players(wallet_address)
);
```

### Table: `items`
```sql
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
```

---

## 4. Master Item Definitions — Seed Exactly

Seed these into the `items` table on first run. IDs must be stable.

### Armor (type = 'armor')

| ID | Name | Tier | Slot | Acc | Str | Def | Def Req | Gold Val |
|----|------|------|------|-----|-----|-----|---------|----------|
| 1 | Bronze Helmet | 1 | helmet | 1 | 1 | 1 | 0 | 1 |
| 2 | Bronze Chestplate | 1 | chestplate | 2 | 2 | 2 | 0 | 1 |
| 3 | Bronze Platelegs | 1 | platelegs | 2 | 2 | 2 | 0 | 1 |
| 4 | Bronze Shield | 1 | shield | 1 | 1 | 1 | 0 | 1 |
| 5 | Iron Helmet | 2 | helmet | 1 | 1 | 1 | 20 | 2 |
| 6 | Iron Chestplate | 2 | chestplate | 5 | 5 | 5 | 20 | 2 |
| 7 | Iron Platelegs | 2 | platelegs | 4 | 4 | 4 | 20 | 2 |
| 8 | Iron Shield | 2 | shield | 3 | 3 | 3 | 20 | 2 |

### Weapons (type = 'weapon')

| ID | Name | Tier | Slot | Acc Stat | Str Bonus | Atk Req | Gold Val |
|----|------|------|------|----------|-----------|---------|----------|
| 9 | Bronze Scimitar | 1 | weapon | 5 | 0 | 0 | 1 |
| 10 | Bronze Stiletto | 1 | weapon | 5 | 0 | 0 | 1 |
| 11 | Bronze Battleaxe | 1 | weapon | 5 | 0 | 0 | 1 |
| 12 | Bronze Warhammer | 1 | weapon | 5 | 0 | 0 | 1 |
| 13 | Iron Scimitar | 2 | weapon | 13 | 1 | 20 | 2 |
| 14 | Iron Stiletto | 2 | weapon | 13 | 1 | 20 | 2 |
| 15 | Iron Battleaxe | 2 | weapon | 13 | 1 | 20 | 2 |
| 16 | Iron Warhammer | 2 | weapon | 13 | 1 | 20 | 2 |

> Weapon `accuracy_stat` is the raw stat number — converted to % bonus using the formula in Section 6. Weapon `str_bonus` is the override max hit bonus (not a stat — applied directly to max hit calculation).

### Food (type = 'food')

| ID | Name | Heal | Stackable |
|----|------|------|-----------|
| 17 | Cooked Chicken | 5 | 0 (inventory) / 1 (bank) |

### Currency (type = 'gold')

| ID | Name | Stackable |
|----|------|-----------|
| 18 | Gold | 1 (both inventory and bank) |

---

## 5. Combat Formula — Implement Exactly, No Approximations

All combat calculations are **strictly linear and additive**. No multiplicative factors anywhere.

### Accuracy (% chance to hit)

```javascript
function calculateAccuracy(attacker, defender) {
  // attacker and defender are objects with: attack_level, defense_level,
  // total_accuracy_gear_stat, total_defense_gear_stat

  const base = 40;
  const attackBonus = attacker.attack_level * 0.25;
  const gearAccBonus = attacker.total_accuracy_gear_stat / 10;
  const defLevelPenalty = defender.defense_level * 0.1;
  const defGearPenalty = defender.total_defense_gear_stat / 30;

  const accuracy = base + attackBonus + gearAccBonus - defLevelPenalty - defGearPenalty;

  // Clamp: minimum 25%, maximum 80%
  return Math.max(25, Math.min(80, accuracy));
}
```

**Minimum possible accuracy:** 25% (emerges naturally from stat caps — no hard floor needed beyond the clamp)
**Maximum possible accuracy:** 80% (level 100 Attack + best gear vs no defense)

### Max Hit

```javascript
function calculateMaxHit(attacker) {
  // attacker has: strength_level, total_strength_gear_stat, weapon_str_bonus
  // weapon_str_bonus is a direct override (not a stat) — see item table

  const base = 5;
  const skillBonus = Math.floor(attacker.strength_level / 10);
  const gearBonus = Math.floor(attacker.total_strength_gear_stat / 15);
  // weapon_str_bonus is already accounted for in total_strength_gear_stat
  // via the item table strength_stat values

  return base + skillBonus + gearBonus;
}
```

**Minimum max hit:** 5 (no levels, no gear)
**Maximum max hit:** 25 (level 100 Strength + best-in-slot gear)

### Computing Total Gear Stats

```javascript
function computeGearStats(equippedItems) {
  // equippedItems is an array of item records from the items table
  // Each item has accuracy_stat, strength_stat, defense_stat
  // Weapons also have a str_bonus field (stored as strength_stat in items table
  // but applied differently — see weapon str_bonus note above)

  let totalAccuracy = 0;
  let totalStrength = 0;
  let totalDefense = 0;

  for (const item of equippedItems) {
    if (item.type === 'armor') {
      totalAccuracy += item.accuracy_stat;
      totalStrength += item.strength_stat;
      totalDefense += item.defense_stat;
    }
    if (item.type === 'weapon') {
      totalAccuracy += item.accuracy_stat;
      // weapon strength is a direct max hit bonus, handled in calculateMaxHit
    }
  }

  return { totalAccuracy, totalStrength, totalDefense };
}
```

### Attack Roll (per tick)

```javascript
function rollAttack(accuracy, maxHit, guaranteedHit = false) {
  if (guaranteedHit) {
    // Lv1 and Lv10 dummies only: always hits, rolls 1 to maxHit (never 0)
    const damage = Math.floor(Math.random() * maxHit) + 1;
    return { hit: true, damage };
  }

  const hits = Math.random() < (accuracy / 100);
  if (!hits) return { hit: false, damage: 0 };

  const damage = Math.floor(Math.random() * (maxHit + 1)); // 0 to maxHit inclusive
  return { hit: true, damage };
}
```

### Dummies — Defense Stats

All dummies have **zero defense stats and zero defense level**. Apply the formula with `defender.defense_level = 0` and `defender.total_defense_gear_stat = 0`.

---

## 6. XP System — Implement Exactly

### XP Formula

```javascript
// XP required to advance from level N to level N+1
function xpToNextLevel(level) {
  return Math.round(229.71 * Math.exp(0.084633 * level));
}
```

**Boundary conditions (do not modify the formula):**
- Level 1 → 2: **250 XP**
- Level 99 → 100: **1,000,000 XP**

### XP Lookup Table — Precompute on Startup

```javascript
// In /client/js/config/xpTable.js
// Precompute cumulative XP thresholds for levels 0-100
function buildXPTable() {
  const table = [0]; // table[N] = total XP needed to reach level N
  for (let level = 1; level <= 100; level++) {
    const xpForThisLevel = Math.round(229.71 * Math.exp(0.084633 * level));
    table.push(table[level - 1] + xpForThisLevel);
  }
  return table;
}

const XP_TABLE = buildXPTable();

// Derive level from cumulative XP
function levelFromXP(totalXP) {
  let level = 0;
  while (level < 100 && XP_TABLE[level + 1] <= totalXP) {
    level++;
  }
  return level;
}

// XP needed for next level up
function xpToNextLevelFromCurrent(totalXP) {
  const level = levelFromXP(totalXP);
  if (level >= 100) return 0;
  return XP_TABLE[level + 1] - totalXP;
}
```

### XP Award Rules

- XP is computed and awarded **only on confirmed kill** (target HP reaches 0)
- XP per hit = `damage_dealt * dummy.multiplier`
- The server maintains an in-memory damage log per training session: `{ player_id: { totalDamage, totalXP } }`
- On kill: sum the XP from the damage log, apply training style split, write to SQLite in one batch
- **Never write XP per hit** — only per kill
- If player disconnects mid-kill: discard in-memory log, award no XP

### Training Styles

```javascript
function applyTrainingStyle(xpAmount, style, currentSkillXP) {
  switch (style) {
    case 'attack':
      return { attack: xpAmount, strength: 0, defense: 0 };
    case 'strength':
      return { attack: 0, strength: xpAmount, defense: 0 };
    case 'defense':
      return { attack: 0, strength: 0, defense: xpAmount };
    case 'balanced':
      // Split equally, round UP per skill
      const perSkill = Math.ceil(xpAmount / 3);
      return { attack: perSkill, strength: perSkill, defense: perSkill };
    default:
      throw new Error(`Unknown training style: ${style}`);
  }
}
```

---

## 7. Dummy Configuration — Implement Exactly

```javascript
// /client/js/config/dummies.js
const DUMMIES = [
  { level: 1,  multiplier: 1,  unlockAt: 0,  guaranteedHit: true,  hp: 100 },
  { level: 10, multiplier: 5,  unlockAt: 10, guaranteedHit: true,  hp: 100 },
  { level: 20, multiplier: 10, unlockAt: 20, guaranteedHit: false, hp: 100 },
  { level: 30, multiplier: 15, unlockAt: 30, guaranteedHit: false, hp: 100 },
  { level: 40, multiplier: 20, unlockAt: 40, guaranteedHit: false, hp: 100 },
  { level: 50, multiplier: 25, unlockAt: 50, guaranteedHit: false, hp: 100 },
  { level: 60, multiplier: 30, unlockAt: 60, guaranteedHit: false, hp: 100 },
  { level: 70, multiplier: 35, unlockAt: 70, guaranteedHit: false, hp: 100 },
  { level: 80, multiplier: 40, unlockAt: 80, guaranteedHit: false, hp: 100 },
  { level: 85, multiplier: 45, unlockAt: 85, guaranteedHit: false, hp: 100 },
  { level: 90, multiplier: 50, unlockAt: 90, guaranteedHit: false, hp: 100 },
  { level: 100,multiplier: 55, unlockAt: 90, guaranteedHit: false, hp: 100 },
];

// A player can attack a dummy if their relevant skill level >= dummy.unlockAt
// Lv100 dummy is accessible from skill level 90+
function canAttackDummy(dummy, playerSkillLevel) {
  return playerSkillLevel >= dummy.unlockAt;
}
```

**3 dummies per tier** placed in Training Grounds for scalability. Each dummy instance is tracked independently (separate currentHp, separate attacker list).

**Dummy reset on death:** auto-reset to 100 HP after 1 tick (2.4 seconds). No manual re-engage needed — player auto-continues attacking if still in range.

---

## 8. Boss Configuration — Implement Exactly

```javascript
// /client/js/config/boss.js
const BOSS = {
  name: 'The Minotaur',
  maxHp: 2000,
  level: 150,
  defense_level: 0,
  defense_gear_stat: 0,
  aoe_damage: 10,
  aoe_interval_ticks: 8,        // fires every 8 ticks (19.2 seconds)
  aoe_warning_ticks: 2,         // warning ring appears 2 ticks before firing
  aoe_radius_tiles: 5,
  respawn_seconds: 1200,        // 20 minutes (use 120 for local testing)
  loot_damage_threshold: 25,    // minimum damage to qualify for loot roll
};

// Loot table — independent roll per qualifying player
const BOSS_LOOT_TABLE = [
  { chance: 0.35, reward: null },                    // nothing
  { chance: 0.30, reward: 'random_t1_armor' },       // random T1 armor piece
  { chance: 0.15, reward: 'random_t1_weapon' },      // random T1 weapon
  { chance: 0.15, reward: 'random_t2_armor' },       // random T2 armor piece
  { chance: 0.05, reward: 'random_t2_weapon' },      // random T2 weapon
];

function rollLoot() {
  const roll = Math.random();
  let cumulative = 0;
  for (const entry of BOSS_LOOT_TABLE) {
    cumulative += entry.chance;
    if (roll < cumulative) return entry.reward;
  }
  return null; // fallback
}

const T1_ARMOR_IDS = [1, 2, 3, 4];   // Bronze Helmet, Chest, Legs, Shield
const T1_WEAPON_IDS = [9, 10, 11, 12]; // Bronze weapons
const T2_ARMOR_IDS = [5, 6, 7, 8];   // Iron Helmet, Chest, Legs, Shield
const T2_WEAPON_IDS = [13, 14, 15, 16]; // Iron weapons

function resolveReward(reward) {
  if (!reward) return null;
  if (reward === 'random_t1_armor') return T1_ARMOR_IDS[Math.floor(Math.random() * 4)];
  if (reward === 'random_t1_weapon') return T1_WEAPON_IDS[Math.floor(Math.random() * 4)];
  if (reward === 'random_t2_armor') return T2_ARMOR_IDS[Math.floor(Math.random() * 4)];
  if (reward === 'random_t2_weapon') return T2_WEAPON_IDS[Math.floor(Math.random() * 4)];
  return null;
}
```

### Boss Damage Log (Server-Side In-Memory)

```javascript
// In server memory — NOT in SQLite
// Reset on each boss spawn
let bossDamageLog = {};  // { player_id: totalDamage }

function recordDamage(playerId, damage) {
  if (!bossDamageLog[playerId]) bossDamageLog[playerId] = 0;
  bossDamageLog[playerId] += damage;
}

function getQualifyingPlayers() {
  return Object.entries(bossDamageLog)
    .filter(([id, dmg]) => dmg >= BOSS.loot_damage_threshold)
    .map(([id]) => id);
}

function resetDamageLog() {
  bossDamageLog = {};
}
```

---

## 9. Tick System — Core Timing

```javascript
// TICK_DURATION_MS — the heartbeat of the entire game
const TICK_DURATION_MS = 2400; // 2.4 seconds = 1 tick

// All time-based events are expressed in ticks, never raw milliseconds in game logic
// Convert for Phaser timers: ticks * TICK_DURATION_MS

const TIMING = {
  ATTACK_TICKS: 4,           // attack every 4 ticks (9.6 seconds... wait:
  // Correction: attack speed is every 4 ticks = 4 * 2.4s = 9.6s? No.
  // OSRS tick = 0.6s. Arena tick = 2.4s (4x OSRS tick).
  // Attack speed = every 4 Arena ticks = 9.6s. That is too slow.
  // CORRECT INTERPRETATION:
  // The spec says "every 4 ticks (2.4 seconds real-time)"
  // This means: attack interval = 2.4 seconds = 1 Arena tick
  // The "4 ticks" refers to OSRS ticks (4 x 0.6s = 2.4s)
  // In Arena's own tick system: attack fires every 1 Arena tick = 2.4 seconds
  ATTACK_INTERVAL_MS: 2400,  // attack fires every 2.4 seconds

  EAT_COOLDOWN_MS: 2400,     // 1 tick between eating
  EAT_ATTACK_DELAY_TICKS: 1, // eating skips the next 1 attack

  BOSS_AOE_INTERVAL_MS: 8 * 2400,   // 19.2 seconds
  BOSS_AOE_WARNING_MS: 2 * 2400,    // 4.8 second warning before AOE fires

  DUMMY_RESET_MS: 2400,      // 1 tick dead time before dummy resets
  LEVEL_UP_POPUP_MS: 2000,   // level up notification shows for 2 seconds
  CHAT_BUBBLE_MS: 3500,      // text above player head lasts 3.5 seconds
  SPAWN_ZONE_TILES: 3,       // 3x3 spawn zone in lobby centre
};
```

---

## 10. Food System — Implement Exactly

```javascript
// /client/js/systems/FoodSystem.js
class FoodSystem {
  constructor() {
    this.eatCooldownRemaining = 0;   // ms remaining on eat cooldown
    this.attackDelayRemaining = 0;   // ticks to skip on next attack
  }

  canEat() {
    return this.eatCooldownRemaining <= 0;
  }

  eat(player) {
    if (!this.canEat()) return { success: false, reason: 'cooldown' };

    // Check inventory has Cooked Chicken (item_id 17)
    const chickenSlot = player.inventory.find(i => i.item_id === 17);
    if (!chickenSlot) return { success: false, reason: 'no_food' };

    // Apply heal — capped at 100, no overheal
    const newHp = Math.min(100, player.current_hp + 5);
    const actualHeal = newHp - player.current_hp;

    // Remove one chicken from inventory
    player.inventory = removeOneItem(player.inventory, 17);

    // Set cooldowns
    this.eatCooldownRemaining = TIMING.EAT_COOLDOWN_MS;
    this.attackDelayRemaining = TIMING.EAT_ATTACK_DELAY_TICKS;

    return { success: true, healAmount: actualHeal, newHp };
  }

  update(delta) {
    this.eatCooldownRemaining = Math.max(0, this.eatCooldownRemaining - delta);
  }

  // Called by combat loop before firing an attack
  consumeAttackDelay() {
    if (this.attackDelayRemaining > 0) {
      this.attackDelayRemaining--;
      return true; // skip this attack
    }
    return false; // proceed with attack
  }
}
```

**Food cannot be used in wager fights.** Wager fights are pre-computed simulations — no real-time interaction.

---

## 11. HP Rules — Implement Exactly

- Player starts at 100 HP on character creation
- HP **persists across zones and sessions** — saved to SQLite after every change
- HP is **never restored automatically** except by:
  1. Eating food (+5 per chicken, capped at 100, no overheal)
  2. Dying (respawn at full 100 HP)
  3. Winning a wager fight (winner restored to 100 HP — not relevant for local build)
- At 0 HP: player movement halted immediately, teleport to lobby spawn zone (random tile in 3x3 centre), restore to 100 HP
- In local build: death can only occur from boss AOE damage

---

## 12. Inventory Rules — Implement Exactly

### Inventory (20 slots, indices 0–19)
- Each slot holds exactly one item
- **No stacking in inventory** — every unit is its own slot
- Gold occupies one slot per coin — no stacking
- Food occupies one slot per chicken — no stacking
- If inventory full (20/20 items): block new item acquisition, show "Inventory full" message

### Bank (100 slots, indices 0–99)
- **Stackable items (food, gold) stack in bank** — same item_id in same slot, increment quantity
- Gear does **not** stack — each piece occupies its own slot
- Bank saves to SQLite on close — never save in real-time to prevent partial state
- Anti-duplication: when depositing, verify item exists in inventory before adding to bank. When withdrawing, verify bank slot has sufficient quantity.

### Equipment Slots
- 5 slots: helmet, chestplate, platelegs, shield, weapon
- Equipping an item: move from inventory to equipped table, free the inventory slot
- Unequipping: move from equipped back to inventory (must have a free inventory slot)
- Level requirements enforced on equip: check attack_req (weapons) or defense_req (armor) against player's current level

---

## 13. World Layout — Zone Definitions

The game world is a single continuous tilemap. Three zones are regions within it.

```javascript
const WORLD = {
  TILE_SIZE: 32,          // pixels per tile
  LOBBY: {
    name: 'Lobby',
    tileColor: 0x888888,  // grey stone
    // Contains: spawn zone (3x3 centre tiles), Bank NPC, Trading Merchant NPC,
    //           Food Shop NPC, Cosmetics Shop NPC (placeholder)
    // Doors at north wall lead to Training Grounds
  },
  TRAINING_GROUNDS: {
    name: 'Training Grounds',
    tileColor: 0x8B6914,  // dirt brown
    // Contains: 3 dummies per tier (12 tiers * 3 = 36 dummies total)
    // Cave entrance at far north end leads to Boss Cave
  },
  BOSS_CAVE: {
    name: 'Boss Cave',
    tileColor: 0x333333,  // dark stone
    // Contains: The Minotaur (fixed position, centre)
    // Respawn countdown timer visible on zone entry
  },
};

// Spawn zone: 3x3 tile area at geographic centre of Lobby
// On spawn: pick random tile within this zone
// If tile occupied: shift to nearest adjacent free tile
```

### Movement
- **Point-and-click:** left-click a tile to move there
- **Pathfinding:** A* algorithm, respects wall/obstacle tiles
- **Camera:** mouse scroll = zoom in/out, arrow keys = rotate 4 directions
- **Zone transitions:** seamless — walking into the doorway tile triggers zone entry
- No loading screens

---

## 14. Character Creation Screen

Shown on first launch if no player record exists for `test_wallet_001`.

```
Options (4 per category):
  Gender:        male | female
  Hair color:    blonde | brunette | black | white
  Skin tone:     light | tan | dark_tan | deep
  Clothing:      green | brown | blue | red

Display name:   text input, 3-20 characters, profanity filter applied
```

**On confirm:**
1. Insert player record into SQLite with chosen customisation and `tutorial_complete = 0`
2. Insert 1 gold (item_id 18) into inventory slot 0
3. Spawn player at lobby spawn zone
4. Trigger tutorial

**Profanity filter:** replace common English profanity with `***`. Use a simple word list — do not over-engineer.

---

## 15. Tutorial System

- Triggers after character creation if `tutorial_complete = 0`
- **Not replayable** — once `tutorial_complete = 1`, never shows again
- Does **not block gameplay** — player can move while boxes are visible
- Styled as dark-bordered info panels, less flashy than level-up popups
- Each box has a **Next** button. Final box has a **Done** button.
- On Done: `UPDATE players SET tutorial_complete = 1 WHERE wallet_address = 'test_wallet_001'`

**Tutorial sequence (16 boxes, one topic each):**
1. Welcome to Arena — what the game is, the core loop
2. Movement — left click to move, scroll to zoom, arrow keys to rotate
3. The Lobby — bank, merchants, shops, wager system location
4. Skills — Attack, Strength, Defense and what each does
5. The Training Grounds — location (through north lobby doors), attacking dummies
6. Training styles — Attack / Strength / Defense / Balanced, how XP splits
7. XP and leveling — XP awarded on kill only, levels unlock dummies and gear
8. Gear — armor and weapons, how to equip, level requirements, stat bonuses
9. Food and healing — buy chicken, eat it, +5 HP, eat cooldown, missed attack tradeoff
10. HP and death — HP persists everywhere, how to die, where you respawn
11. The Bank — location (in lobby), deposit/withdraw, stacking behaviour
12. Gold and merchants — earn gold by selling gear, spend it at food shop
13. The Boss — location (cave at back of Training Grounds), AOE warning ring, loot, 20min respawn
14. The Wager System — coming in V2 (placeholder box, no mechanic yet)
15. $ARENA token and cosmetics — coming soon (placeholder)
16. Player interface — the 4 panel buttons bottom-right: Inventory, Skills, Equipment, Player Info

---

## 16. UI Panels — 4 Buttons Bottom-Right

### Inventory Panel
- 4×5 grid (20 slots)
- Each slot shows item icon (placeholder colored square for now) and item name on hover
- Right-click item for context menu: **Equip** (gear only), **Eat** (food only), **Examine**, **Drop**
- Drop: removes item from inventory (lost — no ground items for now)

### Skills Panel
- Three rows: Attack, Strength, Defense
- Each row: skill name | level number | XP bar (current XP / XP to next level) | XP number
- Level derived from XP in real-time using `levelFromXP()`

### Equipment Panel
- 5 slots displayed as a character silhouette with slot positions:
  - Top centre: Helmet
  - Centre: Chestplate
  - Bottom centre: Platelegs
  - Left of centre: Shield
  - Right of centre: Weapon
- Click equipped item: unequip back to inventory (if space)
- Below slots: computed combat stats readout — Accuracy %, Max Hit, Defense bonus

### Player Info Panel
- Display name (editable text field — saves on Enter or focus-out)
- Wallet address: `test_wallet_001`
- Fight record: `Wins: 0 | Losses: 0`
- Current server: `Local Build`

---

## 17. HUD (Always Visible)

```
Top-left:
  [Player name]
  HP: [===========     ] 87/100  (red bar)

Bottom-right:
  [INV] [SKILLS] [EQUIP] [INFO]  (4 panel toggle buttons)

Boss Cave only (when in zone):
  "Minotaur respawns in: MM:SS"  (or "Minotaur is alive!" if up)

Level-up popup (centre screen, 2 seconds, non-blocking):
  Gold sparkle animation
  "Attack level up! Now level 12"
```

---

## 18. Chat System

- Collapsible panel bottom-left, default expanded
- Text input at bottom, Enter to send
- Messages format: `[PlayerName]: message text`
- Messages appear in log AND float above player head for 3.5 seconds in yellow
- Profanity filter on send (same word list as character creation)
- Max 100 messages in log before oldest are trimmed
- In local single-player: only the local player's messages appear (no network)

---

## 19. NPC Definitions

All NPCs are placed in the Lobby zone. Click to interact.

### Bank NPC
- Opens 10×10 bank grid (100 slots)
- Left panel: player inventory. Right panel: bank.
- Drag or click-to-transfer items between panels
- Saves on close — single atomic SQLite write for entire bank state

### Trading Merchant NPC
- Opens inventory view
- Player selects a gear item from inventory
- Merchant shows gold offer (item tier number = gold amount)
- Confirm: remove from inventory, add gold to inventory (or increment if gold already in inventory — but remember no stacking in inventory so each gold unit = one slot... wait:

> **IMPORTANT NOTE on gold stacking in inventory:**
> Gold is defined as stackable (stackable = 1 in items table). However Section 12 says "no stacking in inventory." Resolve this contradiction as follows: **Gold stacks in inventory as a single slot with a quantity counter.** This is a special exception for currency only. Gold and food are the only stackable-in-inventory items. Food does NOT stack in inventory. Only Gold stacks in inventory.

- Deduct one gold from merchant sale if player has gold: find player's gold inventory slot, increment quantity by gold_value. If no gold slot exists and inventory has space, create a new slot with quantity = gold_value.

### Food Shop NPC
- Opens simple shop interface
- Shows: Cooked Chicken | 10 for 1 gold | [Quantity selector] | [Buy]
- Quantity selector: multiples of 10 (10, 20, 30...) up to inventory space
- Deduct gold from inventory, add chickens to inventory (each occupies one slot)
- Block if inventory would overflow

### Cosmetics Shop NPC (Placeholder)
- Shows "Seasonal cosmetics coming soon — connect wallet to purchase $ARENA"
- No functional purchase in local build

---

## 20. API Routes

### POST `/api/player/create`
```json
Body: { "wallet_address": "test_wallet_001", "display_name": "TestPlayer",
        "gender": "male", "hair_color": "brunette", "skin_tone": "tan", "clothing_color": "green" }
Response: { "success": true, "player": { ...player record... } }
```

### GET `/api/player/:wallet_address`
```json
Response: { "player": { ...all fields... }, "level": { "attack": N, "strength": N, "defense": N },
            "inventory": [...], "bank": [...], "equipped": {...} }
```

### PUT `/api/player/:wallet_address`
```json
Body: { "current_hp": 87 }  // any subset of updatable fields
Response: { "success": true }
```

### POST `/api/combat/xp`
```json
Body: { "player_id": "test_wallet_001", "attack_xp": 0, "strength_xp": 150, "defense_xp": 0 }
Response: { "success": true, "new_xp": {...}, "level_ups": ["strength"] }
```

### POST `/api/inventory/equip`
```json
Body: { "player_id": "test_wallet_001", "item_id": 2, "from_slot": 3 }
Response: { "success": true } or { "success": false, "reason": "level_requirement_not_met" }
```

### POST `/api/inventory/unequip`
```json
Body: { "player_id": "test_wallet_001", "slot_type": "chestplate" }
Response: { "success": true } or { "success": false, "reason": "inventory_full" }
```

### POST `/api/inventory/sell`
```json
Body: { "player_id": "test_wallet_001", "inventory_slot": 5 }
Response: { "success": true, "gold_received": 1 }
```

### POST `/api/inventory/buy_food`
```json
Body: { "player_id": "test_wallet_001", "quantity": 10 }
Response: { "success": true } or { "success": false, "reason": "insufficient_gold" }
```

### POST `/api/bank/deposit`
```json
Body: { "player_id": "test_wallet_001", "inventory_slot": 4 }
Response: { "success": true }
```

### POST `/api/bank/withdraw`
```json
Body: { "player_id": "test_wallet_001", "bank_slot": 7 }
Response: { "success": true } or { "success": false, "reason": "inventory_full" }
```

### POST `/api/boss/damage`
```json
Body: { "player_id": "test_wallet_001", "damage": 45 }
Response: { "success": true, "total_damage": 145 }
```

### POST `/api/boss/kill`
```json
Body: { "player_id": "test_wallet_001" }
Response: { "loot_item_id": 3, "loot_item_name": "Bronze Platelegs" }
// or { "loot_item_id": null } if nothing dropped
```

---

## 21. Phaser Scene Structure

```javascript
// main.js — Phaser game config
const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  backgroundColor: '#1a1a1a',
  scene: [BootScene, CharacterCreateScene, GameScene, UIScene, TutorialScene],
  physics: { default: 'arcade' },
};

// Scene lifecycle:
// BootScene      → checks SQLite for existing player → if none: CharacterCreateScene → GameScene
//                                                     → if exists: GameScene directly
// GameScene      → main world (tilemap, player movement, NPCs, combat)
// UIScene        → runs in PARALLEL with GameScene (HUD, panels, chat) — use scene.launch()
// TutorialScene  → runs in PARALLEL, shows on top, auto-dismisses when tutorial_complete = 1
```

---

## 22. Hard Rules — Never Violate These

1. **Never approximate the combat formula** — use the exact JavaScript functions in Section 5
2. **Never store level in the database** — always derive from XP using `levelFromXP()`
3. **Never use localStorage or sessionStorage** — all state in SQLite or server memory
4. **Never award XP per hit** — only on confirmed kill
5. **Never stack food in inventory** — food occupies one slot per unit (gold is the only inventory exception)
6. **Never let HP exceed 100** — hard cap on all heal operations
7. **Never let accuracy exceed 80% or drop below 25%** — clamp in `calculateAccuracy()`
8. **Never allow food in wager fights** — wager fights are pre-computed simulations
9. **Never add features not in this file** — if a mechanic isn't here, ask before implementing
10. **Never skip the guaranteed hit logic** — Lv1 and Lv10 dummies always hit, roll 1 to maxHit
11. **Always read this file before starting any new task** — not optional
12. **Never modify the XP formula constants** — 229.71 and 0.084633 are locked

---

## 23. Build and Run

```bash
# Root package.json should have:
{
  "scripts": {
    "start": "node server/server.js",
    "dev": "nodemon server/server.js"
  }
}

# Install:
npm install express better-sqlite3 cors nodemon

# Run:
npm start
# Game at: http://localhost:3000
```

The server serves the `/client` folder as static files. `server.js` mounts both the API routes and the static file serving.

---

## 24. Local Build Simplifications (vs Full Spec)

These are intentional simplifications for the local build only:

| Full Spec | Local Build |
|-----------|-------------|
| Solana wallet connection | Hardcoded `test_wallet_001` |
| $ARENA on-chain purchase | Cosmetics shop is a placeholder |
| Wager fight escrow | No wagering — placeholder UI only |
| Multiple players / servers | Single player, local only |
| Postgres database | SQLite (`arena.db`) |
| Provably fair seed | Not needed — no wager fights |
| Geo-blocking / AML | Not applicable |
| Real-money settlement | Not applicable |
| Boss respawn: 20 minutes | Use 2 minutes for local testing |

---

## 25. What Comes Next (Do Not Implement Yet)

- Multi-player networking (WebSocket server, multiple concurrent players)
- Solana wallet integration (Phantom/Backpack)
- Wager fight flow (challenge, escrow, seed commitment, fight simulation, settlement)
- $ARENA token cosmetic purchases (on-chain burn)
- Marketplace (player-to-player gear listings)
- Additional gear tiers (T3 Steel, T4 Titanium, and beyond)
- Cosmetic system (seasonal sets, visual overlays)
- Leaderboards (requires multi-player)
- Chat across players (requires multi-player)
- Additional bosses and monsters

---

## 26. Implementation Status — As Built

> Sections 0–25 above are the original spec (the source of truth for *intended* design).
> Sections 26–33 below record what has actually been built and any places the
> implementation diverged. When spec and as-built disagree, the as-built notes in
> Section 28 are authoritative for the current code. Last updated: 2026-06-14.

**The local build is feature-complete against the spec, plus multiplayer Phases 1–3 (Section 32) are implemented** — presence/chat, server-authoritative combat, and the V1 wager system. All systems are wired end-to-end (client ↔ Socket.io/REST ↔ SQLite) and verified with no console errors. See §33 for the multiplayer as-built.

| Area | Status | Notes |
|---|---|---|
| Folder structure & DB schema (§2–3) | ✅ Done | All tables created + items seeded on first run |
| Master items seed (§4) | ✅ Done | IDs 1–18 stable |
| Combat math (§5) | ✅ Done | `CombatSystem.js` — exact functions, clamps verified |
| XP system + table (§6) | ✅ Done | `xpTable.js` / `XPSystem.js`; levels derived, never stored |
| Dummies (§7) | ✅ Done | 36 instances (12 tiers × 3), lock states, auto-reset |
| Boss encounter (§8) | ✅ Done | `BossSystem.js` — HP, AOE warning ring + 10 dmg, death/respawn, loot |
| Tick timing (§9) | ✅ Done | `timing.js`; 2400 ms attack interval |
| Food system (§10) | ✅ Done | `FoodSystem.js`; F key + right-click Eat; HP persisted |
| HP rules (§11) | ✅ Done | Cap 100, death → lobby respawn at full HP |
| Inventory / bank / equip (§12) | ✅ Done | 20 inv / 100 bank slots; gold-only inventory stacking |
| World + zones + pathfinding (§13) | ✅ Done | One tilemap, 3 zones, A* movement, camera zoom/rotate |
| Character creation (§14) | ✅ Done | Full DOM screen, live preview, validated name |
| Tutorial (§15) | ✅ Done | 16 boxes, parallel scene, sets `tutorial_complete` |
| UI panels (§16) | ✅ Done | Inventory, Skills, **Combat style**, Equipment, Player Info |
| HUD (§17) | ✅ Done | See §28 — **5** panel buttons now, plus combat-style indicator |
| Chat (§18) | ✅ Done | Log + input + floating bubble; now real-time multiplayer (§33) |
| NPCs (§19) | ✅ Done | Bank, Merchant, Food Shop, Cosmetics (placeholder) |
| API routes (§20) | ✅ Done | Plus added routes — see §28 |
| Scenes (§21) | ✅ Done | Boot → CharacterCreate/GameScene; UIScene + TutorialScene parallel |
| Art assets | ✅ Done | Real backgrounds + sprites via the pipeline in §27 |
| Motion / combat feel | ✅ Done | Tween-based sprite animation — see §31 |
| Multiplayer Phase 1 — presence + chat | ✅ Done | Socket.io; other players, movement sync, room chat — see §33 |
| Multiplayer Phase 2 — server combat | ✅ Done | Authoritative server-side attack loops, dummy/boss/AOE/XP — see §33 |
| Multiplayer Phase 3 — wager V1 | ✅ Done | Challenge → simulate → streamed replay → result; no real money — see §33 |
| Multiplayer Phase 4 — V2 wagering | ⛔ Not started | Solana escrow/settlement — out of scope (§32.9) |

---

## 27. Asset Pipeline (Added This Session)

Real art replaces the placeholder rectangles. Source images are opaque JPEG design
sheets; a Node script crops the subjects, removes their backgrounds, and emits
transparent PNGs plus a manifest the client reads.

### Files & flow
- **Source art** lives in `/client/assets/source/` (git-ignored-style working art; see its `README.md`).
- **`/scripts/prepare_assets.js`** (uses `sharp`) processes sources into:
  - `/client/assets/backgrounds/` — `lobby.jpg`, `training_grounds.jpg`, `boss_cave.jpg` (copied as-is)
  - `/client/assets/sprites/` — `dummy.png`, `boss.png`, `player_male.png`, `player_female.png` (cropped + background-removed)
- **`/client/assets/asset-manifest.js`** — auto-generated; lists only the assets that were actually produced. `GameScene.preload()` loads only what the manifest lists, so missing art produces **zero load errors** and the game falls back to placeholder shapes.

### Rebuild art
```bash
npm install sharp            # once
node scripts/prepare_assets.js
```
Re-run any time source art changes. Missing source files are reported and skipped (never fabricated).

### Background removal approach
Sources are design sheets (gradient / textured / parchment backgrounds), so a flat
colour key fails. The script uses **contiguous keying**: it samples a background
reference colour from a patch above each subject's head, then flood-fills inward
from the crop borders, removing only pixels within a per-image tolerance of that
reference. This follows non-uniform backgrounds but stops at the subject silhouette
(so the dark boss isn't erased). Crop boxes + tolerances live in `SPRITE_JOBS`.

### Rendering
- Each zone gets a background image at depth `-1` filling the zone's pixel bounds (alpha 0.85). When backgrounds are present the tile layer is dimmed to `0.35` so it reads as a faint grid behind the art (debug-friendly — see §30).
- Player / dummy / boss use the sprite if its texture loaded (`textures.exists()`), else the original coloured rectangle. Dummies tint dark when locked; the boss flashes red on AOE fire; the player sprite flips horizontally with movement direction.
- NPCs render as labelled colour circles with an invisible hit-rectangle preserving click behaviour.
- Damage splats: number on a coloured circle (red hit / dark-blue miss), float-up + fade.

---

## 28. Deviations & Clarifications from the Original Spec

These are real divergences in the current code. Treat them as authoritative.

1. **Levels are derived, never stored** (Hard Rule #2). The first prompt requested `*_level` DB columns; the schema in §3 (XP-only) was followed instead, with levels computed via `levelFromXP()` at read time.
2. **`better-sqlite3` is `^12`** (not v11). v11 won't build on Node 26; v12 ships prebuilt binaries for it.
3. **Combat router is mounted at `/api`** (not `/api/combat`) so both `/api/combat/xp` and `/api/boss/*` resolve per §20. Route paths inside the router carry their own `/combat` or `/boss` prefix.
4. **Added route `POST /api/inventory/remove_item`** `{ player_id, item_id, quantity, slot? }` — used by eating and dropping.
5. **Bank save is `POST /api/bank/save`**, not per-item `deposit`/`withdraw`. The bank UI edits a working copy and saves on close, replacing **both** bank *and* inventory atomically in one transaction (deposits mutate inventory too, so saving bank-only would duplicate items on reload).
6. **Profanity filter rejects rather than masks.** Character creation and display-name changes return `{ success: false, reason: 'profanity' }`. Input is normalised (lowercase + leet substitutions `@4301!$5` → letters, strip non-letters) before matching an expanded word list. A client-side mirror (`/client/js/config/profanity.js`) gives instant feedback and filters chat sends.
7. **Weapon strength bonus** is applied directly to max hit at the call site (`calculateMaxHit(...) + weapon_str_bonus`), per the §4 item-table note. `computeGearStats()` excludes weapon strength as written in §5. (No-op for bronze; iron weapons get +1.)
8. **Chat is local-only with no server route** (§18 says single-player, no network). Send/log/bubble are client-side; profanity is enforced client-side for chat. Boss "defeated/respawned" and loot messages use the same chat log.
9. **HUD has 5 panel buttons**, not 4: `INV · SKILLS · COMBAT · EQUIP · INFO` (a Combat Style panel was added). A persistent `Style: <name>` indicator sits under the HP bar. The player has **no in-world HP bar** — HP is shown in the HUD only (§17), so the §16-style "HP bar above the sprite" does not apply to the player.
10. **Combat style** (`player.activeTrainingStyle`, default `strength`) lives in memory (registry), never persisted. Left-clicking a dummy/boss attacks with the active style; right-click shows a single "Attack …" entry.
11. **Boss respawn is 120 s** for local testing (§24), configurable in `boss.js`.

---

## 29. Run / Rebuild (Current)

```bash
npm install                       # express, better-sqlite3, cors, nodemon, sharp
node scripts/prepare_assets.js    # (re)generate art from /client/assets/source/  (optional)
npm start                         # game at http://localhost:3000
```

- First run auto-creates and seeds `server/arena.db`. Delete it to reset (a fresh DB triggers the character-creation screen).
- Without running the asset pipeline, the game still runs with placeholder shapes and no errors.

---

## 30. Roadmap & Follow-ups

### Long-term (from §25 — still not implemented)
Multi-player networking · Solana wallet integration · wager fight flow (challenge, escrow, seed commitment, simulation, settlement) · $ARENA on-chain cosmetic purchases · marketplace · additional gear tiers (T3 Steel, T4 Titanium…) · cosmetic system · leaderboards · cross-player chat · additional bosses/monsters.

Currently present as **placeholders** pending those systems: the Cosmetics shop, the wager-system tutorial box (#14), the $ARENA tutorial box (#15), and the player right-click "Attack/Wager (Coming Soon)" stub.

### Near-term follow-ups / tech debt (surfaced this session)
- **Sprite file sizes**: `dummy.png` is ~1.1 MB at 595×965 — far larger than its ~32 px in-game size. Downscale sprite outputs in the pipeline for faster loads (rendering scales by texture width, so any size works).
- **Background debug alpha**: the tile layer is dimmed to `0.35` and backgrounds are at `0.85` for debugging — tighten/remove for production.
- **Boss cutout artifact**: a small piece of the design sheet's "FRONT" mini-view remains at the top-right of `boss.png` (can't crop tighter without clipping the bull's rear). Replace with a dedicated boss sprite if a cleaner source becomes available.
- **Profanity filter** is substring-based on a normalised string; revisit if stronger moderation is needed.

---

## 31. Motion & Combat-Feel Animations (Added This Session)

Programmatic, tween-based animation only — **no new image assets**, and **no changes
to game logic, combat math, server routes, or system files**. All of it lives in
`GameScene.js`. Key principle: the player/dummy/boss **containers** are counter-rotated
each frame for the camera, so every animation drives the **body child's** local
rotation / x-y offset / scale and never disturbs pathfinding, combat targeting, or the camera.

### Player
- **Facing flip**: body `flipX` set on the horizontal component of each step *before* the move tween — left / down-left → flipped, right / down-right → normal, pure vertical → unchanged.
- **Idle bob**: ±2px sine on body y, 1800ms/cycle, `Sine.easeInOut`; starts after 500ms standing still and only when out of combat; stops the instant movement or combat begins.
- **Walk cycle**: ±3px vertical bob driven by **distance travelled** (one oscillation per 2 tiles), computed in `update()` from per-frame container movement — not a timer; stops on arrival.
- **Attack lunge**: on a landed hit (damage > 0) vs a dummy or the boss, the body nudges 6px toward the target (120ms out / 80ms back) along the target angle. Pure body offset.

### Dummies
- **Idle sway**: unlocked, alive dummies rock ±0.04 rad on a 2200ms sine, phase-offset by `id × 300ms` so they're out of sync. Locked / dead / mid-recoil dummies stay static. Driven programmatically in `update()`.
- **Hit recoil**: +0.15 rad tilt (80ms) then settle (120ms); a `recoiling` flag makes the idle-sway yield control of `body.rotation` until it finishes.
- **Miss pulse**: body alpha 0.6 → 1.0 over 200ms.
- **Reset pop**: existing fade-in flash plus a scale pop (×1.15 yoyo over 400ms, relative to the sprite's base scale) when the dummy returns to full HP.

### Boss
- **Idle**: simultaneous breathing scale (×1.0↔1.04, 2600ms) and left-right sway (±4px, 3200ms), both yoyo loops; sway runs continuously.
- **AOE telegraph (Section 8 of the prompt was truncated — implemented as a wind-up)**: during the 2-tick warning window (detected read-only via `bossSystem.aoeWarningActive`, since `BossSystem.js` is off-limits), the calm breathing is replaced by a faster/larger pulse (×1.09, 250ms). On fire it ends and the boss does its existing red flash. Boss death/respawn transitions clear the telegraph and restore breathing.

All animation state (idle/lunge tweens, walk distance, sway phase, telegraph) is transient and visual; nothing is persisted. Verified: clean console over a long run, with the per-frame motion + sway loops and the idle/boss tweens all executing without error.

---

*Sections 0–25 are the original build spec; Sections 26–31 + §33 record the as-built state; Section 32 defines the multiplayer architecture (Phases 1–3 now built — see §33). The build is complete and runnable per Section 29.*

---

## 32. Multiplayer Architecture — Next Build Phase

> This section defines every architectural decision for the multiplayer build. Do not deviate from it. If something is unclear, ask before implementing.

### 32.1 Core Principle — Authoritative Server

The current build is client-authoritative (client runs combat loops, tells server what happened). **This must change for multiplayer.** All game-critical outcomes are computed server-side. The client is a display layer only — it sends intentions and animates results.

**Client tells server:** "I am attacking dummy_lv10_0 with strength style."
**Server tells client:** "You hit for 7 damage. Dummy HP is now 43."
**Client never computes combat outcomes — only animates what the server reports.**

### 32.2 Technology — Non-Negotiable

| Layer | Choice | Reason |
|---|---|---|
| Real-time comms | **Socket.io** | WebSocket with fallback, rooms built-in, works with existing Express server |
| Game loop | **Server-side setInterval** | 2400ms tick drives all combat server-side |
| State sync | **Delta broadcasts** | Only changed fields per tick, not full world state |
| Player sessions | **Socket ID + wallet address** | Socket ID for connection lifetime, wallet for persistent DB data |
| Server instances | **Socket.io rooms** | One room = one game world. Players join a room on login. |
| Movement | **Client-authoritative with server validation** | Client pathfinds locally for responsiveness, syncs position every 500ms |

Install: `npm install socket.io`

### 32.3 Server-Side World State

One `worldState` object per server room (in memory, not in DB):

```javascript
const worldState = {
  players: {
    'wallet_001': {
      socketId: 'abc123',
      displayName: 'TestPlayer',
      x: 45, y: 74,              // tile coordinates (authoritative)
      currentHp: 87,
      activeTrainingStyle: 'strength',
      combatTarget: null,         // { type: 'dummy', id: 'dummy_lv10_0' } | { type: 'boss' } | null
      busyUntil: null,            // timestamp — wager busy flag
      lastPositionUpdate: Date.now(),
    }
  },
  dummies: {
    'dummy_lv10_0': {
      tierId: 10,
      currentHp: 100,
      attackers: ['wallet_001', 'wallet_002'],  // all current attackers
    },
    // one entry per dummy instance (3 per tier × 12 tiers = 36 total)
  },
  boss: {
    currentHp: 2000,
    state: 'ALIVE',              // 'ALIVE' | 'DEAD'
    aoeTimer: 19200,             // ms until next AOE
    aoeWarningActive: false,
    respawnTimer: 0,
    damageLog: { 'wallet_001': 450, 'wallet_002': 230 },
  },
  chat: [],                      // last 100 messages [{ name, message, timestamp }]
};
```

### 32.4 Socket Event Dictionary

Every event has a defined name, direction, and payload. Never invent new event names.

**Client → Server (player intentions):**

| Event | Payload | Meaning |
|---|---|---|
| `join_room` | `{ wallet_address, display_name, room_id? }` | Player connects and joins a room |
| `player_move` | `{ x, y }` | Player's current tile position (sent every 500ms while moving) |
| `start_attack` | `{ target_type: 'dummy'\|'boss', target_id: string, style: string }` | Begin auto-attacking a target |
| `stop_attack` | `{}` | Player stops attacking (walks away, opens panel, etc.) |
| `eat_food` | `{}` | Player eats a chicken |
| `send_chat` | `{ message: string }` | Chat message (server filters and broadcasts) |
| `challenge_wager` | `{ target_wallet, amount, currency }` | Send a wager challenge |
| `accept_wager` | `{ challenge_id }` | Accept incoming challenge |
| `decline_wager` | `{ challenge_id }` | Decline incoming challenge |
| `confirm_wager` | `{ challenge_id }` | Challenger confirms after accepter signs |
| `cancel_wager` | `{ challenge_id }` | Challenger cancels after accepter signed |

**Server → Client (state updates):**

| Event | Payload | Meaning |
|---|---|---|
| `room_joined` | `{ room_id, players: [...], boss: {...}, dummies: {...} }` | Full initial world state on join |
| `player_joined` | `{ wallet_address, display_name, x, y, currentHp }` | Another player entered the room |
| `player_left` | `{ wallet_address }` | Player disconnected |
| `player_moved` | `{ wallet_address, x, y }` | Another player's position update |
| `combat_hit` | `{ attackerId, targetType, targetId, damage, targetHp }` | A hit landed — animate splat and update HP bar |
| `combat_miss` | `{ attackerId, targetType, targetId }` | A miss — animate blue 0 |
| `dummy_kill` | `{ dummyId, attackerXp: { wallet: xpGained }, newHp: 100 }` | Dummy died, XP awarded, dummy resetting |
| `level_up` | `{ wallet_address, skill, newLevel }` | A player levelled up |
| `boss_aoe_warning` | `{}` | Warning ring should appear (4.8s before AOE fires) |
| `boss_aoe_fire` | `{ hitWallets: ['wallet_001'] }` | AOE fired — named players take 10 damage |
| `boss_died` | `{ loot: { wallet_address: { item_id, item_name } } }` | Boss dead, loot per qualifying player |
| `boss_respawned` | `{}` | Boss is back at full HP |
| `player_died` | `{ wallet_address }` | A player reached 0 HP — respawn them at lobby |
| `chat_message` | `{ name, message, timestamp }` | Broadcast chat to all in room |
| `wager_challenge` | `{ challenge_id, from_wallet, from_name, from_levels, amount, currency }` | Incoming challenge to the target player |
| `wager_accepted` | `{ challenge_id, to_wallet, to_name, to_levels }` | Challenger told accepter signed |
| `wager_declined` | `{ challenge_id }` | Challenge was declined |
| `wager_cancelled` | `{ challenge_id, penalty_paid: true|false }` | Challenger cancelled after accept |
| `wager_fight_tick` | `{ tick, attackerId, damage, defenderHp }` | One tick of fight replay streamed to both players |
| `wager_fight_result` | `{ winner_wallet, loser_wallet, amount, currency }` | Fight over, show result screen |

### 32.5 Server-Side Combat Loop

Replace the client-side `setInterval` attack loops with server-side ones:

```javascript
// One interval per active attacker — created on start_attack, cleared on stop_attack or death
function startCombatLoop(attackerWalletId, target, room) {
  const interval = setInterval(() => {
    const player = worldState[room].players[attackerWalletId];
    const dummy = worldState[room].dummies[target.id];
    if (!player || !dummy || dummy.currentHp <= 0) {
      clearInterval(interval);
      return;
    }

    // All math uses the same CombatSystem functions — require() them server-side
    const attacker = buildAttackerStats(player);        // reads from DB or cache
    const defender = { defense_level: 0, defense_gear_stat: 0 }; // dummies have no defense
    const result = rollAttack(
      calculateAccuracy(attacker, defender),
      calculateMaxHit(attacker),
      dummy.tierId <= 10  // guaranteedHit for Lv1 and Lv10
    );

    dummy.currentHp = Math.max(0, dummy.currentHp - result.damage);
    dummy.attackerLog[attackerWalletId] = (dummy.attackerLog[attackerWalletId] || 0) + result.damage;

    // Broadcast to entire room
    io.to(room).emit(result.damage > 0 ? 'combat_hit' : 'combat_miss', {
      attackerId: attackerWalletId,
      targetType: 'dummy',
      targetId: target.id,
      damage: result.damage,
      targetHp: dummy.currentHp,
    });

    if (dummy.currentHp <= 0) {
      handleDummyKill(dummy, room);
    }
  }, 2400);

  combatIntervals[attackerWalletId] = interval;
}
```

**Key rules:**
- `CombatSystem.js` functions must be importable by both client and server — either copy to `/server/systems/` or make them CommonJS modules
- Attack intervals are stored in a server-side map: `combatIntervals[wallet_address]`
- Clearing an interval on `stop_attack`, disconnect, or player death is mandatory — never leave orphaned intervals
- Boss AOE runs on its own server-side interval independent of any player

### 32.6 Movement Sync

```
Client:
  - Handles own pathfinding and movement locally (unchanged from single-player)
  - Emits player_move { x, y } every 500ms while moving
  - Stops emitting when movement stops

Server:
  - Receives player_move, validates: distance from last known position <= max tiles per 500ms
  - If valid: updates worldState.players[wallet].x/y, broadcasts player_moved to rest of room
  - If invalid (teleport cheat): reject and emit corrected position back to the cheating client

Other clients:
  - Receive player_moved
  - Tween the other player's sprite smoothly to the new position over 500ms (Phaser tween)
  - This gives smooth interpolated movement for other players despite 500ms update interval
```

### 32.7 Room/Server Model

```
One Node.js process = one game world = one Socket.io room (named 'server_1', 'server_2', etc.)

On connect:
  - If room_id provided: join that room (manual server switch)
  - Else: auto-join least-populated room under 200 players

Each room has its own:
  - worldState object (players, dummies, boss)
  - Boss respawn timer
  - Active combat intervals map
  - Chat history (last 100 messages)

All rooms share:
  - SQLite database (XP, inventory, bank, stats — global per wallet)
  - Leaderboard reads (global across all rooms)

V1 multiplayer: single room only. Multi-room scaling comes later.
```

### 32.8 Wager Fight — Server-Side Simulation

```javascript
async function runWagerFight(challengeId, playerAWallet, playerBWallet, room) {
  // 1. Snapshot both players' stats from DB at this exact moment
  const statsA = await readPlayerStats(playerAWallet);
  const statsB = await readPlayerStats(playerBWallet);

  // 2. Mark both players as busy
  worldState[room].players[playerAWallet].busyUntil = Infinity;
  worldState[room].players[playerBWallet].busyUntil = Infinity;

  // 3. Generate fight seed (V1: server entropy only. V2: combine wallet signatures)
  const seed = generateFightSeed(statsA, statsB);

  // 4. Run FULL simulation synchronously — all ticks computed instantly
  const fightLog = simulateFight(statsA, statsB, seed);
  // fightLog = [{ tick, attackerId, damage, defenderHp }, ...]

  // 5. Stream fight log to both players tick by tick at 2400ms intervals
  for (let i = 0; i < fightLog.length; i++) {
    await delay(2400);
    io.to(playerAWallet).emit('wager_fight_tick', fightLog[i]);
    io.to(playerBWallet).emit('wager_fight_tick', fightLog[i]);
  }

  // 6. Declare result
  const winner = fightLog[fightLog.length - 1].defenderHp <= 0
    ? (fightLog[fightLog.length - 1].attackerId === playerAWallet ? playerAWallet : playerBWallet)
    : playerBWallet;

  // 7. Update fight records in DB
  await updateFightRecord(winner, 'win');
  await updateFightRecord(winner === playerAWallet ? playerBWallet : playerAWallet, 'loss');

  // 8. Emit result to both players
  io.to(playerAWallet).emit('wager_fight_result', { winner_wallet: winner, ... });
  io.to(playerBWallet).emit('wager_fight_result', { winner_wallet: winner, ... });

  // 9. Clear busy flags, reset HP for both players
  worldState[room].players[playerAWallet].busyUntil = null;
  worldState[room].players[playerBWallet].busyUntil = null;

  // V2: trigger escrow release here
}
```

**Busy flag enforcement:** any `start_attack`, `challenge_wager`, or `accept_wager` from a busy player is rejected with `{ error: 'player_busy' }`. The client shows "Player is busy" to the challenger.

### 32.9 Build Phases

Build in this exact order. Do not start Phase 2 until Phase 1 is verified working.

> Status: Phases 1, 2, and 3 are **complete and verified** (see §33). Phase 4 is not started.

**Phase 1 — Presence and chat** ✅ Done
- Socket.io installed and mounted on the existing Express server
- Players can see each other in the lobby (other player sprites rendered)
- Position sync: player movement visible to other players (500ms updates, interpolated)
- Chat broadcasts across all clients in the room
- Player joined/left notifications in chat
- Verify: open two browser windows, move in one, see movement in the other

**Phase 2 — Shared combat** ✅ Done
- Combat loops moved server-side (client sends `start_attack`, server runs the interval)
- Multiple players can attack the same dummy simultaneously
- XP correctly split per attacker from `attackerLog` on kill
- Boss fight works with real group: all players see same HP bar, AOE hits all in-range players
- Verify: two windows attacking same dummy, both get XP on kill

**Phase 3 — Wager system V1 (no real money)** ✅ Done
- Challenge flow: right-click player → Wager, challenge interface, accept/decline
- Wager fight simulation server-side, streamed tick by tick to both clients
- Result screen, fight record updated in DB
- Both players locked as busy during fight, visible to room as "IN FIGHT"
- Verify: two windows wager against each other, fight plays out, winner/loser screen

**Phase 4 — V2 wagering (separate build, requires Solana integration)** ⛔ Not started
- Not in scope until Phase 3 is verified and Curaçao license is obtained

### 32.10 Hard Rules for Multiplayer

1. **Never compute combat outcomes on the client** — client animates, server decides
2. **Always clear combat intervals** on disconnect, stop_attack, and player death — orphaned intervals are a server memory leak
3. **Never trust client-reported damage** — server computes all damage rolls
4. **worldState is in-memory only** — never write worldState to SQLite directly; only write derived results (XP, HP, inventory changes) to the DB
5. **CombatSystem.js must work in both client and server contexts** — use CommonJS exports (`module.exports`) not ES module syntax
6. **Wager fight result is final** — no server-side mechanism to reverse a fight outcome once the fight log is committed
7. **Position validation is mandatory** — reject impossible position jumps to prevent teleport cheating
8. **One socket per wallet** — if the same wallet connects twice, disconnect the older session

---

## 33. Multiplayer — As Built (Phases 1–3)

Implements Section 32 Phases 1–3. The server is the authority for combat and
wagers; the client sends intentions and animates results. Last updated: 2026-06-15.

### Files
- `server/multiplayer.js` — all Socket.io logic: presence, chat, world state, server-side combat loops, boss AOE, and the wager flow.
- `server/systems/CombatSystem.js`, `server/systems/XPSystem.js` — CommonJS copies of the client combat/XP math, byte-identical (Hard Rule #5).
- `server/profanity.js` — shared chat/name filter (also used by `routes/player.js`'s logic).
- `client/js/systems/NetworkManager.js` — `network` singleton; all client emit/on.
- `client/js/ui/WagerUI.js` — challenge panel, incoming/accept modals, fight overlay, result screen.
- `server.js` now creates an `http` server + Socket.io alongside the (unchanged) REST routes.

### Phase 1 — Presence & chat
- Single room `server_1`. `worldState` holds players + chat (last 100).
- Other players render as sprites (name + HP bar); movement syncs every 500ms and tweens smoothly. Join/leave + chat appear in the chat log.
- **Identity:** keyed by `wallet_address` with strict one-socket-per-wallet (Hard Rule #8). The client reads `?wallet=` / `?name=` (default `test_wallet_001`) so two browser windows can test as distinct wallets — open the 2nd as `?wallet=test_wallet_002&name=Tester2`. Unknown wallets default to HP 100 / lobby spawn.

### Phase 2 — Server-authoritative combat
- Client `setInterval` combat loops were **removed**. The client emits `start_attack`/`stop_attack` once it reaches the target; the server runs the 2400ms (`TICK_MS`) attack loop, rolls every hit, owns dummy/boss HP, and broadcasts `combat_hit`/`combat_miss`/`dummy_kill`/`dummy_reset`/`level_up`.
- Dummies keyed `dummy_lv{level}_{j}` (36). Multiple players share a dummy's HP; XP splits per attacker by their own style on kill, written to SQLite; `level_up` emitted to the leveling player only.
- A single always-on boss-AOE interval drives `boss_aoe_warning`/`boss_aoe_fire` (10 guaranteed damage to in-range players, HP persisted, death→respawn via `player_died`), plus `boss_died`/`boss_respawned`.
- `BossSystem.js` is now **visual-only** (HP bar, sprite visibility, server-driven warning ring + respawn countdown) — its AOE timer was removed.
- Combat intervals cleared on `stop_attack`, disconnect, and death (Hard Rule #2). `start_attack` also stops on movement, eating, opening a panel/NPC.

### Phase 3 — Wager system (V1, no real money)
- `wager_challenges` DB table added (record-keeping; a row is written on completion). Live challenge state lives in `worldState.challenges`.
- Flow: right-click another player → **Wager** → challenge panel (USDC $1–$5000 / SOL ≥0.01) → `challenge_wager`. Target sees an Accept/Decline modal; challenger then sees an Accept→Confirm/Cancel modal. The fight starts **only on `confirm_wager`** (Hard Rule #1).
- `runWagerFight()` precomputes the entire fight synchronously (both at 100 HP, alternating attacks, **no food**), then streams the precomputed log tick-by-tick. On completion: wins/losses written, both reset to 100 HP, `wager_fight_result` emitted, challenge deleted.
- **Busy flag:** both players are busy from `accept_wager` through fight completion; `start_attack`/`challenge_wager`/`accept_wager` from a busy player are rejected (`error: player_busy`). Disconnect tears down any non-running challenge so no one is left stuck busy.

### Deviations / notes (authoritative for current code)
1. **Wager replay cadence is 500ms**, not the 2400ms combat tick — `WAGER_REPLAY_INTERVAL_MS` in `multiplayer.js`. The fight is precomputed, so the stream rate is purely cosmetic; 2400ms made fights 1.5–8 min long. `TICK_MS` (combat) is unchanged at 2400ms.
2. **Local signing is a plain confirm** — no real wallet popup, escrow, or transfer in V1 (Hard Rule #5 of this phase). The result screen's payout line is informational only.
3. **Chat is now networked** (was local-only in the pre-multiplayer build — supersedes the §28 note).
4. **Non-DB wallets** (e.g. a `?wallet=` value with no players row) can play but get no persisted XP/wins/losses — a property of the single-DB-wallet local test setup, not a bug.
5. The prompt that built this referenced "Sections 4.3/4.4" for the wager spec; those don't exist — the authoritative wager spec is **§32.4 (events) + §32.8 (simulation)** plus the food/HP rules (no food in wagers; winner restored to full HP).

---

## 34. 2.5D Rendering Migration — As Built

Completed 2026-06-15. The game world is now rendered as a 2.5D hybrid: Three.js
handles the 3D ground, camera, and entity billboards; Phaser is a transparent
static overlay handling all UI, input, and HUD. Last updated: 2026-06-15.

### Architecture

```
index.html
  #game (position: relative, 1280×720)
    #threejs-canvas   z-index:0  pointer-events:none  ← Three.js world
    phaser canvas     z-index:1  transparent:true      ← Phaser UI overlay
```

Three.js loaded via CDN: `https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.min.js`
(r159 — last version shipping a global UMD build. r161+ removed three.min.js entirely.)

enable3d was ruled out: ESM-only, no CDN-loadable UMD bundle compatible with the
no-build-step constraint.

### New Files
- `client/js/systems/ThreeScene.js` — singleton managing the entire Three.js layer:
  ground planes, billboard sprites (player, other players, dummies, boss), camera
  rig, AOE ring, screen-space projection, and raycasting.

### Modified Files
- `client/js/scenes/GameScene.js` — Phaser bodies set to `setAlpha(0)`; all visuals
  moved to ThreeScene billboards. Single scene-level `pointerdown` handler replaces
  per-body `setInteractive()` (tile-coordinate matching). Phase 6 update loop
  projects all floating UI (health bars, labels) to screen space each frame.
- `client/js/config/timing.js` — `CAMERA` block drives the Three.js rig:
  `ROTATION_SPEED`, `PITCH_SPEED/DEFAULT/MIN/MAX`, `DIST_DEFAULT/MIN/MAX`.
- `client/index.html` — dual-canvas CSS stack; Three.js CDN tag before Phaser.
- `client/js/ui/WagerUI.js` — fight overlay updated with player sprites, lunge/flash
  animations, floating damage numbers, and HP bar drain.

### Camera Controls
| Input | Action |
|---|---|
| Left / Right arrows | Orbit camera around player (continuous, ROTATION_SPEED rad/s) |
| Up / Down arrows | Pitch camera between overhead and oblique (PITCH_MIN–MAX) |
| Scroll wheel | Dolly zoom (DIST_MIN–MAX tile units) |

### Entity Rendering
| Entity | Renderer | Asset |
|---|---|---|
| Ground (3 zones) | Three.js PlaneGeometry | backgrounds/lobby.jpg, training_grounds.jpg, boss_cave.jpg |
| Player | Three.js Sprite billboard | sprites/player_male.png (placeholder — real spritesheet TBD) |
| Other players | Three.js Sprite billboard | sprites/player_male.png or player_female.png |
| Training dummies (36) | Three.js Sprite billboards | sprites/dummy.png |
| Group boss | Three.js Sprite billboard | sprites/boss.png (dark — needs better art) |
| Boss AOE ring | Three.js RingGeometry on y=0 | Procedural (no texture) |

### Click Detection
Phaser `pointerdown` → `ThreeScene.getGroundPositionFromScreen(x,y)` → raycasts
Three.js camera against `THREE.Plane(y=0)` → returns `{tileX, tileZ}` → matched
against dummy tile positions and `BOSS_FOOTPRINT` (3×3 tiles) → dispatches attack
or `moveTo()`. Red click marker for attack targets, yellow for movement.

### UI Tracking
`ThreeScene.getScreenPosition(worldX, worldZ, heightOffset)` projects 3D world
positions to Phaser screen coordinates. Called every frame in `update()` for:
dummy labels + HP bars (height 1.8), boss label + HP bar (height 3.8), local player
(name hidden by default), remote players (name shown 5s after right-click).

### Known Placeholder Issues (art, not code)
- `boss.png` is near-black against the dark cave floor — needs a higher-contrast
  replacement when proper boss art is produced.
- Player movement/attack/dummy-recoil sprite sheets are reference diagrams, not
  game-ready assets. `player_male.png` is used as a static billboard placeholder
  until production spritesheets (clean transparent-background PNGs, 8-directional
  frames) are delivered.

### Multiplayer Status in 2.5D
- ✅ Other player billboards render at correct world-unit scale (same as local player)
- ✅ Position sync (500ms broadcasts + interpolation) works visually in 3D
- ✅ Dummy shared HP, XP split on kill both verified with two clients
- ✅ Boss HP sync and AOE ring verified
- ✅ Wager fight overlay functional (fight streams, result screen shows)
- ✅ Right-click on other player (name reveal) — resolved via scene-level
  `pointerdown` tile-proximity matching (`GameScene.js:1108`), as of 2026-06-23

---

## 35. Current Roadmap — Next Up (as of 2026-06-23)

> Status reconciled against the actual code on 2026-06-23. Several items previously
> listed as "ready to start" are now built and committed (`c860695`). What remains
> open is recorded below, including one real gap surfaced during reconciliation
> (the boss loot tables were not updated for the Leather tier renumber).

### ✅ Polish Pass — Completed (committed in `c860695`)

**1. Dev/Test Mode** ✅ — `?dev=maxstats` implemented in `client/js/systems/DevMode.js`
(wired via `BootScene.js` + `UIScene.js`): sets Attack/Strength/Defense to level 99,
equips top-tier gear, restores HP.

**2. Scimitar → Kopesh rename** ✅ — items 9/13 are now `Bronze Kopesh` / `Iron Kopesh`
in `items.js`, `icons.js`, and `server/database.js`. No "Scimitar" string remains
anywhere in `client/` or `server/` code.

**3. Leather Armor Tier 1 + tier renumber** ✅ (data) / ⚠️ (loot — see open items) —
Leather Helmet/Jerkin/Platelegs/Kite Shield added as ids 19–22 at Tier 1; Bronze
shifted to Tier 2, Iron to Tier 3 in both `items.js` and the `server/database.js`
seed. **Loot tables NOT yet updated — see "Open" below.**

**4. Item icons** ✅ (wired) — `icons.js` references `items/gold_piles.jpg`,
`items/chicken.jpg`, `items/kopesh_reference.jpg`, `items/stiletto_reference.jpg`,
`items/leather_armor_pieces.jpg`; consumed by `InventoryPanel.js` + `EquipmentPanel.js`.
⚠️ These point at the **raw extracted concept sheets**, not cropped per-item icons —
verify they render acceptably (see Open item 2).

**6. Weapon art** ✅ — Kopesh/Stiletto icons wired via `icons.js` (see above).

**Other-player right-click** ✅ — handled in the scene-level `pointerdown` via tile
proximity matching (`GameScene.js:1108`, `requestOtherPlayerMenu` + name reveal at
`:1436`/`:1452`). The 2.5D `setAlpha(0)` interactivity regression noted in the old
§35 is resolved.

### 📋 Open — Still To Do

**A. Boss loot table renumber** ✅ Done (2026-06-23) — rebalanced to a 3-tier rarity
ladder and synced across **all three** copies (`client/js/config/boss.js`,
`server/multiplayer.js`, `server/routes/combat.js`). Arrays renamed to
`LEATHER_ARMOR_IDS` (19–22) / `BRONZE_ARMOR_IDS` / `BRONZE_WEAPON_IDS` /
`IRON_ARMOR_IDS` / `IRON_WEAPON_IDS`. Drop spread: nothing 35% · Leather armor 25% ·
Bronze armor 15% · Bronze weapon 10% · Iron armor 8% · Iron weapon 7% (sums to 1.00).
Note: Leather is armor-only, so the common-weapon slot is Bronze (no Leather weapon
exists). Still TODO: recheck merchant gold values and any dummy→tier mappings against
the new numbering.

**B. Lobby NPC models** — `client/assets/npc/desert_warrior_npcs.jpg` is present but
still the raw multi-character parchment sheet (§36 Ref 15). Slice into four sprites
and assign to banker / merchant / cosmetic shop / food shop NPCs. Not yet wired.

**C. Item-icon cleanup** — the wired icons (item 4 above) are raw concept sheets.
Crop/clean to per-item icons (gold is an 8-panel sheet → slice; leather pieces sheet
→ crop each piece) if they don't read well in the panels.

**D. Character creation flow verification** — confirm the first-time creation screen
appears for a fresh `?wallet=` value with no DB row.

### 🎨 Art Production Needed Before These Can Land
The following are blocked on production-ready assets being delivered:

- **Player spritesheet** — 8-directional Walk + Run cycles, 6 frames each, clean
  transparent-background PNG (not the reference diagram). Layout shown in
  `movement_sprites.jpg`.
- **Attack spritesheets** — 8-directional Kopesh Attack + Stiletto Attack, 6 frames
  each, same format. Layout shown in `attack_sprites.jpg`.
- **Dummy recoil spritesheet** — 8-directional, 4 frames each, transparent PNG.
  Layout shown in `dummy_recoil_sprites.jpg`.
- **Boss sprite** — single high-contrast transparent PNG replacing the current
  near-black `boss.png`. Reference: `boss_sprite1.jpg`.

Once art is delivered, wire them into `ThreeScene.js` as billboard textures with
directional frame selection (the UV offset animation system is already scaffolded).

### 🔮 Future (Post-Art, Post-Polish)
- Equipment visuals on character (gear layered over walking/attacking sprites)
- Collision/walkability rules per asset type (Prompt 3)
- Multiplayer Phase 4 (Solana wagering — out of scope until licensing)
- Additional gear tiers (T4 Titanium and beyond)
- Leaderboards, cosmetics system, additional bosses

---

## 36. Visual Asset Source — Spec Doc & Extraction Guide (added 2026-06-15)

**The canonical source for all reference art is `arenaspecfinal.docx`** (Section
"Visual References", Reference 1–19). When a polish-pass prompt says an asset file
"should be placed first" at some `client/assets/...` path, the art for it lives
inside this doc. There are no loose .jpg files to find — you must extract them.

> ⚠️ **Filename note:** older prompt text refers to `arena_concept_spec_v2.docx`.
> The actual file is **`arenaspecfinal.docx`**. Same document — use the real name.

### The images are EMBEDDED MEDIA, not loose files

Reading the doc as text gives you the Reference *descriptions* only. The actual
JPEGs are zipped inside the .docx as `word/media/image1.jpg … image19.jpg`.
**Reference N maps 1:1 to imageN.jpg** (verified: they embed in document order).

Extract them with a plain unzip (a .docx is a ZIP archive):

```bash
mkdir -p /tmp/spec_media
unzip -o arenaspecfinal.docx 'word/media/*' -d /tmp/spec_media
# images land in /tmp/spec_media/word/media/image1.jpg … image19.jpg
```

### Reference → embedded file → destination (polish-pass assets)

| Prompt | Reference | Embedded file | Copy to |
|---|---|---|---|
| C | 13 — Leather Armor turnaround | image13.jpg | `client/assets/reference/leather_armor_turnaround.jpg` |
| C | 14 — Leather Armor pieces | image14.jpg | `client/assets/items/leather_armor_pieces.jpg` |
| D | 9 — Gold coin piles (8-stage) | image9.jpg | `client/assets/items/gold_piles.jpg` |
| D | 10 — Chicken (food) | image10.jpg | `client/assets/items/chicken.jpg` |
| E | 15 — Egyptian Desert Warrior NPCs | image15.jpg | `client/assets/npc/desert_warrior_npcs.jpg` |
| F | 11 — Kopesh weapon | image11.jpg | `client/assets/items/kopesh.jpg` |
| F | 12 — Stiletto weapon | image12.jpg | `client/assets/items/stiletto.jpg` |

Other references (not needed for the current polish pass, listed for completeness):
1 Arena · 2 Lobby · 3 Player/equipment screen · 4 Boss cave (perspective) ·
5 Boss model sheet · 6 Boss cave overhead · 7 Training Grounds · 8 Dummy close-up ·
16 Player movement sheet · 17 Player attack sheet · 18 Boss sprite sheet ·
19 Dummy recoil sheet.

### These are CONCEPT SHEETS — most need cropping/cleanup, not drop-in use

Do not wire a raw extracted JPEG straight in as a game asset without checking it:

- **Item icons (9, 10, 11, 12):** multi-panel or single-render art on a flat/grey
  background. Gold (9) is an 8-panel sheet → slice into 8 icons. Crop tight,
  knock out the background as needed.
- **Leather pieces (14):** a labelled piece-layout image → crop chest, legs,
  helmet, shield individually.
- **NPC sheet (15):** has a parchment background, decorative border, and text
  labels baked in. Slice the four characters out and clean up before use.
- **Sprite sheets (16–19):** reference diagrams with grid lines, labels, and
  opaque backgrounds — **NOT game-ready.** These remain art-blocked (roadmap §35
  "Art Production Needed") until clean transparent-background PNGs are delivered.
  Do not attempt to derive production spritesheets from these diagrams.

If any extracted image does not visually match its Reference description, STOP and
flag it rather than wiring the wrong art — do not guess the mapping.

---

## 37. Ground-Item Pickup + Dev God-Mode — As Built (2026-06-23)

Two features added this session. Both verified live against the running server
(socket.io-client smoke tests): dev hit = flat 50 dmg, auto-max = 99/99/99 + Iron
Kopesh on join, and a full boss-kill → ground-drop → free-slot → pickup cycle.

### Ground items (boss loot when inventory is full)
Previously, boss loot rolled for a player with a full (20/20) inventory was silently
lost. Now it **drops to the ground as an owner-only item** that is picked up by
clicking it.

- **Server (`server/multiplayer.js`):** `worldState[ROOM].groundItems` (`id →
  { id, item_id, item_name, owner, x, y }`). On boss kill, if `firstFreeSlot` is
  full, `spawnGroundItem()` creates one at the **player's current tile** and emits
  `ground_item_spawned` **only to the owner's socket**. Loot payload gains a
  `dropped` boolean. New `pickup_item { ground_item_id }` handler: validates owner +
  free slot, inserts to inventory, deletes the ground item, emits
  `ground_item_removed`; emits `pickup_failed { reason: 'inventory_full' }` if still
  full. Owner's ground items are cleared on disconnect (in-memory only, never
  persisted — Hard Rule #4).
- **Client:** `ThreeScene.addGroundItem/removeGroundItem` render a bobbing/spinning
  gold cube on the tile; `GameScene` tracks `this.groundItems` (+ a "click to pick
  up" label projected each frame), left-click on the tile sends `pickup_item`,
  and `NetworkManager.pickupItem()` emits it. New socket events registered in
  `MP_EVENTS`: `ground_item_spawned`, `ground_item_removed`, `pickup_failed`.
- **Scope:** boss loot only. The inventory "Drop" context action remains "lost — no
  ground item" per §16. No proximity check — clicking your own loot tile picks it up
  from anywhere (local/dev convenience). Not persisted across disconnect/restart.

### Dev god-mode (local testing — OFF in production)
> ⚠️ **Kill switch: `NODE_ENV=production` disables ALL of this.** Set it before going live.

When `NODE_ENV !== 'production'`, **every account** is a dev account:
- **Auto-max on join** — `applyDevMaxStats(wallet)` in `join_room` sets all three
  skills to level 99, equips the best gear in every slot, restores HP. No
  `?dev=maxstats` query param needed (that REST route still exists too). **Note: this
  overwrites the account's stored XP/equipment on every login.**
- **Guaranteed 50-damage hits** — in the PvE combat loops (dummy + boss), the attack
  roll is replaced with `{ hit: true, damage: 50 }` (`DEV_HIT_DAMAGE`), so attacks
  always land for 50 even with no weapon. Constants `DEV_MODE` / `DEV_HIT_DAMAGE` at
  the top of `multiplayer.js`.
- **Not applied to wager fights** — the wager simulation (`runWagerFight`) still uses
  real stats, so PvP outcomes remain meaningful. Change here if dev god-mode in
  wagers is wanted.

---

## 38. Full Gear Tier Ladder — As Built (2026-06-23)

The spec (`arenaspecfinal.docx`, "Gear Tier Progression — Full Table") defines a
10-tier gear ladder; only Bronze + Iron (+ the added Leather) were in the game. This
session implemented **all remaining tiers as data + placeholder visuals** (no art).

### What was added
- **64 new items, IDs 23–86** (8 tiers × [4 armor + 4 weapons]). Mirrored in
  `client/js/config/items.js` and the `server/database.js` seed (`INSERT OR REPLACE`,
  so an existing `arena.db` picks them up on restart — no manual reset needed).
- Tiers (ladder ordinal in the `tier` column → material, def/atk req):
  T1 Leather(0) · T2 Bronze(0) · T3 Iron(20) · **T4 Steel(30) · T5 Titanium(50) ·
  T6 Tungsten(60) · T7 Obsidian(70) · T8 Dragonite(80) · T9 Celestial(85) ·
  T10 Void(90) · T11 Eternal(100)**.
- **Stats taken verbatim from the spec gear table** (each armor piece gives its slot
  value to Acc, Str AND Def equally; weapons give `accuracy_stat` = tier formula value
  and `strength_stat` = the max-hit override). No combat-formula changes.
- **Weapons:** all 4 types (Kopesh, Stiletto, Battleaxe, Warhammer) per tier, identical
  stats within a tier (cosmetic choice), per spec.

### Numbering reconciliation (important)
The docx gear table predates the Leather insertion (it lists Bronze as T1). The
implemented `tier` column is the **ladder ordinal** (Leather=1 … Eternal=11), so it is
offset +1 from the docx tier numbers, but the **stat values are material-keyed** and
match the docx exactly (Steel total 25, … Eternal 150). So the docx's "T10 ultimate"
is our **T11 Eternal** (a placeholder name — the spec leaves T10's name "TBD").

### Placeholder visuals
No art. New gear has no icon, so the inventory/bank/merchant panels fall back to a
coloured square + the real item name. `InventoryPanel.js` now has a `TIER_COLORS` map
(1–11) so each tier renders as a **distinct colour** (Leather brown → Void purple →
Eternal gold). Real art can be wired later via `icons.js` without touching this.

### Dev god-mode updates (for the new tiers)
- Auto-max on join (and the REST `dev_maxstats`) now sets level **100** (was 99) so the
  top tier (req 100) is equippable, and **equips the highest tier** (Eternal) — the
  `bestArmorForSlot`/`bestWeapon` ORDER BY tier DESC picks it automatically.
- Dev login now **stocks the bank** with one of every armor/weapon (84 items, fits the
  100-slot bank) via `applyDevMaxStats`.

### ⚠️ Known consequence — max hit exceeds the legacy "25" note
§5 / §22 state "max max hit = 25" — that was written when **Iron** was top tier. Under
the unchanged linear formula, **Eternal + level 100 = max hit 30** (armor str 150 →
+10, weapon override +5, level +10, base 5). Accuracy still clamps at 80% (the formula
clamps accuracy but **not** max hit). The spec's own "Combined Max Hit Progression"
table is internally inconsistent with its gear-stat table under the real formula, so
the items were implemented faithfully to the **gear table** rather than silently
clamping. **Open balance decision:** add a max-hit clamp, retune high-tier str values,
or accept >25 for future tiers. Not resolved — flagged for design.

### Not changed
- **Boss loot table** still drops only Leather/Bronze/Iron. The spec says higher-tier
  drops are added "as tiers release" — left as-is pending a drop-rate decision.
- **Merchant** pays `gold_value` = tier ordinal (Steel 4 … Eternal 11), consistent
  with §19.

---

## 39. Chunk World System — As Built (2026-06-23)

The world is now built from **CHUNKS** — the fundamental unit of map space, locked at
**60×60 tiles** (`client/js/config/chunks.js`). This formalises map sections so the
world can grow predictably. Built incrementally ("Path B"): the chunk system + the
first new chunk now; the legacy zones are re-fit to 60×60 in a later pass.

### Coordinate model
- Chunks are addressed by `(col, row)`: col increases **east (+X)**, row **south (+Y)**.
- World tile coords stay **non-negative**, so a chunk added to the **west** pushes
  existing content **east** (no negative array indices). Adding the Catacombs shifted
  the entire legacy world **+60 in X**.
- `chunkAt(x,y)` → the chunk or `null` (void/unbuilt). `isChunkDoor(x,y)` → walkable
  passage. `WORLD_TILES` = `{ W:100, H:90 }` (derived).

### Current chunk map (X 0→99, Y 0→89)
```
        X:0 ──────── 59 | 60 ──────── 99
  Y 0  ┌───────────────┬───────────────┐
       │               │  Boss Cave    │  (legacy 40×30)
  Y 29 │  THE          ├───────────────┤
       │  CATACOMBS    │  Training Grd │  (legacy 40×30)
  Y 59 │  (60×60 NEW)  ├───────────────┤
       ├───────────────┤  Lobby        │  (legacy 40×30)  ← spawn (80,74)
  Y 89 │     void      │               │
       └───────────────┴───────────────┘
```
- **Catacombs** = chunk (0,0), the first true 60×60 chunk. Empty themed shell (dark
  occult stone, `color 0x241b2e`, no art yet). Connects to the Boss Cave via a 2×2
  doorway at the x=59/60 boundary, y=14–15 (`CHUNK_DOORS`).
- **Legacy column** (Boss/Training/Lobby) = chunk col 1, still 40×30 each (`legacy:true`).
- **Void** (X 0–59, Y 60–89, west of the lobby) is unbuilt — solid wall.

### Files touched
- **NEW** `config/chunks.js` — locked spec + registry + `chunkAt`/`isChunkDoor`. Loaded
  in `index.html` before ThreeScene/GameScene.
- `GameScene.js` — `WORLD.WIDTH` 40→100; all legacy X coords shifted +60 (boss
  `{x:80}`, dummy `baseX 68/86`, NPCs `x:72/88`, `DOOR_XS [79,80]`, spawn `{x:80}`);
  `buildWorld()` rewritten to be chunk-aware (per-tile `chunkAt`, catacombs wall ring,
  void walls, carved doors); 5th tile colour (`catacombs`).
- `ThreeScene.js` — `ZONES_3D` gains per-zone `minX/maxX` + the catacombs ground plane
  (flat colour, `texPath:null`); ground planes sized from X bounds; camera default
  x 20→80.
- `server/multiplayer.js` — `MAP_WIDTH` 40→100, `SPAWN.x` 20→80, `BOSS_TILE_X` 20→80.

### Verified
Flood-fill from spawn (80,74) reaches **all four areas** including the Catacombs through
the doorway (6640 connected walkable tiles). Server boots, player spawns at (80,74),
boss HP 2000, `chunks.js` served.

### Notes / follow-ups
- **Server has no wall/void model** — it validates movement by bounds + step distance
  only (pre-existing). A client can't path into void (walls block A*), but the server
  wouldn't reject a void tile. Fine for the local build; revisit for anti-cheat.
- **Legacy re-fit pending** — Boss/Training/Lobby are still 40×30, not 60×60. The next
  pass should re-fit them to the locked chunk size.
- **Catacombs is an empty shell** — ground + walls + doorway only; contents TBD.
- Background art for the legacy column still spans only its 40-wide region; the
  Catacombs has no background image yet (flat colour).

> **Superseded:** the world now spans 280×150 with 6 planned chunks added — see
> **§40 Map Expansion Plan** for the current full map.

---

## 40. Map Expansion Plan (Official) — 2026-06-23

The world's growth is planned in `client/js/config/chunks.js` (single source of
truth) and visualised in **`docs/arena_map.pdf`**. This is the official map plan;
it is expected to be **rearranged on paper (the PDF) before chunks are fully built**.

### The map PDF
- Regenerate after any chunk change: `node scripts/generate_map_pdf.js`
- Reads `chunks.js` and draws every chunk as a labelled box at its real tile
  bounds, doorways as yellow tiles. **Solid border = built; dashed = planned shell.**
- Generator: `scripts/generate_map_pdf.js` (uses `pdfkit`, a devDependency).

### Current chunk map (world 340×180 tiles, 11 chunks) — rearranged 2026-06-23
```
        X:60──99 |100─159 |160─219 |220─279 |280─339
  Y 0  ┌─────────┬────────┬────────┬────────┬────────┐
       │ Armory  │ Cow    │ Grassy │Mountain│ Boss   │
       │(smiths) │ Field  │ Cave   │ Cave   │ Cave   │
  Y 29 ├─────────┤(cows)  │ Entr.  │(bulls +│(Minotr)│
       │Training │        │(mtn    │ small  │        │
  Y 59 │ Grounds ├────────┼─minotr)┴────────┴────────┘
       ├─────────┤ Grassy │ THE         (legacy col
  Y 89 │ Lobby   │ Path   │ CATACOMBS    = X60-99)
       │ ←spawn  │(trees) ├────────┐
  Y119 ├─────────┤(X100-  │ (X160-219, Y60-119)
       │ Prayer  │  159)  │
       │ Room    ├────────┤
  Y179 └─────────┤ River  │  (X100-159, Y120-179)
                 │Crossing│
                 └────────┘
```
(ASCII is approximate; **`docs/arena_map.pdf` is exact and to scale**.)

### Chunks
| Chunk | Status | Tile bounds (X / Y) | Contents |
|---|---|---|---|
| **Armory** | built (legacy) | 60–99 / 0–29 | armoursmith + weaponsmith NPCs (no stock) |
| Training Grounds | built (legacy) | 60–99 / 30–59 | 36 dummies |
| Lobby | built (legacy) | 60–99 / 60–89 | hub, spawn (80,74) |
| **Prayer Room** | planned (legacy) | 60–99 / 90–119 | altar + priest NPC (TBD), south of lobby |
| Cow Field | planned shell | 100–159 / 0–59 | cows; leads to the cave |
| Grassy Cave Entrance | planned shell | 160–219 / 0–59 | cave mouth at a mountain base |
| Mountain Cave | planned shell | 220–279 / 0–59 | bulls + small minotaurs |
| **Boss Cave** | built | 280–339 / 0–59 | The Minotaur (now 60×60, moved east) |
| Catacombs | built (shell) | 160–219 / 60–119 | empty antechamber, S of cave entrance |
| Grassy Path | planned shell | 100–159 / 60–119 | trees, path lobby→wilderness |
| River Crossing | planned shell | 100–159 / 120–179 | river + bridge, S of grassy path |

### Connections (doorways)
Legacy column (Armory↔Training↔Lobby↔Prayer) is carved by the band-wall logic
(`WALL_ROWS [0,30,60,90,119]` + `DOOR_XS`). `DOOR_SPECS` carries the rest:
Lobby↔Grassy Path · Grassy Path↔Cow Field · Grassy Path↔River Crossing ·
Cow Field↔Cave Entrance · Cave Entrance↔Mountain Cave · Mountain Cave↔Boss Cave ·
Cave Entrance↔Catacombs. Verified: all 11 chunks reachable from spawn by flood-fill.

### Notable this rearrange
- **Boss Cave moved** out of the legacy column (was X60-99/0-29) to a 60×60 chunk
  east of the Mountain Cave (X280-339/0-59); Minotaur recentred to (310,30); server
  `BOSS_TILE_X/Y` follow. The wilderness now ends at the boss: Lobby → Grassy Path →
  Cow Field → Cave Entrance → Mountain Cave → **Boss Cave**.
- **Armory** is the new occupant of the old boss-cave slot (above Training Grounds) —
  two placeholder smith NPCs (`armor_smith`, `weapon_smith`); clicking shows a
  "nothing in stock yet" toast (`UIScene.openNpc`).
- **Prayer Room** is now a legacy 40×30 directly south of the Lobby (joined the
  legacy column; reachable via the band doorway at row 90).
- **Catacombs** moved to south of the Cave Entrance; **River Crossing** to south of
  the Grassy Path. The old X0-59 region (former Catacombs spot) is now void.

### Build status
All shell chunks are still **empty** (flat-colour ground, wall ring, doorway) except
the Armory (has its two NPCs). The legacy column re-fit to 60×60 is still pending (§39).
