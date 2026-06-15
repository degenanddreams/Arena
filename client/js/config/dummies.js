// dummies.js — dummy tier definitions per CLAUDE.md Section 7
const DUMMIES = [
  { level: 1,   multiplier: 1,  unlockAt: 0,  guaranteedHit: true,  hp: 100 },
  { level: 10,  multiplier: 5,  unlockAt: 10, guaranteedHit: true,  hp: 100 },
  { level: 20,  multiplier: 10, unlockAt: 20, guaranteedHit: false, hp: 100 },
  { level: 30,  multiplier: 15, unlockAt: 30, guaranteedHit: false, hp: 100 },
  { level: 40,  multiplier: 20, unlockAt: 40, guaranteedHit: false, hp: 100 },
  { level: 50,  multiplier: 25, unlockAt: 50, guaranteedHit: false, hp: 100 },
  { level: 60,  multiplier: 30, unlockAt: 60, guaranteedHit: false, hp: 100 },
  { level: 70,  multiplier: 35, unlockAt: 70, guaranteedHit: false, hp: 100 },
  { level: 80,  multiplier: 40, unlockAt: 80, guaranteedHit: false, hp: 100 },
  { level: 85,  multiplier: 45, unlockAt: 85, guaranteedHit: false, hp: 100 },
  { level: 90,  multiplier: 50, unlockAt: 90, guaranteedHit: false, hp: 100 },
  { level: 100, multiplier: 55, unlockAt: 90, guaranteedHit: false, hp: 100 },
];

// A player can attack a dummy if their relevant skill level >= dummy.unlockAt
// Lv100 dummy is accessible from skill level 90+
function canAttackDummy(dummy, playerSkillLevel) {
  return playerSkillLevel >= dummy.unlockAt;
}
