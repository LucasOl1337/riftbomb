"use strict";

    let renderer;
    let sfx;
    let game;
    let lastFrame = performance.now();
    let selectedLocalPlayer = 1;

    function updatePlayerSelector(playerId) {
      selectedLocalPlayer = playerId === 2 ? 2 : 1;
      UI.playerSelectorButtons.forEach((button) => {
        const selected = Number(button.dataset.selectPlayer) === selectedLocalPlayer;
        button.setAttribute("aria-pressed", String(selected));
      });
      if (UI.playerConfigLabel) UI.playerConfigLabel.textContent = `P${selectedLocalPlayer} / UNIT`;
      const champion = selectedLocalPlayer === 2 ? game.selectedChampion2 : game.selectedChampion;
      game.presentation.selectChampion(champion, selectedLocalPlayer);
    }

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
      sfx.update(game, dt);
      renderer.render(game, sfx, dt, now);
      document.documentElement.style.setProperty("--beat", sfx.visualPulse().toFixed(3));
      UI.fxLabel.textContent = `Bloom · ${Math.round(sfx.intensity * 100)}%`;
      requestAnimationFrame(frame);
    }

    async function beginGame() {
      UI.start.disabled = true;
      UI.start.textContent = "Loading selected arena…";
      void sfx.start().catch((error) => console.warn("Audio will resume after player input:", error));
      const assetResults = await Promise.allSettled([
        renderer.ensureChampionModels(game.players.map((player) => player.champion)),
        renderer.arenaTexturesReady
      ]);
      for (const result of assetResults) {
        if (result.status === "rejected") {
          console.warn("A match asset could not fully load:", result.reason);
        }
      }
      UI.start.textContent = "Arena ready";
      game.start();
      if (game.p2Human) configurePlayerView(1, { shared: true, localMultiplayer: true });
      UI.intro.classList.add("is-gone");
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
      const onlineBanner = document.querySelector(".online-connection");
      if (onlineBanner) {
        onlineBanner.hidden = true;
        onlineBanner.textContent = "";
      }
      document.querySelector(".online-panel")?.setAttribute("hidden", "");
      // fluid-bg is a second WebGL surface — kill it during match on phones.
      const fluid = document.querySelector("fluid-bg");
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

    const arenaPreviewTextures = new Map();

    function loadArenaPreviewTexture(source) {
      if (!source) return Promise.resolve(null);
      if (!arenaPreviewTextures.has(source)) {
        arenaPreviewTextures.set(source, new Promise((resolve) => {
          const image = new Image();
          image.decoding = "async";
          image.onload = () => resolve(image);
          image.onerror = () => resolve(null);
          image.src = source;
        }));
      }
      return arenaPreviewTextures.get(source);
    }

    function fillPolygon(context, points, fill, texture = null, alpha = 1) {
      context.save();
      context.beginPath();
      context.moveTo(points[0][0], points[0][1]);
      for (let index = 1; index < points.length; index++) {
        context.lineTo(points[index][0], points[index][1]);
      }
      context.closePath();
      context.fillStyle = fill;
      context.fill();
      if (texture) {
        const pattern = context.createPattern(texture, "repeat");
        if (pattern) {
          context.globalAlpha = alpha;
          context.fillStyle = pattern;
          context.fill();
        }
      }
      context.restore();
    }

    async function paintArenaPreview(canvas, grid, arena) {
      const theme = game.arenaTemplate(arena.id).theme;
      const sources = {
        floor: ARENA_TEXTURES[theme.floor],
        wall: ARENA_TEXTURES[theme.wall],
        wallTop: ARENA_TEXTURES[theme.wallTop],
        crate: ARENA_TEXTURES.crate,
        crateTop: ARENA_TEXTURES.crateTop
      };
      const textureEntries = await Promise.all(
        Object.entries(sources).map(async ([key, source]) => [key, await loadArenaPreviewTexture(source)])
      );
      if (!canvas.isConnected) return;
      const textures = Object.fromEntries(textureEntries);
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const width = 360;
      const height = 178;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const context = canvas.getContext("2d");
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.imageSmoothingEnabled = true;

      const backdrop = context.createLinearGradient(0, 0, 0, height);
      backdrop.addColorStop(0, theme.clear);
      backdrop.addColorStop(1, theme.base);
      context.fillStyle = backdrop;
      context.fillRect(0, 0, width, height);

      const halfW = 10.8;
      const halfH = 5.25;
      const originX = width / 2;
      const originY = 16;
      const safe = new Set([
        `${grid.length - 2},1`, `${grid.length - 3},1`, `${grid.length - 2},2`,
        `1,${grid[0].length - 2}`, `2,${grid[0].length - 2}`, `1,${grid[0].length - 3}`
      ]);
      const diamond = (x, y) => [
        [x, y - halfH],
        [x + halfW, y],
        [x, y + halfH],
        [x - halfW, y]
      ];

      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          const x = originX + (c - r) * halfW;
          const y = originY + (c + r) * halfH;
          fillPolygon(context, diamond(x, y), theme.floorB, textures.floor, 0.78);
          if (safe.has(`${r},${c}`)) {
            const glow = context.createRadialGradient(x, y, 0, x, y, halfW * 1.15);
            glow.addColorStop(0, `${theme.crystal}e6`);
            glow.addColorStop(0.5, `${theme.crystal}55`);
            glow.addColorStop(1, `${theme.crystal}00`);
            context.fillStyle = glow;
            context.beginPath();
            context.ellipse(x, y, halfW * 1.25, halfH * 1.55, 0, 0, Math.PI * 2);
            context.fill();
          }
        }
      }

      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          const type = grid[r][c];
          if (!type) continue;
          const x = originX + (c - r) * halfW;
          const y = originY + (c + r) * halfH;
          const rise = type === 1 ? 12.5 : 9.2;
          const top = diamond(x, y - rise);
          const base = diamond(x, y);
          const side = type === 1 ? theme.stone : "#59331e";
          const sideTexture = type === 1 ? textures.wall : textures.crate;
          const topTexture = type === 1 ? textures.wallTop : textures.crateTop;
          fillPolygon(context, [top[3], top[2], base[2], base[3]], side, sideTexture, 0.72);
          fillPolygon(context, [top[1], top[2], base[2], base[1]], theme.base, sideTexture, 0.58);
          fillPolygon(context, top, type === 1 ? theme.stoneTop : "#9b6337", topTexture, 0.86);
          context.strokeStyle = type === 1 ? `${theme.crystal}38` : "#d49a5b45";
          context.lineWidth = 0.6;
          context.beginPath();
          context.moveTo(top[0][0], top[0][1]);
          for (let index = 1; index < top.length; index++) context.lineTo(top[index][0], top[index][1]);
          context.closePath();
          context.stroke();
        }
      }

      const shade = context.createLinearGradient(0, 0, width, height);
      shade.addColorStop(0, "rgb(0 0 0 / 34%)");
      shade.addColorStop(0.5, "rgb(0 0 0 / 0%)");
      shade.addColorStop(1, "rgb(0 0 0 / 44%)");
      context.fillStyle = shade;
      context.fillRect(0, 0, width, height);
      context.strokeStyle = `${theme.crystal}70`;
      context.lineWidth = 1;
      context.strokeRect(0.5, 0.5, width - 1, height - 1);
    }

    function createArenaPreview(grid, arena) {
      const canvas = document.createElement("canvas");
      canvas.className = "arena-mini";
      canvas.dataset.arena = arena.id;
      canvas.setAttribute("aria-hidden", "true");
      void paintArenaPreview(canvas, grid, arena);
      return canvas;
    }

    function buildArenaPicker() {
      const host = document.getElementById("arena-select") || document.querySelector(".arena-select");
      if (!host || !game) return;
      const heading = document.createElement("span");
      heading.className = "micro";
      heading.textContent = `[ ARENAS ] · ${game.listArenas().length} real previews`;
      host.replaceChildren(heading);
      game.listArenas().forEach((arena) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "arena-choice";
        button.dataset.arena = arena.id;
        button.setAttribute("role", "radio");
        button.setAttribute("aria-checked", String(arena.id === game.selectedArena));
        button.title = arena.blurb;
        const previewShell = document.createElement("div");
        previewShell.className = "arena-preview-shell";
        const previewLabel = document.createElement("span");
        previewLabel.className = "arena-preview-label micro";
        previewLabel.textContent = "REAL ARENA VIEW";
        previewLabel.setAttribute("aria-hidden", "true");
        previewShell.append(createArenaPreview(game.previewGrid(arena.id), arena), previewLabel);
        const title = document.createElement("strong");
        title.textContent = arena.label;
        const blurb = document.createElement("small");
        blurb.textContent = arena.blurb;
        button.append(previewShell, title, blurb);
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
      buildArenaPicker();
      UI.championChoices.forEach((button) => button.addEventListener("click", () => {
        if (selectedLocalPlayer === 2) game.selectChampion2(button.dataset.champion);
        else game.selectChampion(button.dataset.champion);
        updatePlayerSelector(selectedLocalPlayer);
      }));
      UI.playerSelectorButtons.forEach((button) => button.addEventListener("click", () => {
        const playerId = Number(button.dataset.selectPlayer) === 2 ? 2 : 1;
        if (playerId === 2 && game.mode === "intro") game.activatePlayerTwo();
        updatePlayerSelector(playerId);
      }));
      try {
        renderer = new Renderer(UI.canvas);
        game.renderer = renderer;
        const embeddedModels = game.players
          .map((player) => player.champion)
          .filter((champion) => PLAYABLE_CHAMPIONS[champion]);
        void renderer.ensureChampionModels(embeddedModels);
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
        UI.guideOpenIntro.addEventListener("click", openGuide);
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
      } catch (error) {
        console.error(error);
        UI.start.disabled = true;
        UI.start.textContent = "WebGL2 is required";
        UI.intro.querySelector(".intro-lede").textContent =
          "This browser could not initialize the WebGL2 arena. Open the file in a current Chrome, Edge, Firefox, or Safari build with hardware acceleration enabled.";
      }
    }

    boot();
