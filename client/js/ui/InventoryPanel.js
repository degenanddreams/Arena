// InventoryPanel.js — 4x5 inventory grid (20 slots, indices 0-19) per CLAUDE.md
// Section 16. Right-click a slot for Equip / Eat / Examine / Drop depending on
// item type. Pulls fresh data from the server on open.
//
// Also exports shared item-slot drawing helpers used by the bank and merchant.

const ITEM_TYPE_COLORS = {
  armor: 0x5d7a99,
  weapon: 0x995d5d,
  food: 0xcc8800,
  gold: 0xbfa520,
};

function itemFillColor(itemId) {
  const item = ITEMS[itemId];
  return item ? (ITEM_TYPE_COLORS[item.type] || 0x666666) : 0x666666;
}

// Draws one item slot (rect + name + quantity) into a container.
// onClick(row, pointer, event) fires for clicks when row is non-null.
function addItemSlot(scene, container, x, y, size, row, onClick) {
  const rect = scene.add.rectangle(x, y, size, size, row ? itemFillColor(row.item_id) : 0x2a2a2a)
    .setOrigin(0, 0)
    .setStrokeStyle(1, 0x555555);
  container.add(rect);

  if (row) {
    const item = ITEMS[row.item_id];

    // Real icon art if this item has one (icons.js); otherwise the item name
    // centred in the slot as before.
    const icon = (typeof addItemIcon === 'function')
      ? addItemIcon(scene, container, x + size / 2, y + size / 2, size - 6, row.item_id, row.quantity)
      : null;

    if (icon) {
      // Small name strip along the bottom edge so the item is still readable.
      const name = scene.add.text(x + size / 2, y + size - 2, item ? item.name : `#${row.item_id}`, {
        fontFamily: 'monospace', fontSize: '7px', color: '#ffffff', align: 'center',
        stroke: '#000000', strokeThickness: 2, wordWrap: { width: size - 2 },
      }).setOrigin(0.5, 1);
      container.add(name);
    } else {
      const name = scene.add.text(x + size / 2, y + size / 2, item ? item.name : `#${row.item_id}`, {
        fontFamily: 'monospace', fontSize: '8px', color: '#ffffff', align: 'center',
        wordWrap: { width: size - 4 },
      }).setOrigin(0.5);
      container.add(name);
    }

    if (row.quantity > 1) {
      const qty = scene.add.text(x + size - 2, y + size - 2, `x${row.quantity}`, {
        fontFamily: 'monospace', fontSize: '9px', color: '#ffff66',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(1, 1);
      container.add(qty);
    }

    if (onClick) {
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerover', () => rect.setStrokeStyle(2, 0xffffff));
      rect.on('pointerout', () => rect.setStrokeStyle(1, 0x555555));
      rect.on('pointerdown', (pointer, localX, localY, event) => {
        event.stopPropagation();
        onClick(row, pointer, event);
      });
    }
  }

  return rect;
}

const INV_PANEL = {
  COLS: 4,
  ROWS: 5,
  SLOT: 46,
  GAP: 4,
};

class InventoryPanel {
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

  async open() {
    if (this.isOpen) return;

    // Pull fresh inventory data from the server on open
    await this.scene.refreshPlayerData();
    if (this.isOpen) return; // guard against double-open during the fetch

    const { COLS, ROWS, SLOT, GAP } = INV_PANEL;
    const width = COLS * (SLOT + GAP) - GAP + 28;
    const height = ROWS * (SLOT + GAP) - GAP + 50;
    const x = 1280 - width - 16;
    const y = 720 - height - 60;

    const bg = this.scene.add.rectangle(0, 0, width, height, 0x1e1e1e, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x555555)
      .setInteractive();
    bg.on('pointerdown', (pointer, localX, localY, event) => event.stopPropagation());

    const title = this.scene.add.text(width / 2, 10, 'Inventory', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    this.container = this.scene.add.container(x, y, [bg, title]).setDepth(900);
    this.slotsGroup = this.scene.add.container(0, 0);
    this.container.add(this.slotsGroup);

    this.renderSlots();
  }

  renderSlots() {
    if (!this.isOpen) return;
    this.slotsGroup.removeAll(true);

    const { COLS, ROWS, SLOT, GAP } = INV_PANEL;
    const inventory = this.scene.registry.get('inventory') || [];
    const bySlot = new Map(inventory.map((r) => [r.slot, r]));

    for (let i = 0; i < COLS * ROWS; i++) {
      const col = i % COLS;
      const rowIdx = Math.floor(i / COLS);
      const sx = 14 + col * (SLOT + GAP);
      const sy = 36 + rowIdx * (SLOT + GAP);
      const row = bySlot.get(i) || null;

      addItemSlot(this.scene, this.slotsGroup, sx, sy, SLOT, row, (slotRow, pointer) => {
        if (pointer.rightButtonDown()) this.openSlotMenu(slotRow, pointer);
      });
    }
  }

  openSlotMenu(row, pointer) {
    const item = ITEMS[row.item_id];
    if (!item) return;

    const items = [];
    if (item.type === 'armor' || item.type === 'weapon') {
      items.push({
        label: 'Equip', enabled: true, event: 'inventory-equip',
        payload: { item_id: row.item_id, from_slot: row.slot },
      });
    }
    if (item.type === 'food') {
      items.push({ label: 'Eat', enabled: true, event: 'eat-food', payload: {} });
    }
    items.push({
      label: 'Examine', enabled: true, event: 'inventory-examine',
      payload: { item_id: row.item_id },
    });
    if (item.type !== 'gold') {
      items.push({
        label: 'Drop', enabled: true, event: 'inventory-drop',
        payload: { item_id: row.item_id, slot: row.slot, quantity: row.quantity },
      });
    }

    this.scene.openContextMenu({ x: pointer.x, y: pointer.y, title: item.name, items });
  }

  refresh() {
    this.renderSlots();
  }

  close() {
    if (!this.isOpen) return;
    this.container.destroy();
    this.container = null;
    this.slotsGroup = null;
  }
}
