// chunks.js — the Arena world is built from CHUNKS.
//
// A CHUNK is the fundamental unit of map space, locked at 60×60 tiles. The world
// grows by appending chunks addressed by (col, row): col increases east (+X),
// row increases south (+Y). World tile coordinates are always non-negative, so a
// chunk added to the west/north pushes existing content (no negative indices).
//
// LOCKED CONVENTION (do not change without a world-wide re-fit):
//   • CHUNK.W = CHUNK.H = 60 tiles.
//   • New chunks are 60×60 and tile cleanly against their neighbours.
//   • Walls live on each chunk's border; passages between chunks are CHUNK_DOORS.
//
// LEGACY NOTE: the three original areas (Boss Cave, Training Grounds, Lobby)
// predate the chunk system and are still 40 wide × 30 deep (`legacy: true`).
// They will be re-fit to full 60×60 in a later pass. Every chunk with
// `legacy: false` is built to the locked 60×60 standard.
//
// This file is the single source of truth for the world map. The map PDF
// (scripts/generate_map_pdf.js → docs/arena_map.pdf) and the in-game world
// (GameScene.buildWorld, ThreeScene ground planes) are both generated from it.
// See CLAUDE.md "Map Expansion Plan" for the official plan.

const CHUNK = { W: 60, H: 60 }; // locked chunk size in tiles

// Each chunk: world-tile bounds (inclusive), hidden-tilemap colour slot
// (`tileIndex`), Three.js ground colour, optional background image, theme/desc
// (shown on the map PDF), and a `built` flag (false = planned shell, contents TBD).
const CHUNKS = {
  // --- Legacy column (X 60-99, still 40×30; band walls via GameScene WALL_ROWS) ---
  armory: {
    key: 'armory', name: 'Armory', desc: 'Armoursmith + weaponsmith. No stock yet.',
    legacy: true, built: true, minX: 60, maxX: 99, minY: 0, maxY: 29,
    tileIndex: 11, color: 0x4a4e57, texPath: null,
  },
  training_grounds: {
    key: 'training_grounds', name: 'Training Grounds', desc: '36 dummies, 12 tiers.',
    legacy: true, built: true, minX: 60, maxX: 99, minY: 30, maxY: 59,
    tileIndex: 1, color: 0x5a3a14, texPath: '/assets/backgrounds/training_grounds.jpg',
  },
  lobby: {
    key: 'lobby', name: 'Lobby', desc: 'Hub: bank, merchant, shops, spawn.',
    legacy: true, built: true, minX: 60, maxX: 99, minY: 60, maxY: 89,
    tileIndex: 0, color: 0x555555, texPath: '/assets/backgrounds/lobby.jpg',
  },
  prayer_room: {
    key: 'prayer_room', name: 'Prayer Room', desc: 'Altar + priest NPC (TBD). South of lobby.',
    legacy: true, built: false, minX: 60, maxX: 99, minY: 90, maxY: 119,
    tileIndex: 5, color: 0x6b5836, texPath: null,
  },

  // --- Wilderness (60×60 chunks east of the lobby) ---
  cow_field: {
    key: 'cow_field', name: 'Cow Field', desc: 'Open grassy field with cows. Leads to the cave.',
    legacy: false, built: false, minX: 100, maxX: 159, minY: 0, maxY: 59,
    tileIndex: 8, color: 0x4f8f3f, texPath: null,
  },
  cave_entrance: {
    key: 'cave_entrance', name: 'Grassy Cave Entrance', desc: 'Cave mouth at the base of a mountain.',
    legacy: false, built: false, minX: 160, maxX: 219, minY: 0, maxY: 59,
    tileIndex: 9, color: 0x47604a, texPath: null,
  },
  mountain_cave: {
    key: 'mountain_cave', name: 'Mountain Cave', desc: 'Bulls + small minotaurs inside the mountain.',
    legacy: false, built: false, minX: 220, maxX: 279, minY: 0, maxY: 59,
    tileIndex: 10, color: 0x33312f, texPath: null,
  },
  boss_cave: {
    key: 'boss_cave', name: 'Boss Cave', desc: 'The Minotaur. Group boss + AOE. East of the mountain cave.',
    legacy: false, built: true, minX: 280, maxX: 339, minY: 0, maxY: 59,
    tileIndex: 2, color: 0x2a1a2a, texPath: '/assets/backgrounds/boss_cave.jpg',
  },
  catacombs: {
    key: 'catacombs', name: 'The Catacombs', desc: 'Dark occult antechamber. South of the cave entrance.',
    legacy: false, built: true, minX: 160, maxX: 219, minY: 60, maxY: 119,
    tileIndex: 4, color: 0x241b2e, texPath: null,
  },
  grassy_path: {
    key: 'grassy_path', name: 'Grassy Path', desc: 'Scenic walking path, trees. Lobby → wilderness.',
    legacy: false, built: false, minX: 100, maxX: 159, minY: 60, maxY: 119,
    tileIndex: 6, color: 0x3f7a3f, texPath: null,
  },
  river_crossing: {
    key: 'river_crossing', name: 'River Crossing', desc: 'River + bridge. South of the grassy path.',
    legacy: false, built: false, minX: 100, maxX: 159, minY: 120, maxY: 179,
    tileIndex: 7, color: 0x2f6f6a, texPath: null,
  },
};

