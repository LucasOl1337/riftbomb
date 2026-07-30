"use strict";

    let renderer;
    let sfx;
    let game;
    let lastFrame = performance.now();

    function configurePlayerView(playerId = 1, options = {}) {
      const localPlayerId = playerId === 2 ? 2 : 1;
      const shared = Boolean(options.shared);
      const localMultiplayer = Boolean(options.localMultiplayer);
      game.localPlayerId = localPlayerId;
      renderer?.setViewPlayer(shared ? 0 : localPlayerId);
      document.body.classList.toggle("is-local-multiplayer", localMultiplayer);
      const local = game.players.find((player) => player.id === localPlayerId);
      if (local) game.presentation.selectChampion(local.champion, localPlayerId);
      game.presentation.update(game);
    }

    globalThis.configurePlayerView = configurePlayerView;

    function frame(now) {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
      lastFrame = now;
      game.update(dt);
      try {
        sfx.update(game, dt);
      } catch (error) {
        console.warn("SFX update skipped for this frame:", error);
      }
      renderer.render(game, sfx, dt, now);
      document.documentElement.style.setProperty("--beat", sfx.visualPulse().toFixed(3));
      UI.fxLabel.textContent = `Bloom · ${Math.round(sfx.intensity * 100)}%`;
      requestAnimationFrame(frame);
    }

    async function beginGame() {
      if (game.mode === "playing") return;
      UI.start.disabled = true;
      UI.start.textContent = "Loading selected arena…";
      void sfx.start().catch((error) => console.warn("Audio will resume after player input:", error));
      const assetResults = await Promise.allSettled([
        renderer.ensureChampionModels(game.players.map((player) => player.champion)),
        renderer.ensureArenaTextures(game.arenaTemplate().theme)
      ]);
      for (const result of assetResults) {
        if (result.status === "rejected") {
          console.warn("A match asset could not fully load:", result.reason);
        }
      }
      UI.start.textContent = "Arena ready";
      game.start();
      if (game.p2Human) configurePlayerView(1, { shared: true, localMultiplayer: true });
      UI.chrome.classList.remove("is-hidden");
      UI.chrome.setAttribute("aria-hidden", "false");
      UI.chrome.removeAttribute("inert");
      UI.start.disabled = false;
      const arenaName = game.arenaTemplate().label;
      UI.live.textContent = `Rift Bomber · ${arenaName}. P1 uses WASD, Q/F/E/R and Space. P2 uses arrows, J/K/L/; and Enter.`;
      await enterMatchPresentation();
    }

    function isCoarseOrPhone() {
      return window.matchMedia("(pointer: coarse)").matches
        || window.matchMedia("(hover: none)").matches
        || Math.min(window.innerWidth, window.innerHeight) <= 520;
    }

    function isPortrait() {
      return window.matchMedia("(orientation: portrait)").matches
        || window.innerHeight > window.innerWidth;
    }

    function updateLandscapeGate() {
      const gate = document.getElementById("landscape-gate");
      if (!gate) return;
      const matchActive = document.documentElement.classList.contains("is-match-active");
      const show = matchActive && isCoarseOrPhone() && isPortrait();
      gate.hidden = !show;
      gate.setAttribute("aria-hidden", String(!show));
      document.documentElement.classList.toggle("needs-landscape", show);
    }

    async function lockLandscapeOrientation() {
      // The top-level online client owns fullscreen. Nested fullscreen requests
      // are unreliable on iOS and can leave a visible browser-sized border.
      if (window.self !== window.top) return;
      try {
        const root = document.documentElement;
        if (!document.fullscreenElement) {
          if (root.requestFullscreen) {
            await root.requestFullscreen({ navigationUI: "hide" });
          } else if (root.webkitRequestFullscreen) {
            await root.webkitRequestFullscreen();
          }
        }
      } catch {
        // Fullscreen is best-effort; iOS Safari often blocks it.
      }
      try {
        const orientation = screen.orientation;
        if (orientation?.lock) await orientation.lock("landscape");
      } catch {
        // Orientation lock requires fullscreen/PWA on many browsers.
      }
    }

    async function enterMatchPresentation() {
      document.documentElement.classList.add("is-match-active");
      document.body.classList.add("is-match-active");
      // Online lobby banner must never sit over mobile skills.
      const onlineBanner = document.querySelector(".runtime-network-status");
      if (onlineBanner) {
        onlineBanner.hidden = true;
        onlineBanner.textContent = "";
      }
      document.querySelector(".runtime-network-controls")?.setAttribute("hidden", "");
      // fluid-bg is a second WebGL surface — kill it during match on phones.
      const fluid = document.querySelector("fluid-bg, #riftbomb-background");
      if (fluid) {
        fluid.style.display = "none";
        fluid.setAttribute("hidden", "");
        try { fluid.remove(); } catch { /* keep hidden if removal is blocked */ }
      }
      document.querySelector(".fx-grain")?.setAttribute("hidden", "");
      await lockLandscapeOrientation();
      updateLandscapeGate();
      // Canvas size can change after rotate/fullscreen.
      try { renderer?.resize?.(); } catch {}
    }

    async function leaveMatchPresentation() {
      document.documentElement.classList.remove("is-match-active", "needs-landscape");
      document.body.classList.remove("is-match-active");
      const gate = document.getElementById("landscape-gate");
      if (gate) {
        gate.hidden = true;
        gate.setAttribute("aria-hidden", "true");
      }
      try { screen.orientation?.unlock?.(); } catch {}
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
      } catch {}
    }

    function setupLandscapeGate() {
      const gateAction = document.getElementById("landscape-gate-action");
      gateAction?.addEventListener("click", async () => {
        await lockLandscapeOrientation();
        updateLandscapeGate();
        try { renderer?.resize?.(); } catch {}
      });
      const refresh = () => {
        updateLandscapeGate();
        try { renderer?.resize?.(); } catch {}
      };
      addEventListener("orientationchange", () => setTimeout(refresh, 80));
      addEventListener("resize", refresh);
      screen.orientation?.addEventListener?.("change", refresh);
    }

    function openGuide() {
      UI.guide.showModal();
      UI.guideClose.focus();
    }

    function closeGuide() {
      UI.guide.close();
    }

    function setupInput() {
      addEventListener("keydown", (event) => {
        if (game.mode === "playing") void sfx.start().catch(() => {});
        if (UI.guide.open) {
          if (event.code === "KeyH") closeGuide();
          return;
        }
        const gameKeys = [
          "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyF", "KeyE", "KeyR",
          "KeyJ", "KeyK", "KeyL", "Semicolon", "Numpad1", "Numpad2", "Numpad3", "Numpad4",
          "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter",
          "Numpad0", "ShiftLeft", "ShiftRight"
        ];
        if (gameKeys.includes(event.code) && game.mode === "playing") event.preventDefault();
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Numpad0", "ShiftRight",
          "KeyJ", "KeyK", "KeyL", "Semicolon", "Numpad1", "Numpad2", "Numpad3", "Numpad4"].includes(event.code)
          && game.mode === "playing") {
          game.activatePlayerTwo();
          configurePlayerView(1, { shared: true, localMultiplayer: true });
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
        else if (["KeyJ", "Numpad1"].includes(event.code)) game.castAbility(0, game.players[1]);
        else if (["KeyK", "Numpad2"].includes(event.code)) game.castAbility(1, game.players[1]);
        else if (["KeyL", "Numpad3"].includes(event.code)) game.castAbility(2, game.players[1]);
        else if (["Semicolon", "Numpad4"].includes(event.code)) game.castAbility(3, game.players[1]);
        else if (event.code === "KeyH") openGuide();
      });
      addEventListener("keyup", (event) => game.keys.delete(event.code));
      addEventListener("pointerdown", () => {
        if (game.mode === "playing") void sfx.start().catch(() => {});
      }, { passive: true });
      addEventListener("wheel", (event) => {
        if (!document.body.classList.contains("is-online-match") || game.mode !== "playing") return;
        event.preventDefault();
        const zoom = renderer.adjustViewZoom(event.deltaY < 0 ? 0.1 : -0.1);
        UI.live.textContent = `Camera zoom · ${Math.round((zoom / 1.35) * 100)}%`;
      }, { passive: false });
      addEventListener("blur", () => {
        game.keys.clear();
        game.touchDirs.clear();
        resetTouchStick();
      });

      setupTouchStick();
      bindTouchAction(UI.touchBomb, () => game.placeBomb());
      bindTouchAction(UI.touchQ, () => game.castAbility(0));
      bindTouchAction(UI.touchDash, () => game.castAbility(1));
      bindTouchAction(UI.touchMine, () => game.castAbility(2));
      bindTouchAction(UI.touchUlt, () => game.castAbility(3));
    }

    function resetTouchStick() {
      if (!game) return;
      game.touchStick.x = 0;
      game.touchStick.z = 0;
      UI.touchStick?.classList.remove("is-active");
      if (UI.touchStickKnob) UI.touchStickKnob.style.transform = "translate3d(0, 0, 0)";
    }

    function setupTouchStick() {
      const zone = UI.touchMoveZone;
      const stick = UI.touchStick;
      const knob = UI.touchStickKnob;
      if (!zone || !stick || !knob) return;

      let activePointer = null;
      let anchorX = 0;
      let anchorY = 0;
      let maxRadius = 1;
      const deadzone = 0.18;

      // Floating stick: it spawns centered on the touch point and every
      // direction offset is measured from that anchor, not the element.
      const spawnStick = (clientX, clientY) => {
        const rect = stick.getBoundingClientRect();
        anchorX = clientX;
        anchorY = clientY;
        maxRadius = Math.min(rect.width, rect.height) * 0.34;
        stick.classList.add("is-floating");
        stick.style.transform = `translate3d(${clientX - rect.width / 2}px, ${clientY - rect.height / 2}px, 0)`;
      };

      const parkStick = () => {
        stick.classList.remove("is-floating");
        stick.style.transform = "";
      };

      const applyStick = (clientX, clientY) => {
        let offsetX = clientX - anchorX;
        let offsetY = clientY - anchorY;
        const distance = Math.hypot(offsetX, offsetY);
        if (distance > maxRadius && distance > 0) {
          offsetX = (offsetX / distance) * maxRadius;
          offsetY = (offsetY / distance) * maxRadius;
        }
        knob.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
        // Screen Y grows down; arena forward (-Z) is stick up.
        const nx = maxRadius > 0 ? offsetX / maxRadius : 0;
        const nz = maxRadius > 0 ? offsetY / maxRadius : 0;
        const magnitude = Math.hypot(nx, nz);
        if (magnitude <= deadzone) {
          game.touchStick.x = 0;
          game.touchStick.z = 0;
        } else {
          game.touchStick.x = nx;
          game.touchStick.z = nz;
        }
      };

      zone.addEventListener("pointerdown", (event) => {
        if (activePointer !== null) return;
        event.preventDefault();
        activePointer = event.pointerId;
        zone.setPointerCapture?.(event.pointerId);
        spawnStick(event.clientX, event.clientY);
        stick.classList.add("is-active");
        applyStick(event.clientX, event.clientY);
        if (game.mode === "playing") void sfx.start().catch(() => {});
      });

      zone.addEventListener("pointermove", (event) => {
        if (event.pointerId !== activePointer) return;
        event.preventDefault();
        applyStick(event.clientX, event.clientY);
      });

      const release = (event) => {
        if (event && event.pointerId !== activePointer) return;
        activePointer = null;
        resetTouchStick();
        parkStick();
      };

      // Listen at window capture phase so releasing a second finger cannot
      // cancel the stick and a release outside its bounds can never leave it on.
      addEventListener("pointerup", release, { capture: true });
      addEventListener("pointercancel", release, { capture: true });
      addEventListener("blur", () => release(), { passive: true });
    }

    function bindTouchAction(button, action) {
      if (!button) return;
      let activePointer = null;
      const press = (event) => {
        if (activePointer !== null) return;
        event.preventDefault();
        activePointer = event.pointerId;
        button.classList.add("is-pressed");
        if (game.mode === "playing") void sfx.start().catch(() => {});
        action();
      };
      const unpress = (event) => {
        if (event && event.pointerId !== activePointer) return;
        activePointer = null;
        button.classList.remove("is-pressed");
      };
      button.addEventListener("pointerdown", press);
      addEventListener("pointerup", unpress, { capture: true });
      addEventListener("pointercancel", unpress, { capture: true });
      addEventListener("blur", () => unpress(), { passive: true });
    }

    function boot() {
      sfx = new SfxEngine();
      const previewRenderer = {
        cameraShake: 0,
        hitPulse: 0,
        addShock() {},
        ensureChampionModel() { return Promise.resolve(); },
        ensureChampionModels() { return Promise.resolve(); }
      };
      game = new Game(previewRenderer, sfx, new BrowserMatchPresentation());
      game.activateBotOpponent();
      try {
        renderer = new Renderer(UI.canvas);
        game.renderer = renderer;
        const embeddedModels = [
          ...game.players.map((player) => player.champion),
          modelReviewTarget
        ]
          .filter(Boolean);
        void renderer.ensureChampionModels(embeddedModels);
        if (modelReviewMode) {
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
        setupLandscapeGate();
        UI.start.addEventListener("click", beginGame);
        UI.restart.addEventListener("click", () => {
          UI.end.hidden = true;
          UI.chrome.classList.remove("is-hidden");
          UI.chrome.setAttribute("aria-hidden", "false");
          UI.chrome.removeAttribute("inert");
          game.start();
          void enterMatchPresentation();
        });
        UI.guideOpen.addEventListener("click", openGuide);
        UI.guideClose.addEventListener("click", closeGuide);
        UI.guide.addEventListener("cancel", (event) => {
          event.preventDefault();
          closeGuide();
        });
        UI.arenaBombAction.addEventListener("click", () => game.placeBomb());
        UI.bombAction.addEventListener("click", () => game.castAbility(0));
        UI.dashAction.addEventListener("click", () => game.castAbility(1));
        UI.mineAction.addEventListener("click", () => game.castAbility(2));
        UI.ultAction.addEventListener("click", () => game.castAbility(3));
        UI.playerTwoBombButton?.addEventListener("click", () => game.placeBomb(game.players[1]));
        UI.playerTwoSkillButtons.forEach((button) => button.addEventListener("click", () => {
          game.castAbility(Number(button.dataset.p2Slot), game.players[1]);
        }));
        requestAnimationFrame(frame);
        if (window.self === window.top && !modelReviewMode) void beginGame();
      } catch (error) {
        console.error(error);
        UI.start.disabled = true;
        UI.start.textContent = "WebGL2 is required";
        UI.live.textContent =
          "This browser could not initialize the WebGL2 arena. Use a current browser with hardware acceleration enabled.";
      }
    }

    boot();
