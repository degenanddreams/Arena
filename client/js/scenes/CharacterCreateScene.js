// CharacterCreateScene.js — character customisation (CLAUDE.md Section 14).
// Shown only when no player record exists. On confirm it POSTs /player/create
// and restarts BootScene, which then finds the record and enters the game.

// Option definitions: { value (stored), label (shown) }
const CC_OPTIONS = {
  gender: [
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
  ],
  hair_color: [
    { value: 'blonde', label: 'Blonde' },
    { value: 'brunette', label: 'Brunette' },
    { value: 'black', label: 'Black' },
    { value: 'white', label: 'White' },
  ],
  skin_tone: [
    { value: 'light', label: 'Light' },
    { value: 'tan', label: 'Tan' },
    { value: 'dark_tan', label: 'Dark Tan' },
    { value: 'deep', label: 'Deep' },
  ],
  clothing_color: [
    { value: 'green', label: 'Green' },
    { value: 'brown', label: 'Brown' },
    { value: 'blue', label: 'Blue' },
    { value: 'red', label: 'Red' },
  ],
};

// Preview colours
const CC_CLOTHING_COLORS = { green: 0x3a9d3a, brown: 0x8b5a2b, blue: 0x3a6fd8, red: 0xc0392b };
const CC_SKIN_COLORS = { light: 0xf1c27d, tan: 0xc68642, dark_tan: 0x8d5524, deep: 0x5a3410 };
const CC_HAIR_COLORS = { blonde: 0xe6c200, brunette: 0x5b3a1a, black: 0x1a1a1a, white: 0xeeeeee };

const CC_SELECTED_FILL = 0xb8860b;
const CC_SELECTED_BORDER = 0xffd700;
const CC_IDLE_FILL = 0x2a2a2a;
const CC_IDLE_BORDER = 0x555555;

class CharacterCreateScene extends Phaser.Scene {
  constructor() {
    super('CharacterCreateScene');
  }

  create() {
    this.cameras.main.setBackgroundColor('#141414');

    this.selection = {
      gender: 'male',
      hair_color: 'brunette',
      skin_tone: 'tan',
      clothing_color: 'green',
    };
    this.optionButtons = {}; // category -> [{ value, bg, label }]

    this.add.text(640, 36, 'Create Your Character', {
      fontFamily: 'monospace', fontSize: '32px', color: '#ffd700', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5, 0);

    this.buildPreview();
    this.buildOptionRows();
    this.buildNameInput();
    this.buildConfirmButton();

    this.refreshPreview();
    this.refreshConfirmState();
  }

  // --- Live preview (left side) ---

  buildPreview() {
    const px = 300;
    const py = 320;
    this.add.rectangle(px, py, 200, 280, 0x000000, 0.35).setStrokeStyle(1, 0x444444);

    // Simple stacked-rectangle avatar: hair, head (skin), body (clothing)
    this.previewBody = this.add.rectangle(px, py + 40, 90, 120, CC_CLOTHING_COLORS.green)
      .setStrokeStyle(2, 0x111111);
    this.previewHead = this.add.rectangle(px, py - 50, 60, 60, CC_SKIN_COLORS.tan)
      .setStrokeStyle(2, 0x111111);
    this.previewHair = this.add.rectangle(px, py - 74, 64, 22, CC_HAIR_COLORS.brunette)
      .setStrokeStyle(2, 0x111111);
    this.previewGender = this.add.text(px, py + 120, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#cccccc',
    }).setOrigin(0.5, 0);
  }

  refreshPreview() {
    this.previewBody.setFillStyle(CC_CLOTHING_COLORS[this.selection.clothing_color]);
    this.previewHead.setFillStyle(CC_SKIN_COLORS[this.selection.skin_tone]);
    this.previewHair.setFillStyle(CC_HAIR_COLORS[this.selection.hair_color]);
    // Female avatar reads as slightly narrower body
    this.previewBody.width = this.selection.gender === 'female' ? 72 : 90;
    this.previewGender.setText(this.selection.gender === 'female' ? 'Female' : 'Male');
  }

  // --- Option rows (right side) ---

