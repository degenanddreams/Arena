// CombatSystem.js — all combat math per CLAUDE.md Section 5.
// Strictly linear and additive. No multiplicative factors anywhere.
// Implemented exactly as specified — never approximate these functions.

function calculateAccuracy(attacker, defender) {
  // attacker and defender are objects with: attack_level, defense_level,
  // total_accuracy_gear_stat, total_defense_gear_stat

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
  // attacker has: strength_level, total_strength_gear_stat, weapon_str_bonus
  // weapon_str_bonus is a direct override (not a stat) — see item table

  const base = 5;
  const skillBonus = Math.floor(attacker.strength_level / 10);
  const gearBonus = Math.floor(attacker.total_strength_gear_stat / 15);

  return base + skillBonus + gearBonus;
}

function computeGearStats(equippedItems) {
  // equippedItems is an array of item records from the items table

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
      // weapon strength is a direct max hit bonus, handled separately
      // (CLAUDE.md Section 4: "applied directly to max hit calculation")
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
