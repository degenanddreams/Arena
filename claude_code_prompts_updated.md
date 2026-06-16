# Arena — Polish Pass Prompts (Updated 2026-06-15)

## Status Overview

| Prompt | Task | Status |
|---|---|---|
| Camera controls | Smooth orbit + real pitch + scroll zoom | ✅ Done (2.5D migration) |
| Character scale | Player ~1.5–2 tiles in 3D world | ✅ Done (billboard sizing) |
| Tile collision | Walkability rules per asset | 📋 Not started |
| Item icons | Gold piles + chicken art | 📋 Not started |
| Kopesh rename + art | Scimitar → Kopesh everywhere | 📋 Not started |
| Leather T1 + tier renumber | New tier 1, Bronze→T2, Iron→T3 | 📋 Not started |
| Lobby NPC models | Egyptian Warriors replace placeholders | 📋 Not started |
| Sprite sheets | Player/dummy/boss animation (BLOCKED on art) | ⛔ Blocked |
| Equipment visuals on sprite | Gear layered on character (BLOCKED on art) | ⛔ Blocked |
| Dev test mode | Max stats + top gear via ?dev=maxstats | 📋 Not started |
| Other player right-click | Name reveal broken after Phase 7 fix | 🔧 In progress |

---


---

## Prompt A — Dev/Test Mode (do second — unblocks testing everything else)

**No asset files needed.**

```
Add a dev-only test mode triggered by the URL query param ?dev=maxstats.
When active for the local test player (test_wallet_001 or whatever wallet
is in the URL), on game load:

1. Set Attack, Strength, Defense XP to the level 99 value from
   client/js/config/xpTable.js via a POST to the player API.
2. Equip the highest available tier of helmet, chestplate, platelegs,
   shield, and weapon — whatever is currently the highest tier in
   items.js (currently Iron/Tier 2 pending the Leather renumber).
3. Set current_hp to the player's max HP.

Gate behind: only fire if window.location.search includes 'dev=maxstats'
AND window.location.hostname is 'localhost' or '127.0.0.1'.

Add a small on-screen indicator (e.g. a red "DEV MODE" text in the top
left, depth 100) so it's clear when the mode is active.

Document how to trigger it in README.md.

Verify: open http://localhost:3000?dev=maxstats, confirm stats are maxed,
gear is equipped, and the player can kill the group boss quickly.
```

---

## Prompt B — Scimitar → Kopesh Rename

**No asset files needed.**

```
Rename "Scimitar" to "Kopesh" everywhere in the codebase.

Files to update:
- client/js/config/items.js — item names for IDs 9 and 13
  (Bronze Scimitar → Bronze Kopesh, Iron Scimitar → Iron Kopesh)
- client/js/ui/InventoryPanel.js — any display strings
- client/js/ui/EquipmentPanel.js — any display strings
- client/js/ui/CombatStylePanel.js — any display strings or style keys
- server/routes/items.js — if item names are stored/returned server-side
- server/database.js — if item names are in the seed data

Do NOT change any OSRS reference text in design docs or comments
explaining the OSRS scimitar attack speed — only in-game-facing strings.

Verify: open inventory, equipment panel, and combat style panel and
confirm no "Scimitar" label appears anywhere.
```

---

## Prompt C — Leather Armor Tier 1 + Tier Renumbering

**Place these files first:**
- `leather_armor_tier_1.jpg` → `client/assets/reference/leather_armor_turnaround.jpg`
- `leather_armor_image_2.jpg` → `client/assets/items/leather_armor_pieces.jpg`

```
Read CLAUDE.md Section 4 (Master Item Definitions) and Section 35 (roadmap).

Add Leather Armor as the new Tier 1 set, shifting Bronze to Tier 2 and
Iron to Tier 3.

1. In client/js/config/items.js and server/database.js seed data, add:
   - Leather Helmet (new ID, Tier 1, helmet slot, def_req: 0)
   - Leather Chestplate/Jerkin (new ID, Tier 1, chestplate slot, def_req: 0)
   - Leather Platelegs (new ID, Tier 1, platelegs slot, def_req: 0)
   - Leather Kite Shield (new ID, Tier 1, shield slot, def_req: 0)
   Stats should be slightly below Bronze values (Bronze will be Tier 2).
   Use client/assets/items/leather_armor_pieces.jpg as the icon source
   (crop the chest, legs, helmet, and shield from the piece layout image).

2. Update existing Bronze items: tier 1 → tier 2. Keep IDs stable.
   Update existing Iron items: tier 2 → tier 3. Keep IDs stable.

3. Update any hardcoded tier references:
   - Loot tables (boss drops, merchant stock)
   - Merchant gold values
   - Dummy/gear-tier unlock relationships
   - UI tier labels

4. client/assets/reference/leather_armor_turnaround.jpg shows the full
   set equipped — use as visual reference, not a game asset.

Verify: new character can equip Leather set with no requirement errors.
Bronze and Iron still equip at their new tier numbers.
```

---

## Prompt D — Item Icons: Gold & Chicken

**Place these files first:**
- `gold1.jpg` → `client/assets/items/gold_piles.jpg`
- `chicken_1.jpg` → `client/assets/items/chicken.jpg`

