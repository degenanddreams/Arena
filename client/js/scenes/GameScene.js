// GameScene.js — main game world: tilemap (all three zones), point-and-click
// movement with A* pathfinding, camera zoom/rotate, training dummies and the
// auto-attack combat loop.
//
// Combat style is chosen in the Combat Style Panel (COMBAT button) and stored
// on player.activeTrainingStyle — left-clicking a dummy attacks with it.

// World layout per CLAUDE.md Section 13 — one continuous tilemap, three zones
// stacked south-to-north: Lobby -> Training Grounds -> Boss Cave.
// Chunk system: the world is built from CHUNKS (see config/chunks.js, locked at
// 60×60). The legacy zones now live in chunk column 1 (X 60-99), so all original
// coordinates are shifted +60 in X; the Catacombs chunk occupies X 0-59 to the
// west. WIDTH/HEIGHT mirror WORLD_TILES.
const WORLD = {
  TILE_SIZE: 32,
  WIDTH: 340,   // tiles — mirrors WORLD_TILES.W (config/chunks.js)
  HEIGHT: 180,  // tiles — mirrors WORLD_TILES.H
  // Wall rows separating the legacy column's stacked zones (door gaps cut in):
  // Armory(0-29) / Training(30-59) / Lobby(60-89) / Prayer(90-119).
  WALL_ROWS: [0, 30, 60, 90, 119],
  DOOR_XS: [79, 80],          // 2-tile-wide vertical doorways, centred
  ZONES: {
    ARMORY:           { name: 'Armory',           minY: 0,  maxY: 29,  tileIndex: 11 },
    TRAINING_GROUNDS: { name: 'Training Grounds', minY: 30, maxY: 59,  tileIndex: 1 },
    LOBBY:            { name: 'Lobby',            minY: 60, maxY: 89,  tileIndex: 0 },
    PRAYER_ROOM:      { name: 'Prayer Room',      minY: 90, maxY: 119, tileIndex: 5 },
  },
  SPAWN_ZONE_TILES: 3, // 3x3 spawn zone in lobby centre
  SPAWN_CENTER: { x: 80, y: 74 },
};

// Hidden-tilemap colours, indexed to match each chunk's tileIndex (config/chunks.js):
// 0 lobby · 1 training · 2 boss · 3 wall · 4 catacombs · 5 prayer · 6 grassy_path
// · 7 river · 8 cow_field · 9 cave_entrance · 10 mountain_cave · 11 armory. (Layer is
// hidden; Three.js renders the real ground — these only back A*.)
const TILE_COLORS = {
  lobby: 0x888888,
  training: 0x8B6914,
  boss: 0x333333,
  wall: 0x55504a,
  catacombs: 0x241b2e,
  prayer: 0x6b5836,
  grassy_path: 0x3f7a3f,
  river: 0x2f6f6a,
  cow_field: 0x4f8f3f,
  cave_entrance: 0x47604a,
  mountain_cave: 0x33312f,
  armory: 0x4a4e57,
};

const CLOTHING_COLORS = {
  green: 0x3a9d3a,
  brown: 0x8b5a2b,
  blue: 0x3a6fd8,
  red: 0xc0392b,
};

const MOVE_DURATION_MS = 200; // walk speed: one tile per 200ms

// Dummy tier colours, low tier (tan) -> high tier (dark red)
const DUMMY_TIER_COLORS = [
  0xcdb380, 0xc9a86a, 0xc59a54, 0xc18c3e, 0xbd7e28, 0xb86f1f,
  0xb35f1b, 0xa84f18, 0x9e3f15, 0x8f3012, 0x80200f, 0x70100c,
];
const DUMMY_LOCKED_COLOR = 0x3a3a3a;

// The Minotaur — fixed at the Boss Cave centre, 3x3 tiles. The boss cave is now a
// 60×60 chunk east of the Mountain Cave (X 280-339, Y 0-59), so the centre is (310, 30).
const BOSS_CENTER_TILE = { x: 310, y: 30 };
const BOSS_FOOTPRINT = [];
for (let dy = -1; dy <= 1; dy++) {
  for (let dx = -1; dx <= 1; dx++) {
    BOSS_FOOTPRINT.push({ x: BOSS_CENTER_TILE.x + dx, y: BOSS_CENTER_TILE.y + dy });
  }
}
const BOSS_BODY_COLOR = 0x1a0a0a; // dark charcoal

class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  preload() {
    // Load only art the prepare script actually produced (asset-manifest.js).
    // Missing art simply isn't listed, so there are no failed loads and the
    // game falls back to placeholder shapes.
    const manifest = (typeof ASSET_MANIFEST !== 'undefined')
      ? ASSET_MANIFEST : { backgrounds: {}, sprites: {} };
    for (const [key, rel] of Object.entries(manifest.backgrounds || {})) {
      this.load.image(`bg_${key}`, `assets/${rel}`);
    }
    for (const [key, rel] of Object.entries(manifest.sprites || {})) {
      this.load.image(key, `assets/${rel}`);
    }

