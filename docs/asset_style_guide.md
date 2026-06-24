# Arena — Asset Style Guide & Generation Prompts

> Purpose: keep all new art consistent with the established look, and make
> producing it fast. Claude can't paint/render art — these prompts are for an
> external image generator (Midjourney / DALL·E / SD). Produced art drops into the
> pipeline in §"Pipeline" below.
>
> Direction (chosen 2026-06-23): **Hybrid — green medieval outdoors, dark stone
> dungeons.** Open-air chunks read as lush RuneScape countryside; caves / catacombs
> / boss keep the existing dark sandstone-occult look so the world transitions
> naturally from the desert town.

---

## 1. Established style (from the real art)

- **Backgrounds** (`lobby.jpg`, etc.): polished **low-poly 3D isometric renders**,
  top-down ~45°, soft ambient occlusion + warm key light, props (crates, torches,
  banners). Full-bleed, no transparency.
- **Characters / creatures** (desert-warrior sheet): **painted semi-realistic RPG
  concept art**, full-body, clean lighting, slight outline read. For in-game use we
  crop to a single subject on a transparent background.
- Overall vibe: **desert-fantasy + medieval** (note the lobby's green-cross crusader
  banners). Mobile-RPG / OSRS quality, not pixel art.

## 2. Palette (hex)

| Region | Use | Colours |
|---|---|---|
| Desert town (existing) | ground / stone / banners / wood | `#d8c49a` sand · `#cbbfa8` stone · `#3f6b5e` green cloth · `#8b5a2b` wood · `#e9b44c` gold |
| Green outdoors (new) | grass / trees / water / fence | `#4f8f3f` grass · `#3f7a3f` deep grass · `#6b4a2a` trunk · `#3e6b32` foliage · `#2f6f9a` river · `#caa06a` dirt path |
| Stone dungeon (new) | cave / catacomb / boss | `#33312f` cave rock · `#241b2e` occult stone · `#4a2f6a` purple accent · `#2a2530` shadow |
| Metal / forge (armory) | anvil / steel / forge glow | `#4a4e57` steel · `#6e5a4a` leather · `#e8732e` forge glow |

These match the chunk `color` values in `client/js/config/chunks.js`.

## 3. Technical spec (so art drops straight in)

- **Billboard sprites** (cow, bull, minotaur, NPCs, trees, altar…): PNG, **transparent
  background**, single centred subject, front/3-4 view. Any resolution (rendered
  scaled by world-unit size). In-game sizes for reference: player `0.9×1.8` tiles,
  dummy `0.85×1.5`, boss `3.0×3.5`. → output roughly square-ish PNGs ~512–1024px.
- **Ground backgrounds** (per chunk): JPEG, full-bleed top-down, ~`60×60` tiles
  aspect (square) for new 60×60 chunks. No transparency.
- **Item icons** (gear tiers): PNG, single item, transparent or flat, ~256px.
- **Naming**: `client/assets/sprites/<thing>.png`, `client/assets/backgrounds/<chunk>.jpg`,
  `client/assets/items/<item>.png`. Add to `asset-manifest.js` (or wire via `icons.js`
  for item icons / `ThreeScene` ZONES_3D for backgrounds).

## 4. Prompt blocks

