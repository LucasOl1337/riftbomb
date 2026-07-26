"use strict";

    const formatTime = (seconds) => {
      seconds = Math.max(0, Math.floor(seconds));
      return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    };

    let renderer;
    let music;
    let game;
    let lastFrame = performance.now();
    let guidePausedGame = false;

    function updateMusicUI() {
      const position = music.position();
      const progress = position / music.duration;
      const beat = music.stepIndex % 4;
      const bar = Math.floor(music.stepIndex / 16) % music.totalBars;
      const section = music.sectionForBar(bar);
      document.documentElement.style.setProperty("--beat", music.visualBeat().toFixed(3));
      UI.playhead.style.setProperty("--progress", progress.toFixed(5));
      UI.trackTime.textContent = formatTime(position);
      UI.musicSection.textContent = section.name;
      const style = music.styles[music.styleId] || music.styles.gravesong;
      if (UI.trackTitle) {
        UI.trackTitle.textContent = music.samplesReady
          ? `${style.label.toUpperCase()} · ${Math.round(music.bpm)} BPM`
          : `SYNTH · ${style.label.toUpperCase()} · ${Math.round(music.bpm)} BPM`;
      }
      if (UI.bpmLabel) {
        UI.bpmLabel.textContent = music.samplesReady
          ? `${style.label} · ${Math.round(music.bpm)} BPM · heat ${Math.round(music.heat * 100)}%`
          : `No samples · ${style.label} · ${Math.round(music.bpm)} BPM`;
      }
      UI.beatDots.forEach((dot, i) => dot.classList.toggle("is-on", i === beat));
      const bars = UI.waveform.children;
      const energy = music.energy;
      for (let i = 0; i < bars.length; i++) {
        const pulse = 1 + energy * (0.25 + ((i * 13) % 11) / 10) * 0.9;
        bars[i].style.transform = `scaleY(${pulse.toFixed(2)})`;
      }
      UI.fxLabel.textContent = `Bloom · ${Math.round(energy * 100)}%`;
    }

    function frame(now) {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
      lastFrame = now;
      music.syncFromGame(game, dt);
      music.updateEnergy();
      game.update(dt);
      renderer.render(game, music, dt, now);
      updateMusicUI();
      requestAnimationFrame(frame);
    }

    async function beginGame() {
      UI.start.disabled = true;
      const alreadyAudible = Boolean(music.ctx);
      UI.start.textContent = alreadyAudible ? "Starting match…" : "Loading cello / piano samples…";
      try {
        await music.start();
        UI.start.textContent = music.samplesReady ? "Samples ready" : "Synth fallback";
      } catch (error) {
        console.warn("Audio could not start:", error);
      }
      game.start();
      UI.intro.classList.add("is-gone");
      UI.chrome.classList.remove("is-hidden");
      UI.chrome.setAttribute("aria-hidden", "false");
      UI.chrome.removeAttribute("inert");
      UI.start.disabled = false;
      const arenaName = game.arenaTemplate().label;
      UI.live.textContent = game.player.champion !== "ziggs"
        ? `Rift Bomber · ${arenaName}. ${game.player.name} uses WASD, Q/F/E/R and Space. Red Ziggs uses arrows and Enter.`
        : `Rift Bomber · ${arenaName}. Blue Ziggs uses WASD, Q and Shift. Red Ziggs uses arrows and Enter.`;
    }

    function openGuide() {
      guidePausedGame = game && game.mode === "playing" && !game.paused;
      if (guidePausedGame) game.togglePause(true);
      UI.guide.showModal();
      UI.guideClose.focus();
    }

    function closeGuide() {
      UI.guide.close();
      if (guidePausedGame && game.mode === "playing") game.togglePause(false);
      guidePausedGame = false;
    }

    function setupInput() {
      addEventListener("keydown", (event) => {
        if (UI.guide.open) {
          if (event.code === "KeyH") closeGuide();
          return;
        }
        const gameKeys = ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyF", "KeyE", "KeyR", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "Numpad0", "ShiftLeft", "ShiftRight"];
        if (gameKeys.includes(event.code) && game.mode === "playing") event.preventDefault();
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Numpad0", "ShiftRight"].includes(event.code) && game.mode === "playing") {
          game.activatePlayerTwo();
        }
        game.keys.add(event.code);
        if (event.repeat) return;
        if (event.code === "Space") game.placeBomb();
        else if (event.code === "KeyQ") game.castAbility(0);
        else if (event.code === "KeyF") game.castAbility(1);
        else if (event.code === "KeyE") game.castAbility(2);
        else if (event.code === "KeyR") game.castAbility(3);
        else if (event.code === "ShiftLeft") game.castAbility(1);
        else if (event.code === "Enter" || event.code === "Numpad0") game.placeBomb(game.players[1]);
        else if (event.code === "ShiftRight") game.requestDash(game.players[1]);
        else if (event.code === "KeyM") toggleSound();
        else if (event.code === "KeyP") game.togglePause();
        else if (event.code === "KeyH") openGuide();
      });
      addEventListener("keyup", (event) => game.keys.delete(event.code));
      addEventListener("blur", () => {
        game.keys.clear();
        game.touchDirs.clear();
      });

      $$(".touch-key[data-dir]").forEach((button) => {
        const dir = button.dataset.dir;
        const down = (event) => {
          event.preventDefault();
          button.setPointerCapture?.(event.pointerId);
          game.touchDirs.add(dir);
        };
        const up = () => game.touchDirs.delete(dir);
        button.addEventListener("pointerdown", down);
        button.addEventListener("pointerup", up);
        button.addEventListener("pointercancel", up);
        button.addEventListener("lostpointercapture", up);
      });
      UI.touchBomb.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        game.placeBomb();
      });
      UI.touchDash.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        game.castAbility(1);
      });
      UI.touchQ.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        game.castAbility(0);
      });
      UI.touchMine.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        game.castAbility(2);
      });
      UI.touchUlt.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        game.castAbility(3);
      });
    }

    function toggleSound() {
      const muted = music.toggleMute();
      UI.sound.setAttribute("aria-pressed", String(muted));
      UI.sound.setAttribute("aria-label", muted ? "Restore soundtrack" : "Mute soundtrack");
      UI.sound.style.color = muted ? "var(--ember)" : "";
      UI.live.textContent = muted ? "Soundtrack muted" : "Soundtrack restored";
    }

    function paintArenaMini(host, grid, arenaId) {
      host.replaceChildren();
      const safe = new Set([
        `${grid.length - 2},1`, `${grid.length - 3},1`, `${grid.length - 2},2`,
        `1,${grid[0].length - 2}`, `2,${grid[0].length - 2}`, `1,${grid[0].length - 3}`
      ]);
      host.dataset.arena = arenaId || "";
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          const cell = document.createElement("i");
          const key = `${r},${c}`;
          if (safe.has(key)) cell.dataset.t = "s";
          else if (grid[r][c] === 1) cell.dataset.t = "1";
          else if (grid[r][c] === 2) cell.dataset.t = "2";
          host.appendChild(cell);
        }
      }
    }

    function buildArenaPicker() {
      const host = document.getElementById("arena-select") || document.querySelector(".arena-select");
      if (!host || !game) return;
      const heading = document.createElement("span");
      heading.className = "micro";
      heading.textContent = `[ ARENA TEMPLATE ] · ${game.listArenas().length} layouts`;
      host.replaceChildren(heading);
      game.listArenas().forEach((arena) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "arena-choice";
        button.dataset.arena = arena.id;
        button.setAttribute("role", "radio");
        button.setAttribute("aria-checked", String(arena.id === game.selectedArena));
        button.title = arena.blurb;
        const mini = document.createElement("div");
        mini.className = "arena-mini";
        mini.setAttribute("aria-hidden", "true");
        paintArenaMini(mini, game.previewGrid(arena.id), arena.id);
        const title = document.createElement("strong");
        title.textContent = arena.label;
        const blurb = document.createElement("small");
        blurb.textContent = arena.blurb;
        button.append(mini, title, blurb);
        button.addEventListener("click", () => {
          game.selectArena(arena.id);
          UI.arenaChoices.forEach((choice) => {
            choice.setAttribute("aria-checked", String(choice.dataset.arena === arena.id));
          });
          heading.textContent = `[ ARENA ] ${arena.label.toUpperCase()}`;
          UI.live.textContent = `Arena: ${arena.label} — ${arena.blurb}`;
        });
        host.appendChild(button);
      });
      UI.arenaChoices = [...host.querySelectorAll(".arena-choice")];
    }

    function buildSoundtrackPicker() {
      const host = document.getElementById("soundtrack-select") || document.querySelector(".soundtrack-select");
      if (!host || !music) return;
      const heading = document.createElement("span");
      heading.className = "micro";
      heading.textContent = `[ AUDIO BANK ] · ${music.listStyles().length} styles · click to preview`;
      host.replaceChildren(heading);
      let previewToken = 0;
      music.listStyles().forEach((style, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "soundtrack-choice";
        button.dataset.style = style.id;
        button.setAttribute("role", "radio");
        button.setAttribute("aria-checked", String(style.id === music.styleId || (index === 0 && !music.styleId)));
        button.title = `Preview ${style.label}`;
        const title = document.createElement("strong");
        title.textContent = style.label;
        const blurb = document.createElement("small");
        blurb.textContent = style.blurb;
        button.append(title, blurb);
        button.addEventListener("click", async () => {
          const token = ++previewToken;
          UI.soundtrackChoices.forEach((choice) => {
            const selected = choice.dataset.style === style.id;
            choice.setAttribute("aria-checked", String(selected));
            choice.classList.toggle("is-loading", selected);
            choice.classList.remove("is-previewing");
          });
          heading.textContent = `Loading preview · ${style.label}…`;
          UI.live.textContent = `Loading soundtrack preview: ${style.label}`;
          try {
            const applied = await music.previewStyle(style.id);
            if (token !== previewToken) return;
            UI.soundtrackChoices.forEach((choice) => {
              const selected = choice.dataset.style === style.id;
              choice.classList.toggle("is-loading", false);
              choice.classList.toggle("is-previewing", selected);
            });
            heading.textContent = `[ LIVE ] ${applied.label.toUpperCase()}`;
            if (UI.trackTitle) {
              UI.trackTitle.textContent = `${applied.label.toUpperCase()} · ${Math.round(music.bpm)} BPM`;
            }
            if (UI.bpmLabel) {
              UI.bpmLabel.textContent = `${applied.label} · ${applied.blurb}`;
            }
            if (UI.musicSection) UI.musicSection.textContent = applied.sections[0].name;
            UI.live.textContent = `Previewing ${applied.label}. Click Play to start the match with this track.`;
            if (UI.sound) {
              UI.sound.setAttribute("aria-pressed", "false");
              UI.sound.setAttribute("aria-label", "Mute soundtrack");
              UI.sound.style.color = "";
            }
          } catch (error) {
            if (token !== previewToken) return;
            console.warn("Soundtrack preview failed:", error);
            UI.soundtrackChoices.forEach((choice) => {
              choice.classList.remove("is-loading", "is-previewing");
            });
            heading.textContent = `[ AUDIO BANK ] · ${music.listStyles().length} styles · click to preview`;
            music.setStyle(style.id);
            UI.live.textContent = `Selected ${style.label} (preview unavailable — will play on start).`;
          }
        });
        host.appendChild(button);
      });
      UI.soundtrackChoices = [...host.querySelectorAll(".soundtrack-choice")];
    }

    function boot() {
      try {
        music = new MusicEngine();
        renderer = new Renderer(UI.canvas);
        game = new Game(renderer, music, new BrowserMatchPresentation());
        if (modelReviewMode) {
          UI.intro.classList.add("is-gone");
          game.enemies = [];
          const reviewEnemy = {
            id: 9001,
            x: 0,
            z: 0,
            health: 12,
            maxHealth: 12,
            speed: 0,
            kind: 0,
            boss: false,
            hurt: 0,
            facing: 0
          };
          if (modelReviewTarget === "minions") {
            game.enemies = [
              { ...reviewEnemy, id: 9001, x: -0.48, kind: 0 },
              { ...reviewEnemy, id: 9002, x: 0.48, kind: 1 }
            ];
          } else if (modelReviewTarget === "herald") {
            game.enemies = [{ ...reviewEnemy, kind: 2, health: 3, maxHealth: 3 }];
          } else if (modelReviewTarget === "baron") {
            game.enemies = [{ ...reviewEnemy, kind: 3, boss: true }];
          }
        }
        UI.gpuLabel.textContent = `WebGL2 · ${renderer.ext ? "HDR" : "adaptive"}`;
        setupInput();
        UI.championChoices.forEach((button) =>
          button.addEventListener("click", () => game.selectChampion(button.dataset.champion))
        );
        buildArenaPicker();
        buildSoundtrackPicker();
        UI.start.addEventListener("click", beginGame);
        UI.restart.addEventListener("click", () => {
          UI.end.hidden = true;
          UI.chrome.classList.remove("is-hidden");
          UI.chrome.setAttribute("aria-hidden", "false");
          UI.chrome.removeAttribute("inert");
          game.start();
        });
        UI.guideOpen.addEventListener("click", openGuide);
        UI.guideOpenIntro.addEventListener("click", openGuide);
        UI.guideClose.addEventListener("click", closeGuide);
        UI.guide.addEventListener("cancel", (event) => {
          event.preventDefault();
          closeGuide();
        });
        UI.sound.addEventListener("click", toggleSound);
        UI.pause.addEventListener("click", () => game.togglePause());
        UI.arenaBombAction.addEventListener("click", () => game.placeBomb());
        UI.bombAction.addEventListener("click", () => game.castAbility(0));
        UI.dashAction.addEventListener("click", () => game.castAbility(1));
        UI.mineAction.addEventListener("click", () => game.castAbility(2));
        UI.ultAction.addEventListener("click", () => game.castAbility(3));
        document.addEventListener("visibilitychange", () => {
          if (document.hidden && game.mode === "playing" && !game.paused) game.togglePause(true);
        });
        requestAnimationFrame(frame);
      } catch (error) {
        console.error(error);
        UI.start.disabled = true;
        UI.start.textContent = "WebGL2 is required";
        UI.intro.querySelector(".intro-lede").textContent =
          "This browser could not initialize the WebGL2 arena. Open the file in a current Chrome, Edge, Firefox, or Safari build with hardware acceleration enabled.";
      }
    }

    boot();
