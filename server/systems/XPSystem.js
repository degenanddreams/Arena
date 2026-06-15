// XPSystem.js (server) — CommonJS XP math. Constants 229.71 / 0.084633 are
// locked (CLAUDE.md Section 6 / Hard Rule). Mirrors client/js/config/xpTable.js
// and client/js/systems/XPSystem.js.

function buildXPTable() {
  const table = [0]; // table[N] = total XP needed to reach level N
  for (let level = 1; level <= 100; level++) {
    const xpForThisLevel = Math.round(229.71 * Math.exp(0.084633 * level));
    table.push(table[level - 1] + xpForThisLevel);
  }
  return table;
}

const XP_TABLE = buildXPTable();

function levelFromXP(totalXP) {
  let level = 0;
  while (level < 100 && XP_TABLE[level + 1] <= totalXP) {
    level++;
  }
  return level;
}

function applyTrainingStyle(xpAmount, style) {
  switch (style) {
    case 'attack':
      return { attack: xpAmount, strength: 0, defense: 0 };
    case 'strength':
      return { attack: 0, strength: xpAmount, defense: 0 };
    case 'defense':
      return { attack: 0, strength: 0, defense: xpAmount };
    case 'balanced': {
      // Split equally, round UP per skill
      const perSkill = Math.ceil(xpAmount / 3);
      return { attack: perSkill, strength: perSkill, defense: perSkill };
    }
    default:
      return { attack: 0, strength: xpAmount, defense: 0 }; // default to strength
  }
}

module.exports = { buildXPTable, levelFromXP, applyTrainingStyle, XP_TABLE };