// Overall tile extent of the built+planned world (derived from the chunks above).
const WORLD_TILES = { W: 340, H: 180 };

// Walkable passages between chunks. Each spec carves a 2-wide doorway through the
// shared border between two chunks (both border tiles become floor). `axis: 'v'`
// = vertical border at column `at` (tiles at-1 and at); `axis: 'h'` = horizontal
// border at row `at` (tiles at-1 and at). `span` = the two tiles along the border.
// NOTE: doorways WITHIN the legacy column (armory↔training↔lobby↔prayer) are not
// listed here — they are carved by GameScene's band-wall logic (WALL_ROWS + DOOR_XS).
// These specs are the passages between non-legacy chunks (and legacy↔wilderness).
const DOOR_SPECS = [
  { a: 'lobby',         b: 'grassy_path',    axis: 'v', at: 100, span: [73, 74] },
  { a: 'grassy_path',   b: 'cow_field',      axis: 'h', at: 60,  span: [129, 130] },
  { a: 'grassy_path',   b: 'river_crossing', axis: 'h', at: 120, span: [129, 130] },
  { a: 'cow_field',     b: 'cave_entrance',  axis: 'v', at: 160, span: [29, 30] },
  { a: 'cave_entrance', b: 'mountain_cave',  axis: 'v', at: 220, span: [29, 30] },
  { a: 'mountain_cave', b: 'boss_cave',      axis: 'v', at: 280, span: [29, 30] },
  { a: 'cave_entrance', b: 'catacombs',      axis: 'h', at: 60,  span: [189, 190] },
];

// Expand DOOR_SPECS to an explicit set of walkable door tiles.
const CHUNK_DOORS = [];
for (const d of DOOR_SPECS) {
  for (const s of d.span) {
    if (d.axis === 'v') { CHUNK_DOORS.push({ x: d.at - 1, y: s }); CHUNK_DOORS.push({ x: d.at, y: s }); }
    else { CHUNK_DOORS.push({ x: s, y: d.at - 1 }); CHUNK_DOORS.push({ x: s, y: d.at }); }
  }
}

// Returns the chunk containing a world tile, or null for void (unbuilt space).
function chunkAt(tileX, tileY) {
  for (const c of Object.values(CHUNKS)) {
    if (tileX >= c.minX && tileX <= c.maxX && tileY >= c.minY && tileY <= c.maxY) return c;
  }
  return null;
}

function isChunkDoor(tileX, tileY) {
  return CHUNK_DOORS.some((d) => d.x === tileX && d.y === tileY);
}

// Bounds of the legacy column (Boss/Training/Lobby), derived — used by the world
// builder to keep the original band-wall behaviour intact.
function legacyBounds() {
  const ls = Object.values(CHUNKS).filter((c) => c.legacy);
  return {
    minX: Math.min(...ls.map((c) => c.minX)), maxX: Math.max(...ls.map((c) => c.maxX)),
    minY: Math.min(...ls.map((c) => c.minY)), maxY: Math.max(...ls.map((c) => c.maxY)),
  };
}

// CommonJS export for server / tooling (map PDF); harmless in the browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CHUNK, CHUNKS, WORLD_TILES, DOOR_SPECS, CHUNK_DOORS, chunkAt, isChunkDoor, legacyBounds };
}
