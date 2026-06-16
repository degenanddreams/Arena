// UIScene.js — HUD overlay, runs in parallel with GameScene (scene.launch).
// Its camera is never zoomed/rotated, so all screen-space UI lives here:
// HP bar, combat style indicator, panel buttons, the five side panels
// (Inventory / Skills / Combat / Equipment / Info), NPC interfaces, context
// menus, toasts, and level-up popups.

class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene');
  }

  create() {
    this.createHud();
    this.createPanelButtons();

    this.skillsPanel = new SkillsPanel(this);
    this.combatStylePanel = new CombatStylePanel(this);
    this.inventoryPanel = new InventoryPanel(this);
    this.equipmentPanel = new EquipmentPanel(this);
    this.playerInfoPanel = new PlayerInfoPanel(this);
    this.npcPanels = {
      bank: new BankPanel(this),
      merchant: new MerchantPanel(this),
      food: new FoodShopPanel(this),
      cosmetics: new CosmeticsPanel(this),
    };

    this.sidePanels = [
      this.skillsPanel, this.combatStylePanel, this.inventoryPanel,
      this.equipmentPanel, this.playerInfoPanel,
    ];

    this.chatLog = new ChatLog(this);
    this.wagerUI = new WagerUI(this);

    this.contextMenu = null;
    this.popupCount = 0;
    this.toastCount = 0;

    // Wager flow (Phase 3) — GameScene relays socket events to these
    this.onOpenWagerPanel = (p) => this.wagerUI.openChallengePanel(p);
    this.onWagerChallenge = (p) => this.wagerUI.showIncoming(p);
    this.onWagerAccepted = (p) => this.wagerUI.showAccepted(p);
    this.onWagerDeclined = () => this.showToast('Your wager was declined.', '#ff6666');
    this.onWagerCancelled = () => this.showToast('The wager was cancelled.', '#ffcc66');
    this.onWagerFightTick = (p) => this.wagerUI.onFightTick(p);
    this.onWagerFightResult = (p) => this.wagerUI.showResult(p);
    this.onWagerError = ({ error }) => {
      const msg = {
        player_busy: 'You are busy.', target_busy: 'That player is busy.',
        player_offline: 'That player is offline.', invalid_amount: 'Invalid wager amount.',
      }[error] || 'Wager error.';
      this.showToast(msg, '#ff6666');
    };
    this.game.events.on('open-wager-panel', this.onOpenWagerPanel);
    this.game.events.on('wager-challenge', this.onWagerChallenge);
    this.game.events.on('wager-accepted', this.onWagerAccepted);
    this.game.events.on('wager-declined', this.onWagerDeclined);
    this.game.events.on('wager-cancelled', this.onWagerCancelled);
    this.game.events.on('wager-fight-tick', this.onWagerFightTick);
    this.game.events.on('wager-fight-result', this.onWagerFightResult);
    this.game.events.on('wager-error', this.onWagerError);

    // Events from GameScene / panels
    this.game.events.on('open-context-menu', this.openContextMenu, this);
    this.game.events.on('level-ups', this.showLevelUps, this);
    this.game.events.on('xp-updated', this.onXPUpdated, this);
    this.game.events.on('style-changed', this.refreshStyleIndicator, this);
    this.game.events.on('open-npc', this.openNpc, this);
    this.game.events.on('player-data-updated', this.refreshOpenPanels, this);
    this.game.events.on('inventory-equip', this.doEquip, this);
    this.game.events.on('inventory-drop', this.doDrop, this);
    this.game.events.on('inventory-examine', this.doExamine, this);
    this.game.events.on('chat-message', this.onChatMessage, this);
    this.game.events.on('show-banner', this.onShowBanner, this);
    this.game.events.on('loot-notification', this.onLootNotification, this);
    this.game.events.on('sync-player', this.refreshPlayerData, this);
    this.registry.events.on('changedata-player', this.onPlayerChanged, this);

    this.events.once('shutdown', () => {
      this.game.events.off('open-wager-panel', this.onOpenWagerPanel);
      this.game.events.off('wager-challenge', this.onWagerChallenge);
      this.game.events.off('wager-accepted', this.onWagerAccepted);
      this.game.events.off('wager-declined', this.onWagerDeclined);
      this.game.events.off('wager-cancelled', this.onWagerCancelled);
      this.game.events.off('wager-fight-tick', this.onWagerFightTick);
      this.game.events.off('wager-fight-result', this.onWagerFightResult);
      this.game.events.off('wager-error', this.onWagerError);
      this.game.events.off('open-context-menu', this.openContextMenu, this);
      this.game.events.off('level-ups', this.showLevelUps, this);
      this.game.events.off('xp-updated', this.onXPUpdated, this);
      this.game.events.off('style-changed', this.refreshStyleIndicator, this);
      this.game.events.off('open-npc', this.openNpc, this);
      this.game.events.off('player-data-updated', this.refreshOpenPanels, this);
      this.game.events.off('inventory-equip', this.doEquip, this);
      this.game.events.off('inventory-drop', this.doDrop, this);
      this.game.events.off('inventory-examine', this.doExamine, this);
      this.game.events.off('chat-message', this.onChatMessage, this);
      this.game.events.off('show-banner', this.onShowBanner, this);
      this.game.events.off('loot-notification', this.onLootNotification, this);
      this.game.events.off('sync-player', this.refreshPlayerData, this);
      this.registry.events.off('changedata-player', this.onPlayerChanged, this);
    });

    // Any unhandled click (UI elements stop propagation) = a click outside:
    // close the context menu and the inventory panel
    this.input.on('pointerdown', () => {
      this.closeContextMenu();
      if (this.inventoryPanel.isOpen) this.inventoryPanel.close();
    });

    // Escape closes everything (panels, NPC interfaces, menus)
    this.input.keyboard.on('keydown-ESC', () => this.closeAll());
  }

  // --- Server data sync ---

  async refreshPlayerData() {
    try {
      const res = await fetch(`/api/player/${TEST_WALLET}`);
      if (!res.ok) throw new Error(`fetch failed (${res.status})`);
      const data = await res.json();

      const current = this.registry.get('player') || {};
      data.player.activeTrainingStyle = current.activeTrainingStyle || 'strength';

      this.registry.set('player', data.player);
      this.registry.set('inventory', data.inventory);
      this.registry.set('bank', data.bank);
      this.registry.set('equipped', data.equipped);

      this.refreshOpenPanels();
    } catch (err) {
      console.error('Player data refresh failed:', err);
    }
  }

  refreshOpenPanels() {
    if (this.skillsPanel.isOpen) this.skillsPanel.refresh();
    if (this.combatStylePanel.isOpen) this.combatStylePanel.refresh();
    if (this.inventoryPanel.isOpen) this.inventoryPanel.refresh();
    if (this.equipmentPanel.isOpen) this.equipmentPanel.refresh();
    if (this.playerInfoPanel.isOpen) this.playerInfoPanel.refresh();
    if (this.npcPanels.merchant.isOpen) this.npcPanels.merchant.redraw();
    if (this.npcPanels.food.isOpen) this.npcPanels.food.redraw();
  }

  // --- HUD (top-left) ---

  createHud() {
    const player = this.registry.get('player');

    this.nameText = this.add.text(16, 14, player.display_name, {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    });

    this.add.rectangle(16, 40, 180, 16, 0x222222).setOrigin(0, 0).setStrokeStyle(1, 0x000000);
    this.hpFill = this.add.rectangle(17, 41, 178, 14, 0xcc2222).setOrigin(0, 0);
    this.hpText = this.add.text(202, 40, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    });

    // Persistent combat style indicator
    this.styleText = this.add.text(16, 62, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffcc66',
      stroke: '#000000', strokeThickness: 3,
    });

    // Dev/test mode indicator (roadmap §35, Prompt A) — only when ?dev=maxstats
    // is active on localhost.
    if (typeof DevMode !== 'undefined' && DevMode.isActive()) {
      this.add.text(640, 6, 'DEV MODE', {
        fontFamily: 'monospace', fontSize: '16px', color: '#ff4444', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5, 0).setDepth(100);
    }

    this.refreshHP();
    this.refreshStyleIndicator();
  }

  onPlayerChanged() {
    this.refreshHP();
    this.refreshStyleIndicator();
    const player = this.registry.get('player');
    this.nameText.setText(player.display_name);
  }

  refreshHP() {
    const player = this.registry.get('player');
    const hp = Phaser.Math.Clamp(player.current_hp, 0, 100);
    this.hpFill.width = Math.round(178 * (hp / 100));
    this.hpText.setText(`${hp} / 100`);
  }

  refreshStyleIndicator() {
    const style = this.registry.get('player').activeTrainingStyle || 'strength';
    const label = style.charAt(0).toUpperCase() + style.slice(1);
    this.styleText.setText(`Style: ${label}`);
  }

  // --- Panel buttons (bottom-right) ---

  createPanelButtons() {
    const buttons = [
      { label: 'INV', panel: () => this.inventoryPanel },
      { label: 'SKILLS', panel: () => this.skillsPanel },
      { label: 'COMBAT', panel: () => this.combatStylePanel },
      { label: 'EQUIP', panel: () => this.equipmentPanel },
      { label: 'INFO', panel: () => this.playerInfoPanel },
    ];
    const buttonWidth = 66;
    const gap = 6;
    const totalWidth = buttons.length * buttonWidth + (buttons.length - 1) * gap;
    let x = 1280 - 16 - totalWidth;
    const y = 720 - 16 - 28;

    for (const btn of buttons) {
      const bg = this.add.rectangle(x, y, buttonWidth, 28, 0x333333)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x666666)
        .setInteractive({ useHandCursor: true });

      this.add.text(x + buttonWidth / 2, y + 14, btn.label, {
        fontFamily: 'monospace', fontSize: '11px', color: '#ffffff',
      }).setOrigin(0.5);

      bg.on('pointerdown', (pointer, localX, localY, event) => {
        event.stopPropagation(); // don't walk under the button
        const panel = btn.panel();
        const wasOpen = panel.isOpen;
        this.closeSidePanels();
        if (!wasOpen) {
          panel.open(); // side panels share one spot — exclusive
          this.game.events.emit('request-stop-attack'); // opening a panel stops combat (Section 13)
        }
      });

      x += buttonWidth + gap;
    }
  }

  closeSidePanels() {
    for (const panel of this.sidePanels) panel.close();
  }

  closeAll() {
    this.closeSidePanels();
    for (const panel of Object.values(this.npcPanels)) {
      if (panel.isOpen) panel.close();
    }
    this.closeContextMenu();
  }

  onXPUpdated() {
    this.skillsPanel.refresh();
  }

  // --- NPC interfaces ---

  openNpc({ npc }) {
    const target = this.npcPanels[npc];
    if (!target) return;
    if (target.isOpen) return;

    // One NPC interface at a time
    for (const panel of Object.values(this.npcPanels)) {
      if (panel.isOpen) panel.close();
    }
    target.open();
    this.game.events.emit('request-stop-attack'); // opening an NPC stops combat (Section 13)
  }

  // --- Inventory actions ---

  async doEquip({ item_id, from_slot }) {
    try {
      const res = await fetch('/api/inventory/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: TEST_WALLET, item_id, from_slot }),
      });
      const data = await res.json();

      if (!data.success) {
        if (data.reason === 'level_requirement_not_met') {
          const item = ITEMS[item_id];
          const message = item.type === 'weapon'
            ? `You need Attack level ${data.required} to wield this`
            : `You need Defense level ${data.required} to wear this`;
          this.showToast(message, '#ff6666');
        } else {
          this.showToast('Could not equip item', '#ff6666');
        }
        return;
      }
      await this.refreshPlayerData();
    } catch (err) {
      console.error('Equip failed:', err);
      this.showToast('Could not equip item', '#ff6666');
    }
  }

  async doUnequip(slotType) {
    try {
      const res = await fetch('/api/inventory/unequip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: TEST_WALLET, slot_type: slotType }),
      });
      const data = await res.json();

      if (!data.success) {
        if (data.reason === 'inventory_full') {
          this.showToast('Inventory full — free a slot first', '#ff6666');
        } else {
          this.showToast('Could not unequip item', '#ff6666');
        }
        return;
      }
      await this.refreshPlayerData();
    } catch (err) {
      console.error('Unequip failed:', err);
      this.showToast('Could not unequip item', '#ff6666');
    }
  }

  async doDrop({ item_id, slot, quantity }) {
    try {
      const res = await fetch('/api/inventory/remove_item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: TEST_WALLET, item_id, quantity, slot }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.reason || 'drop_failed');

      this.showToast(`Dropped ${ITEMS[item_id] ? ITEMS[item_id].name : 'item'}`, '#aaaaaa');
      await this.refreshPlayerData();
    } catch (err) {
      console.error('Drop failed:', err);
      this.showToast('Could not drop item', '#ff6666');
    }
  }

  doExamine({ item_id }) {
    const item = ITEMS[item_id];
    if (!item) return;
    this.showToast(item.description || item.name, '#aaddff');
  }

  // --- Display name editing ---

  async saveDisplayName(name) {
    try {
      const res = await fetch(`/api/player/${TEST_WALLET}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: name }),
      });
      const data = await res.json();

      if (!data.success) {
        this.showToast('Invalid name (3-20 characters)', '#ff6666');
        if (this.playerInfoPanel.isOpen) this.playerInfoPanel.refresh();
        return;
      }
      this.showToast('Name saved', '#66ff66');
      await this.refreshPlayerData();
      this.game.events.emit('name-changed');
    } catch (err) {
      console.error('Name save failed:', err);
      this.showToast('Name save failed', '#ff6666');
    }
  }

  // --- Toasts ---

  showToast(message, color = '#ffffff') {
    const y = 640 - (this.toastCount % 3) * 30;
    this.toastCount++;

    const text = this.add.text(640, y, message, {
      fontFamily: 'monospace', fontSize: '13px', color, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(1200);

    this.tweens.add({
      targets: text,
      y: y - 12,
      alpha: { from: 1, to: 0 },
      delay: 1400,
      duration: 500,
      onComplete: () => text.destroy(),
    });
  }

  // --- Chat / banners / loot (boss encounter integration) ---

  onChatMessage({ text }) {
    this.chatLog.addMessage(text);
  }

  // Centre-screen banner (boss defeat, death message). Non-blocking; auto-
  // dismisses after `duration` ms.
  onShowBanner({ text, color = '#ffffff', duration = 3000, y = 200 }) {
    const bg = this.add.rectangle(640, y, 520, 52, 0x000000, 0.8)
      .setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(color).color);
    const label = this.add.text(640, y, text, {
      fontFamily: 'monospace', fontSize: '20px', color, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3, align: 'center',
    }).setOrigin(0.5);

    const banner = this.add.container(0, 0, [bg, label]).setDepth(1150);

    this.time.delayedCall(duration, () => {
      this.tweens.add({
        targets: banner,
        alpha: 0,
        duration: 250,
        onComplete: () => banner.destroy(),
      });
    });
  }

  // Loot popup, shown for 3 seconds beneath the defeat banner
  onLootNotification({ text, color = '#ffd700' }) {
    const y = 260;
    const label = this.add.text(640, y, text, {
      fontFamily: 'monospace', fontSize: '18px', color, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5).setDepth(1151);

    this.time.delayedCall(3000, () => {
      this.tweens.add({
        targets: label,
        alpha: 0,
        duration: 250,
        onComplete: () => label.destroy(),
      });
    });
  }

  // --- Generic right-click context menu ---
  // items: [{ label, enabled, suffix?, event?, payload? }]

  openContextMenu({ x, y, title, items }) {
    this.closeContextMenu();

    const itemHeight = 26;
    const headerHeight = title ? 22 : 6;
    const labelOf = (item) => item.suffix ? `${item.label} (${item.suffix})` : item.label;
    const longest = Math.max(...items.map((i) => labelOf(i).length), title ? title.length : 0);
    const width = Math.max(150, longest * 8 + 24);
    const height = headerHeight + items.length * itemHeight + 4;
    const menuX = Phaser.Math.Clamp(x, 0, 1280 - width);
    const menuY = Phaser.Math.Clamp(y, 0, 720 - height);

    const bg = this.add.rectangle(0, 0, width, height, 0x1e1e1e, 0.97)
      .setOrigin(0, 0).setStrokeStyle(1, 0x888888);
    const children = [bg];

    if (title) {
      children.push(this.add.text(width / 2, 4, title, {
        fontFamily: 'monospace', fontSize: '11px', color: '#aaaaaa',
      }).setOrigin(0.5, 0));
    }

    items.forEach((item, i) => {
      const oy = headerHeight + i * itemHeight;

      const itemBg = this.add.rectangle(2, oy, width - 4, itemHeight - 2, 0x1e1e1e)
        .setOrigin(0, 0);
      const itemText = this.add.text(10, oy + 5, labelOf(item), {
        fontFamily: 'monospace', fontSize: '13px',
        color: item.enabled ? '#ffffff' : '#555555',
      });

      if (item.enabled && item.event) {
        itemBg.setInteractive({ useHandCursor: true });
        itemBg.on('pointerover', () => itemBg.setFillStyle(0x3a3a3a));
        itemBg.on('pointerout', () => itemBg.setFillStyle(0x1e1e1e));
        itemBg.on('pointerdown', (pointer, localX, localY, event) => {
          event.stopPropagation(); // don't walk under the menu
          this.game.events.emit(item.event, item.payload || {});
          this.closeContextMenu();
        });
      }

      children.push(itemBg, itemText);
    });

    this.contextMenu = this.add.container(menuX, menuY, children).setDepth(1000);
  }

  closeContextMenu() {
    if (this.contextMenu) {
      this.contextMenu.destroy();
      this.contextMenu = null;
    }
  }

  // --- Level-up popups ---

  showLevelUps(levelUps) {
    levelUps.forEach((up, i) => this.showLevelUpPopup(up, i));
  }

  showLevelUpPopup({ skill, newLevel }, stackIndex) {
    const label = skill.charAt(0).toUpperCase() + skill.slice(1);
    const y = 260 + (this.popupCount % 3) * 70 + stackIndex * 70;
    this.popupCount++;

    const bg = this.add.rectangle(640, y, 420, 56, 0x1a1a1a, 0.92)
      .setStrokeStyle(3, 0xffd700);
    const text = this.add.text(640, y, `${label} level up! Now level ${newLevel}`, {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffd700', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);

    const popup = this.add.container(0, 0, [bg, text]).setDepth(1100);

    // Simple gold sparkle: a quick pulse on the border/text
    this.tweens.add({
      targets: text,
      scale: { from: 1, to: 1.12 },
      duration: 240,
      yoyo: true,
      repeat: 1,
    });

    // Non-blocking, auto-dismiss after 2000ms
    this.time.delayedCall(TIMING.LEVEL_UP_POPUP_MS, () => {
      this.tweens.add({
        targets: popup,
        alpha: 0,
        duration: 200,
        onComplete: () => popup.destroy(),
      });
    });
  }
}
