// PlayerInfoPanel.js — Player Info panel per CLAUDE.md Section 16:
// editable display name (saves on Enter or focus-out), wallet address,
// fight record, current server. Uses a Phaser DOM element for the input.

const INFO_PANEL = {
  WIDTH: 330,
  HEIGHT: 220,
};

class PlayerInfoPanel {
  constructor(scene) {
    this.scene = scene;
    this.container = null;
    this.domInput = null;
  }

  get isOpen() {
    return this.container !== null;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    if (this.isOpen) {
      this.refresh();
      return;
    }

    const player = this.scene.registry.get('player');
    const { WIDTH, HEIGHT } = INFO_PANEL;
    const x = 1280 - WIDTH - 16;
    const y = 720 - HEIGHT - 60;

    const bg = this.scene.add.rectangle(0, 0, WIDTH, HEIGHT, 0x1e1e1e, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x555555)
      .setInteractive();
    bg.on('pointerdown', (pointer, localX, localY, event) => event.stopPropagation());

    const title = this.scene.add.text(WIDTH / 2, 12, 'Player Info', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    const nameLabel = this.scene.add.text(16, 48, 'Display name:', {
      fontFamily: 'monospace', fontSize: '12px', color: '#aaaaaa',
    });

    this.infoText = this.scene.add.text(16, 110, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#dddddd', lineSpacing: 10,
    });

    this.container = this.scene.add.container(x, y, [bg, title, nameLabel, this.infoText])
      .setDepth(900);

    this.createNameInput(x, y, player.display_name);
    this.refresh();
  }

  createNameInput(panelX, panelY, currentName) {
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 20;
    input.value = currentName;
    input.style.cssText = [
      'width: 280px', 'height: 24px',
      'background: #111111', 'color: #ffffff',
      'border: 1px solid #666666', 'padding: 2px 8px',
      'font-family: monospace', 'font-size: 13px', 'outline: none',
    ].join(';');

    // DOM elements use centre origin at absolute screen coords
    this.domInput = this.scene.add.dom(panelX + 165, panelY + 82, input).setDepth(950);

    // Pause game hotkeys (F to eat, arrows to rotate) while typing
    input.addEventListener('focus', () => this.scene.game.events.emit('typing', true));
    input.addEventListener('blur', () => {
      this.scene.game.events.emit('typing', false);
      this.save(input.value);
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') input.blur(); // blur triggers the save
    });
  }

  save(value) {
    const player = this.scene.registry.get('player');
    const trimmed = (value || '').trim();
    if (!trimmed || trimmed === player.display_name) return;
    this.scene.saveDisplayName(trimmed);
  }

  refresh() {
    if (!this.isOpen) return;
    const player = this.scene.registry.get('player');

    this.infoText.setText([
      `Wallet:  ${player.wallet_address}`,
      `Record:  Wins: ${player.wins} | Losses: ${player.losses}`,
      'Server:  Local Build',
    ].join('\n'));

    if (this.domInput && document.activeElement !== this.domInput.node) {
      this.domInput.node.value = player.display_name;
    }
  }

  close() {
    if (!this.isOpen) return;
    this.scene.game.events.emit('typing', false);
    if (this.domInput) {
      this.domInput.destroy();
      this.domInput = null;
    }
    this.container.destroy();
    this.container = null;
    this.infoText = null;
  }
}
