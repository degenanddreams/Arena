// ThreeScene.js — Three.js scene manager for the 2.5D hybrid renderer.
//
// Migration phases:
//   0b  (done) Proof-of-concept dual-canvas overlay, wireframe grid
//   1   (current) Zone ground planes textured with background images;
//                 camera sync follows player tile position + Phaser rotation
//   2   Player billboard (8-dir sprite sheet on THREE.Sprite)
//   3   Full camera rig — orbit angle, pitch, dolly zoom via Three.js only
//   4   Dummy / boss / NPC billboards
//   5   Raycaster click-to-move bridge
//
// Coordinate system:
//   X = east, Z = south, Y = up (standard Three.js right-hand)
//   Tile (tx, ty) → 3D world (tx * TU, 0, ty * TU)  where TU = TILE_UNIT
//
// Canvas layering (set in index.html CSS):
//   z-index 0 — Three.js canvas (world / ground)
//   z-index 1 — Phaser canvas  (transparent; sprites + UI on top)

const TILE_UNIT = 1; // one game tile = 1 Three.js world unit

// Zone layout mirrors WORLD.ZONES in GameScene.js.
// minY/maxY are tile rows; dimensions in 3D world units.
const ZONES_3D = [
  { key: 'boss_cave',        minZ: 0,  maxZ: 30, color: 0x2a1a2a, texPath: '/assets/backgrounds/boss_cave.jpg' },
  { key: 'training_grounds', minZ: 30, maxZ: 60, color: 0x5a3a14, texPath: '/assets/backgrounds/training_grounds.jpg' },
  { key: 'lobby',            minZ: 60, maxZ: 90, color: 0x555555, texPath: '/assets/backgrounds/lobby.jpg' },
];

// Phase 2: player billboard — sprite sheet dimensions and display scale.
// Sheet: 12 cols (6 walk + 6 run) × 8 rows (N, NE, E, SE, S, SW, W, NW).
const PLAYER_SHEET_COLS = 12;
const PLAYER_SHEET_ROWS =  8;
const PLAYER_SPRITE_W   = 0.9;  // width in Three.js world units (~0.9 tiles)
const PLAYER_SPRITE_H   = 1.8;  // height (feet at y=0, head at y=PLAYER_SPRITE_H)

// Phase 4: dummy and boss billboard display sizes (in Three.js world units = tiles).
const DUMMY_SPRITE_W = 0.85;
const DUMMY_SPRITE_H = 1.5;
const BOSS_SPRITE_W  = 3.0;
const BOSS_SPRITE_H  = 3.5;

// Phase 3: full camera rig — optical constants only (position/distance/pitch
// are driven by the CAMERA block in timing.js so both files agree).
const CAM = {
  FOV:  55,   // PerspectiveCamera vertical field of view (degrees)
  NEAR:  0.5,
  FAR:  500,
};

class ThreeScene {
  constructor() {
    this._canvas  = null;
    this.renderer = null;
    this.scene    = null;
    this.camera   = null;
    this._ready   = false;
  }

