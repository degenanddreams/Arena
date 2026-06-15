// CombatSystem.js (server) — CommonJS copy of client/js/systems/CombatSystem.js.
// Byte-for-byte identical math per CLAUDE.md Section 5 and Hard Rule #5
// (CombatSystem must work in both client and server contexts). Do not diverge
// from the client version — same formula, constants, and clamps.

function calculateAccuracy(attacker, defender) {
  const base = 40;
  const attackBonus = attacker.attack_level * 0.25;
  const gearAccBonus = attacker.total_accuracy_gear_stat / 10;
  const defLevelPenalty = defender.defense_level * 0.1;
  const defGearPenalty = defender.total_defense_gear_stat / 30;

  const accuracy = base + attackBonus + gearAccBonus - defLevelPenalty - defGearPenalty;

  // Clamp: minimum 25%, maximum 80%
  return Math.max(25, Math.min(80, accuracy));
}

function calculateMaxHit(attacker) {
  const base = 5;
  const skillBonus = Math.floor(attacker.strength_level / 10);
  const gearBonus = Math.floor(attacker.total_strength_gear_stat / 15);

  return base + skillBonus + gearBonus;
}

function computeGearStats(equippedItems) {
  let totalAccuracy = 0;
  let totalStrength = 0;
  let totalDefense = 0;

  for (const item of equippedItems) {
    if (item.type === 'armor') {
      totalAccuracy += item.accuracy_stat;
      totalStrength += item.strength_stat;
      totalDefense += item.defense_stat;
    }
    if (item.type === 'weapon') {
      totalAccuracy += item.accuracy_stat;
    }
  }

  return { totalAccuracy, totalStrength, totalDefense };
}

function rollAttack(accuracy, maxHit, guaranteedHit = false) {
  if (guaranteedHit) {
    // Lv1 and Lv10 dummies only: always hits, rolls 1 to maxHit (never 0)
    const damage = Math.floor(Math.random() * maxHit) + 1;
    return { hit: true, damage };
  }

  const hits = Math.random() < (accuracy / 100);
  if (!hits) return { hit: false, damage: 0 };

  const damage = Math.floor(Math.random() * (maxHit + 1)); // 0 to maxHit inclusive
  return { hit: true, damage };
}

module.exports = { calculateAccuracy, calculateMaxHit, computeGearStats, rollAttack };
