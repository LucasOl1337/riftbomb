"use strict";

/**
 * Canonical Riftbomb combat contract.
 *
 * The original prototype encoded full health as 1 and damage/healing as decimal
 * fractions. This compatibility layer establishes a public 0–100 HP scale while
 * preserving the effective champion balance. New combat code should pass integer
 * HP values directly; legacy values in the 0–1 range are converted at the combat
 * boundary until each champion kit is migrated.
 *
 * See docs/combat-system.md before changing these values.
 */
const RIFTBOMB_COMBAT = Object.freeze({
  maxHealth: 100,
  arenaBombDamage: 35,
  criticalHealth: 25,
  legacyScale: 100,
  vladimir: Object.freeze({
    sanguinePoolCost: 8,
    tidesOfBloodCost: 6.5
  })
});

globalThis.RIFTBOMB_COMBAT = RIFTBOMB_COMBAT;

(() => {
  const toHpPoints = (value) => {
    const numeric = Number(value) || 0;
    return Math.abs(numeric) <= 1 ? numeric * RIFTBOMB_COMBAT.legacyScale : numeric;
  };

  const formatHp = (player) => `${Math.max(0, Math.ceil(player.health))} / ${Math.ceil(player.maxHealth)} HP`;

  function installCombatHud(match) {
    let hud = document.getElementById("combat-hp-readout");
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "combat-hp-readout";
      hud.className = "combat-hp-readout";
      hud.setAttribute("aria-live", "polite");
      hud.innerHTML = `
        <span data-combat-hp="p1"></span>
        <span data-combat-hp="p2"></span>
      `;
      document.querySelector(".player-card")?.appendChild(hud);

      const style = document.createElement("style");
      style.textContent = `
        .combat-hp-readout{display:grid;grid-template-columns:1fr 1fr;gap:.35rem .75rem;width:100%;margin-top:.4rem;font:700 clamp(.66rem,1.2vw,.82rem)/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.045em;text-transform:uppercase}
        .combat-hp-readout span{padding:.3rem .45rem;border:1px solid rgb(255 255 255 / 18%);background:rgb(0 0 0 / 34%);white-space:nowrap}
        .combat-hp-readout span:last-child{text-align:right}
        .combat-hp-readout span[data-critical="true"]{animation:combat-critical 1s steps(2,end) infinite}
        .combat-rule-card{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:.45rem .9rem;margin-top:.65rem;padding:.55rem .7rem;border:1px solid rgb(255 255 255 / 16%);background:rgb(0 0 0 / 28%);font:700 .72rem/1.35 ui-monospace,SFMono-Regular,Consolas,monospace;text-transform:uppercase;letter-spacing:.04em}
        @keyframes combat-critical{50%{opacity:.48}}
        @media(max-width:720px){.combat-hp-readout{grid-template-columns:1fr}.combat-hp-readout span:last-child{text-align:left}}
      `;
      document.head.appendChild(style);
    }

    const p1 = match.players?.[0];
    const p2 = match.players?.[1];
    if (!p1 || !p2) return;
    const p1Node = hud.querySelector('[data-combat-hp="p1"]');
    const p2Node = hud.querySelector('[data-combat-hp="p2"]');
    p1Node.textContent = `P1 ${p1.name} · ${formatHp(p1)}`;
    p2Node.textContent = `P2 ${p2.name} · ${formatHp(p2)}`;
    p1Node.dataset.critical = String(p1.alive && p1.health <= RIFTBOMB_COMBAT.criticalHealth);
    p2Node.dataset.critical = String(p2.alive && p2.health <= RIFTBOMB_COMBAT.criticalHealth);
    hud.setAttribute("aria-label", `${p1.name}: ${formatHp(p1)}. ${p2.name}: ${formatHp(p2)}.`);
  }

  function installIntroRules() {
    if (document.getElementById("combat-rule-card")) return;
    const card = document.createElement("div");
    card.id = "combat-rule-card";
    card.className = "combat-rule-card";
    card.innerHTML = `
      <span>100 HP each</span>
      <span>Arena bomb: ${RIFTBOMB_COMBAT.arenaBombDamage} damage</span>
      <span>0 HP: eliminated</span>
      <span>Shield: blocks one complete hit</span>
    `;
    document.querySelector(".intro-notes")?.after(card);
  }

  function install(match) {
    if (!match || match.__combatHpInstalled) return;
    match.__combatHpInstalled = true;

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

    const originalHealChampion = match.healChampion.bind(match);
    match.healChampion = function healChampionInHp(player, amount) {
      return originalHealChampion(player, toHpPoints(amount));
    };

    const originalHitSkill = match.hitSkill.bind(match);
    match.hitSkill = function hitSkillInHp(player, damage, source, label, quiet = false) {
      const legacyDamage = Math.abs(Number(damage) || 0) <= 1 ? Number(damage) || 0 : (Number(damage) || 0) / RIFTBOMB_COMBAT.legacyScale;
      const appliedDamage = toHpPoints(damage);
      const activeZedMark = source?.champion === "zed" && label !== "Death Mark"
        ? this.zedMarks.find((candidate) => candidate.ownerId === source.id && candidate.targetId === player.id && !candidate.detonated)
        : null;
      const storedBefore = activeZedMark?.stored ?? 0;
      const connected = originalHitSkill(player, appliedDamage, source, label, quiet);

      // The legacy implementation stores a fraction of Zed's damage for Death Mark.
      // Restore that fractional bookkeeping after the integer HP hit is applied so
      // the migration does not silently increase every marked combo to the cap.
      if (connected && activeZedMark && !activeZedMark.detonated) {
        activeZedMark.stored = Math.min(0.3, storedBefore + legacyDamage * 0.48);
      }

      if (connected && player.alive && !quiet) {
        this.presentation.announce(`${label} · ${formatHp(player)} remaining`);
        this.presentation.update(this);
      }
      return connected;
    };

    // Arena explosions now participate in the same HP system as champion skills.
    // A shield still consumes one charge and blocks the complete explosion hit.
    match.hitContestant = function hitContestantWithDamage(player, bomb) {
      const owner = this.players.find((candidate) => candidate.id === bomb.ownerId);
      const label = owner?.id === player.id ? "Own Arena Bomb" : "Arena Bomb";
      this.hitSkill(player, RIFTBOMB_COMBAT.arenaBombDamage, owner, label);
    };

    // Convert Vladimir's direct legacy fractional health costs to readable HP.
    const originalVladimirW = match.castVladimirW?.bind(match);
    if (originalVladimirW) {
      match.castVladimirW = function castVladimirWWithHpCost(player) {
        const before = player?.health ?? 0;
        const cast = originalVladimirW(player);
        if (cast && player?.alive) {
          const cost = Math.min(RIFTBOMB_COMBAT.vladimir.sanguinePoolCost, before * 0.12);
          player.health = Math.max(6, before - cost);
          this.presentation.update(this);
        }
        return cast;
      };
    }

    const originalVladimirE = match.castVladimirE?.bind(match);
    if (originalVladimirE) {
      match.castVladimirE = function castVladimirEWithHpCost(player) {
        const before = player?.health ?? 0;
        const cast = originalVladimirE(player);
        if (cast && player?.alive) {
          const cost = Math.min(RIFTBOMB_COMBAT.vladimir.tidesOfBloodCost, before * 0.1);
          player.health = Math.max(5, before - cost);
          this.presentation.update(this);
        }
        return cast;
      };
    }

    const originalPresentationUpdate = match.presentation.update.bind(match.presentation);
    match.presentation.update = function updateWithExactHp(currentMatch) {
      originalPresentationUpdate(currentMatch);
      installCombatHud(currentMatch);
    };

    installIntroRules();
    match.presentation.update(match);
  }

  // This file is loaded before the Game class and boot script. A zero-delay poll
  // installs the layer after boot creates the shared lexical `game` instance and
  // before the first animation frame is rendered.
  const installer = setInterval(() => {
    try {
      if (typeof game === "undefined" || !game) return;
      clearInterval(installer);
      install(game);
    } catch {
      // The later script's lexical binding may still be in its initialization gap.
    }
  }, 0);
})();
