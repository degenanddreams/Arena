// routes/bank.js — /api/bank routes
// Bank state is edited client-side while the bank UI is open and written back
// atomically on close (CLAUDE.md Section 12: save on close, no partial writes).
// Deposits/withdrawals also mutate inventory, so the save replaces BOTH tables
// in one transaction — otherwise a refresh would duplicate transferred items.
const express = require('express');

const BANK_SLOTS = 100;
const INVENTORY_SLOTS = 20;

module.exports = function bankRoutes(db) {
  const router = express.Router();

  const getPlayer = db.prepare('SELECT * FROM players WHERE wallet_address = ?');
  const getItem = db.prepare('SELECT * FROM items WHERE id = ?');
  const deleteBank = db.prepare('DELETE FROM bank WHERE player_id = ?');
  const deleteInv = db.prepare('DELETE FROM inventory WHERE player_id = ?');
  const insertBank = db.prepare('INSERT INTO bank (player_id, slot, item_id, quantity) VALUES (?, ?, ?, ?)');
  const insertInv = db.prepare('INSERT INTO inventory (player_id, slot, item_id, quantity) VALUES (?, ?, ?, ?)');

  function validateRows(rows, maxSlots) {
    if (!Array.isArray(rows)) return 'not_an_array';
    const seen = new Set();
    for (const row of rows) {
      if (!Number.isInteger(row.slot) || row.slot < 0 || row.slot >= maxSlots) return 'invalid_slot';
      if (seen.has(row.slot)) return 'duplicate_slot';
      seen.add(row.slot);
      if (!Number.isInteger(row.quantity) || row.quantity < 1) return 'invalid_quantity';
      if (!getItem.get(row.item_id)) return 'unknown_item';
    }
    return null;
  }

  // POST /api/bank/save — full bank + inventory state, written atomically
  router.post('/save', (req, res) => {
    const { player_id, bank, inventory } = req.body || {};
    if (!getPlayer.get(player_id)) {
      return res.status(404).json({ success: false, reason: 'player_not_found' });
    }

    const bankError = validateRows(bank, BANK_SLOTS);
    if (bankError) return res.status(400).json({ success: false, reason: `bank_${bankError}` });
    const invError = validateRows(inventory, INVENTORY_SLOTS);
    if (invError) return res.status(400).json({ success: false, reason: `inventory_${invError}` });

    const save = db.transaction(() => {
      deleteBank.run(player_id);
      for (const row of bank) insertBank.run(player_id, row.slot, row.item_id, row.quantity);
      deleteInv.run(player_id);
      for (const row of inventory) insertInv.run(player_id, row.slot, row.item_id, row.quantity);
    });
    save();

    return res.json({ success: true });
  });

  return router;
};
