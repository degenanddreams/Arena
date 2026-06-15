// BossSystem.js — client-side VISUAL state for The Minotaur.
// Phase 2: the SERVER owns all boss timing (AOE cycle, damage, death, respawn)
// and drives this via socket events. This class no longer runs any AOE timer —
// it only tracks HP for the bar, sprite visibility, the warning ring visual,
// and the respawn countdown text. GameScene calls update(delta) each frame and
// the ring/death/respawn methods from server-event handlers.

class BossSystem {
  constructor(scene) {
    this.scene = scene;
    this.state = 'ALIVE';            // 'ALIVE' | 'DEAD'
    this.currentHp = BOSS.maxHp;
    this.maxHp = BOSS.maxHp;
    this.respawnTimer = 0;
    this.respawnDuration = BOSS.respawn_seconds * 1000;

    this.warningRing = null;
    this.warningPulse = null;
    this.respawnText = null;
  }

  // --- Frame update: only the local respawn-countdown display (visual). The
  // server decides the actual respawn moment via the boss_respawned event. ---
  update(delta) {
    if (this.state === 'DEAD') {
      this.respawnTimer = Math.max(0, this.respawnTimer - delta);
      this.updateRespawnText();
    }
  }

  // --- AOE warning ring (created/destroyed from server boss_aoe_* events) ---

  createWarningRing() {
    if (this.warningRing) return;
    const radius = BOSS.aoe_radius_tiles * WORLD.TILE_SIZE; // 5 tiles
    const { x, y } = this.scene.bossCenterPx;

    this.warningRing = this.scene.add.circle(x, y, radius, 0xff0000, 0.20)
      .setStrokeStyle(3, 0xff2222)
      .setDepth(1); // on the ground, beneath sprites

    this.warningPulse = this.scene.tweens.add({
      targets: this.warningRing,
      alpha: { from: 0.12, to: 0.5 },
      duration: 480,
      yoyo: true,
      repeat: -1,
    });
  }

  destroyWarningRing() {
    if (this.warningPulse) {
      this.warningPulse.stop();
      this.warningPulse = null;
    }
    if (this.warningRing) {
      this.warningRing.destroy();
      this.warningRing = null;
    }
  }

  // --- Death / respawn (visual only — triggered by server events) ---

  enterDeadState() {
    this.state = 'DEAD';
    this.currentHp = 0;
    this.respawnTimer = this.respawnDuration;
    this.destroyWarningRing();
    this.scene.bossContainer.setVisible(false);
    this.showRespawnText();
  }

  respawnVisual() {
    this.currentHp = this.maxHp;
    this.state = 'ALIVE';
    this.hideRespawnText();
    this.scene.bossContainer.setVisible(true);
    this.scene.updateBossHpBar();
  }

  // --- Respawn countdown text (world-space, at the boss's position) ---

  showRespawnText() {
    const { x, y } = this.scene.bossCenterPx;
    if (!this.respawnText) {
      this.respawnText = this.scene.add.text(x, y, '', {
        fontFamily: 'monospace', fontSize: '14px', color: '#ffd700', fontStyle: 'bold',
        align: 'center', stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(6);
    }
    this.respawnText.setVisible(true);
    this.updateRespawnText();
  }

  updateRespawnText() {
    if (!this.respawnText) return;
    const totalSeconds = Math.max(0, Math.ceil(this.respawnTimer / 1000));
    const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const ss = String(totalSeconds % 60).padStart(2, '0');
    this.respawnText.setText(`${BOSS.name}\nrespawns in: ${mm}:${ss}`);
  }

  hideRespawnText() {
    if (this.respawnText) this.respawnText.setVisible(false);
  }
}
