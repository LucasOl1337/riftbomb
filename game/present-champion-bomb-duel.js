"use strict";

    class BrowserMatchPresentation {
      selectChampion(selectedChampion, playerId = 1) {
        const presentations = {
          katarina: {
            name: "Katarina", alt: "Katarina, a Lâmina Sinistra", portrait: KATARINA_PORTRAIT,
            passive: KATARINA_ASSETS.passive,
            art: [KATARINA_ASSETS.q, KATARINA_ASSETS.w, KATARINA_ASSETS.e, KATARINA_ASSETS.r],
            abilities: ["Bouncing Blade", "Preparation", "Shunpo", "Death Lotus"]
          },
          zed: {
            name: "Zed", alt: "Zed, o Mestre das Sombras", portrait: ZED_ASSETS.portrait,
            passive: ZED_ASSETS.passive,
            art: [ZED_ASSETS.q, ZED_ASSETS.w, ZED_ASSETS.e, ZED_ASSETS.r],
            abilities: ["Razor Shuriken", "Living Shadow", "Shadow Slash", "Death Mark"]
          },
          renekton: {
            name: "Renekton", alt: "Renekton, o Carniceiro das Areias", portrait: RENEKTON_ASSETS.portrait,
            passive: RENEKTON_ASSETS.passive,
            art: [RENEKTON_ASSETS.q, RENEKTON_ASSETS.w, RENEKTON_ASSETS.e, RENEKTON_ASSETS.r],
            abilities: ["Cull the Meek", "Ruthless Predator", "Slice and Dice", "Dominus"]
          },
          vladimir: {
            name: "Vladimir", alt: "Vladimir, o Sanguinário Escarlate", portrait: VLADIMIR_ASSETS.portrait,
            passive: VLADIMIR_ASSETS.passive,
            art: [VLADIMIR_ASSETS.q, VLADIMIR_ASSETS.w, VLADIMIR_ASSETS.e, VLADIMIR_ASSETS.r],
            abilities: ["Transfusion", "Sanguine Pool", "Tides of Blood", "Hemoplague"]
          },
          gangplank: {
            name: "Gangplank", alt: "Gangplank, o Flagelo das Águas Salgadas", portrait: GANGPLANK_ASSETS.portrait,
            passive: GANGPLANK_ASSETS.passive,
            art: [GANGPLANK_ASSETS.q, GANGPLANK_ASSETS.w, GANGPLANK_ASSETS.e, GANGPLANK_ASSETS.r],
            abilities: ["Parrrley", "Remove Scurvy", "Powder Keg", "Cannon Barrage"]
          }
        };
        const presentation = presentations[selectedChampion] || presentations.katarina;
        const championName = presentation.name;
        const matchTarget = this.matchTarget || 3;
        document.documentElement.dataset.champion = selectedChampion;
        UI.championChoices.forEach((button) =>
          button.setAttribute("aria-pressed", String(button.dataset.champion === selectedChampion))
        );
        UI.championPortrait.src = presentation.portrait;
        UI.championPortrait.alt = presentation.alt;
        UI.playerName.textContent = `P${playerId} / ${championName.toUpperCase()}`;
        UI.matchSubtitle.textContent = `${championName} ready · first to ${matchTarget}`;
        UI.abilityDock.setAttribute("aria-label", `${championName} abilities`);
        UI.start.textContent = `>>> DEPLOY P${playerId} ${championName.toUpperCase()}`;

        const icons = [UI.bombIcon, UI.dashIcon, UI.mineIcon, UI.ultIcon];
        const art = presentation.art;
        icons.forEach((icon, index) => {
          icon.classList.toggle("has-art", true);
          icon.style.backgroundImage = `url(${art[index]})`;
          icon.textContent = "";
        });
        for (const [key, config] of Object.entries(presentations)) {
          if (!config.passive) continue;
          const glyph = UI.championChoices
            .find((button) => button.dataset.champion === key)
            ?.querySelector(".champion-glyph");
          if (!glyph) continue;
          glyph.style.backgroundImage = `linear-gradient(rgb(15 2 8 / 8%), rgb(15 2 8 / 46%)), url(${config.passive})`;
          glyph.textContent = "";
        }

        UI.bombKey.textContent = "Q";
        UI.dashKey.textContent = "F";
        UI.mineKey.textContent = "E";
        UI.ultKey.textContent = "R";
        UI.bombAction.setAttribute("aria-label", `${presentation.abilities[0]}. Q key.`);
        UI.dashAction.setAttribute("aria-label", `${presentation.abilities[1]}. F key.`);
        UI.mineAction.setAttribute("aria-label", presentation.abilities[2]);
        UI.ultAction.setAttribute("aria-label", presentation.abilities[3]);
        UI.mineAction.classList.remove("stat");
        UI.ultAction.classList.remove("stat");
        this.paintTouchAbility(UI.touchQ, UI.touchQArt, presentation.abilities[0], art[0], "Q");
        this.paintTouchAbility(UI.touchDash, UI.touchDashArt, presentation.abilities[1], art[1], "F");
        this.paintTouchAbility(UI.touchMine, UI.touchMineArt, presentation.abilities[2], art[2], "E");
        this.paintTouchAbility(UI.touchUlt, UI.touchUltArt, presentation.abilities[3], art[3], "R");
        if (UI.touchBomb) UI.touchBomb.setAttribute("aria-label", "Place arena bomb");
      }

      paintTouchAbility(button, artNode, abilityName, artUrl, glyph) {
        if (!button) return;
        button.hidden = false;
        button.setAttribute("aria-label", abilityName);
        const glyphNode = button.querySelector(".touch-btn__glyph");
        if (glyphNode) glyphNode.textContent = glyph;
        const hasArt = Boolean(artUrl)
          && !String(artUrl).includes("[image content")
          && String(artUrl).length > 24;
        button.classList.toggle("has-art", hasArt);
        if (artNode) {
          if (hasArt) artNode.style.backgroundImage = `url(${artUrl})`;
          else artNode.style.removeProperty("background-image");
        }
      }

      syncTouchActionState(button, sourceButton) {
        if (!button || !sourceButton) return;
        button.disabled = sourceButton.disabled;
        button.classList.toggle("is-locked", sourceButton.classList.contains("is-locked"));
      }

      updateSecondaryHud(match, player) {
        if (!UI.playerTwoHud || !player) return;
        const localMultiplayer = document.body.classList.contains("is-local-multiplayer");
        UI.playerTwoHud.hidden = !localMultiplayer;
        if (!localMultiplayer) return;
        const health = clamp(player.health / player.maxHealth, 0, 1);
        UI.playerTwoName.textContent = `P2 · ${player.name.toUpperCase()}`;
        UI.playerTwoHealth.textContent = player.alive ? `${Math.ceil(health * 100)}%` : "ELIMINATED";
        UI.playerTwoHealthFill.style.transform = `scaleX(${health})`;
        const cooldowns = [player.qCooldown, player.wCooldown, player.eCooldown, player.rCooldown];
        const unlocked = player.skillsUnlocked || [true, true, true, true];
        UI.playerTwoSkillButtons.forEach((button, slot) => {
          const name = match.skillSlotLabel(player, slot);
          button.disabled = !player.alive || match.roundLocked || !unlocked[slot];
          button.dataset.lock = unlocked[slot] ? "open" : "crate";
          const label = button.querySelector("span");
          if (label) label.textContent = !unlocked[slot]
            ? `${name} · locked`
            : cooldowns[slot] > 0
              ? `${name} · ${cooldowns[slot].toFixed(1)}s`
              : `${name} · ready`;
        });
        const bombsAvailable = Math.max(0, player.maxBombs - match.activeBombsFor(player));
        UI.playerTwoBombButton.disabled = !player.alive || match.roundLocked || bombsAvailable <= 0;
        const bombLabel = UI.playerTwoBombButton.querySelector("span");
        if (bombLabel) bombLabel.textContent = `Bomb · ${bombsAvailable}`;
      }

      prepareRound() {
        UI.bossPanel.hidden = true;
      }

      announce(text) {
        UI.eventKicker.textContent = text;
        UI.eventKicker.classList.remove("is-live");
        void UI.eventKicker.offsetWidth;
        UI.eventKicker.classList.add("is-live");
        UI.live.textContent = text;
      }

      update(match) {
        this.matchTarget = match.matchTarget || 3;
        const blue = match.players[0];
        const red = match.players[1];
        const localPlayerId = match.localPlayerId === 2 ? 2 : 1;
        const p1 = localPlayerId === 2 ? red : blue;
        const p2 = localPlayerId === 2 ? blue : red;
        if (!p1 || !p2) return;
        this.updateSecondaryHud(match, red);
        UI.playerName.textContent = `P${localPlayerId} / ${p1.name.toUpperCase()}`;
        const crates = match.grid.reduce((sum, row) => sum + row.filter((tile) => tile === 2).length, 0);
        UI.score.textContent = String(crates).padStart(3, "0");
        UI.waveNumber.textContent = String(match.round);
        UI.enemyCount.textContent = String(Math.ceil(match.roundTime)).padStart(2, "0");
        const arenaLabel = match.arenaTemplate ? match.arenaTemplate().label : "Arena";
        UI.matchSubtitle.textContent = `${blue.name} versus ${red.name} · ${arenaLabel} · first to ${match.matchTarget}`;
        UI.matchScoreline.textContent = `${blue.name} · ${match.roundWins[0]} — ${match.roundWins[1]} · ${red.name}`;
        UI.waveLabel.textContent = match.roundLocked
          ? (match.pendingMatchWinner ? "Match point converted" : `Round ${String(match.round).padStart(2, "0")} complete`)
          : `Round ${String(match.round).padStart(2, "0")} · ${match.p2Human ? "Player 2 online/local" : "CPU controls Red"}`;
        UI.playerCard.dataset.worldX = p1.x.toFixed(3);
        UI.playerCard.dataset.worldZ = p1.z.toFixed(3);
        UI.playerCard.dataset.passableBombs = String(
          match.bombs.filter((bomb) => !bomb.exploded && bomb.passOwners?.has(p1.id)).length
        );
        UI.playerCard.dataset.redWorldX = p2.x.toFixed(3);
        UI.playerCard.dataset.redWorldZ = p2.z.toFixed(3);
        UI.playerCard.dataset.redHealth = p2.health.toFixed(3);
        UI.playerCard.dataset.blueBombs = String(match.activeBombsFor(p1));
        UI.playerCard.dataset.redBombs = String(match.activeBombsFor(p2));
        UI.playerCard.dataset.round = String(match.round);
        const healthRatio = clamp(p1.health / p1.maxHealth, 0, 1);
        UI.hearts.setAttribute("aria-label", p1.alive
          ? `${p1.name} has ${Math.ceil(healthRatio * 100)} percent health`
          : `${p1.name} is eliminated`);
        $$("#hearts .heart").forEach((heart, index) =>
          heart.classList.toggle("is-empty", !p1.alive || healthRatio <= index / 5)
        );
        UI.healthFill.style.transform = `scaleX(${healthRatio})`;
        UI.combo.classList.add("is-live");
        UI.comboLabel.textContent = `RIVAL · ${p2.name.toUpperCase()} · ${match.p2Human ? "HUMAN" : "CPU"}`;
        const available = Math.max(0, p1.maxBombs - match.activeBombsFor(p1));
        const locked = !p1.alive || match.roundLocked || p1.ultChannel > 0 || p1.vladimirPool > 0;
        const unlocked = p1.skillsUnlocked || [true, true, true, true];
        const skillLabel = (name, value, isUnlocked) => {
          // LOCK badge is visual; keep name short so the dock stays readable
          if (!isUnlocked) return name;
          return value > 0 ? `${name} · ${value.toFixed(1)}s` : `${name} · ready`;
        };
        const gateSkill = (button, slot, cooldownBlocked) => {
          const isUnlocked = Boolean(unlocked[slot]);
          button.classList.toggle("is-locked", !isUnlocked);
          button.disabled = locked || !isUnlocked || cooldownBlocked;
          button.setAttribute("data-lock", isUnlocked ? "open" : "crate");
          if (!isUnlocked) {
            button.setAttribute("aria-disabled", "true");
            button.title = "Break Hextech crates — skill drops unlock this slot";
          } else {
            button.removeAttribute("title");
          }
        };
        UI.arenaBombLabel.textContent = available > 0 ? `Arena bomb · ${available}` : "Arena bomb · planted";
        UI.arenaBombFill.style.transform = `scaleX(${available > 0 ? 1 : 0.18})`;
        UI.arenaBombAction.disabled = locked || available <= 0;
        UI.arenaBombAction.classList.remove("is-locked");
        if (p1.champion === "katarina") {
          UI.resourceFill.style.transform = "scaleX(0.82)";
          UI.bombLabel.textContent = skillLabel("Bouncing Blade", p1.qCooldown, unlocked[0]);
          UI.dashLabel.textContent = !unlocked[1]
            ? "Preparation"
            : p1.speedBoost > 0
              ? `Preparation · haste ${p1.speedBoost.toFixed(1)}s`
              : skillLabel("Preparation", p1.wCooldown, true);
          UI.rangeLabel.textContent = skillLabel("Shunpo", p1.eCooldown, unlocked[2]);
          UI.shieldLabel.textContent = !unlocked[3]
            ? "Death Lotus"
            : p1.ultChannel > 0
              ? `Death Lotus · ${p1.ultChannel.toFixed(1)}s`
              : skillLabel("Death Lotus", p1.rCooldown, true);
          UI.bombFill.style.transform = `scaleX(${unlocked[0] ? 1 - clamp(p1.qCooldown / 4.5, 0, 1) : 0})`;
          UI.dashFill.style.transform = `scaleX(${unlocked[1] ? 1 - clamp(p1.wCooldown / 8, 0, 1) : 0})`;
          UI.mineFill.style.transform = `scaleX(${unlocked[2] ? 1 - clamp(p1.eCooldown / 8, 0, 1) : 0})`;
          UI.ultFill.style.transform = `scaleX(${unlocked[3] ? (p1.ultChannel > 0 ? p1.ultChannel / 1.65 : 1 - clamp(p1.rCooldown / 28, 0, 1)) : 0})`;
          gateSkill(UI.bombAction, 0, p1.qCooldown > 0);
          gateSkill(UI.dashAction, 1, p1.wCooldown > 0);
          gateSkill(UI.mineAction, 2, p1.eCooldown > 0);
          gateSkill(UI.ultAction, 3, p1.rCooldown > 0);
          UI.playerCard.dataset.qCooldown = p1.qCooldown.toFixed(3);
          UI.playerCard.dataset.wCooldown = p1.wCooldown.toFixed(3);
          UI.playerCard.dataset.eCooldown = p1.eCooldown.toFixed(3);
          UI.playerCard.dataset.rCooldown = p1.rCooldown.toFixed(3);
          UI.playerCard.dataset.daggers = String(match.daggers.length);
          UI.playerCard.dataset.ultChannel = p1.ultChannel.toFixed(3);
        } else if (p1.champion === "zed") {
          UI.resourceFill.style.transform = "scaleX(0.82)";
          const cooldownLabel = (name, value) => value > 0 ? `${name} · ${value.toFixed(1)}s` : `${name} · ready`;
          const livingShadow = match.zedShadows.find((shadow) =>
            shadow.ownerId === p1.id && shadow.kind === "living" && shadow.swapAvailable && shadow.age < shadow.life
          );
          const deathMark = match.zedMarks.find((mark) => mark.ownerId === p1.id && !mark.detonated);
          UI.bombLabel.textContent = skillLabel("Razor Shuriken", p1.qCooldown, unlocked[0]);
          UI.dashLabel.textContent = !unlocked[1]
            ? "Living Shadow"
            : livingShadow && p1.zedSwapWindow > 0
              ? `Living Shadow · F exchange ${p1.zedSwapWindow.toFixed(1)}s`
              : skillLabel("Living Shadow", p1.wCooldown, true);
          UI.rangeLabel.textContent = skillLabel("Shadow Slash", p1.eCooldown, unlocked[2]);
          UI.shieldLabel.textContent = !unlocked[3]
            ? "Death Mark"
            : deathMark
              ? `Death Mark · detonates ${Math.max(0, deathMark.fuse - deathMark.age).toFixed(1)}s`
              : skillLabel("Death Mark", p1.rCooldown, true);
          UI.bombFill.style.transform = `scaleX(${unlocked[0] ? 1 - clamp(p1.qCooldown / 5.6, 0, 1) : 0})`;
          UI.dashFill.style.transform = `scaleX(${unlocked[1] ? (livingShadow && p1.zedSwapWindow > 0 ? 1 : 1 - clamp(p1.wCooldown / 14, 0, 1)) : 0})`;
          UI.mineFill.style.transform = `scaleX(${unlocked[2] ? 1 - clamp(p1.eCooldown / 5.2, 0, 1) : 0})`;
          UI.ultFill.style.transform = `scaleX(${unlocked[3] ? (deathMark ? 1 - deathMark.age / deathMark.fuse : 1 - clamp(p1.rCooldown / 30, 0, 1)) : 0})`;
          gateSkill(UI.bombAction, 0, p1.qCooldown > 0);
          gateSkill(UI.dashAction, 1, p1.wCooldown > 0 && !(livingShadow && p1.zedSwapWindow > 0));
          gateSkill(UI.mineAction, 2, p1.eCooldown > 0);
          gateSkill(UI.ultAction, 3, p1.rCooldown > 0);
          UI.playerCard.dataset.qCooldown = p1.qCooldown.toFixed(3);
          UI.playerCard.dataset.wCooldown = p1.wCooldown.toFixed(3);
          UI.playerCard.dataset.eCooldown = p1.eCooldown.toFixed(3);
          UI.playerCard.dataset.rCooldown = p1.rCooldown.toFixed(3);
          UI.playerCard.dataset.shadows = String(match.zedShadows.filter((shadow) => shadow.ownerId === p1.id).length);
          UI.playerCard.dataset.deathMarks = String(match.zedMarks.filter((mark) => mark.ownerId === p1.id).length);
        } else if (p1.champion === "renekton") {
          const cooldownLabel = (name, value) => value > 0 ? `${name} · ${value.toFixed(1)}s` : `${name} · ready`;
          const empowered = p1.fury >= 50;
          UI.bombLabel.textContent = `${skillLabel("Cull the Meek", p1.qCooldown, unlocked[0])}${unlocked[0] && empowered ? " · empowered" : ""}`;
          UI.dashLabel.textContent = `${skillLabel("Ruthless Predator", p1.wCooldown, unlocked[1])}${unlocked[1] && empowered ? " · empowered" : ""}`;
          UI.rangeLabel.textContent = !unlocked[2]
            ? "Slice and Dice"
            : p1.renektonDashRecast > 0
              ? `Slice and Dice · E again ${p1.renektonDashRecast.toFixed(1)}s`
              : skillLabel("Slice and Dice", p1.eCooldown, true);
          UI.shieldLabel.textContent = !unlocked[3]
            ? "Dominus"
            : p1.renektonDominus > 0
              ? `Dominus · ${p1.renektonDominus.toFixed(1)}s`
              : skillLabel("Dominus", p1.rCooldown, true);
          UI.bombFill.style.transform = `scaleX(${unlocked[0] ? 1 - clamp(p1.qCooldown / 5.8, 0, 1) : 0})`;
          UI.dashFill.style.transform = `scaleX(${unlocked[1] ? 1 - clamp(p1.wCooldown / 9.5, 0, 1) : 0})`;
          UI.mineFill.style.transform = `scaleX(${unlocked[2] ? (p1.renektonDashRecast > 0 ? 1 : 1 - clamp(p1.eCooldown / 11.5, 0, 1)) : 0})`;
          UI.ultFill.style.transform = `scaleX(${unlocked[3] ? (p1.renektonDominus > 0 ? p1.renektonDominus / 7.2 : 1 - clamp(p1.rCooldown / 31, 0, 1)) : 0})`;
          UI.resourceFill.style.transform = `scaleX(${clamp(p1.fury / 100, 0, 1)})`;
          gateSkill(UI.bombAction, 0, p1.qCooldown > 0);
          gateSkill(UI.dashAction, 1, p1.wCooldown > 0);
          gateSkill(UI.mineAction, 2, p1.eCooldown > 0 && p1.renektonDashRecast <= 0);
          gateSkill(UI.ultAction, 3, p1.rCooldown > 0);
          UI.playerCard.dataset.qCooldown = p1.qCooldown.toFixed(3);
          UI.playerCard.dataset.wCooldown = p1.wCooldown.toFixed(3);
          UI.playerCard.dataset.eCooldown = p1.eCooldown.toFixed(3);
          UI.playerCard.dataset.rCooldown = p1.rCooldown.toFixed(3);
          UI.playerCard.dataset.fury = p1.fury.toFixed(2);
          UI.playerCard.dataset.eRecast = p1.renektonDashRecast.toFixed(3);
          UI.playerCard.dataset.dominus = p1.renektonDominus.toFixed(3);
        } else if (p1.champion === "vladimir") {
          const cooldownLabel = (name, value) => value > 0 ? `${name} · ${value.toFixed(1)}s` : `${name} · ready`;
          const mark = match.vladimirMarks.find((candidate) => candidate.ownerId === p1.id && !candidate.detonated);
          UI.bombLabel.textContent = !unlocked[0]
            ? "Transfusion"
            : `${skillLabel("Transfusion", p1.qCooldown, true)} · crimson ${p1.vladimirQStacks}/2`;
          UI.dashLabel.textContent = !unlocked[1]
            ? "Sanguine Pool"
            : p1.vladimirPool > 0
              ? `Sanguine Pool · ${p1.vladimirPool.toFixed(1)}s`
              : skillLabel("Sanguine Pool", p1.wCooldown, true);
          UI.rangeLabel.textContent = skillLabel("Tides of Blood", p1.eCooldown, unlocked[2]);
          UI.shieldLabel.textContent = !unlocked[3]
            ? "Hemoplague"
            : mark
              ? `Hemoplague · detonates ${Math.max(0, mark.fuse - mark.age).toFixed(1)}s`
              : skillLabel("Hemoplague", p1.rCooldown, true);
          UI.bombFill.style.transform = `scaleX(${unlocked[0] ? 1 - clamp(p1.qCooldown / 4.4, 0, 1) : 0})`;
          UI.dashFill.style.transform = `scaleX(${unlocked[1] ? (p1.vladimirPool > 0 ? p1.vladimirPool / 1.45 : 1 - clamp(p1.wCooldown / 15, 0, 1)) : 0})`;
          UI.mineFill.style.transform = `scaleX(${unlocked[2] ? 1 - clamp(p1.eCooldown / 7.6, 0, 1) : 0})`;
          UI.ultFill.style.transform = `scaleX(${unlocked[3] ? (mark ? 1 - mark.age / mark.fuse : 1 - clamp(p1.rCooldown / 30, 0, 1)) : 0})`;
          UI.resourceFill.style.transform = `scaleX(${clamp(p1.vladimirQStacks / 2, 0, 1)})`;
          gateSkill(UI.bombAction, 0, p1.qCooldown > 0);
          gateSkill(UI.dashAction, 1, p1.wCooldown > 0);
          gateSkill(UI.mineAction, 2, p1.eCooldown > 0);
          gateSkill(UI.ultAction, 3, p1.rCooldown > 0);
          UI.playerCard.dataset.qCooldown = p1.qCooldown.toFixed(3);
          UI.playerCard.dataset.wCooldown = p1.wCooldown.toFixed(3);
          UI.playerCard.dataset.eCooldown = p1.eCooldown.toFixed(3);
          UI.playerCard.dataset.rCooldown = p1.rCooldown.toFixed(3);
          UI.playerCard.dataset.crimsonRush = String(p1.vladimirQStacks);
          UI.playerCard.dataset.pool = p1.vladimirPool.toFixed(3);
          UI.playerCard.dataset.hemoplague = String(match.vladimirMarks.filter((candidate) => candidate.ownerId === p1.id).length);
        } else if (p1.champion === "gangplank") {
          const cooldownLabel = (name, value) => value > 0 ? `${name} · ${value.toFixed(1)}s` : `${name} · ready`;
          const barrels = (match.gangplankBarrels || []).filter((b) => b.ownerId === p1.id && !b.exploded).length;
          const barrage = (match.gangplankBarrages || []).find((b) => b.ownerId === p1.id && !b.detonated);
          UI.bombLabel.textContent = skillLabel("Parrrley", p1.qCooldown, unlocked[0]);
          UI.dashLabel.textContent = skillLabel("Remove Scurvy", p1.wCooldown, unlocked[1]);
          UI.rangeLabel.textContent = !unlocked[2]
            ? "Powder Keg"
            : barrels > 0
              ? `Powder Keg · ${barrels}/3 planted`
              : skillLabel("Powder Keg", p1.eCooldown, true);
          UI.shieldLabel.textContent = !unlocked[3]
            ? "Cannon Barrage"
            : barrage
              ? `Cannon Barrage · ${Math.max(0, barrage.fuse - barrage.age).toFixed(1)}s`
              : skillLabel("Cannon Barrage", p1.rCooldown, true);
          UI.bombFill.style.transform = `scaleX(${unlocked[0] ? 1 - clamp(p1.qCooldown / 4.8, 0, 1) : 0})`;
          UI.dashFill.style.transform = `scaleX(${unlocked[1] ? 1 - clamp(p1.wCooldown / 12, 0, 1) : 0})`;
          UI.mineFill.style.transform = `scaleX(${unlocked[2] ? (barrels > 0 ? clamp(barrels / 3, 0, 1) : 1 - clamp(p1.eCooldown / 7.5, 0, 1)) : 0})`;
          UI.ultFill.style.transform = `scaleX(${unlocked[3] ? (barrage ? 1 - barrage.age / barrage.fuse : 1 - clamp(p1.rCooldown / 32, 0, 1)) : 0})`;
          UI.resourceFill.style.transform = `scaleX(${clamp(barrels / 3, 0, 1)})`;
          gateSkill(UI.bombAction, 0, p1.qCooldown > 0);
          gateSkill(UI.dashAction, 1, p1.wCooldown > 0);
          gateSkill(UI.mineAction, 2, p1.eCooldown > 0 || barrels >= 3);
          gateSkill(UI.ultAction, 3, p1.rCooldown > 0);
          UI.playerCard.dataset.qCooldown = p1.qCooldown.toFixed(3);
          UI.playerCard.dataset.wCooldown = p1.wCooldown.toFixed(3);
          UI.playerCard.dataset.eCooldown = p1.eCooldown.toFixed(3);
          UI.playerCard.dataset.rCooldown = p1.rCooldown.toFixed(3);
          UI.playerCard.dataset.barrels = String(barrels);
        } else {
          // Unknown champion fallback — treat as Katarina dock layout.
          UI.resourceFill.style.transform = "scaleX(0.82)";
          UI.bombLabel.textContent = skillLabel("Ability Q", p1.qCooldown, unlocked[0]);
          UI.dashLabel.textContent = skillLabel("Ability F", p1.wCooldown, unlocked[1]);
          UI.rangeLabel.textContent = skillLabel("Ability E", p1.eCooldown, unlocked[2]);
          UI.shieldLabel.textContent = skillLabel("Ability R", p1.rCooldown, unlocked[3]);
          UI.bombFill.style.transform = `scaleX(${unlocked[0] ? 1 - clamp(p1.qCooldown / 5, 0, 1) : 0})`;
          UI.dashFill.style.transform = `scaleX(${unlocked[1] ? 1 - clamp(p1.wCooldown / 8, 0, 1) : 0})`;
          UI.mineFill.style.transform = `scaleX(${unlocked[2] ? 1 - clamp(p1.eCooldown / 8, 0, 1) : 0})`;
          UI.ultFill.style.transform = `scaleX(${unlocked[3] ? 1 - clamp(p1.rCooldown / 28, 0, 1) : 0})`;
          gateSkill(UI.bombAction, 0, p1.qCooldown > 0);
          gateSkill(UI.dashAction, 1, p1.wCooldown > 0);
          gateSkill(UI.mineAction, 2, p1.eCooldown > 0);
          gateSkill(UI.ultAction, 3, p1.rCooldown > 0);
        }

        this.syncTouchActionState(UI.touchQ, UI.bombAction);
        this.syncTouchActionState(UI.touchDash, UI.dashAction);
        this.syncTouchActionState(UI.touchMine, UI.mineAction);
        this.syncTouchActionState(UI.touchUlt, UI.ultAction);
        if (UI.touchBomb) {
          UI.touchBomb.disabled = UI.arenaBombAction.disabled;
          UI.touchBomb.classList.toggle("is-locked", false);
        }

        const maxX = match.tile * (match.cols - 1) / 2;
        const maxZ = match.tile * (match.rows - 1) / 2;
        UI.minimapPlayer.style.left = `${clamp((p1.x / maxX * 0.5 + 0.5) * 100, 4, 96)}%`;
        UI.minimapPlayer.style.top = `${clamp((p1.z / maxZ * 0.5 + 0.5) * 100, 4, 96)}%`;
        const left = clamp((p2.x / maxX * 0.5 + 0.5) * 100, 4, 96);
        const top = clamp((p2.z / maxZ * 0.5 + 0.5) * 100, 4, 96);
        UI.minimapEnemies.innerHTML = p2.alive
          ? `<i class="map-enemy" style="left:${left}%;top:${top}%;width:0.62rem"></i>`
          : "";
      }

      finish(winner, roundWins, elapsed) {
        const target = Number(this.matchTarget) > 0 ? Number(this.matchTarget) : 3;
        UI.endResult.textContent = `First to ${target} · match complete`;
        UI.endTitle.textContent = `${winner.name} wins`;
        UI.endScore.textContent = String(roundWins[0]);
        UI.endChain.textContent = String(roundWins[1]);
        UI.endTime.textContent = formatTime(elapsed);
        UI.end.hidden = false;
        UI.chrome.classList.add("is-hidden");
        UI.chrome.setAttribute("aria-hidden", "true");
        UI.chrome.setAttribute("inert", "");
        setTimeout(() => UI.restart.focus(), 100);
      }
    }
