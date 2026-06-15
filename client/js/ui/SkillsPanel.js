// SkillsPanel.js — Skills panel per CLAUDE.md Section 16.
// Three rows (Attack / Strength / Defense): name | level | XP bar | XP numbers.
// Levels are derived from XP in real time via levelFromXP() — never stored.

const SKILLS_PANEL = {
  WIDTH: 330,
  HEIGHT: 200,
  ROW_HEIGHT: 50,
  BAR_WIDTH: 130,
  BAR_HEIGHT: 12,
};

class SkillsPanel {
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

    const { WIDTH, HEIGHT } = SKILLS_PANEL;
    const x = 1280 - WIDTH - 16;
    const y = 720 - HEIGHT - 60; // sits above the panel buttons

    const bg = this.scene.add.rectangle(0, 0, WIDTH, HEIGHT, 0x1e1e1e, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x555555)
      .setInteractive(); // swallow clicks so they don't reach the world

    bg.on('pointerdown', (pointer, localX, localY, event) => event.stopPropagation());

    const title = this.scene.add.text(WIDTH / 2, 14, 'Skills', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    this.container = this.scene.add.container(x, y, [bg, title]).setDepth(900);
    this.rows = {};

    ['attack', 'strength', 'defense'].forEach((skill, i) => {
      this.buildRow(skill, 44 + i * SKILLS_PANEL.ROW_HEIGHT);
    });

    this.refresh();
  }

  buildRow(skill, rowY) {
    const { BAR_WIDTH, BAR_HEIGHT } = SKILLS_PANEL;
    const label = skill.charAt(0).toUpperCase() + skill.slice(1);

    const name = this.scene.add.text(14, rowY, label, {
      fontFamily: 'monospace', fontSize: '13px', color: '#dddddd',
    });
    const level = this.scene.add.text(96, rowY, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffff66', fontStyle: 'bold',
    });
    const barBg = this.scene.add.rectangle(130, rowY + 2, BAR_WIDTH, BAR_HEIGHT, 0x000000)
      .setOrigin(0, 0).setStrokeStyle(1, 0x666666);
    const barFill = this.scene.add.rectangle(131, rowY + 3, 0, BAR_HEIGHT - 2, 0x2e8b2e)
      .setOrigin(0, 0);
    const xpText = this.scene.add.text(14, rowY + 20, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#aaaaaa',
    });

    this.container.add([name, level, barBg, barFill, xpText]);
    this.rows[skill] = { level, barFill, xpText };
  }

  refresh() {
    if (!this.isOpen) return;
    const player = this.scene.registry.get('player');

    for (const skill of ['attack', 'strength', 'defense']) {
      const totalXP = player[`${skill}_xp`];
      const level = levelFromXP(totalXP);
      const row = this.rows[skill];

      row.level.setText(`Lv ${level}`);

      if (level >= 100) {
        row.barFill.width = SKILLS_PANEL.BAR_WIDTH - 2;
        row.xpText.setText(`${totalXP} XP (max level)`);
      } else {
        // Fill = (currentXP - levelThreshold) / (nextLevelThreshold - levelThreshold)
        const xpIntoLevel = totalXP - XP_TABLE[level];
        const xpForLevel = XP_TABLE[level + 1] - XP_TABLE[level];
        row.barFill.width = Math.round((SKILLS_PANEL.BAR_WIDTH - 2) * (xpIntoLevel / xpForLevel));
        row.xpText.setText(`${xpForLevel - xpIntoLevel} xp to next level`);
      }
    }
  }

  close() {
    if (!this.isOpen) return;
    this.container.destroy();
    this.container = null;
    this.rows = null;
  }
}
