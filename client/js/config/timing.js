// timing.js — tick system constants per CLAUDE.md Section 9
// TICK_DURATION_MS is the heartbeat of the entire game. All time-based events
// are expressed in ticks, never raw milliseconds in game logic.

const TICK_DURATION_MS = 2400; // 2.4 seconds = 1 Arena tick

const TIMING = {
  // Attack fires every 1 Arena tick = 2.4 seconds (the spec's "4 ticks" refers
  // to OSRS 0.6s ticks: 4 x 0.6s = 2.4s). Not 9600ms.
  ATTACK_INTERVAL_MS: 2400,

  EAT_COOLDOWN_MS: 2400,     // 1 tick between eating
  EAT_ATTACK_DELAY_TICKS: 1, // eating skips the next 1 attack

  BOSS_AOE_INTERVAL_MS: 8 * 2400,   // 19.2 seconds
  BOSS_AOE_WARNING_MS: 2 * 2400,    // 4.8 second warning before AOE fires

  DUMMY_RESET_MS: 2400,      // 1 tick dead time before dummy resets
  LEVEL_UP_POPUP_MS: 2000,   // level up notification shows for 2 seconds
  CHAT_BUBBLE_MS: 3500,      // text above player head lasts 3.5 seconds
  SPAWN_ZONE_TILES: 3,       // 3x3 spawn zone in lobby centre
};

// Camera control tuning — adjust here to change feel without touching GameScene.
// All values drive the Three.js camera rig; the Phaser camera is a static overlay.
const CAMERA = {
  ROTATION_SPEED: 1.8,   // radians/s — left/right arrow orbit
  PITCH_SPEED:    1.2,   // radians/s — up/down arrow pitch

  PITCH_DEFAULT:  1.0,   // radians (~57°) — OSRS-like top-down starting angle
  PITCH_MIN:      0.3,   // ~17° — near side-on
  PITCH_MAX:      1.45,  // ~83° — near overhead (stay below 90° to avoid gimbal)

  DIST_DEFAULT:   16,    // tile units from player to camera
  DIST_MIN:        6,    // scroll in  limit
  DIST_MAX:       30,    // scroll out limit
};
