// xp.js — server-side XP table (shared by player and combat routes)
// XP formula per CLAUDE.md Section 6 — constants 229.71 / 0.084633 are locked.

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

module.exports = { XP_TABLE, levelFromXP };
