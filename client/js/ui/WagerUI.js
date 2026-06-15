// WagerUI.js — all screen-space wager UI (Phase 3, CLAUDE.md Section 32.8):
// the challenge-creation panel, incoming-challenge modal, challenger
// confirmation modal, the live fight-replay overlay, and the result screen.
// Driven by UIScene via game events; emits intentions through the `network`
// singleton. No food, no live input — the fight is a streamed simulation.

const WAGER_MIN = { USDC: 1, SOL: 0.01 };
const WAGER_MAX = { USDC: 5000, SOL: 1000000 };
const WAGER_STEP = { USDC: 1, SOL: 0.01 };

class WagerUI {
  constructor(scene) {
    this.scene = scene;
    this.challengePanel = null;
    this.modal = null;          // incoming / accepted modal
    this.fightOverlay = null;
    this.resultOverlay = null;

    this.outgoing = null;       // { amount, currency, targetName } for a sent challenge
    this.opponent = null;       // { wallet, name } for the active/pending fight
    this.fight = null;          // live fight state during replay
  }

  myName() {
    const p = this.scene.registry.get('player');
    return (p && p.display_name) || 'You';
  }

  fmt(amount, currency) {
    return currency === 'SOL' ? `${Number(amount).toFixed(2)} SOL` : `$${Math.round(amount)} USDC`;
  }

  destroyAll() {
    [this.challengePanel, this.modal, this.fightOverlay, this.resultOverlay]
      .forEach((c) => { if (c) c.destroy(); });
    if (this._amountInput) { this._amountInput.destroy(); this._amountInput = null; }
    this.challengePanel = null; this.modal = null; this.fightOverlay = null; this.resultOverlay = null;
  }

