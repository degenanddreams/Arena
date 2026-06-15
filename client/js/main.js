// main.js — Phaser game config and scene list (CLAUDE.md Section 21)

const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  backgroundColor: '#1a1a1a',
  parent: 'game',
  dom: { createContainer: true }, // for the editable display-name input
  scene: [BootScene, CharacterCreateScene, GameScene, UIScene, TutorialScene],
  physics: { default: 'arcade' },
};

const game = new Phaser.Game(config);
