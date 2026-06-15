// BootScene.js — checks for the player record (wallet mocked as
// test_wallet_001). If a record exists, load it and enter GameScene. If none
// exists (404), show CharacterCreateScene first; it restarts BootScene on
// confirm, at which point the record is found and the game starts.

const TEST_WALLET = 'test_wallet_001';

class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    const loading = this.add.text(640, 360, 'Loading Arena...', {
      fontFamily: 'monospace', fontSize: '24px', color: '#ffffff',
    }).setOrigin(0.5);

    this.checkPlayer()
      .then((data) => {
        if (!data) {
          // No record yet — go to character creation
          this.scene.start('CharacterCreateScene');
          return;
        }
        // Preserve an already-chosen combat style across a boot re-entry;
        // otherwise default to Strength. Lives in memory, never stored.
        const existing = this.registry.get('player');
        data.player.activeTrainingStyle =
          (existing && existing.activeTrainingStyle) || 'strength';

        this.registry.set('player', data.player);
        this.registry.set('levels', data.level);
        this.registry.set('inventory', data.inventory);
        this.registry.set('bank', data.bank);
        this.registry.set('equipped', data.equipped);
        this.scene.start('GameScene');
      })
      .catch((err) => {
        loading.setText(`Failed to load player:\n${err.message}\nIs the server running?`);
        loading.setColor('#ff6666');
      });
  }

  // Returns the full player payload, or null if no record exists yet.
  async checkPlayer() {
    const res = await fetch(`/api/player/${TEST_WALLET}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`fetch failed (${res.status})`);
    return res.json();
  }
}