  // --- Shared button helper ---
  button(container, x, y, w, h, label, color, onClick) {
    const bg = this.scene.add.rectangle(x, y, w, h, color)
      .setStrokeStyle(1, 0xaaaaaa).setInteractive({ useHandCursor: true });
    const txt = this.scene.add.text(x, y, label, {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    bg.on('pointerdown', (pointer, lx, ly, event) => { event.stopPropagation(); onClick(); });
    container.add([bg, txt]);
    return bg;
  }

  // --- 1. Challenge-creation panel (from right-click → Wager) ---
  openChallengePanel({ wallet, name }) {
    if (this.modal || this.fightOverlay || this.resultOverlay) return; // busy in a flow
    this.destroyChallengePanel();

    this.target = { wallet, name };
    this.currency = 'USDC';
    this.amount = WAGER_MIN.USDC;

    const W = 360; const H = 250;
    const x = (1280 - W) / 2; const y = (720 - H) / 2;
    const bg = this.scene.add.rectangle(0, 0, W, H, 0x1e1e1e, 0.98).setOrigin(0, 0)
      .setStrokeStyle(2, 0xffd700).setInteractive();
    bg.on('pointerdown', (p, lx, ly, e) => e.stopPropagation());
    const title = this.scene.add.text(W / 2, 12, `Wager ${name}`, {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    this.challengePanel = this.scene.add.container(x, y, [bg, title]).setDepth(1300);

    // Currency radio (USDC | SOL)
    this.scene.add.existing(this.challengePanel);
    this.challengePanel.add(this.scene.add.text(20, 52, 'Currency:', {
      fontFamily: 'monospace', fontSize: '12px', color: '#aaaaaa',
    }));
    this.currencyBtns = {};
    ['USDC', 'SOL'].forEach((cur, i) => {
      const bx = 110 + i * 100;
      const b = this.scene.add.rectangle(bx, 58, 90, 26, 0x2a2a2a).setOrigin(0, 0)
        .setStrokeStyle(1, 0x555555).setInteractive({ useHandCursor: true });
      const t = this.scene.add.text(bx + 45, 71, cur, {
        fontFamily: 'monospace', fontSize: '13px', color: '#ffffff',
      }).setOrigin(0.5);
      b.on('pointerdown', (p, lx, ly, e) => { e.stopPropagation(); this.setCurrency(cur); });
      this.currencyBtns[cur] = b;
      this.challengePanel.add([b, t]);
    });

    // Amount stepper + DOM input
    this.challengePanel.add(this.scene.add.text(20, 110, 'Amount:', {
      fontFamily: 'monospace', fontSize: '12px', color: '#aaaaaa',
    }));
    const minus = this.scene.add.rectangle(110, 116, 30, 28, 0x2a2a2a).setOrigin(0, 0)
      .setStrokeStyle(1, 0x555555).setInteractive({ useHandCursor: true });
    this.challengePanel.add([minus, this.scene.add.text(125, 130, '-', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffffff',
    }).setOrigin(0.5)]);
    const plus = this.scene.add.rectangle(250, 116, 30, 28, 0x2a2a2a).setOrigin(0, 0)
      .setStrokeStyle(1, 0x555555).setInteractive({ useHandCursor: true });
    this.challengePanel.add([plus, this.scene.add.text(265, 130, '+', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffffff',
    }).setOrigin(0.5)]);
    minus.on('pointerdown', (p, lx, ly, e) => { e.stopPropagation(); this.stepAmount(-1); });
    plus.on('pointerdown', (p, lx, ly, e) => { e.stopPropagation(); this.stepAmount(1); });

    const input = document.createElement('input');
    input.type = 'text';
    input.style.cssText = 'width:88px;height:24px;background:#111;color:#fff;border:1px solid #666;'
      + 'text-align:center;font-family:monospace;font-size:14px;outline:none;';
    this.amountInputEl = input;
    this._amountInput = this.scene.add.dom(x + 200, y + 130, input).setDepth(1350);
    input.addEventListener('focus', () => this.scene.game.events.emit('typing', true));
    input.addEventListener('blur', () => { this.scene.game.events.emit('typing', false); this.readAmount(); });
    input.addEventListener('keydown', (e) => e.stopPropagation());

    this.feedback = this.scene.add.text(W / 2, 165, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ff6666',
    }).setOrigin(0.5, 0);
    this.challengePanel.add(this.feedback);

    this.button(this.challengePanel, W / 2 - 70, 215, 130, 34, 'Send Wager', 0x2e7d32, () => this.send());
    this.button(this.challengePanel, W / 2 + 70, 215, 110, 34, 'Cancel', 0x555555, () => this.destroyChallengePanel());

    this.refreshChallengePanel();
  }

  setCurrency(cur) {
    this.currency = cur;
    this.amount = WAGER_MIN[cur];
    this.refreshChallengePanel();
  }

  stepAmount(dir) {
    this.amount = Phaser.Math.Clamp(
      this.amount + dir * WAGER_STEP[this.currency], WAGER_MIN[this.currency], WAGER_MAX[this.currency],
    );
    if (this.currency === 'SOL') this.amount = Math.round(this.amount * 100) / 100;
    this.refreshChallengePanel();
  }

  readAmount() {
    const v = parseFloat(this.amountInputEl.value);
    if (Number.isFinite(v)) {
      this.amount = Phaser.Math.Clamp(v, WAGER_MIN[this.currency], WAGER_MAX[this.currency]);
      if (this.currency === 'USDC') this.amount = Math.round(this.amount);
      else this.amount = Math.round(this.amount * 100) / 100;
    }
    this.refreshChallengePanel();
  }

  refreshChallengePanel() {
    if (!this.challengePanel) return;
    for (const [cur, b] of Object.entries(this.currencyBtns)) {
      b.setFillStyle(cur === this.currency ? 0xb8860b : 0x2a2a2a)
        .setStrokeStyle(cur === this.currency ? 2 : 1, cur === this.currency ? 0xffd700 : 0x555555);
    }
    if (this.amountInputEl && document.activeElement !== this.amountInputEl) {
      this.amountInputEl.value = this.currency === 'SOL' ? this.amount.toFixed(2) : String(Math.round(this.amount));
    }
  }

  send() {
    const cur = this.currency;
    const amt = cur === 'USDC' ? Math.round(this.amount) : Math.round(this.amount * 100) / 100;
    if (cur === 'USDC' && (amt < 1 || amt > 5000)) { this.feedback.setText('USDC must be $1–$5000'); return; }
    if (cur === 'SOL' && amt < 0.01) { this.feedback.setText('SOL minimum is 0.01'); return; }

    this.outgoing = { amount: amt, currency: cur, targetName: this.target.name };
    if (typeof network !== 'undefined') network.sendChallenge(this.target.wallet, amt, cur);
    this.scene.showToast(`Wager sent to ${this.target.name}`, '#ffd700');
    this.destroyChallengePanel();
  }

  destroyChallengePanel() {
    if (this._amountInput) { this._amountInput.destroy(); this._amountInput = null; }
    if (this.challengePanel) { this.challengePanel.destroy(); this.challengePanel = null; }
    this.amountInputEl = null; this.currencyBtns = null; this.feedback = null;
  }

  // --- 2. Incoming challenge modal (Accept / Decline) ---
  showIncoming({ challenge_id, from_wallet, from_name, from_levels, amount, currency }) {
    this.destroyModal();
    const W = 440; const H = 180;
    const x = (1280 - W) / 2; const y = (720 - H) / 2;
    const bg = this.scene.add.rectangle(0, 0, W, H, 0x111111, 0.98).setOrigin(0, 0)
      .setStrokeStyle(2, 0xffd700).setInteractive();
    bg.on('pointerdown', (p, lx, ly, e) => e.stopPropagation());
    const lv = `Att ${from_levels.attack} / Str ${from_levels.strength} / Def ${from_levels.defense}`;
    const text = this.scene.add.text(W / 2, 30,
      `${from_name} (${lv})\nchallenges you to a wager of ${this.fmt(amount, currency)}`, {
        fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', align: 'center', lineSpacing: 8,
      }).setOrigin(0.5, 0);
    this.modal = this.scene.add.container(x, y, [bg, text]).setDepth(1300);

    this.button(this.modal, W / 2 - 70, 135, 120, 36, 'Accept', 0x2e7d32, () => {
      this.opponent = { wallet: from_wallet, name: from_name };
      if (typeof network !== 'undefined') network.acceptWager(challenge_id);
      this.destroyModal();
    });
    this.button(this.modal, W / 2 + 70, 135, 120, 36, 'Decline', 0xc0392b, () => {
      if (typeof network !== 'undefined') network.declineWager(challenge_id);
      this.destroyModal();
    });
  }

  // --- 3. Challenger confirmation modal (Confirm / Cancel) ---
  showAccepted({ challenge_id, to_wallet, to_name, to_levels }) {
    this.destroyModal();
    const amt = this.outgoing ? this.outgoing.amount : 0;
    const cur = this.outgoing ? this.outgoing.currency : 'USDC';
    const W = 440; const H = 180;
    const x = (1280 - W) / 2; const y = (720 - H) / 2;
    const bg = this.scene.add.rectangle(0, 0, W, H, 0x111111, 0.98).setOrigin(0, 0)
      .setStrokeStyle(2, 0xffd700).setInteractive();
    bg.on('pointerdown', (p, lx, ly, e) => e.stopPropagation());
    const lv = `Att ${to_levels.attack} / Str ${to_levels.strength} / Def ${to_levels.defense}`;
    const text = this.scene.add.text(W / 2, 30,
      `${to_name} (${lv})\naccepted your wager of ${this.fmt(amt, cur)}`, {
        fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', align: 'center', lineSpacing: 8,
      }).setOrigin(0.5, 0);
    this.modal = this.scene.add.container(x, y, [bg, text]).setDepth(1300);

    this.button(this.modal, W / 2 - 80, 135, 140, 36, 'Confirm Wager', 0x2e7d32, () => {
      this.opponent = { wallet: to_wallet, name: to_name };
      if (typeof network !== 'undefined') network.confirmWager(challenge_id);
      this.destroyModal();
      this.scene.showToast('Fight starting...', '#ffd700');
    });
    this.button(this.modal, W / 2 + 80, 135, 120, 36, 'Cancel Wager', 0xc0392b, () => {
      if (typeof network !== 'undefined') network.cancelWager(challenge_id);
      this.destroyModal();
    });
  }

  destroyModal() {
    if (this.modal) { this.modal.destroy(); this.modal = null; }
  }

  // --- 4. Live fight replay overlay ---
  ensureFightOverlay() {
    if (this.fightOverlay) return;
    const oppName = this.opponent ? this.opponent.name : 'Opponent';
    this.fight = { myHp: 100, oppHp: 100 };

    const bg = this.scene.add.rectangle(0, 0, 1280, 720, 0x000000, 0.55).setOrigin(0, 0);
    const banner = this.scene.add.text(640, 120, 'WAGER FIGHT', {
      fontFamily: 'monospace', fontSize: '24px', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Left = me, right = opponent
    const mk = (cx, name, color) => {
      const label = this.scene.add.text(cx, 200, name, {
        fontFamily: 'monospace', fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      const barBg = this.scene.add.rectangle(cx, 240, 220, 22, 0x222222).setStrokeStyle(1, 0x000000);
      const barFill = this.scene.add.rectangle(cx - 110, 240, 220, 18, color).setOrigin(0, 0.5);
      const hpText = this.scene.add.text(cx, 240, '100', {
        fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5);
      return { label, barBg, barFill, hpText };
    };
    this.fightMe = mk(420, this.myName(), 0x2ecc40);
    this.fightOpp = mk(860, oppName, 0xcc4444);
    const vs = this.scene.add.text(640, 240, 'VS', {
      fontFamily: 'monospace', fontSize: '20px', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.fightOverlay = this.scene.add.container(0, 0, [
      bg, banner, vs,
      this.fightMe.label, this.fightMe.barBg, this.fightMe.barFill, this.fightMe.hpText,
      this.fightOpp.label, this.fightOpp.barBg, this.fightOpp.barFill, this.fightOpp.hpText,
    ]).setDepth(1400);
  }

  onFightTick({ attackerId, damage, defenderHp }) {
    this.ensureFightOverlay();
    const iAttacked = (typeof network !== 'undefined') && attackerId === network.wallet;
    // The defender is whoever didn't attack; defenderHp is their simulated HP.
    const side = iAttacked ? this.fightOpp : this.fightMe;
    if (iAttacked) this.fight.oppHp = defenderHp; else this.fight.myHp = defenderHp;

    side.barFill.width = 220 * Phaser.Math.Clamp(defenderHp / 100, 0, 1);
    side.hpText.setText(String(defenderHp));

    // Damage splat near the struck combatant
    const splatX = iAttacked ? 860 : 420;
    const splat = this.scene.add.text(splatX + Phaser.Math.Between(-20, 20), 270,
      damage > 0 ? `${damage}` : '0', {
        fontFamily: 'monospace', fontSize: '20px', fontStyle: 'bold',
        color: damage > 0 ? '#ffffff' : '#7ab8ff', stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(1450);
    this.scene.tweens.add({ targets: splat, y: 240, alpha: 0, duration: 700, onComplete: () => splat.destroy() });
  }

  destroyFightOverlay() {
    if (this.fightOverlay) { this.fightOverlay.destroy(); this.fightOverlay = null; }
    this.fight = null;
  }

  // --- 5. Result screen ---
  showResult({ winner_wallet, winner_name, loser_name, amount, currency }) {
    this.destroyFightOverlay();
    if (this.resultOverlay) this.resultOverlay.destroy();

    const iWon = (typeof network !== 'undefined') && winner_wallet === network.wallet;
    const bg = this.scene.add.rectangle(0, 0, 1280, 720, 0x000000, 0.7).setOrigin(0, 0).setInteractive();
    bg.on('pointerdown', (p, lx, ly, e) => e.stopPropagation());
    const headline = this.scene.add.text(640, 250, `${winner_name} defeated ${loser_name}`, {
      fontFamily: 'monospace', fontSize: '24px', color: iWon ? '#ffd700' : '#ff8888', fontStyle: 'bold',
    }).setOrigin(0.5);
    const wager = this.scene.add.text(640, 300, `Wager: ${this.fmt(amount, currency)}`, {
      fontFamily: 'monospace', fontSize: '16px', color: '#dddddd',
    }).setOrigin(0.5);
    const payout = this.scene.add.text(640, 340, `${winner_name} wins ${this.fmt(amount, currency)}`, {
      fontFamily: 'monospace', fontSize: '16px', color: '#66ff66',
    }).setOrigin(0.5);
    const note = this.scene.add.text(640, 380, '(V1: informational only — no real transfer)', {
      fontFamily: 'monospace', fontSize: '11px', color: '#888888',
    }).setOrigin(0.5);

    this.resultOverlay = this.scene.add.container(0, 0, [bg, headline, wager, payout, note]).setDepth(1400);
    this.button(this.resultOverlay, 640, 440, 120, 38, 'Close', 0x555555, () => this.closeResult());

    this._resultTimer = this.scene.time.delayedCall(5000, () => this.closeResult());

    this.opponent = null;
    this.outgoing = null;
    this.scene.game.events.emit('sync-player'); // pick up updated wins/losses + HP
  }

  closeResult() {
    if (this._resultTimer) { this._resultTimer.remove(); this._resultTimer = null; }
    if (this.resultOverlay) { this.resultOverlay.destroy(); this.resultOverlay = null; }
  }
}
