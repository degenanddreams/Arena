// icons.js — placeholder item-icon art (roadmap §35, Prompts D / F + Leather).
//
// Loads the raw design-sheet JPEGs and registers cropped sub-frames so the
// inventory / bank / merchant / equipment panels can show real art instead of
// flat coloured rectangles. This deliberately avoids the prepare_assets.js
// background-removal pipeline: frames are plain rectangular crops of the source
// sheets (their backgrounds are included), which is fine for small slot icons
// and needs no new files. Icons scale-to-fit their slot, so crop precision is
// forgiving.
//
// Used by: GameScene.preload() (loads ICON_TEXTURES) + GameScene.create()
// (calls registerIconFrames). InventoryPanel.addItemSlot() and EquipmentPanel
// look up iconForItem() when drawing a slot.

// key -> path under client/assets/. Files exist on disk (no failed loads).
const ICON_TEXTURES = {
  gold_piles:    'items/gold_piles.jpg',
  chicken_sheet: 'items/chicken.jpg',
  leather_pieces:'items/leather_armor_pieces.jpg',
  kopesh_ref:    'items/kopesh_reference.jpg',
  stiletto_ref:  'items/stiletto_reference.jpg',
};

// Named frames cropped from those textures: [texture, x, y, w, h].
// Coordinates are in each source's native pixels.
const ICON_FRAMES = {
  // Gold piles — 4x2 grid on a 1254x1254 sheet, single coin -> large pyramid.
  gold_1: ['gold_piles',  70, 440, 175, 130],
  gold_2: ['gold_piles', 345, 440, 225, 140],
  gold_3: ['gold_piles', 645, 395, 255, 180],
  gold_4: ['gold_piles', 955, 360, 260, 215],
  gold_5: ['gold_piles',  35, 785, 255, 310],
  gold_6: ['gold_piles', 335, 755, 265, 345],
  gold_7: ['gold_piles', 645, 695, 265, 405],
  gold_8: ['gold_piles', 945, 695, 280, 405],

  // Cooked Chicken — the hero render on the left of the design sheet (591x160).
  chicken: ['chicken_sheet', 108, 12, 168, 145],

  // Leather pieces — 3x2 layout on a 1280x960 sheet.
  leather_chestplate: ['leather_pieces',  95,  95, 320, 390],
  leather_platelegs:  ['leather_pieces', 110, 505, 265, 380],
  leather_helmet:     ['leather_pieces', 480, 545, 285, 320],
  leather_shield:     ['leather_pieces', 865, 540, 275, 355],

  // Weapons — top hero render of each reference sheet (1254x1254).
  kopesh:   ['kopesh_ref',   80, 225, 1115, 470],
  stiletto: ['stiletto_ref', 70, 390, 1145, 250],
};

// Gold quantity -> pile stage (8 stages). Highest threshold the quantity meets.
const GOLD_STAGES = [
  { min: 50000, frame: 'gold_8' },
  { min: 10000, frame: 'gold_7' },
  { min: 2500,  frame: 'gold_6' },
  { min: 500,   frame: 'gold_5' },
  { min: 100,   frame: 'gold_4' },
  { min: 25,    frame: 'gold_3' },
  { min: 5,     frame: 'gold_2' },
  { min: 0,     frame: 'gold_1' },
];

function goldFrameForQty(qty) {
  const q = qty || 0;
  for (const stage of GOLD_STAGES) {
    if (q >= stage.min) return stage.frame;
  }
  return 'gold_1';
}

// item_id -> icon frame name (static items). Gold is dynamic (see iconForItem).
const ITEM_ICON_FRAME = {
  17: 'chicken',
  9: 'kopesh',  13: 'kopesh',   // Bronze / Iron Kopesh
  10: 'stiletto', 14: 'stiletto', // Bronze / Iron Stiletto
  19: 'leather_helmet',
  20: 'leather_chestplate',
  21: 'leather_platelegs',
  22: 'leather_shield',
};

// Returns { texture, frame } for an item, or null if it has no icon art yet.
function iconForItem(itemId, quantity) {
  let frameName = null;
  if (itemId === 18) frameName = goldFrameForQty(quantity);
  else frameName = ITEM_ICON_FRAME[itemId] || null;
  if (!frameName) return null;
  const def = ICON_FRAMES[frameName];
  if (!def) return null;
  return { texture: def[0], frame: frameName };
}

// Registers every ICON_FRAMES entry on the loaded source textures so that
// scene.add.image(x, y, texture, frameName) works. Idempotent. Call once after
// the textures have loaded (GameScene.create). Textures are global to the game,
// so frames registered here are visible to UIScene panels too.
function registerIconFrames(scene) {
  for (const [frameName, def] of Object.entries(ICON_FRAMES)) {
    const [texKey, x, y, w, h] = def;
    if (!scene.textures.exists(texKey)) continue;
    const tex = scene.textures.get(texKey);
    if (tex.has(frameName)) continue; // already registered
    tex.add(frameName, 0, x, y, w, h);
  }
}

// Helper for panels: if the item has a registered icon, add a scaled-to-fit
// image to `container` centred at (cx, cy) within a `box` px square. Returns the
// image (or null if no icon). Scene + texture/frame existence are checked.
function addItemIcon(scene, container, cx, cy, box, itemId, quantity) {
  const icon = iconForItem(itemId, quantity);
  if (!icon || !scene.textures.exists(icon.texture)) return null;
  const tex = scene.textures.get(icon.texture);
  if (!tex.has(icon.frame)) return null;

  const img = scene.add.image(cx, cy, icon.texture, icon.frame).setOrigin(0.5);
  const fr = tex.get(icon.frame);
  const scale = Math.min(box / fr.width, box / fr.height);
  img.setScale(scale);
  if (container) container.add(img);
  return img;
}
