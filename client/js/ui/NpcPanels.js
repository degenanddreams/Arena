// NpcPanels.js — the four Lobby NPC interfaces (CLAUDE.md Section 19):
// BankPanel      — 20-slot inventory vs 10x10 bank, transfers in memory,
//                  full state saved atomically on close via /api/bank/save
// MerchantPanel  — sell gear for its tier value in gold
// FoodShopPanel  — buy Cooked Chicken, 10 for 1 gold, one slot per chicken
// CosmeticsPanel — placeholder only

// Shared modal scaffolding: centred panel with title and an X close button.
function buildModal(scene, width, height, title, onClose) {
  const x = (1280 - width) / 2;
  const y = (720 - height) / 2;

  const bg = scene.add.rectangle(0, 0, width, height, 0x1e1e1e, 0.97)
    .setOrigin(0, 0)
    .setStrokeStyle(2, 0x777777)
    .setInteractive();
  bg.on('pointerdown', (pointer, localX, localY, event) => event.stopPropagation());

  const titleText = scene.add.text(width / 2, 12, title, {
    fontFamily: 'monospace', fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
  }).setOrigin(0.5, 0);

  const closeBtn = scene.add.text(width - 12, 10, 'X', {
    fontFamily: 'monospace', fontSize: '16px', color: '#ff6666', fontStyle: 'bold',
  }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
  closeBtn.on('pointerdown', (pointer, localX, localY, event) => {
    event.stopPropagation();
    onClose();
  });

  return scene.add.container(x, y, [bg, titleText, closeBtn]).setDepth(950);
}

function firstFreeSlotIn(rows, maxSlots) {
  const used = new Set(rows.map((r) => r.slot));
  for (let s = 0; s < maxSlots; s++) {
    if (!used.has(s)) return s;
  }
  return -1;
}

// --- Bank ---

class BankPanel {
  constructor(scene) {
    this.scene = scene;
    this.container = null;
  }

  get isOpen() {
    return this.container !== null;
  }

  open() {
    if (this.isOpen) return;

    // Working copies — all transfers happen in memory, saved on close
    this.inv = (this.scene.registry.get('inventory') || []).map((r) => ({ ...r }));
    this.bank = (this.scene.registry.get('bank') || []).map((r) => ({ ...r }));

    this.container = buildModal(this.scene, 720, 480, 'Bank', () => this.close());

    const invLabel = this.scene.add.text(110, 40, 'Inventory', {
      fontFamily: 'monospace', fontSize: '12px', color: '#aaaaaa',
    }).setOrigin(0.5, 0);
    const bankLabel = this.scene.add.text(490, 40, 'Bank', {
      fontFamily: 'monospace', fontSize: '12px', color: '#aaaaaa',
    }).setOrigin(0.5, 0);
    const hint = this.scene.add.text(360, 458, 'Click an item to transfer it. Saved when you close the bank.', {
      fontFamily: 'monospace', fontSize: '10px', color: '#777777',
    }).setOrigin(0.5, 1);
    this.container.add([invLabel, bankLabel, hint]);

    this.slotsGroup = this.scene.add.container(0, 0);
    this.container.add(this.slotsGroup);
    this.redraw();
  }

  redraw() {
    this.slotsGroup.removeAll(true);

    // Left: inventory 4x5, 44px slots
    const invBySlot = new Map(this.inv.map((r) => [r.slot, r]));
    for (let i = 0; i < 20; i++) {
      const sx = 22 + (i % 4) * 46;
      const sy = 62 + Math.floor(i / 4) * 46;
      addItemSlot(this.scene, this.slotsGroup, sx, sy, 44, invBySlot.get(i) || null,
        (row) => this.deposit(row));
    }

    // Right: bank 10x10, 36px slots
    const bankBySlot = new Map(this.bank.map((r) => [r.slot, r]));
    for (let i = 0; i < 100; i++) {
      const sx = 310 + (i % 10) * 38;
      const sy = 62 + Math.floor(i / 10) * 38;
      addItemSlot(this.scene, this.slotsGroup, sx, sy, 36, bankBySlot.get(i) || null,
        (row) => this.withdraw(row));
    }
  }

  deposit(invRow) {
    const item = ITEMS[invRow.item_id];

    // Stackables (gold, food) merge into an existing bank stack
    if (item && item.stackable) {
      const target = this.bank.find((b) => b.item_id === invRow.item_id);
      if (target) {
        target.quantity += invRow.quantity;
        this.inv = this.inv.filter((r) => r.slot !== invRow.slot);
        this.redraw();
        return;
      }
    }

    const free = firstFreeSlotIn(this.bank, 100);
    if (free === -1) {
      this.scene.showToast('Bank full', '#ff6666');
      return;
    }
    this.bank.push({ slot: free, item_id: invRow.item_id, quantity: invRow.quantity });
    this.inv = this.inv.filter((r) => r.slot !== invRow.slot);
    this.redraw();
  }

  withdraw(bankRow) {
    const item = ITEMS[bankRow.item_id];

    if (bankRow.item_id === 18) {
      // Gold stacks in inventory — merge the whole stack
      const goldRow = this.inv.find((r) => r.item_id === 18);
      if (goldRow) {
        goldRow.quantity += bankRow.quantity;
      } else {
        const free = firstFreeSlotIn(this.inv, 20);
        if (free === -1) {
          this.scene.showToast('Inventory full', '#ff6666');
          return;
        }
        this.inv.push({ slot: free, item_id: 18, quantity: bankRow.quantity });
      }
      this.bank = this.bank.filter((r) => r.slot !== bankRow.slot);
    } else if (item && item.type === 'food') {
      // Food does NOT stack in inventory — withdraw one unit per click
      const free = firstFreeSlotIn(this.inv, 20);
      if (free === -1) {
        this.scene.showToast('Inventory full', '#ff6666');
        return;
      }
      this.inv.push({ slot: free, item_id: bankRow.item_id, quantity: 1 });
      bankRow.quantity -= 1;
      if (bankRow.quantity <= 0) this.bank = this.bank.filter((r) => r.slot !== bankRow.slot);
    } else {
      // Gear: one piece per slot
      const free = firstFreeSlotIn(this.inv, 20);
      if (free === -1) {
        this.scene.showToast('Inventory full', '#ff6666');
        return;
      }
      this.inv.push({ slot: free, item_id: bankRow.item_id, quantity: 1 });
      this.bank = this.bank.filter((r) => r.slot !== bankRow.slot);
    }

    this.redraw();
  }

  async close() {
    if (!this.isOpen) return;
    const payload = {
      player_id: TEST_WALLET,
      bank: this.bank.map(({ slot, item_id, quantity }) => ({ slot, item_id, quantity })),
      inventory: this.inv.map(({ slot, item_id, quantity }) => ({ slot, item_id, quantity })),
    };

    this.container.destroy();
    this.container = null;
    this.slotsGroup = null;

    // Atomic save of the full bank + inventory state on close
    try {
      const res = await fetch('/api/bank/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.reason || 'bank_save_failed');
    } catch (err) {
      console.error('Bank save failed:', err);
      this.scene.showToast('Bank save failed!', '#ff6666');
    }
    await this.scene.refreshPlayerData();
  }
}

// --- Trading Merchant ---

class MerchantPanel {
  constructor(scene) {
    this.scene = scene;
    this.container = null;
  }

  get isOpen() {
    return this.container !== null;
  }

  open() {
    if (this.isOpen) return;
    this.container = buildModal(this.scene, 360, 420, 'Trading Merchant', () => this.close());

    const hint = this.scene.add.text(180, 36, 'Click a gear item to sell it (tier = gold value)', {
      fontFamily: 'monospace', fontSize: '10px', color: '#aaaaaa',
    }).setOrigin(0.5, 0);
    this.goldText = this.scene.add.text(180, 398, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffd700',
    }).setOrigin(0.5, 0);
    this.container.add([hint, this.goldText]);

    this.slotsGroup = this.scene.add.container(0, 0);
    this.confirmGroup = this.scene.add.container(0, 0);
    this.container.add([this.slotsGroup, this.confirmGroup]);

    this.redraw();
  }

  redraw() {
    if (!this.isOpen) return;
    this.slotsGroup.removeAll(true);
    this.confirmGroup.removeAll(true);

    const inventory = this.scene.registry.get('inventory') || [];
    const bySlot = new Map(inventory.map((r) => [r.slot, r]));
    const gold = inventory.find((r) => r.item_id === 18);
    this.goldText.setText(`Your gold: ${gold ? gold.quantity : 0}`);

    for (let i = 0; i < 20; i++) {
      const sx = 66 + (i % 4) * 60;
      const sy = 58 + Math.floor(i / 4) * 60;
      const row = bySlot.get(i) || null;
      const item = row ? ITEMS[row.item_id] : null;
      const sellable = item && (item.type === 'armor' || item.type === 'weapon');

      const rect = addItemSlot(this.scene, this.slotsGroup, sx, sy, 56, row,
        sellable ? (r) => this.confirmSell(r) : null);
      if (row && !sellable) rect.setAlpha(0.45);
    }
  }

  confirmSell(row) {
    this.confirmGroup.removeAll(true);
    const item = ITEMS[row.item_id];

    const bg = this.scene.add.rectangle(180, 210, 320, 110, 0x111111, 0.98)
      .setStrokeStyle(2, 0xffd700)
      .setInteractive();
    bg.on('pointerdown', (pointer, localX, localY, event) => event.stopPropagation());

    const text = this.scene.add.text(180, 182, `Sell ${item.name} for ${item.gold_value} gold?`, {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', align: 'center',
      wordWrap: { width: 300 },
    }).setOrigin(0.5);

    const makeButton = (bx, label, color, handler) => {
      const btn = this.scene.add.rectangle(bx, 235, 110, 30, color)
        .setStrokeStyle(1, 0xaaaaaa)
        .setInteractive({ useHandCursor: true });
      const btnText = this.scene.add.text(bx, 235, label, {
        fontFamily: 'monospace', fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      btn.on('pointerdown', (pointer, localX, localY, event) => {
        event.stopPropagation();
        handler();
      });
      return [btn, btnText];
    };

    this.confirmGroup.add([bg, text,
      ...makeButton(115, 'Sell', 0x2e7d32, () => this.sell(row)),
      ...makeButton(245, 'Cancel', 0x555555, () => this.confirmGroup.removeAll(true)),
    ]);
  }

  async sell(row) {
    this.confirmGroup.removeAll(true);
    try {
      const res = await fetch('/api/inventory/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: TEST_WALLET, inventory_slot: row.slot }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.reason || 'sell_failed');
      this.scene.showToast(`Sold for ${data.gold_received} gold`, '#ffd700');
    } catch (err) {
      console.error('Sell failed:', err);
      this.scene.showToast('Sale failed', '#ff6666');
    }
    await this.scene.refreshPlayerData();
    this.redraw();
  }

  close() {
    if (!this.isOpen) return;
    this.container.destroy();
    this.container = null;
    this.slotsGroup = null;
    this.confirmGroup = null;
    this.goldText = null;
  }
}

// --- Food Shop ---

class FoodShopPanel {
  constructor(scene) {
    this.scene = scene;
    this.container = null;
    this.selectedQty = 10;
  }

  get isOpen() {
    return this.container !== null;
  }

  open() {
    if (this.isOpen) return;
    this.selectedQty = 10;
    this.container = buildModal(this.scene, 340, 250, 'Food Shop', () => this.close());

    const offer = this.scene.add.text(170, 44, 'Cooked Chicken — 10 for 1 gold', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffffff',
    }).setOrigin(0.5, 0);
    this.infoText = this.scene.add.text(170, 70, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#aaaaaa',
    }).setOrigin(0.5, 0);
    this.container.add([offer, this.infoText]);

    this.dynamicGroup = this.scene.add.container(0, 0);
    this.container.add(this.dynamicGroup);
    this.redraw();
  }

  redraw() {
    if (!this.isOpen) return;
    this.dynamicGroup.removeAll(true);

    const inventory = this.scene.registry.get('inventory') || [];
    const gold = inventory.find((r) => r.item_id === 18);
    const goldQty = gold ? gold.quantity : 0;
    const freeSlots = 20 - inventory.length;
    this.infoText.setText(`Gold: ${goldQty}   Free inventory slots: ${freeSlots}`);

    // Quantity selector: 10 / 20 / 30, capped at available inventory space
    [10, 20, 30].forEach((qty, i) => {
      const bx = 80 + i * 90;
      const allowed = qty <= freeSlots;
      const selected = this.selectedQty === qty;

      const btn = this.scene.add.rectangle(bx, 120, 74, 32,
        selected ? 0xb8860b : (allowed ? 0x2a2a2a : 0x1a1a1a))
        .setStrokeStyle(selected ? 2 : 1, selected ? 0xffd700 : 0x555555);
      const label = this.scene.add.text(bx, 120, `${qty}`, {
        fontFamily: 'monospace', fontSize: '14px',
        color: allowed ? '#ffffff' : '#555555', fontStyle: 'bold',
      }).setOrigin(0.5);

      if (allowed) {
        btn.setInteractive({ useHandCursor: true });
        btn.on('pointerdown', (pointer, localX, localY, event) => {
          event.stopPropagation();
          this.selectedQty = qty;
          this.redraw();
        });
      }
      this.dynamicGroup.add([btn, label]);
    });

    const cost = Math.ceil(this.selectedQty / 10);
    const canBuy = this.selectedQty <= freeSlots && goldQty >= cost;

    const buyBtn = this.scene.add.rectangle(170, 185, 180, 36, canBuy ? 0x2e7d32 : 0x333333)
      .setStrokeStyle(1, canBuy ? 0x66bb6a : 0x555555);
    const buyLabel = this.scene.add.text(170, 185, `Buy ${this.selectedQty} for ${cost} gold`, {
      fontFamily: 'monospace', fontSize: '13px',
      color: canBuy ? '#ffffff' : '#666666', fontStyle: 'bold',
    }).setOrigin(0.5);

    if (canBuy) {
      buyBtn.setInteractive({ useHandCursor: true });
      buyBtn.on('pointerdown', (pointer, localX, localY, event) => {
        event.stopPropagation();
        this.buy();
      });
    }
    this.dynamicGroup.add([buyBtn, buyLabel]);
  }

  async buy() {
    try {
      const res = await fetch('/api/inventory/buy_food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: TEST_WALLET, quantity: this.selectedQty }),
      });
      const data = await res.json();
      if (!data.success) {
        const message = data.reason === 'not_enough_inventory_space'
          ? 'Not enough inventory space'
          : data.reason === 'insufficient_gold' ? 'Not enough gold' : 'Purchase failed';
        this.scene.showToast(message, '#ff6666');
      } else {
        this.scene.showToast(`Bought ${this.selectedQty} Cooked Chicken`, '#66ff66');
      }
    } catch (err) {
      console.error('Buy food failed:', err);
      this.scene.showToast('Purchase failed', '#ff6666');
    }
    await this.scene.refreshPlayerData();
    this.redraw();
  }

  close() {
    if (!this.isOpen) return;
    this.container.destroy();
    this.container = null;
    this.dynamicGroup = null;
    this.infoText = null;
  }
}

// --- Cosmetics Shop (placeholder) ---

class CosmeticsPanel {
  constructor(scene) {
    this.scene = scene;
    this.container = null;
  }

  get isOpen() {
    return this.container !== null;
  }

  open() {
    if (this.isOpen) return;
    this.container = buildModal(this.scene, 380, 160, 'Cosmetics Shop', () => this.close());

    const text = this.scene.add.text(190, 85, 'Seasonal cosmetics coming soon.\nConnect wallet to purchase $ARENA.', {
      fontFamily: 'monospace', fontSize: '12px', color: '#cccccc',
      align: 'center', lineSpacing: 8,
    }).setOrigin(0.5);
    this.container.add(text);
  }

  close() {
    if (!this.isOpen) return;
    this.container.destroy();
    this.container = null;
  }
}
