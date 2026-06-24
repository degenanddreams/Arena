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

// Loot table — independent roll per qualifying player.
// 3-tier rarity ladder: Leather (T1) common → Iron (T3) rare.
// NOTE: Leather is armor-only (no Leather weapon exists), so the common-weapon
// slot is Bronze. Chances sum to 1.00.
const BOSS_LOOT_TABLE = [
  { chance: 0.35, reward: null },                     // nothing
  { chance: 0.25, reward: 'random_leather_armor' },   // Leather armor (T1, common)
  { chance: 0.15, reward: 'random_bronze_armor' },    // Bronze armor (T2)
  { chance: 0.10, reward: 'random_bronze_weapon' },   // Bronze weapon (common weapon)
  { chance: 0.08, reward: 'random_iron_armor' },      // Iron armor (T3, rare)
  { chance: 0.07, reward: 'random_iron_weapon' },     // Iron weapon (T3, rare)
];

const LEATHER_ARMOR_IDS = [19, 20, 21, 22]; // T1 — Leather Helmet/Jerkin/Platelegs/Kite Shield
const BRONZE_ARMOR_IDS = [1, 2, 3, 4];      // T2
const BRONZE_WEAPON_IDS = [9, 10, 11, 12];  // T2
const IRON_ARMOR_IDS = [5, 6, 7, 8];        // T3
const IRON_WEAPON_IDS = [13, 14, 15, 16];   // T3

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
  if (reward === 'random_leather_armor') return LEATHER_ARMOR_IDS[Math.floor(Math.random() * 4)];
  if (reward === 'random_bronze_armor') return BRONZE_ARMOR_IDS[Math.floor(Math.random() * 4)];
  if (reward === 'random_bronze_weapon') return BRONZE_WEAPON_IDS[Math.floor(Math.random() * 4)];
  if (reward === 'random_iron_armor') return IRON_ARMOR_IDS[Math.floor(Math.random() * 4)];
  if (reward === 'random_iron_weapon') return IRON_WEAPON_IDS[Math.floor(Math.random() * 4)];
  return null;
}
