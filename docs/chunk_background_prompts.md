# Chunk Background — Image Generation Prompts

> One ready-to-paste prompt per new chunk, for an external image generator
> (Midjourney / DALL·E / SD). Each produces the **ground/area image** for that chunk
> — no characters (NPCs come later). Generate → drop the JPEG at the path below →
> I point the chunk's ThreeScene ground plane at it (replaces the flat colour).
>
> Tuned to match the existing references in `client/assets/reference/` and
> `client/assets/backgrounds/` (`lobby.jpg`, `training_grounds.jpg`, `boss_cave.jpg`):
> top-down isometric 3D render, ~45° overhead, warm soft key light + soft shadows,
> low-poly stylized realism, hand-crafted RPG world tile.

## How to use
1. Paste **STYLE PREAMBLE** + the chunk's **SUBJECT** + the **ASPECT** for that chunk.
2. Add your generator's "no text / no characters" flags (MJ: `--no people, text, watermark`).
3. Save as the **filename** shown → I wire it in (`ThreeScene` ZONES_3D `texPath`).
4. Aspect: **60×60 chunks → square (1:1)**; **legacy 40×30 rooms → 4:3** (so the
   texture isn't stretched on its ground plane).

---

## STYLE PREAMBLE (prepend to every prompt)
> Top-down isometric 3D-rendered game environment, ~45° overhead angle, low-poly
> stylized realism, warm soft key light with gentle ambient occlusion and soft
> shadows, hand-crafted RPG world-map tile in the style of a polished mobile RPG /
> Old School RuneScape, scattered small rocks and ground detail, cohesive single
> area, no characters, no creatures, no text, no UI, no labels, full-bleed —

---

## Green outdoors (lush medieval palette: grass #4f8f3f, oak #6b4a2a, water #2f6f9a)

### Cow Field → `client/assets/backgrounds/cow_field.jpg` · square
> SUBJECT: a lush green grassy pasture dotted with wildflowers and small dirt
> patches, a rustic wooden post-and-rail fence running through it, a couple of hay
> bales and a feeding trough, a few mossy boulders, bright cheerful daylight.

### Grassy Path → `client/assets/backgrounds/grassy_path.jpg` · square
> SUBJECT: a winding packed-dirt walking path cutting through green grassland,
> flanked by rounded oak and birch trees, leafy bushes, tree stumps and small rocks,
> dappled warm light.

### River Crossing → `client/assets/backgrounds/river_crossing.jpg` · square
> SUBJECT: a clear blue river flowing across a green grassy clearing with an arched
> wooden plank footbridge crossing it, reeds and lily pads at the water's edge, mossy
> grey boulders and a few trees along the banks.

### Grassy Cave Entrance → `client/assets/backgrounds/cave_entrance.jpg` · square
> SUBJECT: the rocky grey base of a mountain with a dark arched cave mouth opening
> into shadow, patches of green grass, ferns and scattered boulders at the foot, a
> worn dirt path leading into the cave — a transition from sunny grassland to cold
> stone.

---

## Dark stone dungeons (rock #33312f, occult purple #4a2f6a, torch/ember glow)

### Mountain Cave → `client/assets/backgrounds/mountain_cave.jpg` · square
> SUBJECT: the dim interior floor of a rocky mountain cavern, grey-brown stone
> ground with cracks and rubble, jagged stalagmites and boulders, faint warm
> torchlight pooling in the dark, cold and ominous atmosphere.

### Catacombs → `client/assets/backgrounds/catacombs.jpg` · square
> SUBJECT: the floor of an ancient dark stone catacomb crypt, cracked flagstones,
> carved occult purple rune symbols glowing faintly, scattered bones and a stone
> sarcophagus, dim purple-and-amber torch glow, eerie and sacred — matching the
> palette of the existing boss cave.

---

## Interior rooms (legacy 40×30 — warm sandstone, bridges to the desert town)

### Prayer Room → `client/assets/backgrounds/prayer_room.jpg` · 4:3
> SUBJECT: the interior stone floor of a small candlelit chapel / prayer sanctuary,
> warm sandstone flagstones, a central carved stone altar with a softly glowing rune,
> tall iron candelabras and braziers casting warm light, a woven prayer rug, serene
> and holy — sandstone palette consistent with the desert lobby.

### Armory → `client/assets/backgrounds/armory.jpg` · 4:3
> SUBJECT: the interior of a blacksmith's armory, stone-and-timber floor, a heavy
> iron anvil and a glowing orange forge, wall racks of swords, shields and spears,
> barrels and a grindstone, warm forge glow and sparks — matching the wood-and-stone
> look of the lobby.

---

## Optional — re-do the moved Boss Cave at square aspect
The Boss Cave moved to a 60×60 chunk, so its existing 4:3 `boss_cave.jpg` is now
stretched. If you want a clean fit, regenerate it square:
### Boss Cave → `client/assets/backgrounds/boss_cave.jpg` · square
> SUBJECT: a dark Egyptian-occult stone cave arena, near-black rock floor with a
> golden bull-skull mosaic inlaid in the centre, gold-trimmed black obelisks with
> purple ankh runes, purple flame braziers, an ominous ceremonial chamber.

---

## When you hand them back
Drop the JPEGs at the paths above and tell me — I set each chunk's `ThreeScene`
ZONES_3D `texPath` (currently `null` → flat colour). Missing files stay flat-colour,
so we can do them one at a time. Sprite/creature/NPC prompts live in
`docs/asset_style_guide.md`.
