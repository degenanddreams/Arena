// xpTable.js — precomputed cumulative XP thresholds for levels 0-100
// XP formula constants (229.71, 0.084633) are locked — never modify.

function buildXPTable() {
  const table = [0]; // table[N] = total XP needed to reach level N
  for (let level = 1; level <= 100; level++) {
    const xpForThisLevel = Math.round(229.71 * Math.exp(0.084633 * level));
    table.push(table[level - 1] + xpForThisLevel);
  }
  return table;
}

const XP_TABLE = buildXPTable();

// Derive level from cumulative XP
function levelFromXP(totalXP) {
  let level = 0;
  while (level < 100 && XP_TABLE[level + 1] <= totalXP) {
    level++;
  }
  return level;
}

// XP needed for next level up
function xpToNextLevelFromCurrent(totalXP) {
  const level = levelFromXP(totalXP);
  if (level >= 100) return 0;
  return XP_TABLE[level + 1] - totalXP;
}
