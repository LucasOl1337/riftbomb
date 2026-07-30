"use strict";

/**
 * Canonical Riftbomb combat contract shared by browser and server runtimes.
 *
 * This module is deliberately free of DOM, renderer and audio dependencies so
 * the authoritative simulation applies exactly the same health and damage
 * rules as an offline match.
 */
(() => {
  const RIFTBOMB_COMBAT = Object.freeze({
    maxHealth: 100,
    arenaBombDamage: 35,
    criticalHealth: 25,
    legacyScale: 100,
    vladimir: Object.freeze({
      sanguinePoolCost: 8,
      tidesOfBloodCost: 6.5,
    }),
  });

  const toHpPoints = (value) => {
    const numeric = Number(value) || 0;
    if (Number.isInteger(numeric)) return numeric;
    return Math.abs(numeric) <= 1 ? numeric * RIFTBOMB_COMBAT.legacyScale : numeric;
  };

  const formatHp = (player) =>
    `${Math.max(0, Math.ceil(player.health))} / ${Math.ceil(player.maxHealth)} HP`;

  function installRiftbombCombatRules(match) {
    if (!match || match.__combatRulesInstalled) return match;
    match.__combatRulesInstalled = true;

    const originalCreatePlayer = match.createPlayer.bind(match);
    match.createPlayer = function createPlayerWithReadableHp(id) {
      const player = originalCreatePlayer(id);
      player.health = RIFTBOMB_COMBAT.maxHealth;
      player.maxHealth = RIFTBOMB_COMBAT.maxHealth;
      return player;
    };

    for (const player of match.players || []) {
      const ratio = player.maxHealth > 0 ? player.health / player.maxHealth : 1;
      player.maxHealth = RIFTBOMB_COMBAT.maxHealth;
      player.health = Math.round(RIFTBOMB_COMBAT.maxHealth * ratio);
    }

    match.payVladimirHealthCost = function payVladimirHealthCostInHp(player, ability) {
      if (!player?.alive) return 0;
      const config = ability === "sanguinePool"
        ? { cap: RIFTBOMB_COMBAT.vladimir.sanguinePoolCost, ratio: 0.12 }
        : { cap: RIFTBOMB_COMBAT.vladimir.tidesOfBloodCost, ratio: 0.1 };
      const cost = Math.min(config.cap, Math.max(0, player.health) * config.ratio);
      player.health = Math.max(0, player.health - cost);
      return cost;
    };

    const originalHealChampion = match.healChampion.bind(match);
    match.healChampion = function healChampionInHp(player, amount) {
      return originalHealChampion(player, toHpPoints(amount));
    };

    const originalHitSkill = match.hitSkill.bind(match);
    match.hitSkill = function hitSkillInHp(
      player,
      damage,
      source,
      label,
      quiet = false,
      shieldInvulnerability = 0.48,
      rules = {},
    ) {
      const numericDamage = Number(damage) || 0;
      const legacyDamage = !Number.isInteger(numericDamage) && Math.abs(numericDamage) <= 1
        ? numericDamage
        : numericDamage / RIFTBOMB_COMBAT.legacyScale;
      const appliedDamage = toHpPoints(damage);
      const activeZedMark = source?.champion === "zed" && label !== "Death Mark"
        ? this.zedMarks.find(
          (candidate) =>
            candidate.ownerId === source.id &&
            candidate.targetId === player.id &&
            !candidate.detonated,
        )
        : null;
      const storedBefore = activeZedMark?.stored ?? 0;
      const connected = originalHitSkill(
        player,
        appliedDamage,
        source,
        label,
        quiet,
        shieldInvulnerability,
        rules,
      );

      // Death Mark stores fractional legacy damage. Restore that bookkeeping
      // after applying integer HP so marked combos do not jump to the cap.
      if (connected && activeZedMark && !activeZedMark.detonated) {
        activeZedMark.stored = Math.min(0.3, storedBefore + legacyDamage * 0.48);
      }

      if (connected && player.alive && !quiet) {
        this.presentation.announce(`${label} · ${formatHp(player)} remaining`);
        this.presentation.update(this);
      }
      return connected;
    };

    match.hitContestant = function hitContestantWithDamage(player, bomb) {
      const owner = this.players.find((candidate) => candidate.id === bomb.ownerId);
      const label = owner?.id === player.id ? "Own Arena Bomb" : "Arena Bomb";
      return this.hitSkill(
        player,
        RIFTBOMB_COMBAT.arenaBombDamage,
        owner,
        label,
        false,
        0.72,
      );
    };

    return match;
  }

  globalThis.RIFTBOMB_COMBAT = RIFTBOMB_COMBAT;
  globalThis.installRiftbombCombatRules = installRiftbombCombatRules;
})();
