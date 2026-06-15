// CombatStylePanel.js — combat style selector panel (COMBAT button in the HUD).
// Radio-button behaviour: exactly one of Attack / Strength / Defense / Balanced
// is active. Selection saves immediately to player.activeTrainingStyle (in
// memory) and is read by the dummy attack loop on each kill.

const COMBAT_PANEL = {
  WIDTH: 330,
  HEIGHT: 248,
  BUTTON_HEIGHT: 34,
  SELECTED_FILL: 0xb8860b,    // orange/gold highlight
  SELECTED_BORDER: 0xffd700,
  IDLE_FILL: 0x2a2a2a,
  IDLE_BORDER: 0x555555,
};

const COMBAT_STYLE_DESCRIPTIONS = {
  attack: 'Trains Attack',
  strength: 'Trains Strength',
  defense: 'Trains Defense',
  balanced: 'Trains all three equally',
};

class CombatStylePanel {
  constructor(scene) {
    this.scene = scene;
    this.container = null;
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

    const { WIDTH, HEIGHT, BUTTON_HEIGHT } = COMBAT_PANEL;
    const x = 1280 - WIDTH - 16;
    const y = 720 - HEIGHT - 60; // sits above the panel buttons

    const bg = this.scene.add.rectangle(0, 0, WIDTH, HEIGHT, 0x1e1e1e, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x555555)
      .setInteractive(); // swallow clicks so they don't reach the world
    bg.on('pointerdown', (pointer, localX, localY, event) => event.stopPropagation());

    const title = this.scene.add.text(WIDTH / 2, 12, 'Combat Style', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    this.weaponText = this.scene.add.text(WIDTH / 2, 36, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#aaaaaa',
    }).setOrigin(0.5, 0);

    this.container = this.scene.add.container(x, y, [bg, title, this.weaponText])
      .setDepth(900);
    this.styleButtons = {};

    ['attack', 'strength', 'defense', 'balanced'].forEach((style, i) => {
      this.buildStyleButton(style, 60 + i * (BUTTON_HEIGHT + 8));
    });

    this.refresh();
  }

  buildStyleButton(style, y) {
    const { WIDTH, BUTTON_HEIGHT } = COMBAT_PANEL;
    const label = style.charAt(0).toUpperCase() + style.slice(1);

    const bg = this.scene.add.rectangle(14, y, WIDTH - 28, BUTTON_HEIGHT, COMBAT_PANEL.IDLE_FILL)
      .setOrigin(0, 0)
      .setStrokeStyle(1, COMBAT_PANEL.IDLE_BORDER)
      .setInteractive({ useHandCursor: true });

    const name = this.scene.add.text(26, y + 9, label, {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
    });
    const desc = this.scene.add.text(WIDTH - 26, y + 11, COMBAT_STYLE_DESCRIPTIONS[style], {
      fontFamily: 'monospace', fontSize: '10px', color: '#bbbbbb',
    }).setOrigin(1, 0);

    // Saves immediately on click — no confirm button
    bg.on('pointerdown', (pointer, localX, localY, event) => {
      event.stopPropagation();
      this.select(style);
    });

    this.container.add([bg, name, desc]);
    this.styleButtons[style] = bg;
  }

  select(style) {
    const player = this.scene.registry.get('player');
    player.activeTrainingStyle = style;
    this.scene.registry.set('player', { ...player });
    this.scene.game.events.emit('style-changed', style);
    this.refresh();
  }

  refresh() {
    if (!this.isOpen) return;

    const player = this.scene.registry.get('player');
    const equipped = this.scene.registry.get('equipped') || {};
    const weapon = equipped.weapon_id ? ITEMS[equipped.weapon_id] : null;
    this.weaponText.setText(`Weapon: ${weapon ? weapon.name : 'Unarmed'}`);

    const active = player.activeTrainingStyle || 'strength';
    for (const [style, bg] of Object.entries(this.styleButtons)) {
      if (style === active) {
        bg.setFillStyle(COMBAT_PANEL.SELECTED_FILL)
          .setStrokeStyle(2, COMBAT_PANEL.SELECTED_BORDER);
      } else {
        bg.setFillStyle(COMBAT_PANEL.IDLE_FILL)
          .setStrokeStyle(1, COMBAT_PANEL.IDLE_BORDER);
      }
    }
  }

  close() {
    if (!this.isOpen) return;
    this.container.destroy();
    this.container = null;
    this.styleButtons = null;
    this.weaponText = null;
  }
}
