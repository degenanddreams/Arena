// TutorialScene.js — 16-box onboarding overlay (CLAUDE.md Section 15).
// Launched in parallel with GameScene when tutorial_complete = 0. Does not
// block movement or gameplay. On Done: PUT tutorial_complete = 1, then shut
// down. Never shows again once complete.

const TUTORIAL_BOXES = [
  {
    title: 'Welcome to Arena',
    body: 'A free-to-play top-down RPG. Train your skills on dummies, take on the\ngroup boss for gear, and (soon) wager against other players. Let\'s get\nyou started.',
  },
  {
    title: 'Movement',
    body: 'Left-click any tile to walk there. Scroll the mouse wheel to zoom in and\nout. Use the left/right arrow keys to rotate the camera.',
  },
  {
    title: 'The Lobby',
    body: 'This central hub has the Bank, the Food Shop, the Trading Merchant, and a\nCosmetics shop (coming soon). You spawn in the 3x3 zone at its centre.',
  },
  {
    title: 'Skills',
    body: 'Three skills drive combat: Attack raises your accuracy, Strength raises your\nmax hit, and Defense reduces an opponent\'s accuracy against you.',
  },
  {
    title: 'The Training Grounds',
    body: 'Head north through the lobby doors to reach the dummies. Click a dummy to\nstart attacking it and earn XP.',
  },
  {
    title: 'Training Styles',
    body: 'Open the Combat panel (bottom-right) and choose Attack, Strength, Defense,\nor Balanced before fighting. That decides which skill your XP goes to.',
  },
  {
    title: 'XP and Leveling',
    body: 'XP is awarded only when you land the killing blow. Leveling up unlocks\nhigher-tier dummies and lets you equip better gear.',
  },
  {
    title: 'Gear',
    body: 'Armour needs a Defense level; weapons need an Attack level. Open the\nInventory panel and right-click an item to equip it.',
  },
  {
    title: 'Food and Healing',
    body: 'Buy Cooked Chicken at the Food Shop (1 gold = 10). Press F or right-click\nit -> Eat to heal 5 HP. Eating delays your next attack by one tick.',
  },
  {
    title: 'HP and Death',
    body: 'Your HP persists everywhere you go. If it reaches 0 you respawn back at the\nlobby with full HP.',
  },
  {
    title: 'The Bank',
    body: 'Click the Bank NPC to deposit and withdraw items. Gold and food stack in\nthe bank to save space; gear takes one slot each.',
  },
  {
    title: 'Gold and Merchants',
    body: 'Sell gear to the Trading Merchant — each piece is worth its tier in gold.\nSpend that gold at the Food Shop to keep yourself stocked.',
  },
  {
    title: 'The Boss',
    body: 'The Minotaur waits in the cave at the far north of the Training Grounds.\n2000 HP, a stomp AOE every ~19 seconds — dodge the red ring! It respawns\nevery 2 minutes and drops T1/T2 gear.',
  },
  {
    title: 'The Wager System',
    body: 'Player-vs-player wagering is coming in V2. Connect your wallet when it\'s\nready to put your gear on the line.',
  },
  {
    title: '$ARENA Token',
    body: 'Seasonal cosmetic sets are on the way — check the Cosmetics shop in the\nlobby. More details coming soon.',
  },
  {
    title: 'Player Interface',
    body: 'Five buttons sit bottom-right: Inventory, Skills, Combat style, Equipment,\nand Player Info (change your display name there). That\'s everything —\ngood luck in the Arena!',
  },
];

const TUT_PANEL = { WIDTH: 560, HEIGHT: 200 };

class TutorialScene extends Phaser.Scene {
  constructor() {
    super('TutorialScene');
  }

  create() {
    this.index = 0;
    this.buildPanel();
    this.showBox(0);
  }

  buildPanel() {
    const { WIDTH, HEIGHT } = TUT_PANEL;
    const x = (1280 - WIDTH) / 2;
    const y = 90; // near the top, leaving the world visible/playable below

    // Dark, subtle panel — deliberately not the gold sparkle of level-up popups
    const bg = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x0d0d0d, 0.88)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x666666)
      .setInteractive(); // swallow clicks so they don't fall through to the world
    bg.on('pointerdown', (pointer, localX, localY, event) => event.stopPropagation());

    this.titleText = this.add.text(24, 18, '', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffd700', fontStyle: 'bold',
    });
    this.bodyText = this.add.text(24, 56, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#dddddd', lineSpacing: 6,
    });
    this.progressText = this.add.text(24, HEIGHT - 28, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#888888',
    });

    // Next / Done button
    this.nextBg = this.add.rectangle(WIDTH - 24, HEIGHT - 24, 110, 34, 0x2a2a2a)
      .setOrigin(1, 0.5).setStrokeStyle(1, 0x888888).setInteractive({ useHandCursor: true });
    this.nextLabel = this.add.text(WIDTH - 24 - 55, HEIGHT - 24, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.nextBg.on('pointerdown', (pointer, localX, localY, event) => {
      event.stopPropagation();
      this.advance();
    });

    this.panel = this.add.container(x, y, [
      bg, this.titleText, this.bodyText, this.progressText, this.nextBg, this.nextLabel,
    ]).setDepth(1300);
  }

  showBox(i) {
    const box = TUTORIAL_BOXES[i];
    this.titleText.setText(box.title);
    this.bodyText.setText(box.body);
    this.progressText.setText(`${i + 1} / ${TUTORIAL_BOXES.length}`);
    this.nextLabel.setText(i === TUTORIAL_BOXES.length - 1 ? 'Done' : 'Next ›');
  }

  advance() {
    if (this.index >= TUTORIAL_BOXES.length - 1) {
      this.finish();
      return;
    }
    this.index += 1;
    this.showBox(this.index);
  }

  async finish() {
    // Mark complete so it never triggers again
    const player = this.registry.get('player');
    if (player) {
      player.tutorial_complete = 1;
      this.registry.set('player', { ...player });
    }

    try {
      await fetch(`/api/player/${TEST_WALLET}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorial_complete: 1 }),
      });
    } catch (err) {
      console.error('Tutorial completion save failed:', err);
    }

    this.scene.stop();
  }
}
