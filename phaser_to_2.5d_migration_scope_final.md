# Arena — Phaser → 2.5D Hybrid Migration Scope
# STATUS: COMPLETE as of 2026-06-15

All phases done. This document is now an architectural reference, not a work plan.
For what's next, see CLAUDE.md Section 35 and claude_code_prompts_updated.md.

---

## Architecture: Dual-Canvas Three.js + Phaser

**Three.js r159** via jsDelivr CDN (`build/three.min.js` — last version with global
UMD build. r161+ removed it). enable3d ruled out: ESM-only, no CDN-compatible bundle.

**Dual-canvas stack:**
```
#game (1280×720, position: relative)
  #threejs-canvas   z-index:0  pointer-events:none   ← Three.js world
  phaser canvas     z-index:1  transparent:true       ← Phaser UI overlay
```

Phaser is a static transparent overlay. All world rendering (ground, billboards,
camera) lives in `client/js/systems/ThreeScene.js`. All UI, input, and HUD remain
in Phaser scenes unchanged.

---

## Phase Completion Log

| Phase | Work | Status |
|---|---|---|
| 0a | Remove CSS scaleY pitch hack from GameScene.js + timing.js | ✅ Done |
| 0b | Stand up ThreeScene.js dual-canvas proof of concept | ✅ Done |
| 1 | Ground planes — textured THREE.PlaneGeometry per zone | ✅ Done |
| 2 | Player billboard — THREE.Sprite with static player_male.png placeholder | ✅ Done |
| 3 | Camera rig — PerspectiveCamera, spherical orbit+pitch, scroll zoom | ✅ Done |
| 4 | Entity billboards — 36 dummies, boss, other players | ✅ Done |
| 5 | Click-to-move raycasting — THREE.Raycaster → Pathfinding.js bridge | ✅ Done |
| 6 | UI world-space tracking — getScreenPosition() for all floating labels/bars | ✅ Done |
| 7 | Multiplayer regression — two clients verified (one issue outstanding) | ✅ Done* |

*Phase 7 outstanding: other player right-click broken — fix in progress.

---

## Key Technical Decisions (authoritative)

### Camera (timing.js CAMERA block)
- Orbit: left/right arrows, `ROTATION_SPEED` rad/s, continuous while held
- Pitch: up/down arrows, `PITCH_SPEED` rad/s, clamped `PITCH_MIN`–`PITCH_MAX`
- Zoom: scroll wheel, `DIST_MIN`–`DIST_MAX` tile units (dolly, not FOV)
- Spherical decomp: `hDist = dist*cos(pitch)`, `vDist = dist*sin(pitch)`, camera
  at `(tx - hDist*sin(orbit), vDist, tz + hDist*cos(orbit))`, lookAt `(tx,0,tz)`

### Click Detection
- Three.js canvas is `pointer-events:none` — Phaser owns all input
- `ThreeScene.getGroundPositionFromScreen(screenX, screenY)` converts to NDC,
  fires raycaster against `THREE.Plane(y=0)`, returns `{tileX, tileZ}`
- Scene-level `pointerdown` in GameScene.js matches returned tile against:
  1. Remote player positions (right-click → name reveal)
  2. Dummy tile positions (left-click → attack, right-click → menu)
  3. Boss footprint 3×3 tiles (left-click → attack)
  4. Fallthrough → moveTo()
- Red click marker for attack targets, yellow for movement

### UI Tracking
- `ThreeScene.getScreenPosition(worldX, worldZ, heightOffset)` projects to Phaser
  screen coords via `camera.project()` → sets Phaser object x/y each frame
- Height offsets: dummies 1.8, boss 3.8, players 2.1

### Entity Scale (world units)
- Player + other players: 0.9w × 1.8h
- Dummies: DUMMY_SPRITE_W × DUMMY_SPRITE_H (defined in ThreeScene.js constants)
- Boss: 3.0w × 3.5h

### Sprite Placeholders (pending production art)
- Player: `sprites/player_male.png` — static, no animation
- Boss: `sprites/boss.png` — near-black, low contrast against cave floor
- Dummies: `sprites/dummy.png` — working correctly
- Reference diagrams (movement_sprites.jpg, attack_sprites.jpg, etc.) are NOT
  game-ready assets — they have labels and opaque backgrounds

---

## What Stayed the Same (unchanged by migration)
- `server/multiplayer.js` — all Socket.io/combat/wager logic untouched
- `server/systems/CombatSystem.js`, `XPSystem.js` — unchanged
- `client/js/systems/Pathfinding.js` — A* grid logic unchanged, only coordinate
  mapping changed (raycaster feeds tileX/tileZ directly)
- `client/js/systems/NetworkManager.js` — unchanged
- All UI panels (inventory, equipment, skills, chat, NPC panels) — unchanged
- Socket event payloads — unchanged

---

## Risks Resolved
- ✅ Camera sync drift — Phaser camera locked static (zoom=1, no rotation),
  Three.js camera driven exclusively from orbitAngle/pitchAngle/camDist state vars
- ✅ UI distortion — Phaser UI unaffected (separate canvas, no transform applied)
- ✅ Input — all clicks handled by Phaser; Three.js canvas never captures events
- ✅ Multiplayer scale — other player billboards use same world-unit scale as local
- ✅ Position sync — 500ms broadcasts + interpolation work in 3D
- ⚠️ Performance with many billboards — not load-tested at >5 concurrent players
