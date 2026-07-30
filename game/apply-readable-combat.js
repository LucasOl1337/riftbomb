"use strict";

(() => {
  const { RIFTBOMB_COMBAT, installRiftbombCombatRules } = globalThis;
  if (!RIFTBOMB_COMBAT || typeof installRiftbombCombatRules !== "function") {
    throw new Error("Canonical Riftbomb combat rules were not loaded");
  }

  const formatHp = (player) =>
    `${Math.max(0, Math.ceil(player.health))} / ${Math.ceil(player.maxHealth)} HP`;

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
      document.getElementById("chrome")?.appendChild(hud);

      const style = document.createElement("style");
      style.textContent = `
        .combat-hp-readout{position:fixed!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
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
    p1Node.dataset.critical = String(
      p1.alive && p1.health <= RIFTBOMB_COMBAT.criticalHealth,
    );
    p2Node.dataset.critical = String(
      p2.alive && p2.health <= RIFTBOMB_COMBAT.criticalHealth,
    );
    hud.setAttribute(
      "aria-label",
      `${p1.name}: ${formatHp(p1)}. ${p2.name}: ${formatHp(p2)}.`,
    );
  }

  function install(match) {
    if (!match || match.__combatPresentationInstalled) return;
    installRiftbombCombatRules(match);
    match.__combatPresentationInstalled = true;

    const originalPresentationUpdate = match.presentation.update.bind(match.presentation);
    match.presentation.update = function updateWithExactHp(currentMatch) {
      originalPresentationUpdate(currentMatch);
      installCombatHud(currentMatch);
    };

    match.presentation.update(match);
  }

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