  // -------------------------------------------------------------------------
  // init(width, height, containerEl)
  //   Creates the Three.js WebGL canvas, inserts it as the FIRST child of
  //   containerEl (so it sits behind the Phaser canvas in DOM stacking order),
  //   and builds the Phase-1 scene.
  // -------------------------------------------------------------------------
  init(width, height, containerEl) {
    if (this._ready) return;

    // Store logical dimensions for NDC coordinate conversion in Phase 5.
    // renderer.setPixelRatio() overwrites canvas.width with width*dpr, so we
    // can't rely on canvas.width for NDC math — we need the original values.
    this._logicalW = width;
    this._logicalH = height;

    // --- Canvas ---
    this._canvas       = document.createElement('canvas');
    this._canvas.id    = 'threejs-canvas';
    this._canvas.width  = width;
    this._canvas.height = height;
    containerEl.insertBefore(this._canvas, containerEl.firstChild);

    // --- Renderer ---
    // alpha:true → clear colour is transparent so anything undrawn shows
    // the body background (#1a1a1a) through both canvases.
    this.renderer = new THREE.WebGLRenderer({ canvas: this._canvas, antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);

    // --- Scene ---
    this.scene = new THREE.Scene();

    // --- Camera ---
    this.camera = new THREE.PerspectiveCamera(CAM.FOV, width / height, CAM.NEAR, CAM.FAR);
    // Pre-position using rig defaults (lobby spawn ~tile 20,75) so the first
    // frame looks correct before syncCamera() is called.
    {
      const hd = CAMERA.DIST_DEFAULT * Math.cos(CAMERA.PITCH_DEFAULT);
      const vd = CAMERA.DIST_DEFAULT * Math.sin(CAMERA.PITCH_DEFAULT);
      this.camera.position.set(20, vd, 75 + hd);
    }
    this.camera.lookAt(20, 0, 75);

    // --- Lighting ---
    // Flat MeshBasicMaterial on the ground planes doesn't need lights,
    // but we add them now so Phase 2+ sprites look correct.
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.6);
    sun.position.set(30, 60, 20);
    this.scene.add(sun);

    // --- Ground planes (one per zone) ---
    this._buildGroundPlanes();

    this._ready = true;
    console.log('[ThreeScene] Phase 1 initialised — zone ground planes active.');
  }