```
Replace the placeholder gold and chicken item icons.

1. client/assets/items/gold_piles.jpg is an 8-panel sprite sheet showing
   gold coin piles from single coin (top-left) to large pyramid (bottom-
   right). Slice into 8 individual icons and show the appropriate one
   based on gold quantity held. Suggested breakpoints (adjust if needed):
   1, 5, 25, 100, 500, 2500, 10000, 50000+.
   Wire into the inventory panel gold display and HUD gold counter.

2. client/assets/items/chicken.jpg is the cooked chicken food item
   (heals 20 HP — do not change the heal value, only the icon).
   Replace the placeholder chicken icon in the inventory panel.

Update client/js/config/items.js with icon path references if that is
where icons are currently defined.

Verify: gold icon scales correctly through the quantity tiers, chicken
icon shows the new art in inventory.
```

---

## Prompt E — Lobby NPC Model Swap

**Place this file first:**
- `training_ground_trainer_npcs.jpg` → `client/assets/npc/desert_warrior_npcs.jpg`

```
Read CLAUDE.md Section 35 and arena_concept_spec_v2.docx Reference 15.

client/assets/npc/desert_warrior_npcs.jpg contains four Egyptian Desert
Warrior character models. Assign and slice them for the four Lobby NPCs:

- Shieldbearer/Khopesh Warrior → Banker
- Spearmaiden → Merchant
- Dune Stalker (Dual Blades) → Cosmetic Shop
- Sun Priestess → Food Shop

Slice each character from the reference sheet into an individual sprite
(or use the full sheet with UV cropping if cleaner). Replace the current
placeholder NPC sprites in GameScene.js and update NpcPanels.js so each
NPC keeps its existing interaction panel but shows the new model.

Verify: all four Lobby NPCs show their new models and clicking each one
opens the correct panel (bank, merchant trade, cosmetic shop, food shop).
```

---

## Prompt F — Weapon Art (Kopesh + Stiletto placeholder icons)

**Depends on Prompt B (rename) being done first.**

**Place these files first:**
- `kopesh.jpg` → `client/assets/items/kopesh.jpg`
- `stiletto_1.jpg` → `client/assets/items/stiletto.jpg`

```
Wire placeholder weapon art for Kopesh and Stiletto items.

client/assets/items/kopesh.jpg and stiletto.jpg are reference renders
(red crystalline blade, gold/ruby hilt) to use as the universal icon for
all Kopesh-type and Stiletto-type weapons across ALL tiers until
tier-specific art is produced.

Update client/js/config/items.js to add an icon path for every Kopesh
and Stiletto entry (currently IDs 9, 10, 13, 14 — and any new Leather
tier equivalents added in Prompt C). These should be inventory panel
icons only (not the in-world billboard — the billboard uses player_male.png
until real spritesheets are ready).

Verify: Kopesh and Stiletto items show the new red/gold blade icon in
inventory and equipment panel.
```

---

## BLOCKED — Needs Production Art First

These prompts are ready to run the moment the art assets are delivered.
The reference diagrams already exist in client/assets/source/ but are
NOT game-ready (they have labels, grid lines, and opaque backgrounds).

### Prompt G — Player Animation Spritesheet
**Blocked on:** Clean transparent-background PNG with 8-directional Walk
and Run cycles, 6 frames each, no labels. Layout reference: `movement_sprites.jpg`.

```
Wire the production player movement spritesheet into ThreeScene.js.

The spritesheet should be a single PNG at client/assets/sprites/player_walk.png
(or similar — name it clearly). Layout: 12 columns × 8 rows where columns
are animation frames and rows are directions (N, NE, E, SE, S, SW, W, NW
top to bottom).

In ThreeScene.js, replace the static player_male.png billboard with an
animated billboard:
- _loadSpriteSheet(url, cols, rows) — loads the PNG, sets UV repeat to
  one cell (1/cols × 1/rows)
- updatePlayer(worldX, worldZ, movingDx, movingDz, animTime) — selects
  the correct row via dirRowFromMovement() and the correct column via
  Math.floor(animTime / FRAME_MS) % cols
- Wire animTime to advance only while the player is moving

Same pattern for attack animations when a Kopesh/Stiletto attack spritesheet
is delivered.
```

### Prompt H — Dummy Recoil Spritesheet
**Blocked on:** Clean transparent-background PNG with 8-directional recoil
frames, 4 frames each. Reference: `dummy_recoil_sprites.jpg`.

### Prompt I — Boss Spritesheet / High-Contrast Art
**Blocked on:** New boss.png that is visible against the dark cave floor
(current asset is near-black). Either a higher-contrast version of the
existing bull design, or the production boss sprite.

### Prompt J — Equipment Visuals on Character
**Blocked on:** Prompts B, C, F, and G all being done first (rename,
leather armor icons, weapon icons, and player spritesheet must all exist
before gear can be layered on animation frames).

---

## Notes for Next Session

1. Always run `npm start` in a dedicated terminal window before testing.
2. Hard refresh with Cmd+Shift+R after any code change.
3. Two-window multiplayer test: window 1 = default URL, window 2 = `?wallet=test_wallet_002&name=Tester2`.
4. Three.js is pinned to r159 via CDN — do not upgrade (r161+ removed the global UMD build).
5. No build step — all JS loaded via `<script>` tags in index.html. Maintain load order.
6. Server is at `server/server.js` — `npm start` runs both server and serves client.
