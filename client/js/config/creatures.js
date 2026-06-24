// creatures.js — attackable wandering animals/monsters that populate the chunks.
//
// A creature behaves like a mobile training dummy: the player attacks it, the
// server rolls damage and awards XP on kill (XP multiplier = 10, same as the
// level-20 dummy), then the creature respawns. Creatures do NOT fight back.
//
// Difficulty gradient: creatures near the mainland (lobby) are low level / low HP;
// creatures deeper toward the boss are higher level / higher HP. Every creature
// wanders randomly within a 4×6-tile home box around its spawn (it freezes while
// being attacked). Server + client both build the identical list from this file.

const CREATURE_XP_MULTIPLIER = 10; // same as the level-20 dummy
const CREATURE_HOME_W = 4;         // wander box width (tiles)
const CREATURE_HOME_H = 6;         // wander box height (tiles)
const CREATURE_RESPAWN_MS = 8000;

// type → display name, combat level (also used as defense level), max HP, placeholder
// colour, and billboard size factor (1 = ~dummy size).
const CREATURE_TYPES = {
  chicken:  { name: 'Chicken',         level: 1,  hp: 8,   color: 0xe8e0d0, size: 0.7 },
  rabbit:   { name: 'Rabbit',          level: 2,  hp: 12,  color: 0xcaa66a, size: 0.7 },
  rat:      { name: 'Giant Rat',       level: 4,  hp: 18,  color: 0x6b5a4a, size: 0.8 },
  cow:      { name: 'Cow',             level: 6,  hp: 40,  color: 0xcfc3a8, size: 1.1 },
  frog:     { name: 'Giant Frog',      level: 10, hp: 55,  color: 0x4f8f3f, size: 0.9 },
  boar:     { name: 'Wild Boar',       level: 18, hp: 80,  color: 0x6e5a46, size: 1.0 },
  skeleton: { name: 'Skeleton',        level: 28, hp: 110, color: 0xd8d2c0, size: 1.0 },
  zombie:   { name: 'Zombie',          level: 34, hp: 140, color: 0x5a7a4a, size: 1.0 },
  bull:     { name: 'Raging Bull',     level: 42, hp: 180, color: 0x4a3a2a, size: 1.3 },
  minotaur: { name: 'Small Minotaur',  level: 55, hp: 240, color: 0x7a4a2a, size: 1.4 },
};

// Spawn groups: a cluster of `count` creatures starting at (ox, oy) and stepping by
// (dx, dy) so they don't all stack. Anchors are interior tiles of each chunk
// (lower level near the lobby → higher level toward the boss).
const CREATURE_SPAWNS = [
  // Grassy Path (closest to lobby) — lowest
  { chunk: 'grassy_path',   type: 'rabbit', count: 4, ox: 110, oy: 75,  dx: 6, dy: 0 },
  { chunk: 'grassy_path',   type: 'rat',    count: 3, ox: 135, oy: 98,  dx: 6, dy: 0 },
  // Cow Field — low
  { chunk: 'cow_field',     type: 'cow',     count: 5, ox: 110, oy: 14, dx: 8, dy: 0 },
  { chunk: 'cow_field',     type: 'chicken', count: 3, ox: 120, oy: 42, dx: 6, dy: 0 },
  // River Crossing — low
  { chunk: 'river_crossing', type: 'frog',   count: 4, ox: 115, oy: 138, dx: 8, dy: 0 },
  { chunk: 'river_crossing', type: 'rat',    count: 2, ox: 140, oy: 158, dx: 6, dy: 0 },
  // Cave Entrance — medium
  { chunk: 'cave_entrance', type: 'boar',    count: 4, ox: 175, oy: 16, dx: 9,  dy: 0 },
  { chunk: 'cave_entrance', type: 'boar',    count: 3, ox: 180, oy: 42, dx: 10, dy: 0 },
  // Catacombs — medium-high
  { chunk: 'catacombs',     type: 'skeleton', count: 4, ox: 175, oy: 76, dx: 9, dy: 0 },
  { chunk: 'catacombs',     type: 'zombie',   count: 3, ox: 185, oy: 100, dx: 9, dy: 0 },
  // Mountain Cave (adjacent to boss) — highest
  { chunk: 'mountain_cave', type: 'bull',     count: 4, ox: 235, oy: 16, dx: 9,  dy: 0 },
  { chunk: 'mountain_cave', type: 'minotaur', count: 3, ox: 240, oy: 42, dx: 11, dy: 0 },
];

// Build the flat creature list (identical on client and server). Each creature has
// its spawn tile and a 4×6 home box (clamped so the box is centred on spawn).
function buildCreatures() {
  const out = [];
  let seq = 0; // global running index → guaranteed-unique ids (deterministic, so
               // client and server build identical ids)
  for (const g of CREATURE_SPAWNS) {
    const t = CREATURE_TYPES[g.type];
    if (!t) continue;
    for (let i = 0; i < g.count; i++) {
      const sx = g.ox + g.dx * i;
      const sy = g.oy + g.dy * i;
      out.push({
        id: `creature_${g.type}_${seq++}`,
        type: g.type,
        name: t.name,
        level: t.level,
        maxHp: t.hp,
        color: t.color,
        size: t.size,
        multiplier: CREATURE_XP_MULTIPLIER,
        chunk: g.chunk,
        spawnX: sx,
        spawnY: sy,
        homeMinX: sx - Math.floor(CREATURE_HOME_W / 2),       // 4 wide
        homeMaxX: sx - Math.floor(CREATURE_HOME_W / 2) + CREATURE_HOME_W - 1,
        homeMinY: sy - Math.floor(CREATURE_HOME_H / 2),       // 6 tall
        homeMaxY: sy - Math.floor(CREATURE_HOME_H / 2) + CREATURE_HOME_H - 1,
      });
    }
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CREATURE_TYPES, CREATURE_SPAWNS, CREATURE_XP_MULTIPLIER,
    CREATURE_HOME_W, CREATURE_HOME_H, CREATURE_RESPAWN_MS, buildCreatures,
  };
}
