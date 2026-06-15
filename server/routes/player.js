// routes/player.js — /api/player routes
const express = require('express');
const { levelFromXP } = require('../xp');

// Profanity filter (hardened) — used at character creation and name changes.
// Padded/obfuscated variants previously slipped past a plain substring match,
// so we normalise leetspeak + strip noise before checking. The word list
// includes common obfuscation spellings since normalisation alone can't turn
// e.g. "f4ck" into "fuck" (4 reads as 'a', giving "fack").
const PROFANITY = [
  'fuck', 'fack', 'fuk', 'fuc', 'phuck',
  'shit', 'shyt', 'bitch', 'biatch', 'cunt',
  'asshole', 'ass', 'dick', 'pussy', 'cock', 'twat',
  'nigger', 'nigga', 'faggot', 'faggit', 'whore', 'slut', 'bastard',
];

const LEET_SUBSTITUTIONS = {
  '@': 'a', '4': 'a', '3': 'e', '0': 'o', '1': 'i', '!': 'i', '$': 's', '5': 's',
};

// Normalise: lowercase, apply leet substitutions, then strip everything that
// isn't a-z (spaces, punctuation, leftover digits).
function normaliseForProfanity(text) {
  return String(text)
    .toLowerCase()
    .replace(/[@4301!$5]/g, (ch) => LEET_SUBSTITUTIONS[ch] || ch)
    .replace(/[^a-z]/g, '');
}

function containsProfanity(text) {
  const normalised = normaliseForProfanity(text);
  return PROFANITY.some((word) => normalised.includes(word));
}

const UPDATABLE_FIELDS = [
  'display_name', 'gender', 'hair_color', 'skin_tone', 'clothing_color',
  'attack_xp', 'strength_xp', 'defense_xp', 'current_hp', 'gold',
  'tutorial_complete', 'wins', 'losses',
];

module.exports = function playerRoutes(db) {
  const router = express.Router();

  const getPlayer = db.prepare('SELECT * FROM players WHERE wallet_address = ?');
  const getInventory = db.prepare('SELECT slot, item_id, quantity FROM inventory WHERE player_id = ? ORDER BY slot');
  const getBank = db.prepare('SELECT slot, item_id, quantity FROM bank WHERE player_id = ? ORDER BY slot');
  const getEquipped = db.prepare('SELECT * FROM equipped WHERE player_id = ?');

  // POST /api/player/create
  router.post('/create', (req, res) => {
    const {
      wallet_address, display_name,
      gender = 'male', hair_color = 'brunette', skin_tone = 'tan', clothing_color = 'green',
    } = req.body || {};

    if (!wallet_address || !display_name) {
      return res.status(400).json({ success: false, reason: 'missing_fields' });
    }
    if (display_name.length < 3 || display_name.length > 20) {
      return res.status(400).json({ success: false, reason: 'invalid_name_length' });
    }
    if (containsProfanity(display_name)) {
      return res.status(400).json({ success: false, reason: 'profanity' });
    }
    if (getPlayer.get(wallet_address)) {
      return res.status(409).json({ success: false, reason: 'player_exists' });
    }

    const create = db.transaction(() => {
      db.prepare(`
        INSERT INTO players (wallet_address, display_name, gender, hair_color, skin_tone, clothing_color)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(wallet_address, display_name, gender, hair_color, skin_tone, clothing_color);

      db.prepare('INSERT INTO equipped (player_id) VALUES (?)').run(wallet_address);

      // 1 gold (item_id 18) into inventory slot 0 — gold stacks in inventory with a quantity counter
      db.prepare('INSERT INTO inventory (player_id, slot, item_id, quantity) VALUES (?, 0, 18, 1)')
        .run(wallet_address);
    });
    create();

    return res.json({ success: true, player: getPlayer.get(wallet_address) });
  });

  // GET /api/player/:wallet_address
  router.get('/:wallet_address', (req, res) => {
    const player = getPlayer.get(req.params.wallet_address);
    if (!player) return res.status(404).json({ error: 'player_not_found' });

    return res.json({
      player,
      level: {
        attack: levelFromXP(player.attack_xp),
        strength: levelFromXP(player.strength_xp),
        defense: levelFromXP(player.defense_xp),
      },
      inventory: getInventory.all(player.wallet_address),
      bank: getBank.all(player.wallet_address),
      equipped: getEquipped.get(player.wallet_address) || null,
    });
  });

  // PUT /api/player/:wallet_address — any subset of updatable fields
  router.put('/:wallet_address', (req, res) => {
    const player = getPlayer.get(req.params.wallet_address);
    if (!player) return res.status(404).json({ success: false, reason: 'player_not_found' });

    const updates = {};
    for (const field of UPDATABLE_FIELDS) {
      if (req.body && req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, reason: 'no_updatable_fields' });
    }
    if (updates.display_name !== undefined) {
      if (updates.display_name.length < 3 || updates.display_name.length > 20) {
        return res.status(400).json({ success: false, reason: 'invalid_name_length' });
      }
      if (containsProfanity(updates.display_name)) {
        return res.status(400).json({ success: false, reason: 'profanity' });
      }
    }
    // HP hard cap — never let HP exceed 100
    if (updates.current_hp !== undefined) {
      updates.current_hp = Math.max(0, Math.min(100, updates.current_hp));
    }

    const setClause = Object.keys(updates).map((f) => `${f} = ?`).join(', ');
    db.prepare(`UPDATE players SET ${setClause} WHERE wallet_address = ?`)
      .run(...Object.values(updates), player.wallet_address);

    return res.json({ success: true });
  });

  return router;
};
