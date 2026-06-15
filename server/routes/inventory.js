// routes/inventory.js — /api/inventory routes (CLAUDE.md Section 20)
// Inventory: 20 slots (0-19), no stacking except gold (the single currency
// exception per Section 19). Level requirements enforced server-side on equip.
const express = require('express');
const { levelFromXP } = require('../xp');

const INVENTORY_SLOTS = 20;
const GOLD_ID = 18;
const SLOT_COLUMNS = {
  helmet: 'helmet_id',
  chestplate: 'chestplate_id',
  platelegs: 'platelegs_id',
  shield: 'shield_id',
  weapon: 'weapon_id',
};

module.exports = function inventoryRoutes(db) {
  const router = express.Router();

  const getPlayer = db.prepare('SELECT * FROM players WHERE wallet_address = ?');
  const getInv = db.prepare('SELECT * FROM inventory WHERE player_id = ? ORDER BY slot');
  const getInvSlot = db.prepare('SELECT * FROM inventory WHERE player_id = ? AND slot = ?');
  const getInvByItem = db.prepare('SELECT * FROM inventory WHERE player_id = ? AND item_id = ? ORDER BY slot LIMIT 1');
  const getItem = db.prepare('SELECT * FROM items WHERE id = ?');
  const getEquipped = db.prepare('SELECT * FROM equipped WHERE player_id = ?');
  const insertInv = db.prepare('INSERT INTO inventory (player_id, slot, item_id, quantity) VALUES (?, ?, ?, ?)');
  const deleteInvSlot = db.prepare('DELETE FROM inventory WHERE player_id = ? AND slot = ?');
  const updateInvQty = db.prepare('UPDATE inventory SET quantity = ? WHERE player_id = ? AND slot = ?');

  function firstFreeSlot(playerId) {
    const used = new Set(getInv.all(playerId).map((r) => r.slot));
    for (let s = 0; s < INVENTORY_SLOTS; s++) {
      if (!used.has(s)) return s;
    }
    return -1;
  }

  // POST /api/inventory/remove_item — used by eating and dropping
  router.post('/remove_item', (req, res) => {
    const { player_id, item_id, quantity = 1, slot } = req.body || {};
    if (!player_id || !Number.isInteger(item_id) || !Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ success: false, reason: 'invalid_request' });
    }

    // Optional slot pin (used by drop/eat so the exact clicked slot is removed)
    const row = slot !== undefined
      ? getInvSlot.get(player_id, slot)
      : getInvByItem.get(player_id, item_id);
    if (!row || row.item_id !== item_id) {
      return res.status(404).json({ success: false, reason: 'item_not_found' });
    }
    if (row.quantity < quantity) {
      return res.status(400).json({ success: false, reason: 'insufficient_quantity' });
    }

    if (row.quantity > quantity) {
      updateInvQty.run(row.quantity - quantity, player_id, row.slot);
    } else {
      deleteInvSlot.run(player_id, row.slot);
    }
    return res.json({ success: true });
  });

  // POST /api/inventory/equip
  router.post('/equip', (req, res) => {
    const { player_id, item_id, from_slot } = req.body || {};
    const player = getPlayer.get(player_id);
    if (!player) return res.status(404).json({ success: false, reason: 'player_not_found' });

    const invRow = getInvSlot.get(player_id, from_slot);
    if (!invRow || invRow.item_id !== item_id) {
      return res.status(400).json({ success: false, reason: 'invalid_slot' });
    }

    const item = getItem.get(item_id);
    if (!item || (item.type !== 'armor' && item.type !== 'weapon')) {
      return res.status(400).json({ success: false, reason: 'not_equippable' });
    }

    // Level requirements: weapons check Attack, armor checks Defense
    const required = item.type === 'weapon' ? item.attack_req : item.defense_req;
    const current = item.type === 'weapon'
      ? levelFromXP(player.attack_xp)
      : levelFromXP(player.defense_xp);
    if (current < required) {
      return res.json({ success: false, reason: 'level_requirement_not_met', required, current });
    }

    const column = SLOT_COLUMNS[item.slot_type];
    if (!column) return res.status(400).json({ success: false, reason: 'invalid_slot_type' });

    const equipped = getEquipped.get(player_id);
    const previousItemId = equipped ? equipped[column] : null;

    const doEquip = db.transaction(() => {
      deleteInvSlot.run(player_id, from_slot);
      // Swap: previously equipped item moves into the freed inventory slot
      if (previousItemId) insertInv.run(player_id, from_slot, previousItemId, 1);
      db.prepare(`UPDATE equipped SET ${column} = ? WHERE player_id = ?`).run(item_id, player_id);
    });
    doEquip();

    return res.json({ success: true });
  });

  // POST /api/inventory/unequip
  router.post('/unequip', (req, res) => {
    const { player_id, slot_type } = req.body || {};
    const column = SLOT_COLUMNS[slot_type];
    if (!column) return res.status(400).json({ success: false, reason: 'invalid_slot_type' });

    const equipped = getEquipped.get(player_id);
    const itemId = equipped ? equipped[column] : null;
    if (!itemId) return res.json({ success: false, reason: 'nothing_equipped' });

    const free = firstFreeSlot(player_id);
    if (free === -1) return res.json({ success: false, reason: 'inventory_full' });

    const doUnequip = db.transaction(() => {
      insertInv.run(player_id, free, itemId, 1);
      db.prepare(`UPDATE equipped SET ${column} = NULL WHERE player_id = ?`).run(player_id);
    });
    doUnequip();

    return res.json({ success: true });
  });

  // POST /api/inventory/sell — gear only, payout = item gold_value (= tier)
  router.post('/sell', (req, res) => {
    const { player_id, inventory_slot } = req.body || {};
    const row = getInvSlot.get(player_id, inventory_slot);
    if (!row) return res.status(404).json({ success: false, reason: 'item_not_found' });

    const item = getItem.get(row.item_id);
    if (!item || (item.type !== 'armor' && item.type !== 'weapon')) {
      return res.status(400).json({ success: false, reason: 'not_sellable' });
    }

    const goldReceived = item.gold_value;

    const doSell = db.transaction(() => {
      deleteInvSlot.run(player_id, inventory_slot);
      const goldRow = getInvByItem.get(player_id, GOLD_ID);
      if (goldRow) {
        // Gold stacks in inventory — the only inventory stacking exception
        updateInvQty.run(goldRow.quantity + goldReceived, player_id, goldRow.slot);
      } else {
        const free = firstFreeSlot(player_id); // the sold item's slot just freed up
        if (free !== -1) {
          insertInv.run(player_id, free, GOLD_ID, goldReceived);
        } else {
          console.log(`[sell] no room for gold — ${goldReceived} gold dropped for ${player_id}`);
        }
      }
    });
    doSell();

    return res.json({ success: true, gold_received: goldReceived });
  });

  // POST /api/inventory/buy_food — Cooked Chicken, 10 for 1 gold,
  // each chicken occupies its own inventory slot (no food stacking)
  router.post('/buy_food', (req, res) => {
    const { player_id, quantity } = req.body || {};
    if (!Number.isInteger(quantity) || quantity < 10 || quantity % 10 !== 0) {
      return res.status(400).json({ success: false, reason: 'invalid_quantity' });
    }

    const cost = Math.ceil(quantity / 10);
    const inv = getInv.all(player_id);
    const goldRow = inv.find((r) => r.item_id === GOLD_ID);

    if (!goldRow || goldRow.quantity < cost) {
      return res.json({ success: false, reason: 'insufficient_gold' });
    }

    // A fully-spent gold stack frees its slot for a chicken
    const freeSlots = (INVENTORY_SLOTS - inv.length) + (goldRow.quantity === cost ? 1 : 0);
    if (quantity > freeSlots) {
      return res.json({ success: false, reason: 'not_enough_inventory_space' });
    }

    const doBuy = db.transaction(() => {
      if (goldRow.quantity > cost) {
        updateInvQty.run(goldRow.quantity - cost, player_id, goldRow.slot);
      } else {
        deleteInvSlot.run(player_id, goldRow.slot);
      }
      const used = new Set(getInv.all(player_id).map((r) => r.slot));
      let added = 0;
      for (let s = 0; s < INVENTORY_SLOTS && added < quantity; s++) {
        if (used.has(s)) continue;
        insertInv.run(player_id, s, 17, 1); // Cooked Chicken
        added++;
      }
    });
    doBuy();

    return res.json({ success: true });
  });

  return router;
};
