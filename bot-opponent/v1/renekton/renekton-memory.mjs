/**
 * Renekton tactical memory — only what the pilot remembers about the
 * kit, never Match state. Fury, cooldowns, health and recast windows
 * belong to the Match and arrive through the WorldView.
 */

export function createRenektonMemory() {
  return {
    comboStep: 0,          // where the current combo stands (0 none, 1 E, 2 W, 3 Q)
    pendingDice: false,    // Slice landed; wants the E recast ("Dice")
    exitCell: null,        // planned escape cell after an engage { r, c }
    lastSkill: null,       // { slot, reason, at, effects } last ask; effects = combo snapshot for rollback
    skillHesitation: 0,    // seconds before another skill may be asked
    comboUntil: 0,         // roundAge when the unfinished combo expires
    comboUlted: false,     // Dominus already spent on the current combo
    aimPending: null       // { slot, until, holds } directional cast held for facing
  };
}

export function resetRenektonMemory(memory) {
  memory.comboStep = 0;
  memory.pendingDice = false;
  memory.exitCell = null;
  memory.lastSkill = null;
  memory.skillHesitation = 0;
  memory.comboUntil = 0;
  memory.comboUlted = false;
  memory.aimPending = null;
}
