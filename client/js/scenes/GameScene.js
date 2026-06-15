// GameScene.js — main game world: tilemap (all three zones), point-and-click
// movement with A* pathfinding, camera zoom/rotate, training dummies and the
// auto-attack combat loop.
//
// Combat style is chosen in the Combat Style Panel (COMBAT button) and stored
// on player.activeTrainingStyle — left-clicking a dummy attacks with it.

// World layout per CLAUDE.md Section 13 — one continuous tilemap, three zones
// stacked south-to-north: Lobby -> Training Grounds -> Boss Cave.
const WORLD = {
  TILE_SIZE: 32,
  WIDTH: 40,    // tiles
  HEIGHT: 90,   // tiles
  // Wall rows separating zones (door gaps cut into them)
  WALL_ROWS: [0, 30, 60, 89],
  DOOR_XS: [19, 20],          // 2-tile-wide doorways, centred
  ZONES: {
    BOSS_CAVE:        { name: 'Boss Cave',        minY: 0,  maxY: 29, tileIndex: 2 }, // dark stone
    TRAINING_GROUNDS: { name: 'Training Grounds', minY: 30, maxY: 59, tileIndex: 1 }, // dirt brown
    LOBBY:            { name: 'Lobby',            minY: 60, maxY: 89, tileIndex: 0 }, // grey stone
  },
  SPAWN_ZONE_TILES: 3, // 3x3 spawn zone in lobby centre
  SPAWN_CENTER: { x: 20, y: 74 },
};

