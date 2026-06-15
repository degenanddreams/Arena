// routes/items.js — /api/items routes
// Inventory/bank/equip/sell/buy endpoints arrive with the combat & inventory prompts.
const express = require('express');

module.exports = function itemRoutes(db) {
  const router = express.Router();

  // GET /api/items — full master item list (read-only, useful for the client)
  router.get('/', (req, res) => {
    res.json({ items: db.prepare('SELECT * FROM items ORDER BY id').all() });
  });

  return router;
};
