"use strict";

    class BrowserMatchPresentation {
      selectChampion(selectedChampion) {
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
          ziggs: {
            name: "Blue Ziggs", alt: "Ziggs, o Especialista em Hexplosivos", portrait: ZIGGS_PORTRAIT,
            passive: null, art: null, abilities: ["Place bomb", "Satchel burst", "Current blast range", "Current speed and shield"]
          }
        };
        const presentation = presentations[selectedChampion];
        const skillChampion = selectedChampion !== "ziggs";
        const championName = presentation.name;
        document.documentElement.dataset.champion = selectedChampion;
        UI.championChoices.forEach((button) =>
          button.setAttribute("aria-pressed", String(button.dataset.champion === selectedChampion))
        );
        UI.championPortrait.src = presentation.portrait;
        UI.championPortrait.alt = presentation.alt;
        UI.playerName.textContent = `P1 · ${championName}`;
        UI.matchSubtitle.textContent = skillChampion
          ? `${championName} vs Ziggs · first to 3`
          : "Ziggs mirror match · first to 3";
        UI.abilityDock.setAttribute("aria-label", skillChampion ? `${championName} abilities` : "Blue Ziggs arena stats");
        UI.start.textContent = `Play ${championName} + music`;

        const icons = [UI.bombIcon, UI.dashIcon, UI.mineIcon, UI.ultIcon];
        const art = presentation.art;
        const glyphs = ["✦", "⌁", "↔", "⬡"];
        icons.forEach((icon, index) => {
          icon.classList.toggle("has-art", skillChampion);
          icon.style.backgroundImage = skillChampion ? `url(${art[index]})` : "";
          icon.textContent = skillChampion ? "" : glyphs[index];
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
        UI.dashKey.textContent = skillChampion ? "F" : "⇧";
        UI.mineKey.textContent = skillChampion ? "E" : "+";
        UI.ultKey.textContent = skillChampion ? "R" : "◆";
        UI.bombAction.setAttribute("aria-label", `${presentation.abilities[0]}. Q key.`);
        UI.dashAction.setAttribute("aria-label", `${presentation.abilities[1]}. ${skillChampion ? "F" : "Left Shift"} key.`);
        UI.mineAction.setAttribute("aria-label", presentation.abilities[2]);
        UI.ultAction.setAttribute("aria-label", presentation.abilities[3]);
        UI.mineAction.classList.toggle("stat", !skillChampion);
        UI.ultAction.classList.toggle("stat", !skillChampion);
        UI.touchQ.hidden = !skillChampion;
        UI.touchMine.hidden = !skillChampion;
        UI.touchUlt.hidden = !skillChampion;
        UI.touchDash.textContent = skillChampion ? "F" : "⌁";
        UI.touchQ.setAttribute("aria-label", presentation.abilities[0]);
        UI.touchDash.setAttribute("aria-label", presentation.abilities[1]);
        UI.touchMine.setAttribute("aria-label", presentation.abilities[2]);
        UI.touchUlt.setAttribute("aria-label", presentation.abilities[3]);
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
        const p1 = match.players[0];
        const p2 = match.players[1];
        if (!p1 || !p2) return;
        const crates = match.grid.reduce((sum, row) => sum + row.filter((tile) => tile === 2).length, 0);
        UI.score.textContent = String(crates).padStart(3, "0");
        UI.waveNumber.textContent = String(match.round);
        UI.enemyCount.textContent = String(Math.ceil(match.roundTime)).padStart(2, "0");
        UI.matchScoreline.textContent = `${p1.name} · ${match.roundWins[0]} — ${match.roundWins[1]} · Red Ziggs`;
        UI.waveLabel.textContent = match.roundLocked
          ? (match.pendingMatchWinner ? "Match point converted" : `Round ${String(match.round).padStart(2, "0")} complete`)
          : `Round ${String(match.round).padStart(2, "0")} · ${match.p2Human ? "Local versus" : "CPU controls Red"}`;
        UI.playerCard.dataset.worldX = p1.x.toFixed(3);
        UI.playerCard.dataset.worldZ = p1.z.toFixed(3);
        UI.playerCard.dataset.passableBombs = String(
          match.bombs.filter((bomb) => !bomb.exploded && bomb.passOwners?.has(1)).length
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
        UI.comboLabel.textContent = `P2 · ${match.p2Human ? "LOCAL" : "CPU"}`;
        const available = Math.max(0, p1.maxBombs - match.activeBombsFor(p1));
        const locked = !p1.alive || match.roundLocked || p1.ultChannel > 0 || p1.vladimirPool > 0;
        UI.arenaBombLabel.textContent = available > 0 ? `Arena bomb · ${available}` : "Arena bomb · planted";
        UI.arenaBombFill.style.transform = `scaleX(${available > 0 ? 1 : 0.18})`;
        UI.arenaBombAction.disabled = locked || available <= 0;
        if (p1.champion === "katarina") {
          UI.resourceFill.style.transform = "scaleX(0.82)";
          const cooldownLabel = (name, value) => value > 0 ? `${name} · ${value.toFixed(1)}s` : `${name} · ready`;
          UI.bombLabel.textContent = cooldownLabel("Bouncing Blade", p1.qCooldown);
          UI.dashLabel.textContent = p1.speedBoost > 0
            ? `Preparation · haste ${p1.speedBoost.toFixed(1)}s`
            : cooldownLabel("Preparation", p1.wCooldown);
          UI.rangeLabel.textContent = cooldownLabel("Shunpo", p1.eCooldown);
          UI.shieldLabel.textContent = p1.ultChannel > 0
            ? `Death Lotus · ${p1.ultChannel.toFixed(1)}s`
            : cooldownLabel("Death Lotus", p1.rCooldown);
          UI.bombFill.style.transform = `scaleX(${1 - clamp(p1.qCooldown / 4.5, 0, 1)})`;
          UI.dashFill.style.transform = `scaleX(${1 - clamp(p1.wCooldown / 8, 0, 1)})`;
          UI.mineFill.style.transform = `scaleX(${1 - clamp(p1.eCooldown / 8, 0, 1)})`;
          UI.ultFill.style.transform = `scaleX(${p1.ultChannel > 0 ? p1.ultChannel / 1.65 : 1 - clamp(p1.rCooldown / 28, 0, 1)})`;
          UI.bombAction.disabled = locked || p1.qCooldown > 0;
          UI.dashAction.disabled = locked || p1.wCooldown > 0;
          UI.mineAction.disabled = locked || p1.eCooldown > 0;
          UI.ultAction.disabled = locked || p1.rCooldown > 0;
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
          UI.bombLabel.textContent = cooldownLabel("Razor Shuriken", p1.qCooldown);
          UI.dashLabel.textContent = livingShadow && p1.zedSwapWindow > 0
            ? `Living Shadow · F exchange ${p1.zedSwapWindow.toFixed(1)}s`
            : cooldownLabel("Living Shadow", p1.wCooldown);
          UI.rangeLabel.textContent = cooldownLabel("Shadow Slash", p1.eCooldown);
          UI.shieldLabel.textContent = deathMark
            ? `Death Mark · detonates ${Math.max(0, deathMark.fuse - deathMark.age).toFixed(1)}s`
            : cooldownLabel("Death Mark", p1.rCooldown);
          UI.bombFill.style.transform = `scaleX(${1 - clamp(p1.qCooldown / 5.6, 0, 1)})`;
          UI.dashFill.style.transform = `scaleX(${livingShadow && p1.zedSwapWindow > 0 ? 1 : 1 - clamp(p1.wCooldown / 14, 0, 1)})`;
          UI.mineFill.style.transform = `scaleX(${1 - clamp(p1.eCooldown / 5.2, 0, 1)})`;
          UI.ultFill.style.transform = `scaleX(${deathMark ? 1 - deathMark.age / deathMark.fuse : 1 - clamp(p1.rCooldown / 30, 0, 1)})`;
          UI.bombAction.disabled = locked || p1.qCooldown > 0;
          UI.dashAction.disabled = locked || (p1.wCooldown > 0 && !(livingShadow && p1.zedSwapWindow > 0));
          UI.mineAction.disabled = locked || p1.eCooldown > 0;
          UI.ultAction.disabled = locked || p1.rCooldown > 0;
          UI.playerCard.dataset.qCooldown = p1.qCooldown.toFixed(3);
          UI.playerCard.dataset.wCooldown = p1.wCooldown.toFixed(3);
          UI.playerCard.dataset.eCooldown = p1.eCooldown.toFixed(3);
          UI.playerCard.dataset.rCooldown = p1.rCooldown.toFixed(3);
          UI.playerCard.dataset.shadows = String(match.zedShadows.filter((shadow) => shadow.ownerId === p1.id).length);
          UI.playerCard.dataset.deathMarks = String(match.zedMarks.filter((mark) => mark.ownerId === p1.id).length);
        } else if (p1.champion === "renekton") {
          const cooldownLabel = (name, value) => value > 0 ? `${name} · ${value.toFixed(1)}s` : `${name} · ready`;
          const empowered = p1.fury >= 50;
          UI.bombLabel.textContent = `${cooldownLabel("Cull the Meek", p1.qCooldown)}${empowered ? " · empowered" : ""}`;
          UI.dashLabel.textContent = `${cooldownLabel("Ruthless Predator", p1.wCooldown)}${empowered ? " · empowered" : ""}`;
          UI.rangeLabel.textContent = p1.renektonDashRecast > 0
            ? `Slice and Dice · E again ${p1.renektonDashRecast.toFixed(1)}s`
            : cooldownLabel("Slice and Dice", p1.eCooldown);
          UI.shieldLabel.textContent = p1.renektonDominus > 0
            ? `Dominus · ${p1.renektonDominus.toFixed(1)}s`
            : cooldownLabel("Dominus", p1.rCooldown);
          UI.bombFill.style.transform = `scaleX(${1 - clamp(p1.qCooldown / 5.8, 0, 1)})`;
          UI.dashFill.style.transform = `scaleX(${1 - clamp(p1.wCooldown / 9.5, 0, 1)})`;
          UI.mineFill.style.transform = `scaleX(${p1.renektonDashRecast > 0 ? 1 : 1 - clamp(p1.eCooldown / 11.5, 0, 1)})`;
          UI.ultFill.style.transform = `scaleX(${p1.renektonDominus > 0 ? p1.renektonDominus / 7.2 : 1 - clamp(p1.rCooldown / 31, 0, 1)})`;
          UI.resourceFill.style.transform = `scaleX(${clamp(p1.fury / 100, 0, 1)})`;
          UI.bombAction.disabled = locked || p1.qCooldown > 0;
          UI.dashAction.disabled = locked || p1.wCooldown > 0;
          UI.mineAction.disabled = locked || (p1.eCooldown > 0 && p1.renektonDashRecast <= 0);
          UI.ultAction.disabled = locked || p1.rCooldown > 0;
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
          UI.bombLabel.textContent = `${cooldownLabel("Transfusion", p1.qCooldown)} · crimson ${p1.vladimirQStacks}/2`;
          UI.dashLabel.textContent = p1.vladimirPool > 0
            ? `Sanguine Pool · ${p1.vladimirPool.toFixed(1)}s`
            : cooldownLabel("Sanguine Pool", p1.wCooldown);
          UI.rangeLabel.textContent = cooldownLabel("Tides of Blood", p1.eCooldown);
          UI.shieldLabel.textContent = mark
            ? `Hemoplague · detonates ${Math.max(0, mark.fuse - mark.age).toFixed(1)}s`
            : cooldownLabel("Hemoplague", p1.rCooldown);
          UI.bombFill.style.transform = `scaleX(${1 - clamp(p1.qCooldown / 4.4, 0, 1)})`;
          UI.dashFill.style.transform = `scaleX(${p1.vladimirPool > 0 ? p1.vladimirPool / 1.45 : 1 - clamp(p1.wCooldown / 15, 0, 1)})`;
          UI.mineFill.style.transform = `scaleX(${1 - clamp(p1.eCooldown / 7.6, 0, 1)})`;
          UI.ultFill.style.transform = `scaleX(${mark ? 1 - mark.age / mark.fuse : 1 - clamp(p1.rCooldown / 30, 0, 1)})`;
          UI.resourceFill.style.transform = `scaleX(${clamp(p1.vladimirQStacks / 2, 0, 1)})`;
          UI.bombAction.disabled = locked || p1.qCooldown > 0;
          UI.dashAction.disabled = locked || p1.wCooldown > 0;
          UI.mineAction.disabled = locked || p1.eCooldown > 0;
          UI.ultAction.disabled = locked || p1.rCooldown > 0;
          UI.playerCard.dataset.qCooldown = p1.qCooldown.toFixed(3);
          UI.playerCard.dataset.wCooldown = p1.wCooldown.toFixed(3);
          UI.playerCard.dataset.eCooldown = p1.eCooldown.toFixed(3);
          UI.playerCard.dataset.rCooldown = p1.rCooldown.toFixed(3);
          UI.playerCard.dataset.crimsonRush = String(p1.vladimirQStacks);
          UI.playerCard.dataset.pool = p1.vladimirPool.toFixed(3);
          UI.playerCard.dataset.hemoplague = String(match.vladimirMarks.filter((candidate) => candidate.ownerId === p1.id).length);
        } else {
          UI.resourceFill.style.transform = "scaleX(0.82)";
          UI.bombLabel.textContent = `Bomb · ${available}/${p1.maxBombs} ready`;
          UI.dashLabel.textContent = p1.dashCooldown > 0 ? `Satchel · ${p1.dashCooldown.toFixed(1)}s` : "Satchel · ready";
          UI.bombFill.style.transform = `scaleX(${available > 0 ? 1 : 0})`;
          UI.dashFill.style.transform = `scaleX(${1 - clamp(p1.dashCooldown / 5, 0, 1)})`;
          UI.rangeLabel.textContent = `Blast · ${p1.range} tiles`;
          UI.mineFill.style.transform = `scaleX(${clamp(p1.range / 6, 0, 1)})`;
          UI.shieldLabel.textContent = p1.shield > 0
            ? `Shield · ${p1.shield} charge${p1.shield > 1 ? "s" : ""}`
            : `Speed · ${(p1.speed / 3.45).toFixed(1)}×`;
          UI.ultFill.style.transform = `scaleX(${p1.shield > 0 ? p1.shield / 2 : clamp((p1.speed - 3.2) / 1.55, 0.12, 1)})`;
          UI.bombAction.disabled = available <= 0 || locked;
          UI.dashAction.disabled = p1.dashCooldown > 0 || locked;
          UI.mineAction.disabled = true;
          UI.ultAction.disabled = true;
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
        UI.endResult.textContent = "First to three · match complete";
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

      setPaused(paused) {
        UI.pause.setAttribute("aria-pressed", String(paused));
        UI.pause.setAttribute("aria-label", paused ? "Resume game" : "Pause game");
        UI.pauseIcon.innerHTML = paused
          ? '<path d="M8 5v14l11-7L8 5z"/>'
          : '<path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/>';
      }
    }
