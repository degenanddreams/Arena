// XPSystem.js — XP award rules per CLAUDE.md Section 6.
// XP is computed and awarded only on confirmed kill — never per hit.

function applyTrainingStyle(xpAmount, style, currentSkillXP) {
  switch (style) {
    case 'attack':
      return { attack: xpAmount, strength: 0, defense: 0 };
    case 'strength':
      return { attack: 0, strength: xpAmount, defense: 0 };
    case 'defense':
      return { attack: 0, strength: 0, defense: xpAmount };
    case 'balanced':
      // Split equally, round UP per skill
      const perSkill = Math.ceil(xpAmount / 3);
      return { attack: perSkill, strength: perSkill, defense: perSkill };
    default:
      throw new Error(`Unknown training style: ${style}`);
  }
}
