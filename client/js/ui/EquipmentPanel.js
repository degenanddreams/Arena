// EquipmentPanel.js — 5 equipment slots in a cross/silhouette layout per
// CLAUDE.md Section 16: helmet top, shield/chestplate/weapon middle row,
// platelegs bottom. Click an equipped slot to unequip it back to inventory.
// Below the slots: computed combat stats (Accuracy %, Max Hit, Defense total)
// derived client-side via CombatSystem with the equipped item records.

const EQUIP_PANEL = {
  WIDTH: 330,
  HEIGHT: 320,
  BOX_W: 96,
  BOX_H: 44,
};

const EQUIP_SLOT_LAYOUT = [
  { slotType: 'helmet',     idColumn: 'helmet_id',     x: 165, y: 64 },
  { slotType: 'shield',     idColumn: 'shield_id',     x: 62,  y: 120 },
  { slotType: 'chestplate', idColumn: 'chestplate_id', x: 165, y: 120 },
  { slotType: 'weapon',     idColumn: 'weapon_id',     x: 268, y: 120 },
  { slotType: 'platelegs',  idColumn: 'platelegs_id',  x: 165, y: 176 },
];

class EquipmentPanel {
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

    const { WIDTH, HEIGHT } = EQUIP_PANEL;
    const x = 1280 - WIDTH - 16;
    const y = 720 - HEIGHT - 60;

    const bg = this.scene.add.rectangle(0, 0, WIDTH, HEIGHT, 0x1e1e1e, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x555555)
      .setInteractive();
    bg.on('pointerdown', (pointer, localX, localY, event) => event.stopPropagation());

    const title = this.scene.add.text(WIDTH / 2, 12, 'Equipment', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    this.container = this.scene.add.container(x, y, [bg, title]).setDepth(900);
    this.dynamicGroup = this.scene.add.container(0, 0);
    this.container.add(this.dynamicGroup);

    this.refresh();
  }

  refresh() {
    if (!this.isOpen) return;
    this.dynamicGroup.removeAll(true);

    const equipped = this.scene.registry.get('equipped') || {};
    const { BOX_W, BOX_H } = EQUIP_PANEL;

    for (const slot of EQUIP_SLOT_LAYOUT) {
      const itemId = equipped[slot.idColumn];
      const item = itemId ? ITEMS[itemId] : null;
      const label = slot.slotType.charAt(0).toUpperCase() + slot.slotType.slice(1);

      const box = this.scene.add.rectangle(slot.x, slot.y, BOX_W, BOX_H,
        item ? itemFillColor(itemId) : 0x2a2a2a)
        .setStrokeStyle(1, 0x555555);
      const slotLabel = this.scene.add.text(slot.x, slot.y - BOX_H / 2 - 2, label, {
        fontFamily: 'monospace', fontSize: '9px', color: '#888888',
      }).setOrigin(0.5, 1);
      const itemLabel = this.scene.add.text(slot.x, slot.y, item ? item.name : '(empty)', {
        fontFamily: 'monospace', fontSize: '9px',
        color: item ? '#ffffff' : '#555555',
        align: 'center', wordWrap: { width: BOX_W - 6 },
      }).setOrigin(0.5);

      if (item) {
        box.setInteractive({ useHandCursor: true });
        box.on('pointerover', () => box.setStrokeStyle(2, 0xffffff));
        box.on('pointerout', () => box.setStrokeStyle(1, 0x555555));
        box.on('pointerdown', (pointer, localX, localY, event) => {
          event.stopPropagation();
          this.scene.doUnequip(slot.slotType);
        });
      }

      this.dynamicGroup.add([box, slotLabel, itemLabel]);
    }

    this.renderStats();
  }

  renderStats() {
    const player = this.scene.registry.get('player');
    const equipped = this.scene.registry.get('equipped') || {};

    const slotIds = EQUIP_SLOT_LAYOUT.map((s) => equipped[s.idColumn]);
    const equippedItems = slotIds.filter(Boolean).map((id) => ITEMS[id]).filter(Boolean);
    const gear = computeGearStats(equippedItems);
    const weapon = equipped.weapon_id ? ITEMS[equipped.weapon_id] : null;

    const attacker = {
      attack_level: levelFromXP(player.attack_xp),
      strength_level: levelFromXP(player.strength_xp),
      total_accuracy_gear_stat: gear.totalAccuracy,
      total_strength_gear_stat: gear.totalStrength,
    };

    // Accuracy shown vs an undefended target (dummies have zero defense)
    const accuracy = calculateAccuracy(attacker, { defense_level: 0, total_defense_gear_stat: 0 });
    // Weapon str bonus is applied directly to max hit (Section 4 item table note)
    const maxHit = calculateMaxHit(attacker) + (weapon ? weapon.strength_stat : 0);

    const statsText = [
      `Accuracy:      ${accuracy.toFixed(1)}%`,
      `Max Hit:       ${maxHit}`,
      `Defense bonus: ${gear.totalDefense}`,
    ].join('\n');

    const stats = this.scene.add.text(EQUIP_PANEL.WIDTH / 2, 222, statsText, {
      fontFamily: 'monospace', fontSize: '13px', color: '#dddddd', lineSpacing: 8,
    }).setOrigin(0.5, 0);

    this.dynamicGroup.add(stats);
  }

  close() {
    if (!this.isOpen) return;
    this.container.destroy();
    this.container = null;
    this.dynamicGroup = null;
  }
}