    // Item-icon source sheets (icons.js) + the Lobby NPC model sheet. These
    // files exist on disk, so they load cleanly; panels fall back to coloured
    // rectangles for any item without a registered icon.
    if (typeof ICON_TEXTURES !== 'undefined') {
      for (const [key, rel] of Object.entries(ICON_TEXTURES)) {
        this.load.image(key, `assets/${rel}`);
      }
    }
    this.load.image('npc_warriors', 'assets/npc/desert_warrior_npcs.jpg');
  }

  create() {
    // Register cropped item-icon frames on the loaded source sheets so the UI
    // panels can render real art (icons.js). Safe no-op if textures are absent.
    if (typeof registerIconFrames === 'function') registerIconFrames(this);

    this.buildTileTextures();
    this.buildWorld();
    this.buildBackgrounds();
    this.createDummies();
    this.createBoss();
    this.createNpcs();
    this.createPlayer();
    this.setupCombat();
    this.setupInput();
    this.setupCamera();

    // Three.js scene — provides zone ground planes (Phase 1+).
    threeScene.init(this.scale.width, this.scale.height, document.getElementById('game'));
    this.events.once('shutdown', () => threeScene.destroy());

    // Hide the Phaser tile layer — Three.js ground planes replace it visually.
    // The layer's data (this.walkable grid) is untouched so A* still works.
    if (this.tileLayer) this.tileLayer.setAlpha(0);

    // Phase 2: player renders as a Three.js billboard; hide the Phaser placeholder.
    const _gender = (this.registry.get('player') || {}).gender === 'female' ? 'female' : 'male';
    threeScene.createPlayerBillboard(_gender);
    if (this.playerBody) this.playerBody.setVisible(false);

    // Phase 4: dummy and boss billboards; hide Phaser bodies (keep alpha=0 so
    // interactive hit areas remain active — setAlpha(0) does not disable input).
    threeScene.createDummyBillboards(this.dummies);
    threeScene.createBossBillboard(BOSS_CENTER_TILE.x, BOSS_CENTER_TILE.y);
    for (const d of this.dummies) d.body.setAlpha(0);
    if (this.bossBody) {
      this.bossBody.setAlpha(0);
      console.log('[GameScene] bossBody.setAlpha(0) called — type:', this.bossBody.type,
        '| alpha after set:', this.bossBody.alpha,
        '| texture key:', this.bossBody.texture ? this.bossBody.texture.key : '(no texture)',
        '| container visible:', this.bossContainer ? this.bossContainer.visible : '(no container)');
    } else {
      console.warn('[GameScene] bossBody is null/undefined at Phase-4 setup — body never created?');
    }
    this.bossAoeWarningActive = false;

    this.scene.launch('UIScene');

    // First-time players get the tutorial (parallel scene, non-blocking).
    // tutorial_complete is 0/1 in the DB; only launch when not yet complete.
    const player = this.registry.get('player');
    if (!player.tutorial_complete) {
      this.scene.launch('TutorialScene');
    }

    // Multiplayer presence + chat (Section 32, Phase 1)
    this.setupMultiplayer();
  }

  // --- World ---

  buildTileTextures() {
    // One tileset texture: [lobby(0), training(1), boss(2), wall(3), catacombs(4)]
    // The tile layer is hidden (Three.js renders ground); these only back A*.
    const ts = WORLD.TILE_SIZE;
    const colors = [
      TILE_COLORS.lobby, TILE_COLORS.training, TILE_COLORS.boss, TILE_COLORS.wall,
      TILE_COLORS.catacombs, TILE_COLORS.prayer, TILE_COLORS.grassy_path,
      TILE_COLORS.river, TILE_COLORS.cow_field, TILE_COLORS.cave_entrance,
      TILE_COLORS.mountain_cave, TILE_COLORS.armory,
    ];
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    colors.forEach((color, i) => {
      const darker = Phaser.Display.Color.IntegerToColor(color).darken(15).color;
      g.fillStyle(color, 1);
      g.fillRect(i * ts, 0, ts, ts);
      g.lineStyle(1, darker, 1);
      g.strokeRect(i * ts + 0.5, 0.5, ts - 1, ts - 1);
    });

    g.generateTexture('tiles', colors.length * ts, ts);
    g.destroy();
  }

  zoneForRow(y) {
    for (const zone of Object.values(WORLD.ZONES)) {
      if (y >= zone.minY && y <= zone.maxY) return zone;
    }
    return WORLD.ZONES.LOBBY;
  }

  buildWorld() {
    const { WALL_ROWS, DOOR_XS, TILE_SIZE } = WORLD;
    const W = WORLD_TILES.W; // 100
    const H = WORLD_TILES.H; // 90
    const WALL_INDEX = 3;

    this.grid = [];      // tile indices for the tilemap
    this.walkable = [];  // boolean grid for A*

    // Chunk-aware generation (config/chunks.js). Each tile belongs to a chunk or
    // is void. Non-legacy chunks each get their own wall ring; the legacy column
    // (Boss/Training/Lobby) keeps its original band-wall behaviour, relative to
    // the column's own bounds. Doorways (CHUNK_DOORS) carve walkable gaps.
    const LEG = legacyBounds(); // { minX, maxX, minY, maxY } of the legacy column
    for (let y = 0; y < H; y++) {
      const row = [];
      const walkRow = [];
      for (let x = 0; x < W; x++) {
        const c = chunkAt(x, y);
        let isWall;
        let tileIdx;

        if (!c) {
          // Void — unbuilt space. Solid wall.
          isWall = true;
          tileIdx = WALL_INDEX;
        } else if (isChunkDoor(x, y)) {
          // Carved passage between chunks.
          isWall = false;
          tileIdx = c.tileIndex;
        } else if (c.legacy) {
          // Legacy column: band walls (rows in WALL_ROWS, doors at DOOR_XS) plus
          // the column's own outer border (relative to its bounds, not the world).
          const isOuter = x === LEG.minX || x === LEG.maxX || y === LEG.minY || y === LEG.maxY;
          const isZoneWall = WALL_ROWS.includes(y) && !DOOR_XS.includes(x);
          isWall = isOuter || isZoneWall;
          tileIdx = isWall ? WALL_INDEX : c.tileIndex;
        } else {
          // 60×60 chunk: wall ring on its own border, floor inside.
          isWall = x === c.minX || x === c.maxX || y === c.minY || y === c.maxY;
          tileIdx = isWall ? WALL_INDEX : c.tileIndex;
        }

        row.push(tileIdx);
        walkRow.push(!isWall);
      }
      this.grid.push(row);
      this.walkable.push(walkRow);
    }

    const map = this.make.tilemap({ data: this.grid, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = map.addTilesetImage('tiles');
    this.tileLayer = map.createLayer(0, tileset, 0, 0);
    this.map = map;
  }

  // Phase 1+: Three.js renders all ground visuals, so Phaser's background
  // images and tile layer are hidden.  buildBackgrounds() is kept but becomes
  // a no-op; the tile layer (used by A* via this.walkable) stays in the scene
  // so pathfinding works, but at alpha 0 so it's invisible.
  buildBackgrounds() {
    // Intentionally empty — Three.js zone ground planes replace these.
    // The Phaser tile layer is hidden in create() after ThreeScene.init().
  }

  // --- Dummies ---

  createDummies() {
    // 3 dummies per tier, 12 tiers = 36 instances, laid out in the Training
    // Grounds in 6 rows of 2 tier groups. Lowest tiers nearest the lobby door
    // (south), highest tiers nearest the boss cave (north).
    const ts = WORLD.TILE_SIZE;
    this.dummies = [];
    this.dummiesByServerId = new Map(); // serverId → dummy (for server combat events)

    DUMMIES.forEach((tier, tierIndex) => {
      const row = Math.floor(tierIndex / 2);
      const col = tierIndex % 2;
      const baseX = col === 0 ? 68 : 86; // +60 X (legacy column shift)
      const tileY = 56 - row * 4;

      for (let j = 0; j < 3; j++) {
        const tileX = baseX + j * 3;
        this.walkable[tileY][tileX] = false; // dummies block movement

        // Sprite if available (scaled to ~1 tile width), else the colour rect
        let body;
        if (this.textures.exists('dummy')) {
          body = this.add.image(0, 0, 'dummy');
          body.setScale(WORLD.TILE_SIZE / body.width);
        } else {
          body = this.add.rectangle(0, 0, 24, 24, DUMMY_TIER_COLORS[tierIndex])
            .setStrokeStyle(1, 0x111111);
        }
        // Phase 6: label/bars/lockIcon are standalone scrollFactor(0) screen-space
        // objects, repositioned each frame via getScreenPosition(). They are NOT
        // children of the container — the container holds only the invisible body
        // (for click detection) and is positioned in world space.
        const label = this.add.text(0, 0, `Lv${tier.level} Dummy`, {
          fontFamily: 'monospace', fontSize: '10px', color: '#ffffff',
          stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(50);
        const hpBarBg = this.add.rectangle(0, 0, 28, 5, 0x000000)
          .setOrigin(0.5).setScrollFactor(0).setDepth(50);
        const hpBarFill = this.add.rectangle(0, 0, 26, 3, 0x2ecc40)
          .setOrigin(0, 0.5).setScrollFactor(0).setDepth(50);
        const lockIcon = this.add.text(0, 0, '🔒', { fontSize: '12px' })
          .setOrigin(0.5).setScrollFactor(0).setDepth(51).setVisible(false);

        const container = this.add.container(
          tileX * ts + ts / 2, tileY * ts + ts / 2, [body],
        );

        const dummy = {
          id: this.dummies.length,
          serverId: `dummy_lv${tier.level}_${j}`, // matches server worldState key
          tierId: tierIndex,
          level: tier.level,
          multiplier: tier.multiplier,
          unlockAt: tier.unlockAt,
          guaranteedHit: tier.guaranteedHit,
          currentHp: tier.hp,
          maxHp: tier.hp,
          attackerLog: {},
          tileX, tileY,
          locked: true,
          baseScale: body.scaleX, // for the reset scale-pop, relative to sprite scale
          recoiling: false,        // true while a hit-recoil tween owns body.rotation
          container, body, label, hpBarBg, hpBarFill, lockIcon,
        };

        // Interaction now handled by the scene-level raycaster (see setupInput).
        // The body is invisible (alpha=0) and used only for animations.

        this.dummies.push(dummy);
        this.dummiesByServerId.set(dummy.serverId, dummy);
      }
    });

    this.updateDummyLockStates();
  }

  playerLevels() {
    const player = this.registry.get('player');
    return {
      attack: levelFromXP(player.attack_xp),
      strength: levelFromXP(player.strength_xp),
      defense: levelFromXP(player.defense_xp),
    };
  }

  // Skill level relevant to a training style — balanced uses the highest skill
  skillLevelForStyle(style, levels) {
    if (style === 'balanced') return Math.max(levels.attack, levels.strength, levels.defense);
    return levels[style];
  }

  activeStyle() {
    return this.registry.get('player').activeTrainingStyle || 'strength';
  }

  // Apply a dummy body's normal (alive) appearance for its lock state. Sprites
  // use a dark tint when locked; rectangles use their tier/locked fill colour.
  applyDummyBodyAppearance(dummy) {
    const body = dummy.body;
    if (body.type === 'Image') {
      if (dummy.locked) body.setTint(DUMMY_LOCKED_COLOR);
      else body.clearTint();
    } else {
      body.setFillStyle(dummy.locked ? DUMMY_LOCKED_COLOR : DUMMY_TIER_COLORS[dummy.tierId]);
    }
  }

  // Dummy locks follow the skill relevant to the ACTIVE combat style
  updateDummyLockStates() {
    const levels = this.playerLevels();
    const relevantLevel = this.skillLevelForStyle(this.activeStyle(), levels);

    for (const dummy of this.dummies) {
      dummy.locked = !canAttackDummy(dummy, relevantLevel);
      dummy.lockIcon.setVisible(dummy.locked);
      if (dummy.currentHp > 0) {
        this.applyDummyBodyAppearance(dummy);
      }
      // Phase 6: label/bars are standalone; dim them for locked dummies instead of the container
      const lockAlpha = dummy.locked ? 0.5 : 1;
      dummy.label.setAlpha(lockAlpha);
      dummy.hpBarBg.setAlpha(dummy.locked ? 0 : 1);
      dummy.hpBarFill.setAlpha(dummy.locked ? 0 : 1);
    }

    // Switching style can lock the current target — stop attacking it
    if (this.combatTarget && this.combatTarget.locked) this.cancelCombat();
  }

  updateDummyHpBar(dummy) {
    const pct = Phaser.Math.Clamp(dummy.currentHp / dummy.maxHp, 0, 1);
    dummy.hpBarFill.width = 26 * pct;
    dummy.hpBarFill.setFillStyle(pct > 0.5 ? 0x2ecc40 : pct > 0.25 ? 0xffcc00 : 0xcc2222);
  }

  // Hit recoil: brief tilt then settle. Sets `recoiling` so the idle-sway loop
  // in update() yields control of body.rotation until the recoil finishes.
  dummyRecoil(dummy) {
    dummy.recoiling = true;
    this.tweens.add({
      targets: dummy.body, rotation: 0.15, duration: 80, ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: dummy.body, rotation: 0, duration: 120, ease: 'Quad.easeIn',
          onComplete: () => { dummy.recoiling = false; },
        });
      },
    });
  }

  // Miss acknowledgement: brief flash on the billboard + alpha pulse on body.
  // Body fades back to 0 so the Phaser placeholder doesn't permanently cover
  // the Three.js billboard.
  dummyMissPulse(dummy) {
    dummy.body.setAlpha(0.5);
    this.tweens.add({ targets: dummy.body, alpha: 0, duration: 250, ease: 'Quad.easeOut' });
  }

  // --- Boss (The Minotaur — full encounter via BossSystem) ---

  createBoss() {
    const ts = WORLD.TILE_SIZE;
    for (const tile of BOSS_FOOTPRINT) {
      this.walkable[tile.y][tile.x] = false; // 3x3 footprint blocks movement
    }

    // Centre pixel of the 3x3 footprint (centre of the middle tile)
    this.bossCenterPx = {
      x: BOSS_CENTER_TILE.x * ts + ts / 2,
      y: BOSS_CENTER_TILE.y * ts + ts / 2,
    };

    const bodySize = 3 * ts; // 3 tiles — boss is large and imposing
    let body;
    if (this.textures.exists('boss')) {
      body = this.add.image(0, 0, 'boss');
      body.setScale(bodySize / body.width);
    } else {
      body = this.add.rectangle(0, 0, bodySize, bodySize, BOSS_BODY_COLOR)
        .setStrokeStyle(3, 0x000000);
    }
    this.bossBody = body;

    // Phase 6: label and HP bar are standalone scrollFactor(0) screen-space objects.
    // bossContainer holds only the body for click detection and animations.
    this.bossLabel = this.add.text(0, 0, `${BOSS.name} (Lv ${BOSS.level})`, {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffd700', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(50);
    this.bossHpBarBg = this.add.rectangle(0, 0, 104, 10, 0x000000)
      .setOrigin(0.5).setScrollFactor(0).setDepth(50);
    this.bossHpBarFill = this.add.rectangle(0, 0, 100, 6, 0xcc2222)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(50);

    this.bossContainer = this.add.container(
      this.bossCenterPx.x, this.bossCenterPx.y, [body],
    ).setDepth(5);

    // Interaction handled by the scene-level raycaster (see setupInput).
    // Body is alpha=0 and used only for breathing/telegraph animations.

    this.bossSystem = new BossSystem(this);
    this.bossTarget = false;
    this.updateBossHpBar();

    // Idle animation (Section 7): slow breathing scale + slow left-right sway,
    // running simultaneously on yoyo loops. Sway (x) runs continuously; the
    // breathing (scale) tween is paused during the AOE telegraph (Section 8).
    this.bossBaseScale = body.scaleX;
    this.bossBreathTween = null;
    this.bossTelegraphTween = null;
    this.startBossBreathing();
    this.bossSwayTween = this.tweens.add({
      targets: body, x: { from: -4, to: 4 },
      duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  // Section 7 — calm breathing scale (1.0 ↔ 1.04 of base, 2600ms full cycle).
  startBossBreathing() {
    if (this.bossBreathTween) return;
    const s = this.bossBaseScale;
    this.bossBreathTween = this.tweens.add({
      targets: this.bossBody, scaleX: s * 1.04, scaleY: s * 1.04,
      duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  // Section 8 — AOE telegraph: a faster, larger "wind-up" pulse during the
  // 2-tick warning window, replacing the calm breathing so the incoming stomp
  // reads clearly. Sway continues underneath.
  startBossTelegraph() {
    if (this.bossTelegraphTween) return;
    if (this.bossBreathTween) { this.bossBreathTween.stop(); this.bossBreathTween = null; }
    const s = this.bossBaseScale;
    this.bossBody.setScale(s);
    this.bossTelegraphTween = this.tweens.add({
      targets: this.bossBody, scaleX: s * 1.09, scaleY: s * 1.09,
      duration: 250, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  endBossTelegraph() {
    if (this.bossTelegraphTween) { this.bossTelegraphTween.stop(); this.bossTelegraphTween = null; }
    if (this.bossBody) this.bossBody.setScale(this.bossBaseScale);
    this.startBossBreathing();
  }

  startBossAttack() {
    // Walk to the boss; start_attack is emitted by update() once in range.
    if (this.bossSystem.state !== 'ALIVE') return;
    if (this.isDead) return;
    this.cancelCombat();          // clears any dummy/boss target
    this.bossTarget = true;
    this.attackStarted = false;
    this.walkToAdjacentOf(BOSS_FOOTPRINT);
  }

  isInRangeOfBoss() {
    // Adjacent (within 1 tile, Chebyshev) to any tile of the 3x3 footprint
    for (const tile of BOSS_FOOTPRINT) {
      if (Math.max(Math.abs(this.tileX - tile.x), Math.abs(this.tileY - tile.y)) <= 1) {
        return true;
      }
    }
    return false;
  }

  updateBossHpBar() {
    const pct = Phaser.Math.Clamp(this.bossSystem.currentHp / this.bossSystem.maxHp, 0, 1);
    this.bossHpBarFill.width = 100 * pct;
  }

  showBossDamageSplat(result) {
    this.makeDamageSplat(
      this.bossContainer.x + Phaser.Math.Between(-10, 10), this.bossContainer.y - 10, result,
    );
  }

  // --- Player death (triggered by the server's player_died event) ---

  handlePlayerDeath() {
    // Stop all combat and movement immediately
    this.bossTarget = false;
    this.cancelCombat();
    this.isDead = true;
    this.path = [];
    this.isMoving = false;
    this.movingTo = null;
    this.tweens.killTweensOf(this.playerContainer);

    this.game.events.emit('show-banner', {
      text: 'You have died. Respawning...', color: '#ff6666', duration: 2000, y: 240,
    });

    this.time.delayedCall(2000, () => this.respawnPlayer());
  }

  respawnPlayer() {
    const ts = WORLD.TILE_SIZE;
    const spawn = this.pickSpawnTile();
    this.tileX = spawn.x;
    this.tileY = spawn.y;
    this.playerContainer.setPosition(this.tileX * ts + ts / 2, this.tileY * ts + ts / 2);

    // Server already persisted HP=100 and the respawn position; just mirror it
    // locally for the HUD (no DB write from the client).
    const player = this.registry.get('player');
    player.current_hp = 100;
    this.registry.set('player', { ...player });

    this.isDead = false;
  }

  // --- Lobby NPCs (CLAUDE.md Section 19) ---

  createNpcs() {
    // Egyptian Desert Warrior models (roadmap §35, Prompt E) cropped from the
    // npc/desert_warrior_npcs.jpg sheet (1280x960, four characters across the
    // top). `frame` is the per-character crop; falls back to a coloured circle
    // if the sheet didn't load.
    const NPC_FRAME = {
      bank:      [150, 190, 170, 500], // Shieldbearer / Khopesh Warrior
      merchant:  [410, 190, 175, 500], // Spearmaiden
      cosmetics: [650, 190, 185, 500], // Dune Stalker (dual blades)
      food:      [900, 190, 175, 500], // Sun Priestess
    };
    if (this.textures.exists('npc_warriors')) {
      const tex = this.textures.get('npc_warriors');
      for (const [key, [x, y, w, h]] of Object.entries(NPC_FRAME)) {
        const fk = `npc_${key}`;
        if (!tex.has(fk)) tex.add(fk, 0, x, y, w, h);
      }
    }

    const npcDefs = [
      // Lobby (X60-99, Y60-89)
      { key: 'bank',      name: 'Bank',       color: 0xc9a84c, tileX: 72, tileY: 68 },
      { key: 'merchant',  name: 'Merchant',   color: 0x8b6914, tileX: 88, tileY: 68 },
      { key: 'food',      name: 'Food Shop',  color: 0x2d6e2d, tileX: 72, tileY: 80 },
      { key: 'cosmetics', name: 'Cosmetics',  color: 0x6b2d8b, tileX: 88, tileY: 80 },
      // Armory (X60-99, Y0-29) — placeholder smiths, no stock yet
      { key: 'armor_smith',  name: 'Armoursmith', color: 0x8a8f9a, tileX: 72, tileY: 12 },
      { key: 'weapon_smith', name: 'Weaponsmith', color: 0xb05a3a, tileX: 88, tileY: 12 },
    ];

    // Phase 6: all NPC elements are standalone scrollFactor(0) screen-space objects
    // repositioned each frame via getScreenPosition(). No container needed.
    this.npcs = [];
    for (const npc of npcDefs) {
      this.walkable[npc.tileY][npc.tileX] = false;

      const frameKey = `npc_${npc.key}`;
      let body;
      if (this.textures.exists('npc_warriors') && this.textures.get('npc_warriors').has(frameKey)) {
        body = this.add.image(0, 0, 'npc_warriors', frameKey).setScrollFactor(0).setDepth(50);
        const fr = this.textures.getFrame('npc_warriors', frameKey);
        body.setDisplaySize(fr.width * (84 / fr.height), 84); // ~84px tall, keep aspect
      } else {
        body = this.add.circle(0, 0, 12, npc.color)
          .setStrokeStyle(2, 0x111111).setScrollFactor(0).setDepth(50);
      }
      const label = this.add.text(0, 0, npc.name, {
        fontFamily: 'monospace', fontSize: '10px', color: '#aaddff',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(50);
      // Click area matches the rendered body (full sprite height for models).
      const hitW = Math.max(36, body.displayWidth || 36);
      const hitH = Math.max(36, body.displayHeight || 36);
      const hit = this.add.rectangle(0, 0, hitW, hitH, 0xffffff, 0)
        .setScrollFactor(0).setDepth(51).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', (pointer, localX, localY, event) => {
        if (!pointer.leftButtonDown()) return;
        event.stopPropagation();
        this.game.events.emit('open-npc', { npc: npc.key });
      });

      this.npcs.push({ tileX: npc.tileX, tileY: npc.tileY, key: npc.key, body, label, hit });
    }
  }

  // --- Food / eating ---

  async eatFood() {
    const result = await this.foodSystem.eat();
    const px = this.playerContainer.x;
    const py = this.playerContainer.y - 40;

    if (result.success) {
      this.showFloatingText(px, py, `+${result.healAmount} HP`, '#44ff44');
      // Eating interrupts the attack loop (Section 13) and syncs HP so other
      // players see the updated bar (Section 16).
      this.cancelCombat();
      if (typeof network !== 'undefined' && network.socket) network.sendHpUpdate(result.newHp);
    } else if (result.reason === 'no_food') {
      this.showFloatingText(px, py, 'No food!', '#ff6666');
    }
    // cooldown: silent — the next eat will land once the tick passes
  }

  // --- Context menus (rendered by UIScene — its camera is not zoomed/rotated) ---

  requestDummyMenu(dummy, pointer) {
    this.game.events.emit('open-context-menu', {
      x: pointer.x,
      y: pointer.y,
      items: [
        {
          label: `Attack Lv${dummy.level} Dummy`,
          enabled: !dummy.locked,
          event: 'attack-dummy',
          payload: { dummyId: dummy.id },
        },
      ],
    });
  }

  requestPlayerMenu(pointer) {
    // Stub for multi-player — other players don't exist in the local build,
    // so the local player's own sprite carries the future menu items.
    const name = this.registry.get('player').display_name;
    this.game.events.emit('open-context-menu', {
      x: pointer.x,
      y: pointer.y,
      items: [
        { label: `Attack ${name}`, enabled: false, suffix: 'Coming Soon' },
        { label: `Wager ${name}`, enabled: false, suffix: 'Coming Soon' },
      ],
    });
  }

  // --- Combat ---

  setupCombat() {
    // combatTarget/bossTarget hold the player's CURRENT engagement (for walk-to,
    // range, idle-bob suppression). The server runs the actual attack loop —
    // the client only declares intent (start_attack) once it reaches the target.
    this.combatTarget = null;
    this.bossTarget = false;
    this.attackStarted = false; // whether start_attack has been emitted for the current target
    this.foodSystem = new FoodSystem(this);

    this.onAttackDummy = ({ dummyId }) => this.startCombat(this.dummies[dummyId]);
    this.onAttackBoss = () => this.startBossAttack();
    this.onStyleChanged = () => this.updateDummyLockStates();
    this.onEatFood = () => this.eatFood();
    this.onTyping = (active) => { this.typingActive = active; };
    this.onNameChanged = () => { /* local player name label is not shown */ };
    this.onChatBubble = ({ text }) => this.showChatBubble(text);
    this.onStopAttackRequest = () => this.cancelCombat(); // panels/NPCs stop combat

    this.game.events.on('attack-dummy', this.onAttackDummy);
    this.game.events.on('attack-boss', this.onAttackBoss);
    this.game.events.on('style-changed', this.onStyleChanged);
    this.game.events.on('eat-food', this.onEatFood);
    this.game.events.on('typing', this.onTyping);
    this.game.events.on('name-changed', this.onNameChanged);
    this.game.events.on('chat-bubble', this.onChatBubble);
    this.game.events.on('request-stop-attack', this.onStopAttackRequest);

    this.events.once('shutdown', () => {
      this.game.events.off('attack-dummy', this.onAttackDummy);
      this.game.events.off('attack-boss', this.onAttackBoss);
      this.game.events.off('style-changed', this.onStyleChanged);
      this.game.events.off('eat-food', this.onEatFood);
      this.game.events.off('typing', this.onTyping);
      this.game.events.off('name-changed', this.onNameChanged);
      this.game.events.off('chat-bubble', this.onChatBubble);
      this.game.events.off('request-stop-attack', this.onStopAttackRequest);
    });
  }

  // Floating chat bubble above the player's name label, yellow, 3.5s then
  // fades. Only one bubble at a time — a new message replaces the old.
  showChatBubble(text) {
    if (this.chatBubble) {
      this.chatBubble.destroy();
      this.chatBubble = null;
    }
    if (this.chatBubbleTimer) {
      this.chatBubbleTimer.remove();
      this.chatBubbleTimer = null;
    }

    this.chatBubble = this.add.text(this.playerContainer.x, this.playerContainer.y - 44, text, {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffff33', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3, align: 'center',
      wordWrap: { width: 220 },
    }).setOrigin(0.5, 1).setDepth(700);

    this.chatBubbleTimer = this.time.delayedCall(TIMING.CHAT_BUBBLE_MS, () => {
      if (!this.chatBubble) return;
      this.tweens.add({
        targets: this.chatBubble,
        alpha: 0,
        duration: 400,
        onComplete: () => {
          if (this.chatBubble) { this.chatBubble.destroy(); this.chatBubble = null; }
        },
      });
    });
  }

  handleDummyLeftClick(dummy) {
    if (this.isDead) return;
    if (dummy.locked) {
      this.showFloatingText(
        dummy.container.x, dummy.container.y - 40,
        `Requires level ${dummy.unlockAt}`, '#ff6666',
      );
      return;
    }
    this.startCombat(dummy);
  }

  startCombat(dummy) {
    if (dummy.locked) return;
    if (this.combatTarget === dummy) return; // already attacking this dummy

    // Only one target at a time — switching cancels the old server loop
    this.cancelCombat();
    this.combatTarget = dummy;
    this.attackStarted = false;

    if (!this.isInRangeOf(dummy)) this.walkToDummy(dummy);
  }

  // Stop attacking: tell the server to clear our combat loop, drop local target.
  cancelCombat() {
    if (this.attackStarted && typeof network !== 'undefined' && network.socket) {
      network.stopAttack();
    }
    this.combatTarget = null;
    this.bossTarget = false;
    this.attackStarted = false;
  }

  isInRangeOf(dummy) {
    // Melee range: within 1 tile (Chebyshev distance)
    const dx = Math.abs(this.tileX - dummy.tileX);
    const dy = Math.abs(this.tileY - dummy.tileY);
    return Math.max(dx, dy) <= 1;
  }

  // Once the player has walked into range of their chosen target, declare the
  // attack to the server (once). The server then runs the authoritative loop.
  updateAttackIntent() {
    if (this.attackStarted || this.isMoving) return;
    if (typeof network === 'undefined' || !network.socket) return;
    const style = this.activeStyle();

    if (this.bossTarget && this.isInRangeOfBoss()) {
      this.attackStarted = true;
      network.startAttack('boss', 'minotaur', style);
    } else if (this.combatTarget && this.isInRangeOf(this.combatTarget)) {
      this.attackStarted = true;
      network.startAttack(this.combatTarget.isCreature ? 'creature' : 'dummy', this.combatTarget.serverId, style);
    }
  }

  walkToDummy(dummy) {
    this.walkToAdjacentOf([{ x: dummy.tileX, y: dummy.tileY }]);
  }

  walkToAdjacentOf(tiles) {
    // Path to the closest reachable tile adjacent to any of the given tiles
    const startX = this.isMoving ? this.movingTo.x : this.tileX;
    const startY = this.isMoving ? this.movingTo.y : this.tileY;
    const occupied = new Set(tiles.map((t) => `${t.x},${t.y}`));

    let best = null;
    for (const tile of tiles) {
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = tile.x + dx;
        const ny = tile.y + dy;
        if (occupied.has(`${nx},${ny}`)) continue;
        const path = findPath(this.walkable, startX, startY, nx, ny);
        if (path && (!best || path.length < best.length)) best = path;
      }
    }

    if (best) {
      this.path = best;
      if (!this.isMoving) this.stepAlongPath();
    }
  }

  // Damage splat: number on a coloured circle (red for a hit, dark blue for a
  // miss), floating up and fading over 800ms.
  makeDamageSplat(x, y, result) {
    const isMiss = !result.hit || result.damage === 0;
    const circleColor = isMiss ? 0x14315e : 0xc0392b; // dark blue / red
    const textColor = isMiss ? '#7ab8ff' : '#ffffff';

    const circle = this.add.circle(0, 0, 12, circleColor).setStrokeStyle(1, 0x000000);
    const txt = this.add.text(0, 0, isMiss ? '0' : `${result.damage}`, {
      fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold', color: textColor,
    }).setOrigin(0.5);

    const splat = this.add.container(x, y, [circle, txt])
      .setDepth(500);

    this.tweens.add({
      targets: splat,
      y: y - 16,
      alpha: 0,
      duration: 800,
      onComplete: () => splat.destroy(),
    });
  }

  showDamageSplat(dummy, result) {
    this.makeDamageSplat(
      dummy.container.x + Phaser.Math.Between(-6, 6), dummy.container.y - 8, result,
    );
  }

  // --- Creatures (mobile attackable animals/monsters, config/creatures.js) ---

  createCreature(c) {
    threeScene.addCreatureBillboard(c.id, c.color, c.size);
    const label = this.add.text(0, 0, `${c.name} (Lv${c.level})`, {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffd9a0',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(50);
    const hpBg = this.add.rectangle(0, 0, 28, 4, 0x000000).setScrollFactor(0).setDepth(50);
    const hpFill = this.add.rectangle(0, 0, 28, 4, 0x2ecc40).setOrigin(0, 0.5).setScrollFactor(0).setDepth(51);

    const cr = {
      id: c.id, serverId: c.id, isCreature: true,
      name: c.name, level: c.level, maxHp: c.maxHp, currentHp: c.currentHp,
      color: c.color, size: c.size,
      tileX: c.x, tileY: c.y, rx: c.x, ry: c.y,
      dead: !!c.dead, label, hpBg, hpFill,
    };
    this.creatures.set(c.id, cr);
    if (cr.dead) threeScene.setCreatureVisible(c.id, false);
    this.updateCreatureHpBar(cr);
    return cr;
  }

  updateCreatureHpBar(cr) {
    const pct = Math.max(0, cr.currentHp / cr.maxHp);
    cr.hpFill.width = 28 * pct;
    cr.hpFill.setFillStyle(pct > 0.5 ? 0x2ecc40 : pct > 0.25 ? 0xffcc00 : 0xcc2222);
  }

  showCreatureSplat(cr, result) {
    const sp = threeScene.getScreenPosition(cr.rx + 0.5, cr.ry + 0.5, threeScene.creatureSpriteHeight(cr.id) * 0.6);
    if (sp) this.makeDamageSplat(sp.x + Phaser.Math.Between(-6, 6), sp.y, result);
  }

  showFloatingText(worldX, worldY, str, color = '#ffffff') {
    const text = this.add.text(worldX, worldY, str, {
      fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold',
      color,
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(600);

    this.tweens.add({
      targets: text,
      y: worldY - 16,
      alpha: 0,
      duration: 1200,
      onComplete: () => text.destroy(),
    });
  }

  // Dummy reset animation, triggered by the server's dummy_reset event. The
  // server owns HP and XP; this is display only (HP bar to full + flash + pop).
  playDummyReset(dummy) {
    dummy.currentHp = dummy.maxHp;
    this.updateDummyHpBar(dummy);
    this.applyDummyBodyAppearance(dummy);
    dummy.recoiling = false;
    dummy.body.setRotation(0);
    // Reset flash: Three.js billboard handles the visual; keep body invisible.
    dummy.body.setAlpha(0);
    // Scale pop: 1.0 -> 1.15 -> 1.0 (relative to the body's base scale)
    dummy.body.setScale(dummy.baseScale);
    this.tweens.add({
      targets: dummy.body,
      scaleX: dummy.baseScale * 1.15, scaleY: dummy.baseScale * 1.15,
      duration: 200, yoyo: true, ease: 'Sine.easeInOut',
    });
  }

  // --- Player ---

  // Random walkable tile within the 3x3 lobby spawn zone. If the chosen tile
  // is occupied (e.g. an NPC sprite marks it non-walkable), fall back to the
  // nearest free tile in the zone (CLAUDE.md Section 13).
  pickSpawnTile() {
    const half = Math.floor(WORLD.SPAWN_ZONE_TILES / 2);
    const { x: cx, y: cy } = WORLD.SPAWN_CENTER;

    const free = [];
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (this.walkable[ty] && this.walkable[ty][tx]) free.push({ x: tx, y: ty });
      }
    }
    if (free.length > 0) return Phaser.Utils.Array.GetRandom(free);
    return { x: cx, y: cy }; // zone fully blocked — fall back to centre
  }

  createPlayer() {
    const player = this.registry.get('player');
    const ts = WORLD.TILE_SIZE;

    const spawn = this.pickSpawnTile();
    this.tileX = spawn.x;
    this.tileY = spawn.y;

    // Sprite if available (gender-based, scaled to ~1.5 tile widths), else rect
    const gender = player.gender === 'female' ? 'female' : 'male';
    const spriteKey = `player_${gender}`;
    let body;
    if (this.textures.exists(spriteKey)) {
      body = this.add.image(0, 0, spriteKey);
      body.setScale((ts * 1.5) / body.width);
    } else {
      const bodyColor = CLOTHING_COLORS[player.clothing_color] || CLOTHING_COLORS.green;
      body = this.add.rectangle(0, 0, 20, 26, bodyColor).setStrokeStyle(1, 0x111111);
    }
    this.playerBody = body;

    // Local player name is never shown above the character (the player knows who
    // they are). playerNameLabel is kept as null so callers can null-check safely.

    // Right-click menu stub for the future multi-player Attack/Wager options
    body.setInteractive();
    body.on('pointerdown', (pointer, localX, localY, event) => {
      if (!pointer.rightButtonDown()) return;
      event.stopPropagation();
      this.requestPlayerMenu(pointer);
    });

    this.playerContainer = this.add.container(
      this.tileX * ts + ts / 2,
      this.tileY * ts + ts / 2,
      [body],
    ).setDepth(10);

    this.path = [];
    this.isMoving = false;
    this.movingTo = null; // tile currently being tweened toward

    // Motion-feel state (visual only — body is a child offset, never the container)
    this._wasMoving = false;
    this._walkDist = 0;            // px travelled this movement, drives the walk bob
    this._prevPx = this.playerContainer.x;
    this._prevPy = this.playerContainer.y;
    this._idleBob = null;          // repeating idle-bob tween
    this._idleTimer = null;        // 500ms delay before idle bob starts
    this.scheduleIdleBob();        // spawns idle → start bobbing shortly

    // Phase 2: billboard direction and animation tracking
    this.playerFacingDx  = 0;
    this.playerFacingDy  = 1;  // default: facing S (toward camera at default orbit)
    this._playerAnimTime = 0;  // accumulated walk time (ms), drives frame column
  }

  // Idle bob: slow ±2px sine on the body's y, after 500ms of standing still and
  // out of combat. Restarted/stopped by updatePlayerMotion.
  scheduleIdleBob() {
    this.stopIdleBob();
    this._idleTimer = this.time.delayedCall(500, () => {
      this._idleTimer = null;
      if (this.isMoving || this.combatTarget || this.bossTarget || this.isDead) return;
      if (!this.playerBody) return;
      this.playerBody.y = 0;
      this._idleBob = this.tweens.add({
        targets: this.playerBody, y: { from: -2, to: 2 },
        duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    });
  }

  stopIdleBob() {
    if (this._idleTimer) { this._idleTimer.remove(); this._idleTimer = null; }
    if (this._idleBob) { this._idleBob.stop(); this._idleBob = null; }
  }

  // Attack lunge: nudge the body 6px toward the target, then snap back. Pure
  // local offset on the body child, so pathfinding/camera are untouched.
  playerLunge(targetX, targetY) {
    if (!this.playerBody) return;
    const angle = Math.atan2(targetY - this.playerContainer.y, targetX - this.playerContainer.x);
    const ox = Math.cos(angle) * 6;
    const oy = Math.sin(angle) * 6;
    this.tweens.add({
      targets: this.playerBody, x: ox, y: oy, duration: 120, ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: this.playerBody, x: 0, y: 0, duration: 80, ease: 'Quad.easeIn',
        });
      },
    });
  }

  // Per-frame walk/idle bob management for the player body.
  updatePlayerMotion() {
    if (!this.playerBody) return;
    const moving = this.isMoving;
    const inCombat = !!this.combatTarget || !!this.bossTarget;

    if (moving && !this._wasMoving) {            // started moving
      this.stopIdleBob();
      this._walkDist = 0;
      this.playerBody.x = 0;                     // clear any leftover lunge offset
      this._prevPx = this.playerContainer.x;
      this._prevPy = this.playerContainer.y;
    } else if (!moving && this._wasMoving) {     // stopped moving
      this.playerBody.y = 0;
      this.scheduleIdleBob();
    }

    if (moving) {
      // Walk cycle: ±3px sine driven by distance travelled — one full
      // oscillation per 2 tiles (footstep rhythm), not time-based.
      const dx = this.playerContainer.x - this._prevPx;
      const dy = this.playerContainer.y - this._prevPy;
      this._walkDist += Math.hypot(dx, dy);
      this.playerBody.y = Math.sin((this._walkDist / (2 * WORLD.TILE_SIZE)) * Math.PI * 2) * 3;
    } else if (inCombat && this._idleBob) {
      // Entered combat while idle-bobbing — settle and hold still
      this.stopIdleBob();
      this.playerBody.y = 0;
    }

    this._prevPx = this.playerContainer.x;
    this._prevPy = this.playerContainer.y;
    this._wasMoving = moving;
  }

  moveTo(targetX, targetY) {
    const startX = this.isMoving ? this.movingTo.x : this.tileX;
    const startY = this.isMoving ? this.movingTo.y : this.tileY;

    const path = findPath(this.walkable, startX, startY, targetX, targetY);
    if (!path) return; // unreachable or wall tile — ignore the click

    this.path = path;
    this.showClickMarker(targetX, targetY);
    if (!this.isMoving) this.stepAlongPath();
  }

  stepAlongPath() {
    const next = this.path.shift();
    if (!next) {
      this.isMoving = false;
      this.movingTo = null;
      // Always broadcast the final destination tile on arrival
      if (typeof network !== 'undefined' && network.socket) {
        network.sendMove(this.tileX, this.tileY);
        this._lastMoveSent = Date.now();
      }
      return;
    }

    const ts = WORLD.TILE_SIZE;
    this.isMoving = true;
    this.movingTo = next;

    // Record movement direction for Three.js billboard frame selection.
    this.playerFacingDx = next.x - this.tileX;
    this.playerFacingDy = next.y - this.tileY;

    // Face the direction of travel (sprite only): moving left flips horizontally
    if (this.playerBody && this.playerBody.setFlipX) {
      if (next.x < this.tileX) this.playerBody.setFlipX(true);
      else if (next.x > this.tileX) this.playerBody.setFlipX(false);
    }

    this.tweens.add({
      targets: this.playerContainer,
      x: next.x * ts + ts / 2,
      y: next.y * ts + ts / 2,
      duration: MOVE_DURATION_MS,
      onComplete: () => {
        this.tileX = next.x;
        this.tileY = next.y;
        this.maybeSendMove(); // throttled position broadcast while moving
        this.stepAlongPath();
      },
    });
  }

  showClickMarker(tileX, tileY, color = 0xffff00) {
    const ts = WORLD.TILE_SIZE;
    if (this.clickMarker) this.clickMarker.destroy();

    this.clickMarker = this.add.rectangle(
      tileX * ts + ts / 2, tileY * ts + ts / 2, ts - 4, ts - 4,
    ).setStrokeStyle(2, color);

    this.tweens.add({
      targets: this.clickMarker,
      alpha: 0,
      duration: 600,
      onComplete: () => {
        if (this.clickMarker) {
          this.clickMarker.destroy();
          this.clickMarker = null;
        }
      },
    });
  }

  // --- Input / Camera ---

  setupInput() {
    const ts = WORLD.TILE_SIZE;
    this.input.mouse.disableContextMenu();

    // All ground and entity clicks are handled here via the Three.js raycaster.
    // Dummy and boss bodies cannot use Phaser interactive areas because their
    // world-space positions don't match the 3D-projected billboard screen positions.
    // The raycaster identifies the clicked tile and dispatches to entity handlers.
    this.input.on('pointerdown', (pointer) => {
      const hit = threeScene.getGroundPositionFromScreen(pointer.x, pointer.y);
      if (!hit) return;

      if (window.DEBUG_TILES) {
        console.log(`[DEBUG_TILES] screen(${Math.round(pointer.x)},${Math.round(pointer.y)}) → tileX=${hit.tileX} tileZ=${hit.tileZ}`);
        threeScene.placeDebugMarker(hit.tileX, hit.tileZ);
      }

      // Other player check — must come first and use tile matching because the
      // Three.js billboard screen position diverges from the Phaser body's
      // world-space hit area in 3D perspective (setAlpha(0) preserves input but
      // the wrong screen position means clicks never reach the body handler).
      if (pointer.rightButtonDown() && this.otherPlayers && this.otherPlayers.size > 0) {
        for (const [wallet, op] of this.otherPlayers) {
          const opTileX = Math.round((op.container.x - ts / 2) / ts);
          const opTileZ = Math.round((op.container.y - ts / 2) / ts);
          if (opTileX === hit.tileX && opTileZ === hit.tileZ) {
            this.requestOtherPlayerMenu(wallet, op.displayName, pointer);
            return;
          }
        }
      }

      // Ground item check (owner-only loot) — left-click picks it up
      if (pointer.leftButtonDown() && this.groundItems && this.groundItems.size > 0) {
        for (const [gid, gi] of this.groundItems) {
          if (gi.tileX === hit.tileX && gi.tileZ === hit.tileZ) {
            network.pickupItem(gid);
            this.showClickMarker(hit.tileX, hit.tileZ, 0xffcc33);
            return;
          }
        }
      }

      // Dummy tile check
      const clickedDummy = this.dummies.find(d => d.tileX === hit.tileX && d.tileY === hit.tileZ);
      if (clickedDummy) {
        if (pointer.rightButtonDown()) this.requestDummyMenu(clickedDummy, pointer);
        else if (pointer.leftButtonDown()) {
          this.handleDummyLeftClick(clickedDummy);
          this.showClickMarker(hit.tileX, hit.tileZ, 0xff4444);
        }
        return;
      }

      // Boss footprint check (3×3 tiles)
      const onBoss = BOSS_FOOTPRINT.some(t => t.x === hit.tileX && t.y === hit.tileZ);
      if (onBoss) {
        if (pointer.rightButtonDown()) {
          this.game.events.emit('open-context-menu', {
            x: pointer.x, y: pointer.y,
            items: [{ label: `Attack ${BOSS.name}`, enabled: true, event: 'attack-boss' }],
          });
        } else if (pointer.leftButtonDown()) {
          this.startBossAttack();
          this.showClickMarker(BOSS_CENTER_TILE.x, BOSS_CENTER_TILE.y, 0xff4444);
        }
        return;
      }

      // Creature check (mobile animals/monsters) — attack on click
      if (this.creatures && this.creatures.size > 0) {
        for (const cr of this.creatures.values()) {
          if (cr.dead) continue;
          if (cr.tileX === hit.tileX && cr.tileY === hit.tileZ) {
            if (pointer.leftButtonDown() || pointer.rightButtonDown()) {
              this.startCombat(cr);
              this.showClickMarker(hit.tileX, hit.tileZ, 0xff4444);
            }
            return;
          }
        }
      }

      // Plain ground — left-click moves the player
      if (pointer.leftButtonDown()) {
        if (this.isDead) return;
        this.cancelCombat();
        this.moveTo(hit.tileX, hit.tileZ);
      }
    });

    // Scroll wheel — dolly zoom (Three.js camDist, not Phaser zoom).
    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      this.camDist = Phaser.Math.Clamp(
        this.camDist + deltaY * 0.01,
        CAMERA.DIST_MIN,
        CAMERA.DIST_MAX,
      );
    });

    // Arrow keys — polled each frame in update() for smooth delta-time input.
    //   Left/Right : horizontal orbit
    //   Up/Down    : pitch (vertical tilt)
    this.cursorKeys = this.input.keyboard.createCursorKeys();
    this.typingActive = false;

    // F = eat one Cooked Chicken (also available via inventory right-click)
    this.input.keyboard.on('keydown-F', () => {
      if (!this.typingActive) this.eatFood();
    });
  }

  setupCamera() {
    const cam = this.cameras.main;
    // Phaser camera is a static overlay — follows player for sprite visibility
    // but zoom and rotation are locked.  All camera feel is Three.js-side.
    cam.startFollow(this.playerContainer, true, 0.15, 0.15);
    cam.setZoom(1);

    // Phase 3 rig state — drives ThreeScene.syncCamera() every tick.
    this.orbitAngle = 0;
    this.pitchAngle = CAMERA.PITCH_DEFAULT;
    this.camDist    = CAMERA.DIST_DEFAULT;
  }

  // --- Multiplayer (Section 32, Phase 1: presence + chat) ---

  setupMultiplayer() {
    // Degrade gracefully to single-player if Socket.io isn't available
    if (typeof network === 'undefined' || !network.socket) return;

    this.otherPlayers = new Map(); // wallet_address → { container, body, hpFill, displayName }
    this.groundItems = new Map();  // ground_item_id → { tileX, tileZ, label } (owner-only loot)
    this.creatures = new Map();    // creature_id → { tileX, tileY, rx, ry, label, hpBg, hpFill, ... }
    this._lastMoveSent = 0;

    const MP_EVENTS = [
      'room_joined', 'player_joined', 'player_left', 'player_moved', 'chat_message',
      'combat_hit', 'combat_miss', 'dummy_kill', 'dummy_reset', 'level_up',
      'attack_rejected', 'boss_aoe_warning', 'boss_aoe_fire', 'player_died',
      'boss_died', 'boss_respawned',
      'ground_item_spawned', 'ground_item_removed', 'pickup_failed',
      'creature_kill', 'creature_respawn', 'creatures_moved',
      'wager_challenge', 'wager_accepted', 'wager_declined', 'wager_cancelled',
      'wager_fight_tick', 'wager_fight_result', 'error',
    ];
    // Clear any stale handlers from a previous scene instance (socket is global)
    MP_EVENTS.forEach((e) => network.off(e));

    network.on('room_joined', ({ players, chat, creatures }) => {
      for (const id in players) {
        if (id === network.wallet) continue; // skip self
        if (!this.otherPlayers.has(id)) this.createOtherPlayer(players[id]);
      }
      for (const c of (creatures || [])) {
        if (!this.creatures.has(c.id)) this.createCreature(c);
      }
      // Seed the chat log with recent history
      const recent = (chat || []).slice(-10);
      for (const m of recent) {
        this.game.events.emit('chat-message', { text: `[${m.name}]: ${m.message}` });
      }
    });

    network.on('player_joined', (p) => {
      if (!p || p.wallet_address === network.wallet) return;
      if (this.otherPlayers.has(p.wallet_address)) return; // idempotent
      this.createOtherPlayer(p);
      this.game.events.emit('chat-message', { text: `${p.display_name} has entered the arena.` });
    });

    network.on('player_left', ({ wallet_address }) => {
      const op = this.otherPlayers.get(wallet_address);
      if (!op) return; // unknown wallet — ignore
      this.game.events.emit('chat-message', { text: `${op.displayName} has left.` });
      if (op._nameLabelTimer) { clearTimeout(op._nameLabelTimer); op._nameLabelTimer = null; }
      threeScene.removeOtherPlayerBillboard(wallet_address);
      op.container.destroy();
      op.nameLabel.destroy();
      op.hpBg.destroy();
      op.hpFill.destroy();
      this.otherPlayers.delete(wallet_address);
    });

    network.on('player_moved', ({ wallet_address, x, y, currentHp }) => {
      const op = this.otherPlayers.get(wallet_address);
      if (!op) return;
      const ts = WORLD.TILE_SIZE;
      const targetX = x * ts + ts / 2;
      const targetY = y * ts + ts / 2;
      // Flip to face travel direction (same rule as the local player)
      if (op.body.setFlipX) {
        if (targetX < op.container.x) op.body.setFlipX(true);
        else if (targetX > op.container.x) op.body.setFlipX(false);
      }
      if (currentHp != null) op.hpFill.width = 32 * Phaser.Math.Clamp(currentHp / 100, 0, 1);
      this.tweens.add({ targets: op.container, x: targetX, y: targetY, duration: 500, ease: 'Linear' });
    });

    // Server echoes every chat message (including our own) — this is the
    // authoritative log display for all players.
    network.on('chat_message', ({ name, message }) => {
      this.game.events.emit('chat-message', { text: `[${name}]: ${message}` });
    });

    // --- Server-authoritative combat events (Phase 2) ---

    network.on('combat_hit', ({ attackerId, targetType, targetId, damage, targetHp }) => {
      const result = { hit: true, damage };
      if (targetType === 'dummy') {
        const dummy = this.dummiesByServerId.get(targetId);
        if (!dummy) return;
        dummy.currentHp = targetHp;
        this.updateDummyHpBar(dummy);
        this.showDamageSplat(dummy, result);
        this.dummyRecoil(dummy);
      } else if (targetType === 'boss') {
        this.bossSystem.currentHp = targetHp;
        this.updateBossHpBar();
        this.showBossDamageSplat(result);
      } else if (targetType === 'creature') {
        const cr = this.creatures.get(targetId);
        if (!cr) return;
        cr.currentHp = targetHp;
        this.updateCreatureHpBar(cr);
        this.showCreatureSplat(cr, result);
      }
    });

    network.on('combat_miss', ({ targetType, targetId }) => {
      const result = { hit: false, damage: 0 };
      if (targetType === 'dummy') {
        const dummy = this.dummiesByServerId.get(targetId);
        if (!dummy) return;
        this.showDamageSplat(dummy, result);
        this.dummyMissPulse(dummy);
      } else if (targetType === 'boss') {
        this.showBossDamageSplat(result);
      } else if (targetType === 'creature') {
        const cr = this.creatures.get(targetId);
        if (cr) this.showCreatureSplat(cr, result);
      }
    });

    network.on('creature_kill', ({ creatureId, attackerXp }) => {
      const cr = this.creatures.get(creatureId);
      if (cr) {
        cr.dead = true;
        threeScene.setCreatureVisible(creatureId, false);
        if (cr.label) cr.label.setVisible(false);
        if (cr.hpBg) cr.hpBg.setVisible(false);
        if (cr.hpFill) cr.hpFill.setVisible(false);
      }
      if (this.combatTarget === cr) this.cancelCombat();
      if (attackerXp && attackerXp[network.wallet]) {
        this.showFloatingText(
          this.playerContainer.x, this.playerContainer.y - 56,
          `+${attackerXp[network.wallet]} XP`, '#ffd700',
        );
        this.game.events.emit('sync-player');
      }
    });

    network.on('creature_respawn', ({ creatureId, x, y, hp }) => {
      const cr = this.creatures.get(creatureId);
      if (!cr) return;
      cr.dead = false;
      cr.currentHp = hp;
      cr.tileX = x; cr.tileY = y; cr.rx = x; cr.ry = y;
      threeScene.setCreatureVisible(creatureId, true);
      this.updateCreatureHpBar(cr);
    });

    network.on('creatures_moved', ({ moved }) => {
      for (const m of (moved || [])) {
        const cr = this.creatures.get(m.id);
        if (cr && !cr.dead) { cr.tileX = m.x; cr.tileY = m.y; } // update() lerps rx,ry toward this
      }
    });

    network.on('dummy_kill', ({ attackerXp }) => {
      // Server already wrote XP; refresh our data + show a popup if we earned any
      if (attackerXp && attackerXp[network.wallet]) {
        this.showFloatingText(
          this.playerContainer.x, this.playerContainer.y - 56,
          `+${attackerXp[network.wallet]} XP`, '#ffd700',
        );
        this.game.events.emit('sync-player');
      }
    });

    network.on('dummy_reset', ({ dummyId }) => {
      const dummy = this.dummiesByServerId.get(dummyId);
      if (dummy) this.playDummyReset(dummy);
    });

    network.on('level_up', ({ wallet_address, skill, newLevel }) => {
      if (wallet_address !== network.wallet) return;
      this.game.events.emit('level-ups', [{ skill, newLevel }]);
      this.game.events.emit('sync-player'); // refresh skills panel data
    });

    network.on('attack_rejected', ({ reason, required }) => {
      if (reason === 'level_requirement') {
        this.showFloatingText(
          this.playerContainer.x, this.playerContainer.y - 40,
          `Requires level ${required}`, '#ff6666',
        );
      }
      this.cancelCombat();
    });

    // --- Boss AOE + death/respawn (server-driven) ---

    network.on('boss_aoe_warning', () => {
      this.bossAoeWarningActive = true;
      threeScene.showAoeWarning(
        BOSS_CENTER_TILE.x + 0.5, BOSS_CENTER_TILE.y + 0.5, BOSS.aoe_radius_tiles);
      this.startBossTelegraph();
    });

    network.on('boss_aoe_fire', ({ hitWallets }) => {
      this.bossAoeWarningActive = false;
      threeScene.hideAoeWarning();
      this.endBossTelegraph();
      this.flashBossAoe();
      if (Array.isArray(hitWallets) && hitWallets.includes(network.wallet)) {
        this.showFloatingText(
          this.playerContainer.x, this.playerContainer.y - 40, '-10', '#ff4444',
        );
        this.game.events.emit('sync-player'); // pull authoritative HP from the DB
      }
    });

    network.on('player_died', () => {
      this.handlePlayerDeath();
    });

    network.on('boss_died', ({ loot }) => {
      this.bossAoeWarningActive = false;
      threeScene.hideAoeWarning();
      this.bossSystem.enterDeadState();
      // Phase 6: hide standalone label/bars when boss is dead
      if (this.bossLabel) this.bossLabel.setVisible(false);
      if (this.bossHpBarBg) this.bossHpBarBg.setVisible(false);
      if (this.bossHpBarFill) this.bossHpBarFill.setVisible(false);
      this.game.events.emit('chat-message', { text: `${BOSS.name} has been defeated!` });
      this.game.events.emit('show-banner', {
        text: `${BOSS.name} has been defeated!`, color: '#ffd700', duration: 3000, y: 185,
      });
      const myLoot = loot && loot[network.wallet];
      if (myLoot && myLoot.item_id) {
        if (myLoot.dropped) {
          // Inventory was full — the item is on the ground, awaiting pickup.
          this.game.events.emit('loot-notification', {
            text: `Inventory full! ${myLoot.item_name} dropped — click it to pick up`, color: '#ffaa33',
          });
        } else {
          this.game.events.emit('loot-notification', {
            text: `You received: ${myLoot.item_name}`, color: '#ffd700',
          });
          this.game.events.emit('sync-player');
        }
      }
    });

    // Owner-only ground item spawned (boss loot dropped when inventory was full).
    network.on('ground_item_spawned', ({ id, x, y, item_name }) => {
      if (this.groundItems.has(id)) return;
      threeScene.addGroundItem(id, x, y);
      const label = this.add.text(0, 0, `${item_name}\n(click to pick up)`, {
        fontSize: '11px', color: '#ffcc33', align: 'center',
        backgroundColor: '#000000aa', padding: { x: 3, y: 1 },
      }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(60);
      this.groundItems.set(id, { tileX: x, tileZ: y, label });
    });

    network.on('ground_item_removed', ({ ground_item_id, item_name }) => {
      const gi = this.groundItems.get(ground_item_id);
      if (gi) {
        if (gi.label) gi.label.destroy();
        this.groundItems.delete(ground_item_id);
      }
      threeScene.removeGroundItem(ground_item_id);
      if (item_name) {
        this.game.events.emit('loot-notification', { text: `Picked up: ${item_name}`, color: '#ffd700' });
        this.game.events.emit('sync-player');
      }
    });

    network.on('pickup_failed', ({ reason }) => {
      const msg = reason === 'inventory_full' ? 'Inventory still full — make space first' : 'Could not pick up item';
      this.game.events.emit('loot-notification', { text: msg, color: '#ff6666' });
    });

    network.on('boss_respawned', () => {
      this.bossSystem.respawnVisual();
      // Phase 6: restore standalone label/bars on respawn
      if (this.bossLabel) this.bossLabel.setVisible(true);
      if (this.bossHpBarBg) this.bossHpBarBg.setVisible(true);
      if (this.bossHpBarFill) this.bossHpBarFill.setVisible(true);
      this.game.events.emit('chat-message', { text: `${BOSS.name} has respawned!` });
    });

    // --- Wager events (Phase 3) — routed to the WagerUI in UIScene ---
    network.on('wager_challenge', (p) => this.game.events.emit('wager-challenge', p));
    network.on('wager_accepted', (p) => this.game.events.emit('wager-accepted', p));
    network.on('wager_declined', (p) => this.game.events.emit('wager-declined', p));
    network.on('wager_cancelled', (p) => this.game.events.emit('wager-cancelled', p));
    network.on('wager_fight_tick', (p) => this.game.events.emit('wager-fight-tick', p));
    network.on('wager_fight_result', (p) => this.game.events.emit('wager-fight-result', p));
    network.on('error', (p) => this.game.events.emit('wager-error', p));

    this.events.once('shutdown', () => {
      MP_EVENTS.forEach((e) => network.off(e));
      if (this.otherPlayers) {
        for (const [wallet, op] of this.otherPlayers.entries()) {
          threeScene.removeOtherPlayerBillboard(wallet);
          if (op._nameLabelTimer) clearTimeout(op._nameLabelTimer);
          op.container.destroy();
          op.nameLabel.destroy();
          op.hpBg.destroy();
          op.hpFill.destroy();
        }
        this.otherPlayers.clear();
      }
    });

    const player = this.registry.get('player');
    network.connect(player.display_name);
    // join_room defaults our server-side position to the lobby centre; send our
    // real spawn tile so other clients place us correctly.
    network.sendMove(this.tileX, this.tileY);
    this._lastMoveSent = Date.now();
  }

  // Display-only sprite for another player — no input, combat, or pathfinding.
  createOtherPlayer(p) {
    const ts = WORLD.TILE_SIZE;
    const gender = p.gender === 'female' ? 'female' : 'male';
    const spriteKey = `player_${gender}`;

    let body;
    if (this.textures.exists(spriteKey)) {
      body = this.add.image(0, 0, spriteKey);
      body.setScale((ts * 1.5) / body.width);
    } else {
      body = this.add.rectangle(0, 0, 20, 26, 0x3a6fd8).setStrokeStyle(1, 0x111111);
    }
    // Three.js handles the visual at the correct 3D-projected scale; the Phaser
    // body is kept only for container parenting (container drives position tracking).
    body.setAlpha(0);
    threeScene.addOtherPlayerBillboard(p.wallet_address, gender);

    // Phase 6: nameLabel/hpBg/hpFill are standalone scrollFactor(0) objects.
    // nameLabel starts hidden; shown briefly on right-click via requestOtherPlayerMenu.
    const nameLabel = this.add.text(0, 0, p.display_name, {
      fontFamily: 'monospace', fontSize: '12px', color: '#9fd3ff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(50).setVisible(false);
    const hpBg = this.add.rectangle(0, 0, 34, 5, 0x000000)
      .setOrigin(0.5).setScrollFactor(0).setDepth(50);
    const hpFill = this.add.rectangle(0, 0, 32, 3, 0x2ecc40)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(50);

    const container = this.add.container(
      p.x * ts + ts / 2, p.y * ts + ts / 2, [body],
    ).setDepth(9);

    // Right-click another player → wager challenge menu (display-only otherwise:
    // no movement/combat interactions, per Phase 1).
    body.setInteractive({ useHandCursor: true });
    body.on('pointerdown', (pointer, localX, localY, event) => {
      if (!pointer.rightButtonDown()) return;
      event.stopPropagation();
      this.requestOtherPlayerMenu(p.wallet_address, p.display_name, pointer);
    });

    const op = { container, body, nameLabel, hpBg, hpFill, displayName: p.display_name };
    op.hpFill.width = 32 * Phaser.Math.Clamp((p.currentHp != null ? p.currentHp : 100) / 100, 0, 1);
    this.otherPlayers.set(p.wallet_address, op);
  }

  // Right-click menu on another player: Attack (still a stub) + functional Wager.
  requestOtherPlayerMenu(wallet, name, pointer) {
    // Show the target's name label while the context menu is open (~5 s covers
    // reading the menu and making a selection; no close event to hook into).
    const op = this.otherPlayers && this.otherPlayers.get(wallet);
    if (op && op.nameLabel) {
      op.nameLabel.setVisible(true);
      if (op._nameLabelTimer) clearTimeout(op._nameLabelTimer);
      op._nameLabelTimer = setTimeout(() => {
        if (op.nameLabel) op.nameLabel.setVisible(false);
        op._nameLabelTimer = null;
      }, 5000);
    }
    this.game.events.emit('open-context-menu', {
      x: pointer.x,
      y: pointer.y,
      items: [
        { label: `Attack ${name}`, enabled: false, suffix: 'Coming Soon' },
        { label: `Wager ${name}`, enabled: true, event: 'open-wager-panel', payload: { wallet, name } },
      ],
    });
  }

  // Throttled position broadcast while moving (every 500ms)
  maybeSendMove() {
    if (typeof network === 'undefined' || !network.socket) return;
    const now = Date.now();
    if (now - this._lastMoveSent > 500) {
      this._lastMoveSent = now;
      network.sendMove(this.tileX, this.tileY);
    }
  }

  // Brief red flash on the boss body when the AOE fires.
  flashBossAoe() {
    const body = this.bossBody;
    if (!body) return;
    if (body.type === 'Image') {
      body.setTint(0xff0000);
      this.time.delayedCall(300, () => { if (this.bossBody) this.bossBody.clearTint(); });
    } else {
      body.setFillStyle(0xff0000);
      this.time.delayedCall(300, () => { if (this.bossBody) this.bossBody.setFillStyle(BOSS_BODY_COLOR); });
    }
  }

  update(time, delta) {
    this.foodSystem.update(delta);
    this.bossSystem.update(delta);
    this.updatePlayerMotion();
    this.updateAttackIntent();

    // Follow a wandering creature target until in range, then attack fires above.
    if (this.combatTarget && this.combatTarget.isCreature && !this.attackStarted
        && !this.isMoving && !this.combatTarget.dead && !this.isInRangeOf(this.combatTarget)) {
      this.walkToDummy(this.combatTarget);
    }

    // Arrow keys — orbit (left/right) and pitch (up/down).
    if (!this.typingActive && this.cursorKeys) {
      const rotDelta   = CAMERA.ROTATION_SPEED * (delta / 1000);
      const pitchDelta = CAMERA.PITCH_SPEED    * (delta / 1000);
      if (this.cursorKeys.left.isDown)  this.orbitAngle -= rotDelta;
      if (this.cursorKeys.right.isDown) this.orbitAngle += rotDelta;
      if (this.cursorKeys.up.isDown) {
        this.pitchAngle = Phaser.Math.Clamp(
          this.pitchAngle + pitchDelta, CAMERA.PITCH_MIN, CAMERA.PITCH_MAX);
      }
      if (this.cursorKeys.down.isDown) {
        this.pitchAngle = Phaser.Math.Clamp(
          this.pitchAngle - pitchDelta, CAMERA.PITCH_MIN, CAMERA.PITCH_MAX);
      }
    }

    // Three.js camera sync + render (Phase 3 full rig).
    const _ts = WORLD.TILE_SIZE;
    const _px = this.playerContainer.x / _ts;
    const _pz = this.playerContainer.y / _ts;
    threeScene.syncCamera(_px, _pz, this.orbitAngle, this.pitchAngle, this.camDist);

    // Phase 2: walk animation frame and billboard position.
    if (this.isMoving) { this._playerAnimTime += delta; }
    else               { this._playerAnimTime  = 0;     }
    const _animCol = Math.floor(this._playerAnimTime / 140) % 6;
    const _dirRow  = ThreeScene.dirRowFromMovement(
      this.playerFacingDx, this.playerFacingDy, this.orbitAngle);
    threeScene.updatePlayer(_px, _pz, _dirRow, _animCol);

    // Phase 4: sync dummy and boss billboards.
    for (let _i = 0; _i < this.dummies.length; _i++) {
      const _d = this.dummies[_i];
      threeScene.updateDummy(_i, _d.locked, _d.currentHp <= 0);
    }
    threeScene.updateBoss(
      this.bossSystem.state === 'ALIVE',
      this.bossAoeWarningActive,
    );

    threeScene.render();

    // Phase 6: reposition all floating UI elements to track their 3D billboard positions.
    // Height offsets are in Three.js world units; positive Y = up from ground.
    // DUMMY_SPRITE_H = 1.5, PLAYER_SPRITE_H = 1.8, BOSS_SPRITE_H = 3.5 (from ThreeScene.js)
    for (const _d6 of this.dummies) {
      const _sp6 = threeScene.getScreenPosition(_d6.tileX + 0.5, _d6.tileY + 0.5, 1.8);
      if (_sp6) {
        _d6.label.setPosition(_sp6.x, _sp6.y);
        _d6.hpBarBg.setPosition(_sp6.x, _sp6.y + 13);
        _d6.hpBarFill.setPosition(_sp6.x - 13, _sp6.y + 13);
        _d6.lockIcon.setPosition(_sp6.x, _sp6.y + 13);
      }
    }
    if (this.bossLabel) {
      const _bp6 = threeScene.getScreenPosition(
        BOSS_CENTER_TILE.x + 0.5, BOSS_CENTER_TILE.y + 0.5, 3.8);
      if (_bp6) {
        this.bossLabel.setPosition(_bp6.x, _bp6.y);
        this.bossHpBarBg.setPosition(_bp6.x, _bp6.y + 18);
        this.bossHpBarFill.setPosition(_bp6.x - 50, _bp6.y + 18);
      }
    }
    // Creatures — lerp render position toward target tile, update billboard + UI
    if (this.creatures && this.creatures.size) {
      for (const cr of this.creatures.values()) {
        if (cr.dead) continue;
        cr.rx += (cr.tileX - cr.rx) * 0.15;
        cr.ry += (cr.tileY - cr.ry) * 0.15;
        threeScene.updateCreatureBillboard(cr.id, cr.rx + 0.5, cr.ry + 0.5);
        const _csp = threeScene.getScreenPosition(cr.rx + 0.5, cr.ry + 0.5, threeScene.creatureSpriteHeight(cr.id));
        const _cvis = !!_csp;
        cr.label.setVisible(_cvis); cr.hpBg.setVisible(_cvis); cr.hpFill.setVisible(_cvis);
        if (_csp) {
          cr.label.setPosition(_csp.x, _csp.y);
          cr.hpBg.setPosition(_csp.x, _csp.y + 12);
          cr.hpFill.setPosition(_csp.x - 14, _csp.y + 12);
        }
      }
    }

    // Ground-item labels — track their tile each frame (owner-only loot)
    if (this.groundItems && this.groundItems.size) {
      for (const gi of this.groundItems.values()) {
        const _gsp = threeScene.getScreenPosition(gi.tileX + 0.5, gi.tileZ + 0.5, 0.9);
        if (_gsp && gi.label) {
          gi.label.setVisible(true);
          gi.label.setPosition(_gsp.x, _gsp.y);
        } else if (gi.label) {
          gi.label.setVisible(false);
        }
      }
    }
    // local player name label intentionally not shown (removed from createPlayer)
    if (this.otherPlayers) {
      for (const [_opWallet, _op6] of this.otherPlayers) {
        const _ox = _op6.container.x / _ts;
        const _oz = _op6.container.y / _ts;
        threeScene.updateOtherPlayerBillboard(_opWallet, _ox, _oz);
        const _osp6 = threeScene.getScreenPosition(_ox, _oz, 2.1);
        if (_osp6) {
          _op6.nameLabel.setPosition(_osp6.x, _osp6.y);
          _op6.hpBg.setPosition(_osp6.x, _osp6.y + 13);
          _op6.hpFill.setPosition(_osp6.x - 16, _osp6.y + 13);
        }
      }
    }
    // NPCs — hide when behind camera (player in another zone), show when in view
    if (this.npcs) {
      for (const _npc6 of this.npcs) {
        const _nsp6 = threeScene.getScreenPosition(_npc6.tileX + 0.5, _npc6.tileY + 0.5, 0.8);
        const _nv6  = !!_nsp6;
        _npc6.body.setVisible(_nv6);
        _npc6.label.setVisible(_nv6);
        _npc6.hit.setVisible(_nv6);
        if (_nsp6) {
          _npc6.body.setPosition(_nsp6.x, _nsp6.y);
          _npc6.hit.setPosition(_nsp6.x, _nsp6.y);
          const _lblOff = (_npc6.body.displayHeight ? _npc6.body.displayHeight / 2 : 12) + 8;
          _npc6.label.setPosition(_nsp6.x, _nsp6.y - _lblOff);
        }
      }
    }

    // Dummy idle sway — Phaser camera.rotation is always 0 so no counter-rotation needed.
    for (const dummy of this.dummies) {
      if (dummy.recoiling) continue;
      if (!dummy.locked && dummy.currentHp > 0) {
        const phase = ((dummy.id * 300) / 2200) * Math.PI * 2;
        dummy.body.rotation = Math.sin((time / 2200) * Math.PI * 2 + phase) * 0.04;
      } else {
        dummy.body.rotation = 0;
      }
    }

    // Chat bubble follows the player above the name label
    if (this.chatBubble) {
      this.chatBubble.setPosition(this.playerContainer.x, this.playerContainer.y - 44);
    }
  }
}
