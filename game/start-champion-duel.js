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
      const beatFloat = position / (60 / music.bpm);
      const beat = Math.floor(beatFloat) % 4;
      const bar = Math.floor(beatFloat / 4) % music.totalBars;
      const section = music.sectionForBar(bar);
      document.documentElement.style.setProperty("--beat", music.visualBeat().toFixed(3));
      UI.playhead.style.setProperty("--progress", progress.toFixed(5));
      UI.trackTime.textContent = formatTime(position);
      UI.musicSection.textContent = section.name;
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
      music.updateEnergy();
      game.update(dt);
      renderer.render(game, music, dt, now);
      updateMusicUI();
      requestAnimationFrame(frame);
    }

    async function beginGame() {
      UI.start.disabled = true;
      UI.start.textContent = "Calibrating audio…";
      try {
        await music.start();
      } catch (error) {
        console.warn("Audio could not start:", error);
      }
      game.start();
      UI.intro.classList.add("is-gone");
      UI.chrome.classList.remove("is-hidden");
      UI.chrome.setAttribute("aria-hidden", "false");
      UI.chrome.removeAttribute("inert");
      UI.start.disabled = false;
      UI.live.textContent = game.player.champion !== "ziggs"
        ? `Rift Bomber started. ${game.player.name} uses WASD, Q/F/E/R and Space for arena bombs. Red Ziggs uses arrows and Enter.`
        : "Rift Bomber started. Blue Ziggs uses WASD, Q and Shift. Red Ziggs uses arrows and Enter.";
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
