// items.js — master item definitions (mirror of the server-side items table seed)
// IDs are stable — per CLAUDE.md Section 4.

const ITEMS = {
  1:  { id: 1,  name: 'Bronze Helmet',     type: 'armor',  tier: 1, slot_type: 'helmet',     accuracy_stat: 1,  strength_stat: 1, defense_stat: 1, attack_req: 0,  defense_req: 0,  gold_value: 1, stackable: 0 },
  2:  { id: 2,  name: 'Bronze Chestplate', type: 'armor',  tier: 1, slot_type: 'chestplate', accuracy_stat: 2,  strength_stat: 2, defense_stat: 2, attack_req: 0,  defense_req: 0,  gold_value: 1, stackable: 0 },
  3:  { id: 3,  name: 'Bronze Platelegs',  type: 'armor',  tier: 1, slot_type: 'platelegs',  accuracy_stat: 2,  strength_stat: 2, defense_stat: 2, attack_req: 0,  defense_req: 0,  gold_value: 1, stackable: 0 },
  4:  { id: 4,  name: 'Bronze Shield',     type: 'armor',  tier: 1, slot_type: 'shield',     accuracy_stat: 1,  strength_stat: 1, defense_stat: 1, attack_req: 0,  defense_req: 0,  gold_value: 1, stackable: 0 },
  5:  { id: 5,  name: 'Iron Helmet',       type: 'armor',  tier: 2, slot_type: 'helmet',     accuracy_stat: 1,  strength_stat: 1, defense_stat: 1, attack_req: 0,  defense_req: 20, gold_value: 2, stackable: 0 },
  6:  { id: 6,  name: 'Iron Chestplate',   type: 'armor',  tier: 2, slot_type: 'chestplate', accuracy_stat: 5,  strength_stat: 5, defense_stat: 5, attack_req: 0,  defense_req: 20, gold_value: 2, stackable: 0 },
  7:  { id: 7,  name: 'Iron Platelegs',    type: 'armor',  tier: 2, slot_type: 'platelegs',  accuracy_stat: 4,  strength_stat: 4, defense_stat: 4, attack_req: 0,  defense_req: 20, gold_value: 2, stackable: 0 },
  8:  { id: 8,  name: 'Iron Shield',       type: 'armor',  tier: 2, slot_type: 'shield',     accuracy_stat: 3,  strength_stat: 3, defense_stat: 3, attack_req: 0,  defense_req: 20, gold_value: 2, stackable: 0 },
  9:  { id: 9,  name: 'Bronze Scimitar',   type: 'weapon', tier: 1, slot_type: 'weapon',     accuracy_stat: 5,  strength_stat: 0, defense_stat: 0, attack_req: 0,  defense_req: 0,  gold_value: 1, stackable: 0 },
  10: { id: 10, name: 'Bronze Stiletto',   type: 'weapon', tier: 1, slot_type: 'weapon',     accuracy_stat: 5,  strength_stat: 0, defense_stat: 0, attack_req: 0,  defense_req: 0,  gold_value: 1, stackable: 0 },
  11: { id: 11, name: 'Bronze Battleaxe',  type: 'weapon', tier: 1, slot_type: 'weapon',     accuracy_stat: 5,  strength_stat: 0, defense_stat: 0, attack_req: 0,  defense_req: 0,  gold_value: 1, stackable: 0 },
  12: { id: 12, name: 'Bronze Warhammer',  type: 'weapon', tier: 1, slot_type: 'weapon',     accuracy_stat: 5,  strength_stat: 0, defense_stat: 0, attack_req: 0,  defense_req: 0,  gold_value: 1, stackable: 0 },
  13: { id: 13, name: 'Iron Scimitar',     type: 'weapon', tier: 2, slot_type: 'weapon',     accuracy_stat: 13, strength_stat: 1, defense_stat: 0, attack_req: 20, defense_req: 0,  gold_value: 2, stackable: 0 },
  14: { id: 14, name: 'Iron Stiletto',     type: 'weapon', tier: 2, slot_type: 'weapon',     accuracy_stat: 13, strength_stat: 1, defense_stat: 0, attack_req: 20, defense_req: 0,  gold_value: 2, stackable: 0 },
  15: { id: 15, name: 'Iron Battleaxe',    type: 'weapon', tier: 2, slot_type: 'weapon',     accuracy_stat: 13, strength_stat: 1, defense_stat: 0, attack_req: 20, defense_req: 0,  gold_value: 2, stackable: 0 },
  16: { id: 16, name: 'Iron Warhammer',    type: 'weapon', tier: 2, slot_type: 'weapon',     accuracy_stat: 13, strength_stat: 1, defense_stat: 0, attack_req: 20, defense_req: 0,  gold_value: 2, stackable: 0 },
  17: { id: 17, name: 'Cooked Chicken',    type: 'food',   tier: 0, slot_type: null,         accuracy_stat: 0,  strength_stat: 0, defense_stat: 0, attack_req: 0,  defense_req: 0,  gold_value: 0, stackable: 1, heal: 5 },
  18: { id: 18, name: 'Gold',              type: 'gold',   tier: 0, slot_type: null,         accuracy_stat: 0,  strength_stat: 0, defense_stat: 0, attack_req: 0,  defense_req: 0,  gold_value: 0, stackable: 1 },
};
