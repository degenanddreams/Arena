// main.js — Phaser game config and scene list (CLAUDE.md Section 21)

const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  // No backgroundColor — canvas is transparent so the Three.js ground canvas
  // (z-index 0, behind) shows through wherever Phaser draws nothing.
  // The dark page background (#1a1a1a on body) fills any remaining gaps.
  transparent: true,
  parent: 'game',
  dom: { createContainer: true }, // for the editable display-name input
  scene: [BootScene, CharacterCreateScene, GameScene, UIScene, TutorialScene],
  physics: { default: 'arcade' },
};

const game = new Phaser.Game(config);
