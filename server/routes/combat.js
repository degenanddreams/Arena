// routes/combat.js — /api/combat and /api/boss routes
const express = require('express');
const { levelFromXP } = require('../xp');

// Boss damage log — in-memory server state per CLAUDE.md Section 8.
// Module-level (never persisted to SQLite); reset on boss spawn/respawn.
let bossDamageLog = {};

// Loot table cumulative ranges — 3-tier rarity ladder (Leather T1 → Iron T3).
// Keep in sync with server/multiplayer.js and client/js/config/boss.js.
// Leather is armor-only, so the common-weapon slot is Bronze.
//   0.00-0.35 nothing | 0.35-0.60 Leather armor | 0.60-0.75 Bronze armor
//   0.75-0.85 Bronze weapon | 0.85-0.93 Iron armor | 0.93-1.00 Iron weapon
const LEATHER_ARMOR_IDS = [19, 20, 21, 22]; // T1
const BRONZE_ARMOR_IDS = [1, 2, 3, 4];      // T2
const BRONZE_WEAPON_IDS = [9, 10, 11, 12];  // T2
const IRON_ARMOR_IDS = [5, 6, 7, 8];        // T3
const IRON_WEAPON_IDS = [13, 14, 15, 16];   // T3

function pick(ids) {
  return ids[Math.floor(Math.random() * ids.length)];
}

function rollLootItemId() {
  const roll = Math.random();
  if (roll < 0.35) return null;
  if (roll < 0.60) return pick(LEATHER_ARMOR_IDS);
  if (roll < 0.75) return pick(BRONZE_ARMOR_IDS);
  if (roll < 0.85) return pick(BRONZE_WEAPON_IDS);
  if (roll < 0.93) return pick(IRON_ARMOR_IDS);
  return pick(IRON_WEAPON_IDS);
}

const LOOT_DAMAGE_THRESHOLD = 25;
const INVENTORY_SLOTS = 20;

module.exports = function combatRoutes(db) {
  const router = express.Router();

  const getPlayer = db.prepare('SELECT * FROM players WHERE wallet_address = ?');
  const updateXP = db.prepare(
    'UPDATE players SET attack_xp = ?, strength_xp = ?, defense_xp = ? WHERE wallet_address = ?',
  );
  const getItem = db.prepare('SELECT * FROM items WHERE id = ?');
  const getInv = db.prepare('SELECT slot FROM inventory WHERE player_id = ? ORDER BY slot');
  const insertInv = db.prepare(
    'INSERT INTO inventory (player_id, slot, item_id, quantity) VALUES (?, ?, ?, ?)',
  );

  function firstFreeSlot(playerId) {
    const used = new Set(getInv.all(playerId).map((r) => r.slot));
    for (let s = 0; s < INVENTORY_SLOTS; s++) {
      if (!used.has(s)) return s;
    }
    return -1;
  }

  // POST /api/combat/xp — batch XP award on confirmed kill (never per hit)
  router.post('/combat/xp', (req, res) => {
    const { player_id, attack_xp = 0, strength_xp = 0, defense_xp = 0 } = req.body || {};

    if (!player_id) {
      return res.status(400).json({ success: false, reason: 'missing_player_id' });
    }
    const deltas = { attack: attack_xp, strength: strength_xp, defense: defense_xp };
    for (const [skill, delta] of Object.entries(deltas)) {
      if (!Number.isInteger(delta) || delta < 0) {
        return res.status(400).json({ success: false, reason: `invalid_${skill}_xp` });
      }
    }

    const player = getPlayer.get(player_id);
    if (!player) {
      return res.status(404).json({ success: false, reason: 'player_not_found' });
    }

    const oldXP = {
      attack: player.attack_xp,
      strength: player.strength_xp,
      defense: player.defense_xp,
    };
    const newXP = {
      attack: oldXP.attack + deltas.attack,
      strength: oldXP.strength + deltas.strength,
      defense: oldXP.defense + deltas.defense,
    };

    updateXP.run(newXP.attack, newXP.strength, newXP.defense, player_id);

    const levelUps = ['attack', 'strength', 'defense'].filter(
      (skill) => levelFromXP(newXP[skill]) > levelFromXP(oldXP[skill]),
    );

    return res.json({ success: true, new_xp: newXP, level_ups: levelUps });
  });

  // NOTE: this router is mounted at /api, so route paths carry their own
  // /combat or /boss prefix to match CLAUDE.md Section 20 exactly.

  // POST /api/boss/damage — accumulate this player's damage in the in-memory log
  router.post('/boss/damage', (req, res) => {
    const { player_id, damage } = req.body || {};
    if (!player_id || !Number.isInteger(damage) || damage < 0) {
      return res.status(400).json({ success: false, reason: 'invalid_request' });
    }
    bossDamageLog[player_id] = (bossDamageLog[player_id] || 0) + damage;
    return res.json({ success: true, total_damage: bossDamageLog[player_id] });
  });

  // POST /api/boss/kill — independent loot roll for a qualifying player
  router.post('/boss/kill', (req, res) => {
    const { player_id } = req.body || {};
    if (!player_id) {
      return res.status(400).json({ success: false, reason: 'missing_player_id' });
    }
    if ((bossDamageLog[player_id] || 0) < LOOT_DAMAGE_THRESHOLD) {
      return res.json({ success: false, reason: 'insufficient_damage' });
    }

    const lootItemId = rollLootItemId();
    if (!lootItemId) {
      return res.json({ loot_item_id: null, loot_item_name: null });
    }

    const item = getItem.get(lootItemId);
    const free = firstFreeSlot(player_id);
    if (free === -1) {
      // No room — report the drop but don't add it
      return res.json({
        loot_item_id: lootItemId,
        loot_item_name: item ? item.name : null,
        note: 'inventory_full',
      });
    }

    insertInv.run(player_id, free, lootItemId, 1);
    return res.json({
      loot_item_id: lootItemId,
      loot_item_name: item ? item.name : null,
    });
  });

  // POST /api/boss/respawn — reset the in-memory damage log on boss respawn
  router.post('/boss/respawn', (req, res) => {
    bossDamageLog = {};
    return res.json({ success: true });
  });

  return router;
};