Prepend the right **STYLE** block, then the **SUBJECT**. Add the generator's
transparent-bg flag for sprites (e.g. Midjourney `--no background` / DALL·E "on a
plain white background, isolated").

**STYLE-OUTDOOR** (green chunks):
> stylized low-poly 3D render, top-down 45° isometric game asset, soft ambient
> occlusion, warm key light, lush medieval English countryside palette (grass
> #4f8f3f, oak #6b4a2a, water #2f6f9a), clean readable silhouette, RuneScape-inspired,
> mobile-RPG quality

**STYLE-DUNGEON** (cave / catacomb / boss):
> stylized low-poly 3D render, top-down 45° isometric game asset, dramatic low key
> light, dark sandstone + occult palette (rock #33312f, occult purple #4a2f6a),
> torch/ember glow, ominous, RuneScape-inspired, mobile-RPG quality

**STYLE-CHAR** (NPCs / creatures, painted sheet look):
> semi-realistic painted RPG character concept art, full body, slight outline,
> clean studio lighting, fantasy game asset, OSRS-inspired, isolated on plain
> background

## 5. Per-asset prompts (by chunk)

### Cow Field — STYLE-OUTDOOR
- **Cow**: "a brown-and-white dairy cow standing on grass, calm" (STYLE-CHAR for the
  animal read + STYLE-OUTDOOR palette)
- **Grass tuft / flowers**: "a small clump of green grass with tiny wildflowers"
- **Wooden fence**: "a short rustic wooden post-and-rail fence segment"

### Grassy Path — STYLE-OUTDOOR
- **Oak tree**: "a single rounded oak tree, full green canopy, brown trunk"
- **Pine tree**: "a tall conifer pine tree"
- **Path ground (background)**: "top-down dirt walking path winding through green
  grass with scattered trees and bushes, square tileable"

### River Crossing — STYLE-OUTDOOR
- **River/water (background)**: "top-down blue river flowing through green banks,
  square tileable"
- **Wooden bridge**: "a simple arched wooden plank footbridge"
- **Rocks**: "a cluster of mossy grey river boulders"

### Grassy Cave Entrance & Mountain Cave — STYLE-DUNGEON (entrance keeps grass at the mouth)
- **Mountain face + cave mouth (background)**: "top-down base of a rocky grey
  mountain with a dark cave entrance, patches of grass at the foot"
- **Bull**: "a large aggressive brown bull, lowered horns" (STYLE-CHAR)
- **Small minotaur**: "a small young minotaur, bull head, muscular humanoid, simple
  loincloth, holding a crude club" (STYLE-CHAR)
- **Stalagmite**: "a pointed grey rock stalagmite"

### Prayer Room — STYLE-DUNGEON (warm candlelit stone)
- **Stone altar**: "an ancient carved stone altar with a glowing rune, candles"
- **Priest**: "a robed priest NPC, hood, holding a holy symbol, serene" (STYLE-CHAR)
- **Candle / brazier**: "a tall iron candelabra with lit candles"

### Armory — metal/forge palette
- **Armoursmith**: "a burly blacksmith NPC in a leather apron holding a shield"
  (STYLE-CHAR)
- **Weaponsmith**: "a blacksmith NPC in a leather apron holding a sword and hammer"
  (STYLE-CHAR)
- **Anvil + forge**: "a blacksmith's anvil and glowing forge"
- **Weapon/armor rack**: "a wooden wall rack of swords and shields"

### Gear-tier icons (still missing — Steel→Eternal) — item-icon spec
For each material × {Kopesh, Stiletto, Battleaxe, Warhammer} and {Helmet, Chestplate,
Platelegs, Shield}: "a single <material> <piece>, fantasy RPG item icon, 3/4 view,
isolated". Materials & reads: Steel (polished silver), Titanium (white-blue),
Tungsten (dark steel), Obsidian (black volcanic glass), Dragonite (emerald-green
scales), Celestial (white-gold radiant), Void (purple-black with violet glow),
Eternal (radiant gold, ultimate).

## 6. Pipeline (wiring produced art)

1. Drop raw renders into `client/assets/source/` (or directly into the target folder
   if already clean + transparent).
2. For sprites needing a background knocked out / crop, add a job to
   `scripts/prepare_assets.js` (`sharp` crop + contiguous background key — see
   CLAUDE.md §27) → emits transparent PNG + updates `asset-manifest.js`.
3. Backgrounds: drop the JPEG and point the chunk's `ThreeScene` ZONES_3D `texPath`
   at it (replaces the flat colour).
4. Item icons: register a crop frame in `client/js/config/icons.js` and map the
   item id → frame.
5. Creatures/NPCs in a chunk: add a billboard in `ThreeScene` + place it from the
   chunk's tile bounds (`chunks.js`), same pattern as dummies/boss.

> Missing art is never fatal: the manifest lists only produced assets, so unmade art
> falls back to flat colours / placeholders with no load errors.