  buildOptionRows() {
    const rows = [
      { key: 'gender', label: 'Gender' },
      { key: 'hair_color', label: 'Hair' },
      { key: 'skin_tone', label: 'Skin' },
      { key: 'clothing_color', label: 'Clothing' },
    ];
    const startX = 470;
    const startY = 150;
    const rowGap = 78;

    rows.forEach((row, i) => {
      const rowY = startY + i * rowGap;
      this.add.text(startX, rowY - 22, row.label, {
        fontFamily: 'monospace', fontSize: '14px', color: '#aaaaaa', fontStyle: 'bold',
      });

      this.optionButtons[row.key] = [];
      CC_OPTIONS[row.key].forEach((opt, j) => {
        const bx = startX + j * 180;
        const bg = this.add.rectangle(bx, rowY, 168, 38, CC_IDLE_FILL)
          .setOrigin(0, 0).setStrokeStyle(1, CC_IDLE_BORDER)
          .setInteractive({ useHandCursor: true });
        const label = this.add.text(bx + 84, rowY + 19, opt.label, {
          fontFamily: 'monospace', fontSize: '14px', color: '#ffffff',
        }).setOrigin(0.5);

        bg.on('pointerdown', () => {
          this.selection[row.key] = opt.value;
          this.refreshOptionRow(row.key);
          this.refreshPreview();
        });

        this.optionButtons[row.key].push({ value: opt.value, bg });
      });

      this.refreshOptionRow(row.key);
    });
  }

  refreshOptionRow(key) {
    for (const btn of this.optionButtons[key]) {
      const selected = btn.value === this.selection[key];
      btn.bg.setFillStyle(selected ? CC_SELECTED_FILL : CC_IDLE_FILL)
        .setStrokeStyle(selected ? 2 : 1, selected ? CC_SELECTED_BORDER : CC_IDLE_BORDER);
    }
  }

  // --- Name input (DOM) ---

  buildNameInput() {
    this.add.text(470, 478, 'Display name (3-20 characters):', {
      fontFamily: 'monospace', fontSize: '14px', color: '#aaaaaa',
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 20;
    input.placeholder = 'Enter a name';
    input.style.cssText = [
      'width: 320px', 'height: 28px',
      'background: #111111', 'color: #ffffff',
      'border: 1px solid #666666', 'padding: 2px 8px',
      'font-family: monospace', 'font-size: 15px', 'outline: none',
    ].join(';');

    this.nameInput = input;
    this.add.dom(640, 520, input).setOrigin(0, 0.5);

    input.addEventListener('input', () => this.refreshConfirmState());
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && this.isNameValid()) this.confirm();
    });
    // Autofocus once the DOM node is live
    this.time.delayedCall(50, () => input.focus());
  }

  // --- Validation + confirm ---

  isNameValid() {
    const name = (this.nameInput.value || '').trim();
    if (name.length < 3 || name.length > 20) return false;
    if (containsProfanity(name)) return false;
    return true;
  }

  buildConfirmButton() {
    this.confirmBg = this.add.rectangle(640, 600, 240, 48, 0x2e7d32)
      .setStrokeStyle(2, 0x66bb6a).setInteractive({ useHandCursor: true });
    this.confirmLabel = this.add.text(640, 600, 'Confirm', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.confirmBg.on('pointerdown', () => {
      if (this.isNameValid()) this.confirm();
    });

    this.feedback = this.add.text(640, 640, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ff6666',
    }).setOrigin(0.5, 0);
  }

  refreshConfirmState() {
    const name = (this.nameInput.value || '').trim();
    const valid = this.isNameValid();

    this.confirmBg.setFillStyle(valid ? 0x2e7d32 : 0x333333)
      .setStrokeStyle(2, valid ? 0x66bb6a : 0x555555);
    this.confirmLabel.setColor(valid ? '#ffffff' : '#777777');

    // Inline feedback only once the player has started typing
    if (name.length === 0) {
      this.feedback.setText('');
    } else if (name.length < 3) {
      this.feedback.setText('Name must be at least 3 characters');
    } else if (containsProfanity(name)) {
      this.feedback.setText('Please choose a different name');
    } else {
      this.feedback.setText('');
    }
  }

  async confirm() {
    this.feedback.setColor('#ff6666');
    const name = this.nameInput.value.trim();

    try {
      const res = await fetch('/api/player/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: TEST_WALLET,
          display_name: name,
          gender: this.selection.gender,
          hair_color: this.selection.hair_color,
          skin_tone: this.selection.skin_tone,
          clothing_color: this.selection.clothing_color,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        const message = data.reason === 'profanity'
          ? 'Please choose a different name'
          : data.reason === 'invalid_name_length'
            ? 'Name must be 3-20 characters'
            : data.reason === 'player_exists'
              ? 'A character already exists'
              : 'Could not create character';
        this.feedback.setText(message);
        return;
      }

      // Remove the DOM input before leaving the scene, then let BootScene
      // load the freshly created record and start the game.
      this.scene.start('BootScene');
    } catch (err) {
      console.error('Character creation failed:', err);
      this.feedback.setText('Server error — is the server running?');
    }
  }
}
