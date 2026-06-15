// boss.js — boss parameters per CLAUDE.md Section 8
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
  respawn_seconds: 120,         // 20 minutes in full spec — 2 minutes for local testing
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

const T1_ARMOR_IDS = [1, 2, 3, 4];
const T1_WEAPON_IDS = [9, 10, 11, 12];
const T2_ARMOR_IDS = [5, 6, 7, 8];
const T2_WEAPON_IDS = [13, 14, 15, 16];

function rollLoot() {
  const roll = Math.random();
  let cumulative = 0;
  for (const entry of BOSS_LOOT_TABLE) {
    cumulative += entry.chance;
    if (roll < cumulative) return entry.reward;
  }
  return null; // fallback
}

function resolveReward(reward) {
  if (!reward) return null;
  if (reward === 'random_t1_armor') return T1_ARMOR_IDS[Math.floor(Math.random() * 4)];
  if (reward === 'random_t1_weapon') return T1_WEAPON_IDS[Math.floor(Math.random() * 4)];
  if (reward === 'random_t2_armor') return T2_ARMOR_IDS[Math.floor(Math.random() * 4)];
  if (reward === 'random_t2_weapon') return T2_WEAPON_IDS[Math.floor(Math.random() * 4)];
  return null;
}