  // Build one textured plane per zone.  Falls back to a flat colour if the
  // background image isn't available yet (e.g. asset pipeline not run).
  _buildGroundPlanes() {
    const loader = new THREE.TextureLoader();

    for (const zone of ZONES_3D) {
      const width3d  = 40 * TILE_UNIT;
      const depth3d  = (zone.maxZ - zone.minZ) * TILE_UNIT;
      const centerX  = width3d / 2;
      const centerZ  = (zone.minZ + zone.maxZ) / 2 * TILE_UNIT;

      const geo = new THREE.PlaneGeometry(width3d, depth3d);
      geo.rotateX(-Math.PI / 2); // lie flat on the X-Z ground plane

      // Start with a solid fallback colour; replace with texture on load.
      const mat = new THREE.MeshBasicMaterial({ color: zone.color, side: THREE.FrontSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(centerX, 0, centerZ);
      this.scene.add(mesh);

      // Async texture load — swap material colour for the image when ready.
      loader.load(
        zone.texPath,
        (tex) => {
          // Flip the texture vertically — Three.js UV origin is bottom-left,
          // but our background images are oriented top-down like the game world.
          tex.flipY = false;
          mat.map   = tex;
          mat.color.setHex(0xffffff); // white tint lets the texture show true
          mat.needsUpdate = true;
        },
        undefined,
        (err) => {
          // Texture not found (asset pipeline not run) — fallback colour stays.
          console.log(`[ThreeScene] ${zone.key} texture not found, using colour fallback.`);
        }
      );
    }
  }

  // -------------------------------------------------------------------------
  // syncCamera(tileX, tileY, orbitAngle, pitchAngle, camDist)
  //   Called every Phaser update() tick before render().
  //   Positions the Three.js camera using a full spherical orbit rig:
  //
  //   orbitAngle (radians, horizontal):
  //     0       → camera due south of player, looking north
  //     +N      → camera orbits CCW (east → north → west → south)
  //
  //   pitchAngle (radians, vertical):
  //     PITCH_MIN  → near side-on view (low angle)
  //     PITCH_MAX  → near overhead view (high angle)
  //
  //   camDist: distance from player to camera in tile-units.
  // -------------------------------------------------------------------------
  syncCamera(tileX, tileY, orbitAngle = 0, pitchAngle, camDist) {
    if (!this._ready) return;

    const pitch = (pitchAngle !== undefined) ? pitchAngle : CAMERA.PITCH_DEFAULT;
    const dist  = (camDist    !== undefined) ? camDist    : CAMERA.DIST_DEFAULT;

    const tx = tileX * TILE_UNIT;
    const tz = tileY * TILE_UNIT;

    // Spherical orbit: decompose distance into horizontal and vertical components.
    const hDist = dist * Math.cos(pitch); // distance in the X-Z plane
    const vDist = dist * Math.sin(pitch); // height above the look-at target

    this.camera.position.set(
      tx - hDist * Math.sin(orbitAngle),
      vDist,
      tz + hDist * Math.cos(orbitAngle),
    );
    this.camera.lookAt(tx, 0, tz);
  }

  // -------------------------------------------------------------------------
  // Phase 2 — Player billboard
  // -------------------------------------------------------------------------

  // Initialize the player billboard sprite.  Non-blocking — returns a Promise.
  // Call once from GameScene.create() after threeScene.init().
  //
  // Uses player_male.png (single standing pose, already transparent from the
  // asset pipeline) rather than the movement sheet.  The movement sheet is a
  // design-reference document with baked-in label columns and grid lines, not
  // a clean atlas.  Animated directional frames come back in Phase 4 once a
  // proper atlas is available.
  createPlayerBillboard(gender = 'male') {
    const url = `/assets/sprites/player_${gender}.png`;
    return new Promise((resolve) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        (tex) => {
          // PNG already has a transparent background — no keying needed.
          const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.1 });
          const spr = new THREE.Sprite(mat);
          spr.scale.set(PLAYER_SPRITE_W, PLAYER_SPRITE_H, 1);
          this.scene.add(spr);
          this._playerBillboard = { spr, tex, animated: false };
          console.log('[ThreeScene] Player billboard ready (static pose).');
          resolve();
        },
        undefined,
        (e) => {
          console.warn('[ThreeScene] Player PNG failed, skipping billboard:', e);
          resolve(); // non-fatal
        },
      );
    });
  }

  // Update player billboard position and animation frame — call every tick.
  // worldX, worldZ: smooth float tile coords (playerContainer.x / TILE_SIZE).
  // dirRow: 0-7 (N, NE, E, SE, S, SW, W, NW).
  // animCol: 0-5 (walk frame column in the left half of the sprite sheet).
  updatePlayer(worldX, worldZ, dirRow, animCol) {
    if (!this._playerBillboard) return;
    const { spr, tex } = this._playerBillboard;

    // Feet at y=0, centre at y=PLAYER_SPRITE_H/2.
    spr.position.set(worldX, PLAYER_SPRITE_H / 2, worldZ);

    // UV sub-frame selection — only active when the billboard uses an animated
    // sprite atlas (this._playerBillboard.animated = true).  The static PNG
    // uses the full texture so no offset is needed.
    if (tex && this._playerBillboard.animated) {
      tex.offset.x = animCol / PLAYER_SHEET_COLS;
      tex.offset.y = (PLAYER_SHEET_ROWS - 1 - dirRow) / PLAYER_SHEET_ROWS;
    }
  }

  // Convert a world tile movement delta to a sprite sheet direction row,
  // accounting for the current Three.js camera orbit angle.
  //
  // Row mapping: 0=N  1=NE  2=E  3=SE  4=S  5=SW  6=W  7=NW
  // worldDx: +1=east, -1=west.  worldDy: +1=south, -1=north (tile-space, Y-down).
  // orbitAngle: same value passed to syncCamera().
  static dirRowFromMovement(worldDx, worldDy, orbitAngle) {
    if (worldDx === 0 && worldDy === 0) return 4; // idle → S (face camera at orbit=0)

    // Project the world movement vector into camera-relative axes so the sprite
    // direction reflects what the player looks like *from the camera*, not world-N.
    //   northComp > 0  →  moving away from camera  (= N in sprite)
    //   eastComp  > 0  →  moving to camera's right (= E in sprite)
    const northComp = worldDx * Math.sin(orbitAngle) - worldDy * Math.cos(orbitAngle);
    const eastComp  = worldDx * Math.cos(orbitAngle) + worldDy * Math.sin(orbitAngle);

    const angle = Math.atan2(eastComp, northComp); // from cam-north, CW
    return ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  }

  // -------------------------------------------------------------------------
  // Phase 4 — Dummy billboards (one per dummy instance, 36 total)
  // -------------------------------------------------------------------------

  // Load dummy.png once, create one THREE.Sprite per dummy instance.
  // dummies: array of objects with { tileX, tileY } (GameScene this.dummies).
  createDummyBillboards(dummies) {
    if (!this._ready) return Promise.resolve();
    return new Promise((resolve) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        '/assets/sprites/dummy.png',
        (tex) => {
          // One material per sprite so tint (color) can be set independently per dummy.
          // All materials share the same texture object (just a reference, not a copy).
          this._dummyBillboards = [];
          this._dummyTex = tex; // held for disposal in destroy()
          for (const d of dummies) {
            const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.1 });
            const spr = new THREE.Sprite(mat);
            spr.scale.set(DUMMY_SPRITE_W, DUMMY_SPRITE_H, 1);
            // Centre of tile: tileX + 0.5, feet at ground (y=0), centre at half-height.
            spr.position.set(d.tileX + 0.5, DUMMY_SPRITE_H / 2, d.tileY + 0.5);
            this.scene.add(spr);
            this._dummyBillboards.push(spr);
          }
          console.log(`[ThreeScene] ${this._dummyBillboards.length} dummy billboards ready.`);
          resolve();
        },
        undefined,
        (e) => {
          console.warn('[ThreeScene] dummy.png failed, skipping dummy billboards:', e);
          this._dummyBillboards = [];
          resolve();
        },
      );
    });
  }

  // Update a single dummy billboard each tick.
  // index: position in this._dummyBillboards (matches this.dummies[index]).
  // locked: true if the dummy is level-locked for this player.
  // dead: true if currentHp <= 0 (resetting).
  updateDummy(index, locked, dead) {
    if (!this._dummyBillboards || !this._dummyBillboards[index]) return;
    const spr = this._dummyBillboards[index];
    if (dead) {
      spr.visible = false;
    } else {
      spr.visible = true;
      // Locked dummies render dark grey; unlocked render at full colour.
      spr.material.color.setHex(locked ? 0x888888 : 0xffffff);
    }
  }

  // -------------------------------------------------------------------------
  // Phase 4 — Boss billboard (single instance)
  // -------------------------------------------------------------------------

  // Load boss.png and create a single THREE.Sprite at the boss centre tile.
  // tileX, tileY: boss centre tile coordinates (BOSS_CENTER_TILE in GameScene).
  createBossBillboard(tileX, tileY) {
    if (!this._ready) return Promise.resolve();

    // Guard against double-creation (e.g. scene restart without full destroy).
    if (this._bossBillboard) {
      console.warn('[ThreeScene] createBossBillboard called but billboard already exists — skipping duplicate.');
      return Promise.resolve();
    }

    const url = '/assets/sprites/boss.png';
    console.log('[ThreeScene] createBossBillboard — loading texture from:', url,
      '| tileX:', tileX, 'tileY:', tileY);

    return new Promise((resolve) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        (tex) => {
          const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.1 });
          const spr = new THREE.Sprite(mat);
          spr.scale.set(BOSS_SPRITE_W, BOSS_SPRITE_H, 1);
          spr.position.set(tileX + 0.5, BOSS_SPRITE_H / 2, tileY + 0.5);
          this.scene.add(spr);
          this._bossBillboard = { spr };
          console.log('[ThreeScene] Boss billboard ready — position:',
            spr.position.x.toFixed(2), spr.position.y.toFixed(2), spr.position.z.toFixed(2),
            '| scale:', spr.scale.x, 'x', spr.scale.y,
            '| texture image:', tex.image ? tex.image.src : '(no image src)');
          resolve();
        },
        undefined,
        (e) => {
          console.warn('[ThreeScene] boss.png FAILED to load — billboard skipped. Error:', e);
          resolve();
        },
      );
    });
  }

  // Update boss billboard each tick.
  // alive: bossSystem.state === 'ALIVE'.
  // aoeWarning: true during the 2-tick AOE telegraph window.
  updateBoss(alive, aoeWarning) {
    if (!this._bossBillboard) return;
    const { spr } = this._bossBillboard;
    spr.visible = alive;
    if (alive) {
      spr.material.color.setHex(aoeWarning ? 0xff4444 : 0xffffff);
    }
  }

  // -------------------------------------------------------------------------
  // Phase 5 — Raycaster click-to-move bridge
  // -------------------------------------------------------------------------

  // Convert a screen click (in Phaser's logical pixel space) to a tile coordinate
  // by casting a ray from the Three.js camera through the clicked NDC point and
  // intersecting it with the world ground plane (y = 0).
  //
  // screenX, screenY: pointer.x / pointer.y from Phaser (0..logicalW, 0..logicalH).
  // Returns { tileX, tileZ } where tileX = column and tileZ = row (the value that
  // GameScene passes as its second "tileY" argument to moveTo / pathfinding).
  // Returns null if the ray is parallel to the ground (only happens at pitch ≈ 0).
  getGroundPositionFromScreen(screenX, screenY) {
    if (!this._ready) return null;

    // NDC: x in [-1, +1] left→right; y in [-1, +1] bottom→top.
    // Phaser's pointer.y is 0 at the top, so Y is flipped.
    const ndcX =  (screenX / this._logicalW) * 2 - 1;
    const ndcY = -(screenY / this._logicalH) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    // Infinite ground plane at y = 0, normal pointing up.
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const worldPos    = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(groundPlane, worldPos);
    if (!hit) return null; // ray parallel to ground — degenerate camera angle

    // TILE_UNIT = 1: Three.js world units == tile units.
    // X axis → east → tileX (column); Z axis → south → tileZ (= game's tileY row).
    return {
      tileX: Math.floor(worldPos.x / TILE_UNIT),
      tileZ: Math.floor(worldPos.z / TILE_UNIT),
    };
  }

  // Boss AOE warning ring — a THREE.RingGeometry lying flat on the ground plane
  // (rotated -90° around X so it faces up). Created/destroyed from GameScene.js
  // socket event handlers. The ring pulses via render() each frame.
  showAoeWarning(bossTileX, bossTileZ, radiusTiles) {
    if (this._aoeRing) return;
    const inner = radiusTiles - 0.25;
    const outer = radiusTiles + 0.25;
    const geo = new THREE.RingGeometry(inner * TILE_UNIT, outer * TILE_UNIT, 64);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff2222, transparent: true, opacity: 0.7, side: THREE.DoubleSide,
    });
    this._aoeRing = new THREE.Mesh(geo, mat);
    this._aoeRing.rotation.x = -Math.PI / 2; // XY plane → XZ ground plane
    this._aoeRing.position.set(bossTileX * TILE_UNIT, 0.04, bossTileZ * TILE_UNIT);
    this.scene.add(this._aoeRing);
  }

  hideAoeWarning() {
    if (!this._aoeRing) return;
    this.scene.remove(this._aoeRing);
    this._aoeRing.geometry.dispose();
    this._aoeRing.material.dispose();
    this._aoeRing = null;
  }

  // Debug marker: a thin red box placed at the center of the clicked tile for
  // 1 second, to verify raycaster accuracy. Activated via window.DEBUG_TILES.
  placeDebugMarker(tileX, tileZ) {
    if (this._debugMarker) {
      clearTimeout(this._debugMarkerTimer);
      this.scene.remove(this._debugMarker);
      this._debugMarker.geometry.dispose();
      this._debugMarker.material.dispose();
      this._debugMarker = null;
    }
    const geo = new THREE.BoxGeometry(0.25, 1.5, 0.25);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((tileX + 0.5) * TILE_UNIT, 0.75, (tileZ + 0.5) * TILE_UNIT);
    this.scene.add(mesh);
    this._debugMarker = mesh;
    this._debugMarkerTimer = setTimeout(() => {
      if (this._debugMarker === mesh) {
        this.scene.remove(mesh);
        geo.dispose();
        mat.dispose();
        this._debugMarker = null;
      }
    }, 1000);
  }

  // Phase 6: remote player billboards — one THREE.Sprite per connected peer.
  // Same scale as the local player billboard (PLAYER_SPRITE_W × PLAYER_SPRITE_H) so
  // both appear identical in the 3D view regardless of camera zoom/pitch.

  addOtherPlayerBillboard(walletAddress, gender) {
    if (!this._ready) return;
    if (!this._otherPlayerBillboards) this._otherPlayerBillboards = new Map();
    if (this._otherPlayerBillboards.has(walletAddress)) return; // idempotent

    const url = `/assets/sprites/player_${gender === 'female' ? 'female' : 'male'}.png`;
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (tex) => {
        if (!this._otherPlayerBillboards) return; // scene destroyed during async load
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.1 });
        const spr = new THREE.Sprite(mat);
        spr.scale.set(PLAYER_SPRITE_W, PLAYER_SPRITE_H, 1);
        spr.visible = false; // hidden until first updateOtherPlayerBillboard()
        this.scene.add(spr);
        this._otherPlayerBillboards.set(walletAddress, { spr, tex });
      },
      undefined,
      () => { /* PNG missing — peer renders without Three.js billboard */ },
    );
  }

  removeOtherPlayerBillboard(walletAddress) {
    if (!this._otherPlayerBillboards) return;
    const entry = this._otherPlayerBillboards.get(walletAddress);
    if (!entry) return;
    this.scene.remove(entry.spr);
    entry.spr.material.dispose();
    entry.tex.dispose();
    this._otherPlayerBillboards.delete(walletAddress);
  }

  updateOtherPlayerBillboard(walletAddress, worldX, worldZ) {
    if (!this._otherPlayerBillboards) return;
    const entry = this._otherPlayerBillboards.get(walletAddress);
    if (!entry) return;
    entry.spr.position.set(worldX, PLAYER_SPRITE_H / 2, worldZ);
    entry.spr.visible = true;
  }

  // Phase 6: project a 3D world position to Phaser screen coordinates.
  //   worldX / worldZ — tile units (same coordinate space as getGroundPositionFromScreen)
  //   heightOffset    — y in Three.js world units (0 = ground)
  //   Returns { x, y } in screen pixels (0,0 = top-left), or null if behind camera.
  getScreenPosition(worldX, worldZ, heightOffset = 0) {
    if (!this._ready) return null;
    const vec = new THREE.Vector3(worldX * TILE_UNIT, heightOffset, worldZ * TILE_UNIT);
    vec.project(this.camera);
    if (vec.z > 1) return null; // behind far plane
    return {
      x: (vec.x  + 1) / 2 * this._logicalW,
      y: (-vec.y + 1) / 2 * this._logicalH,
    };
  }

  // -------------------------------------------------------------------------
  // render()  — called every Phaser update tick, after syncCamera()
  // -------------------------------------------------------------------------
  render() {
    if (!this._ready) return;
    if (this._aoeRing) {
      // 480ms pulse period matches the original Phaser tween cadence
      this._aoeRing.material.opacity = 0.25 + 0.5 * Math.abs(Math.sin(Date.now() / 480 * Math.PI));
    }
    this.renderer.render(this.scene, this.camera);
  }

  // -------------------------------------------------------------------------
  // destroy()  — called on GameScene shutdown
  // -------------------------------------------------------------------------
  destroy() {
    if (!this._ready) return;
    if (this._playerBillboard) {
      this._playerBillboard.tex.dispose();
      this._playerBillboard.spr.material.dispose();
      this._playerBillboard = null;
    }
    if (this._dummyBillboards) {
      for (const spr of this._dummyBillboards) spr.material.dispose();
      if (this._dummyTex) { this._dummyTex.dispose(); this._dummyTex = null; }
      this._dummyBillboards = null;
    }
    if (this._bossBillboard) {
      this._bossBillboard.spr.material.map && this._bossBillboard.spr.material.map.dispose();
      this._bossBillboard.spr.material.dispose();
      this._bossBillboard = null;
    }
    if (this._otherPlayerBillboards) {
      for (const { spr, tex } of this._otherPlayerBillboards.values()) {
        this.scene.remove(spr);
        spr.material.dispose();
        tex.dispose();
      }
      this._otherPlayerBillboards.clear();
      this._otherPlayerBillboards = null;
    }
    this.hideAoeWarning();
    if (this._debugMarker) {
      clearTimeout(this._debugMarkerTimer);
      this.scene.remove(this._debugMarker);
      this._debugMarker.geometry.dispose();
      this._debugMarker.material.dispose();
      this._debugMarker = null;
    }
    this.renderer.dispose();
    this._canvas.remove();
    this._ready = false;
  }
}

const threeScene = new ThreeScene();