const TILE_COLORS = {
  lobby: 0x888888,
  training: 0x8B6914,
  boss: 0x333333,
  wall: 0x55504a,
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

// The Minotaur — fixed at the Boss Cave centre, 3x3 tiles on the central
// emblem. Footprint generated around the centre tile (20, 15).
const BOSS_CENTER_TILE = { x: 20, y: 15 };
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
  }

  create() {
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
    // One 4-tile tileset texture: [lobby, training, boss, wall]
    const ts = WORLD.TILE_SIZE;
    const colors = [TILE_COLORS.lobby, TILE_COLORS.training, TILE_COLORS.boss, TILE_COLORS.wall];
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
    const { WIDTH, HEIGHT, WALL_ROWS, DOOR_XS, TILE_SIZE } = WORLD;
    const WALL_INDEX = 3;

    this.grid = [];      // tile indices for the tilemap
    this.walkable = [];  // boolean grid for A*

    for (let y = 0; y < HEIGHT; y++) {
      const row = [];
      const walkRow = [];
      for (let x = 0; x < WIDTH; x++) {
        const isPerimeter = x === 0 || x === WIDTH - 1 || y === 0 || y === HEIGHT - 1;
        const isZoneWall = WALL_ROWS.includes(y) && !DOOR_XS.includes(x);
        const isWall = isPerimeter || isZoneWall;

        row.push(isWall ? WALL_INDEX : this.zoneForRow(y).tileIndex);
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

  // Per-zone background images behind the tile layer and all sprites (depth -1).
  // Each fills its zone's pixel bounds at alpha 0.85. When backgrounds are
  // present the opaque tile layer is dimmed to a faint grid so they show
  // through; with no backgrounds the tiles render normally.
  buildBackgrounds() {
    const ts = WORLD.TILE_SIZE;
    const zoneBg = {
      LOBBY: 'bg_lobby',
      TRAINING_GROUNDS: 'bg_training_grounds',
      BOSS_CAVE: 'bg_boss_cave',
    };

    let anyAdded = false;
    for (const [zoneKey, bgKey] of Object.entries(zoneBg)) {
      if (!this.textures.exists(bgKey)) continue;
      const zone = WORLD.ZONES[zoneKey];
      const x0 = 0;
      const x1 = WORLD.WIDTH * ts;
      const y0 = zone.minY * ts;
      const y1 = (zone.maxY + 1) * ts;

      this.add.image((x0 + x1) / 2, (y0 + y1) / 2, bgKey)
        .setDisplaySize(x1 - x0, y1 - y0)
        .setAlpha(0.85)
        .setDepth(-1);
      anyAdded = true;
    }

    // Dim the tile layer to a faint grid only when real backgrounds exist,
    // so they remain visible behind it (placeholder/debug-friendly).
    if (anyAdded && this.tileLayer) this.tileLayer.setAlpha(0.35);
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
      const baseX = col === 0 ? 8 : 26;
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
        const label = this.add.text(0, -30, `Lv${tier.level} Dummy`, {
          fontFamily: 'monospace', fontSize: '10px', color: '#ffffff',
          stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5);
        const hpBarBg = this.add.rectangle(0, -19, 28, 5, 0x000000).setOrigin(0.5);
        const hpBarFill = this.add.rectangle(-13, -19, 26, 3, 0x2ecc40)
          .setOrigin(0, 0.5);
        const lockIcon = this.add.text(0, 0, '🔒', { fontSize: '12px' })
          .setOrigin(0.5).setVisible(false);

        const container = this.add.container(
          tileX * ts + ts / 2, tileY * ts + ts / 2,
          [body, label, hpBarBg, hpBarFill, lockIcon],
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
          container, body, label, hpBarFill, lockIcon,
        };

        body.setInteractive({ useHandCursor: true });
        body.on('pointerdown', (pointer, localX, localY, event) => {
          if (pointer.rightButtonDown()) {
            event.stopPropagation();
            this.requestDummyMenu(dummy, pointer);
          } else if (pointer.leftButtonDown()) {
            event.stopPropagation();
            this.handleDummyLeftClick(dummy);
          }
        });

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
      dummy.container.setAlpha(dummy.locked ? 0.75 : 1);
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

  // Miss acknowledgement: a quick alpha pulse on the body.
  dummyMissPulse(dummy) {
    dummy.body.setAlpha(0.6);
    this.tweens.add({ targets: dummy.body, alpha: 1, duration: 200, ease: 'Quad.easeOut' });
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

    // Label + HP bar sit above the body, offset by its actual half-height
    const halfH = (body.displayHeight || bodySize) / 2;
    const label = this.add.text(0, -halfH - 26, `${BOSS.name} (Lv ${BOSS.level})`, {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffd700', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    const barY = -halfH - 12;
    const hpBarBg = this.add.rectangle(0, barY, 104, 10, 0x000000).setOrigin(0.5);
    this.bossHpBarFill = this.add.rectangle(-50, barY, 100, 6, 0xcc2222).setOrigin(0, 0.5);

    this.bossContainer = this.add.container(
      this.bossCenterPx.x, this.bossCenterPx.y, [body, label, hpBarBg, this.bossHpBarFill],
    ).setDepth(5);

    body.setInteractive({ useHandCursor: true });
    body.on('pointerdown', (pointer, localX, localY, event) => {
      if (pointer.rightButtonDown()) {
        event.stopPropagation();
        this.game.events.emit('open-context-menu', {
          x: pointer.x,
          y: pointer.y,
          items: [
            { label: `Attack ${BOSS.name}`, enabled: true, event: 'attack-boss' },
          ],
        });
      } else if (pointer.leftButtonDown()) {
        event.stopPropagation();
        this.startBossAttack();
      }
    });

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
    const ts = WORLD.TILE_SIZE;
    const npcs = [
      { key: 'bank',      name: 'Bank',       color: 0xc9a84c, tileX: 12, tileY: 68 },
      { key: 'merchant',  name: 'Merchant',   color: 0x8b6914, tileX: 28, tileY: 68 },
      { key: 'food',      name: 'Food Shop',  color: 0x2d6e2d, tileX: 12, tileY: 80 },
      { key: 'cosmetics', name: 'Cosmetics',  color: 0x6b2d8b, tileX: 28, tileY: 80 },
    ];

    this.npcContainers = [];
    for (const npc of npcs) {
      this.walkable[npc.tileY][npc.tileX] = false; // NPCs block movement

      const body = this.add.circle(0, 0, 12, npc.color).setStrokeStyle(2, 0x111111);
      const label = this.add.text(0, -22, npc.name, {
        fontFamily: 'monospace', fontSize: '10px', color: '#aaddff',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5);

      // Invisible hit zone (rectangles handle input reliably) over the circle
      const hit = this.add.rectangle(0, 0, 28, 28, 0xffffff, 0)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', (pointer, localX, localY, event) => {
        if (!pointer.leftButtonDown()) return;
        event.stopPropagation();
        this.game.events.emit('open-npc', { npc: npc.key });
      });

      const container = this.add.container(
        npc.tileX * ts + ts / 2, npc.tileY * ts + ts / 2, [body, hit, label],
      );
      this.npcContainers.push(container);
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
    this.onNameChanged = () => {
      this.playerNameLabel.setText(this.registry.get('player').display_name);
    };
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
      network.startAttack('dummy', this.combatTarget.serverId, style);
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
      .setDepth(500)
      .setRotation(-this.cameras.main.rotation);

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

  showFloatingText(worldX, worldY, str, color = '#ffffff') {
    const text = this.add.text(worldX, worldY, str, {
      fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold',
      color,
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(600).setRotation(-this.cameras.main.rotation);

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
    // Reset flash: fade in from transparent over 400ms
    dummy.body.setAlpha(0);
    this.tweens.add({ targets: dummy.body, alpha: 1, duration: 400 });
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

    const halfH = (body.displayHeight || 26) / 2;
    const nameLabel = this.add.text(0, -halfH - 8, player.display_name, {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffff66',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    this.playerNameLabel = nameLabel;

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
      [body, nameLabel],
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

  showClickMarker(tileX, tileY) {
    const ts = WORLD.TILE_SIZE;
    if (this.clickMarker) this.clickMarker.destroy();

    this.clickMarker = this.add.rectangle(
      tileX * ts + ts / 2, tileY * ts + ts / 2, ts - 4, ts - 4,
    ).setStrokeStyle(2, 0xffff00);

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

    // Point-and-click movement: left-click an empty tile to walk there.
    // Moving cancels combat. Clicks on dummies/boss stop propagation in their
    // own handlers, so they never reach this.
    this.input.on('pointerdown', (pointer) => {
      if (!pointer.leftButtonDown()) return;
      if (this.isDead) return; // movement halted during the death sequence
      this.cancelCombat();
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const tileX = Math.floor(worldPoint.x / ts);
      const tileY = Math.floor(worldPoint.y / ts);
      this.moveTo(tileX, tileY);
    });

    // Mouse scroll = zoom in/out
    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - deltaY * 0.001, 0.5, 2.5));
    });

    // Arrow keys = rotate view in 4 directions (90-degree steps)
    this.rotationIndex = 0;
    this.typingActive = false;
    this.input.keyboard.on('keydown-LEFT', () => {
      if (!this.typingActive) this.rotateCamera(-1);
    });
    this.input.keyboard.on('keydown-RIGHT', () => {
      if (!this.typingActive) this.rotateCamera(1);
    });

    // F = eat one Cooked Chicken (also available via inventory right-click)
    this.input.keyboard.on('keydown-F', () => {
      if (!this.typingActive) this.eatFood();
    });
  }

  rotateCamera(direction) {
    this.rotationIndex = (this.rotationIndex + direction + 4) % 4;
    this.tweens.add({
      targets: this.cameras.main,
      rotation: this.rotationIndex * (Math.PI / 2),
      duration: 250,
      ease: 'Sine.easeInOut',
    });
  }

  setupCamera() {
    const cam = this.cameras.main;
    cam.startFollow(this.playerContainer, true, 0.15, 0.15);
    cam.setZoom(1.5);
  }

  // --- Multiplayer (Section 32, Phase 1: presence + chat) ---

  setupMultiplayer() {
    // Degrade gracefully to single-player if Socket.io isn't available
    if (typeof network === 'undefined' || !network.socket) return;

    this.otherPlayers = new Map(); // wallet_address → { container, body, hpFill, displayName }
    this._lastMoveSent = 0;

    const MP_EVENTS = [
      'room_joined', 'player_joined', 'player_left', 'player_moved', 'chat_message',
      'combat_hit', 'combat_miss', 'dummy_kill', 'dummy_reset', 'level_up',
      'attack_rejected', 'boss_aoe_warning', 'boss_aoe_fire', 'player_died',
      'boss_died', 'boss_respawned',
      'wager_challenge', 'wager_accepted', 'wager_declined', 'wager_cancelled',
      'wager_fight_tick', 'wager_fight_result', 'error',
    ];
    // Clear any stale handlers from a previous scene instance (socket is global)
    MP_EVENTS.forEach((e) => network.off(e));

    network.on('room_joined', ({ players, chat }) => {
      for (const id in players) {
        if (id === network.wallet) continue; // skip self
        if (!this.otherPlayers.has(id)) this.createOtherPlayer(players[id]);
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
      op.container.destroy();
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
      }
      if (attackerId === network.wallet) {
        const tx = targetType === 'boss' ? this.bossContainer.x
          : (this.dummiesByServerId.get(targetId) || {}).container?.x;
        const ty = targetType === 'boss' ? this.bossContainer.y
          : (this.dummiesByServerId.get(targetId) || {}).container?.y;
        if (tx != null && ty != null) this.playerLunge(tx, ty);
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
      this.bossSystem.createWarningRing();
      this.startBossTelegraph();
    });

    network.on('boss_aoe_fire', ({ hitWallets }) => {
      this.bossSystem.destroyWarningRing();
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
      this.bossSystem.enterDeadState();
      this.game.events.emit('chat-message', { text: `${BOSS.name} has been defeated!` });
      this.game.events.emit('show-banner', {
        text: `${BOSS.name} has been defeated!`, color: '#ffd700', duration: 3000, y: 185,
      });
      const myLoot = loot && loot[network.wallet];
      if (myLoot && myLoot.item_id) {
        this.game.events.emit('loot-notification', {
          text: `You received: ${myLoot.item_name}`, color: '#ffd700',
        });
        this.game.events.emit('sync-player');
      }
    });

    network.on('boss_respawned', () => {
      this.bossSystem.respawnVisual();
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
        for (const op of this.otherPlayers.values()) op.container.destroy();
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

    const halfH = (body.displayHeight || 26) / 2;
    const nameLabel = this.add.text(0, -halfH - 8, p.display_name, {
      fontFamily: 'monospace', fontSize: '12px', color: '#9fd3ff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    const hpBg = this.add.rectangle(0, -halfH - 20, 34, 5, 0x000000).setOrigin(0.5);
    const hpFill = this.add.rectangle(-16, -halfH - 20, 32, 3, 0x2ecc40).setOrigin(0, 0.5);

    const container = this.add.container(
      p.x * ts + ts / 2, p.y * ts + ts / 2, [body, nameLabel, hpBg, hpFill],
    ).setDepth(9);

    // Right-click another player → wager challenge menu (display-only otherwise:
    // no movement/combat interactions, per Phase 1).
    body.setInteractive({ useHandCursor: true });
    body.on('pointerdown', (pointer, localX, localY, event) => {
      if (!pointer.rightButtonDown()) return;
      event.stopPropagation();
      this.requestOtherPlayerMenu(p.wallet_address, p.display_name, pointer);
    });

    const op = { container, body, hpFill, displayName: p.display_name };
    op.hpFill.width = 32 * Phaser.Math.Clamp((p.currentHp != null ? p.currentHp : 100) / 100, 0, 1);
    this.otherPlayers.set(p.wallet_address, op);
  }

  // Right-click menu on another player: Attack (still a stub) + functional Wager.
  requestOtherPlayerMenu(wallet, name, pointer) {
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

    // Keep sprites and labels upright on screen while the camera rotates
    const counterRotation = -this.cameras.main.rotation;
    this.playerContainer.setRotation(counterRotation);
    this.bossContainer.setRotation(counterRotation);
    if (this.bossSystem.respawnText) this.bossSystem.respawnText.setRotation(counterRotation);
    for (const dummy of this.dummies) {
      dummy.container.setRotation(counterRotation);
      // Idle sway (Section 6): unlocked, alive dummies rock gently, each with a
      // phase offset so they're out of sync. Locked/dead/recoiling: no sway.
      if (dummy.recoiling) continue;
      if (!dummy.locked && dummy.currentHp > 0) {
        const phase = ((dummy.id * 300) / 2200) * Math.PI * 2;
        dummy.body.rotation = Math.sin((time / 2200) * Math.PI * 2 + phase) * 0.04;
      } else {
        dummy.body.rotation = 0;
      }
    }
    for (const npc of this.npcContainers) {
      npc.setRotation(counterRotation);
    }
    if (this.otherPlayers) {
      for (const op of this.otherPlayers.values()) op.container.setRotation(counterRotation);
    }

    // Chat bubble follows the player above the name label
    if (this.chatBubble) {
      this.chatBubble.setPosition(this.playerContainer.x, this.playerContainer.y - 44);
      this.chatBubble.setRotation(counterRotation);
    }
  }
}
