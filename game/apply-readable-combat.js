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
    if (!match || match.__combatPresentationInstalled) return;
    installRiftbombCombatRules(match);
    match.__combatPresentationInstalled = true;

    const originalPresentationUpdate = match.presentation.update.bind(match.presentation);
    match.presentation.update = function updateWithExactHp(currentMatch) {
      originalPresentationUpdate(currentMatch);
      installCombatHud(currentMatch);
    };

    installIntroRules();
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
