// ChatLog.js — collapsible chat panel, bottom-left (CLAUDE.md Section 18).
// Local single-player: only the local player's messages appear (no network).
// System messages (boss defeated/respawned, loot) arrive via the same
// addMessage path. Sending a message also floats it above the player sprite.

const CHAT_LOG = {
  WIDTH: 360,
  HEIGHT: 178,
  TITLE_H: 22,
  INPUT_H: 28,
  MAX_MESSAGES: 100,   // trim oldest beyond this (Section 18)
  VISIBLE_LINES: 6,
};

class ChatLog {
  constructor(scene) {
    this.scene = scene;
    this.messages = [];
    this.collapsed = false;

    const x = 12;
    const y = 720 - CHAT_LOG.HEIGHT - 12;
    this.originX = x;
    this.originY = y;

    // Title bar with collapse toggle
    this.titleBar = scene.add.rectangle(x, y, CHAT_LOG.WIDTH, CHAT_LOG.TITLE_H, 0x111111, 0.92)
      .setOrigin(0, 0).setStrokeStyle(1, 0x555555).setDepth(800)
      .setInteractive({ useHandCursor: true });
    this.titleText = scene.add.text(x + 8, y + 4, 'Chat ▼', {
      fontFamily: 'monospace', fontSize: '12px', color: '#cccccc', fontStyle: 'bold',
    }).setDepth(801);

    this.titleBar.on('pointerdown', (pointer, localX, localY, event) => {
      event.stopPropagation();
      this.toggle();
    });

    // Message area
    this.bodyY = y + CHAT_LOG.TITLE_H;
    this.bodyH = CHAT_LOG.HEIGHT - CHAT_LOG.TITLE_H - CHAT_LOG.INPUT_H;
    this.bg = scene.add.rectangle(x, this.bodyY, CHAT_LOG.WIDTH, this.bodyH, 0x000000, 0.55)
      .setOrigin(0, 0).setStrokeStyle(1, 0x444444).setDepth(800);
    this.text = scene.add.text(x + 8, this.bodyY + 6, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#dddddd',
      lineSpacing: 4, wordWrap: { width: CHAT_LOG.WIDTH - 16 },
    }).setDepth(801);

    this.buildInput();
    this.render();
  }

  buildInput() {
    const inputY = this.originY + CHAT_LOG.HEIGHT - CHAT_LOG.INPUT_H;
    this.inputBg = this.scene.add.rectangle(
      this.originX, inputY, CHAT_LOG.WIDTH, CHAT_LOG.INPUT_H, 0x1a1a1a, 0.95,
    ).setOrigin(0, 0).setStrokeStyle(1, 0x444444).setDepth(800);

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 100;
    input.placeholder = 'Press Enter to chat';
    input.style.cssText = [
      `width: ${CHAT_LOG.WIDTH - 16}px`, 'height: 20px',
      'background: transparent', 'color: #ffffff',
      'border: none', 'padding: 0 8px',
      'font-family: monospace', 'font-size: 12px', 'outline: none',
    ].join(';');

    this.inputEl = input;
    this.domInput = this.scene.add.dom(
      this.originX, inputY + CHAT_LOG.INPUT_H / 2, input,
    ).setOrigin(0, 0.5).setDepth(801);

    // Suppress game hotkeys (F/arrows) while typing in chat
    input.addEventListener('focus', () => this.scene.game.events.emit('typing', true));
    input.addEventListener('blur', () => this.scene.game.events.emit('typing', false));
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.send();
    });
  }

  send() {
    const raw = (this.inputEl.value || '').trim();
    this.inputEl.value = '';
    if (!raw) return;

    // Client-side pre-check for instant feedback (the server also masks).
    if (containsProfanity(raw)) {
      this.addMessage('[System]: message blocked (please watch your language)');
      return;
    }

    // Authoritative log display comes from the server echo (chat_message) for
    // everyone, including us — so don't add to the log locally here. If the
    // network is unavailable (single-player), echo locally as a fallback.
    if (typeof network !== 'undefined' && network.socket) {
      network.sendChat(raw);
    } else {
      const name = this.scene.registry.get('player').display_name;
      this.addMessage(`[${name}]: ${raw}`);
    }
    // The local speech bubble is immediate (our own avatar speaking)
    this.scene.game.events.emit('chat-bubble', { text: raw });
  }

  addMessage(message) {
    this.messages.push(message);
    if (this.messages.length > CHAT_LOG.MAX_MESSAGES) {
      this.messages.shift(); // trim oldest
    }
    this.render();
  }

  render() {
    const visible = this.messages.slice(-CHAT_LOG.VISIBLE_LINES);
    this.text.setText(visible.join('\n'));
  }

  toggle() {
    this.collapsed = !this.collapsed;
    this.titleText.setText(this.collapsed ? 'Chat ▲' : 'Chat ▼');
    this.bg.setVisible(!this.collapsed);
    this.text.setVisible(!this.collapsed);
    this.inputBg.setVisible(!this.collapsed);
    this.domInput.setVisible(!this.collapsed);
  }
}
