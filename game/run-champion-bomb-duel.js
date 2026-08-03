"use strict";

    // Fixed-block (1) layouts for the 11×13 Bomber Rift. Soft crates (2) fill afterwards.
    // Each template must leave blue spawn (bottom-left) and red spawn (top-right) open.
    // theme.floor/wall/wallTop = ARENA_TEXTURES keys; hex colors drive procedural accents.
    const ARENA_TEMPLATES = Object.freeze([
      {
        id: "lattice",
        label: "Salt Lens Array",
        blurb: "Black-salt observatory · balanced lanes",
        crateChance: 0.73,
        powerupChance: 0.48,
        theme: Object.freeze({
          floor: "floorLattice",
          wall: "wallLattice",
          wallTop: "wallTopLattice",
          clear: "#07090b",
          base: "#171b1e",
          floorA: "#8a5a3a",
          floorB: "#6e452c",
          lane: "#a87850",
          river: "#176c70",
          riverLight: "#3ed6c5",
          stone: "#252a2d",
          stoneTop: "#4f5554",
          crystal: "#3ed6c5",
          accent: "#ff8a3d",
          fx: Object.freeze({
            motif: 0,
            primary: "#3ed6c5",
            secondary: "#ff8a3d",
            intensity: 0.82,
            speed: 0.42,
            density: 1.05
          })
        }),
        placeHard(grid, rows, cols) {
          for (let r = 2; r < rows - 1; r += 2) {
            for (let c = 2; c < cols - 1; c += 2) grid[r][c] = 1;
          }
        }
      },
      {
        id: "clearing",
        label: "Nacre Hollow",
        blurb: "Sunken shell-garden · open center",
        crateChance: 0.25,
        powerupChance: 0.52,
        theme: Object.freeze({
          floor: "floorClearing",
          wall: "wallClearing",
          wallTop: "wallTopClearing",
          soft: "nacreGrowth",
          clear: "#03191e",
          base: "#08282c",
          floorA: "#b8b2a6",
          floorB: "#817f78",
          lane: "#d8d1c2",
          river: "#12565c",
          riverLight: "#54c9cc",
          stone: "#777c78",
          stoneTop: "#ddd8ca",
          crystal: "#54c9cc",
          accent: "#78cfca",
          fx: Object.freeze({
            motif: 1,
            primary: "#4cced3",
            secondary: "#c6a7c7",
            intensity: 0.20,
            speed: 0.32,
            density: 0.82
          })
        }),
        placeHard(grid, rows, cols) {
          const pillars = [
            [3, 4], [3, 8], [5, 3], [5, 9], [7, 4], [7, 8], [5, 6]
          ];
          for (const [r, c] of pillars) {
            if (r > 0 && r < rows - 1 && c > 0 && c < cols - 1) grid[r][c] = 1;
          }
        }
      },
      {
        id: "labyrinth",
        label: "Cinderfrost Works",
        blurb: "Polar foundry · long thermal corridors",
        crateChance: 0.68,
        powerupChance: 0.45,
        theme: Object.freeze({
          floor: "floorLabyrinth",
          wall: "wallLabyrinth",
          wallTop: "wallTopLabyrinth",
          clear: "#070a0e",
          base: "#11161c",
          floorA: "#20262d",
          floorB: "#151b21",
          lane: "#69747e",
          river: "#70371f",
          riverLight: "#ff7a2e",
          stone: "#202932",
          stoneTop: "#d6f1f5",
          crystal: "#52a9c9",
          accent: "#ff7a2e",
          fx: Object.freeze({
            motif: 2,
            primary: "#52a9c9",
            secondary: "#ff7a2e",
            intensity: 0.88,
            speed: 0.48,
            density: 1.22
          })
        }),
        placeHard(grid, rows, cols) {
          for (let r = 1; r < rows - 1; r++) {
            if (r === 3 || r === 5 || r === 7) continue;
            grid[r][3] = 1;
            grid[r][9] = 1;
          }
          for (let c = 1; c < cols - 1; c++) {
            if (c === 2 || c === 6 || c === 10) continue;
            grid[3][c] = 1;
            grid[7][c] = 1;
          }
          grid[5][5] = 1;
          grid[5][7] = 1;
        }
      },
      {
        id: "forts",
        label: "Aeolian Bastions",
        blurb: "Storm archive · open kill lane",
        crateChance: 0.70,
        powerupChance: 0.50,
        theme: Object.freeze({
          floor: "floorForts",
          wall: "wallForts",
          wallTop: "wallTopForts",
          clear: "#07140c",
          base: "#122418",
          floorA: "#3a7a36",
          floorB: "#2a5a28",
          lane: "#8a9a5a",
          river: "#2c788c",
          riverLight: "#5ad0e6",
          stone: "#b8b5aa",
          stoneTop: "#e9e4d5",
          crystal: "#5ad0e6",
          accent: "#c46d38",
          fx: Object.freeze({
            motif: 3,
            primary: "#5ad0e6",
            secondary: "#7ec85a",
            intensity: 0.72,
            speed: 0.56,
            density: 0.92
          })
        }),
        placeHard(grid, rows, cols) {
          const blue = [
            [8, 3], [8, 4], [7, 4], [6, 4], [6, 3],
            [8, 5], [7, 5]
          ];
          for (const [r, c] of blue) {
            grid[r][c] = 1;
            grid[rows - 1 - r][cols - 1 - c] = 1;
          }
          grid[5][2] = 1;
          grid[5][10] = 1;
          grid[2][6] = 1;
          grid[8][6] = 1;
        }
      },
      {
        id: "pit",
        label: "Storm-Eye Basin",
        blurb: "Charged ring · calm center · outer lane",
        crateChance: 0.76,
        powerupChance: 0.46,
        theme: Object.freeze({
          floor: "floorPit",
          wall: "wallPit",
          wallTop: "wallTopPit",
          clear: "#050810",
          base: "#0c1424",
          floorA: "#1a2848",
          floorB: "#121c36",
          lane: "#6d7480",
          river: "#183d59",
          riverLight: "#5ad0e6",
          stone: "#263349",
          stoneTop: "#9fa9b8",
          crystal: "#5ad0e6",
          accent: "#c44972",
          fx: Object.freeze({
            motif: 4,
            primary: "#5ad0e6",
            secondary: "#c44972",
            intensity: 0.92,
            speed: 0.68,
            density: 1.12
          })
        }),
        placeHard(grid, rows, cols) {
          for (let c = 3; c <= 9; c++) {
            if (c !== 6) {
              grid[2][c] = 1;
              grid[8][c] = 1;
            }
          }
          for (let r = 3; r <= 7; r++) {
            if (r !== 5) {
              grid[r][2] = 1;
              grid[r][10] = 1;
            }
          }
          grid[4][5] = 1;
          grid[4][7] = 1;
          grid[6][5] = 1;
          grid[6][7] = 1;
        }
      }
    ]);

    // Bot skill intents ("q" | "w" | "e" | "r") map to the same slots the
    // human input uses; unknown values never reach castAbility.
    const BOT_SKILL_SLOTS = Object.freeze({ q: 0, w: 1, e: 2, r: 3 });
    const ABILITY_ANIMATION_ACTIONS = Object.freeze(["q", "w", "e", "r", "rStrike"]);
    const ZED_DEATH_MARK_WINDUP_SECONDS = 0.6;
    const ZED_DEATH_MARK_DASH_SECONDS = 0.35;
    const ZED_DEATH_MARK_COMMITMENT_SECONDS =
      ZED_DEATH_MARK_WINDUP_SECONDS + ZED_DEATH_MARK_DASH_SECONDS;
    const ZED_DEATH_MARK_FUSE_SECONDS = 3;
    const ZED_DEATH_MARK_SHADOW_SECONDS = 9;
    const ABILITY_ANIMATION_DURATIONS = Object.freeze({
      katarina: Object.freeze([0.42, 0.42, 0.42, 1.65]),
      zed: Object.freeze([0.48, 0.48, 0.52, ZED_DEATH_MARK_WINDUP_SECONDS]),
      renekton: Object.freeze([0.58, 0.56, 0.46, 0.72]),
      vladimir: Object.freeze([0.56, 1.45, 0.62, 0.66]),
      gangplank: Object.freeze([0.48, 0.4, 0.42, 0.7])
    });
    const ABILITY_BUFFER_SECONDS = 0.15;
    const ABILITY_TIME_EPSILON = 0.000001;

    function compactLiveParticles(particles) {
      let writeIndex = 0;
      for (let readIndex = 0; readIndex < particles.length; readIndex += 1) {
        const particle = particles[readIndex];
        if (particle.age >= particle.life || particle.y <= -0.2) continue;
        particles[writeIndex] = particle;
        writeIndex += 1;
      }
      particles.length = writeIndex;
      return particles;
    }

    class Game {
      constructor(renderer, sfx, presentation) {
        this.renderer = renderer;
        this.sfx = sfx;
        this.presentation = presentation;
        this.cols = 13;
        this.rows = 11;
        this.tile = 1.32;
        this.mode = "intro";
        this.grid = [];
        this.powerupPlan = new Map();
        this.bombs = [];
        this.blasts = [];
        this.ultimates = [];
        this.pickups = [];
        this.enemies = [];
        this.particles = [];
        this.daggers = [];
        this.projectiles = [];
        this.skillTrails = [];
        this.slashes = [];
        this.zedShadows = [];
        this.zedMarks = [];
        this.vladimirMarks = [];
        this.gangplankBarrels = [];
        this.gangplankBarrages = [];
        this.players = [];
        this.player = null;
        this.daggerId = 0;
        this.shadowId = 0;
        this.selectedChampion = "katarina";
        this.selectedChampion2 = "zed";
        this.selectedBot = null;
        this.localPlayerId = 1;
        this.selectedArena = ARENA_TEMPLATES[0].id;
        this.round = 0;
        this.wave = 1;
        this.maxWave = 5;
        this.roundWins = [0, 0];
        this.matchTarget = 3;
        this.roundTime = 90;
        this.roundAge = 0;
        this.roundLocked = false;
        this.roundTransition = 0;
        this.roundDecisionTimer = -1;
        this.pendingMatchWinner = null;
        this.elapsed = 0;
        this.bombId = 0;
        this.daggerId = 0;
        this.seed = 0xA57A2026;
        this.keys = new Set();
        this.touchDirs = new Set();
        // Analog stick for mobile (-1..1). Zero when released.
        this.touchStick = { x: 0, z: 0 };
        // Latest mouse position on the arena ground plane; null until the
        // local player moves a mouse. Touch aim never writes here — it arrives
        // per-cast from the skill-button drag.
        this.pointerAim = null;
        // One authoritative postponed spell per player. Commands keep a player
        // id rather than an object reference because online snapshots replace
        // player objects in-place.
        this.abilityBuffer = new Map();
        this.abilityCommandSequence = 0;
        this.abilityBufferStats = {
          queued: 0,
          executed: 0,
          expired: 0,
          replaced: 0,
          canceled: 0,
          channelsCanceled: 0
        };
        this.statusTimer = 0;
        this.p2Human = false;
        this.generateMap();
        this.resetPlayers();
        this.botPolicy = typeof RIFTBOMB_BOTS === "undefined"
          ? null
          : this.createBotPolicy();
        this.resetBotPolicy();
      }

      createBotPolicy() {
        const random = () => 0;
        // V1 (Renekton pilot) ships in load-v1-bot.js; without that bundle
        // the solo CPU falls back to the baseline policy as before.
        if (typeof RIFTBOMB_BOTS.createV1Policy === "function") {
          // The champion module must match the champion the CPU actually
          // plays; without one the V1 runs its shared arena brain only.
          const createPilot = this.selectedChampion2 === "renekton"
            ? RIFTBOMB_BOTS.createRenektonPilot
            : null;
          if (typeof createPilot === "function") {
            return RIFTBOMB_BOTS.createV1Policy({
              champion: createPilot({ random }),
              random
            });
          }
          return RIFTBOMB_BOTS.createV1Policy({ random });
        }
        return RIFTBOMB_BOTS.createBaselinePolicy({ random });
      }

      random() {
        this.seed ^= this.seed << 13;
        this.seed ^= this.seed >>> 17;
        this.seed ^= this.seed << 5;
        return (this.seed >>> 0) / 4294967296;
      }

      listArenas() {
        return ARENA_TEMPLATES.map(({ id, label, blurb }) => ({ id, label, blurb }));
      }

      arenaTemplate(id = this.selectedArena) {
        return ARENA_TEMPLATES.find((entry) => entry.id === id) || ARENA_TEMPLATES[0];
      }

      /** Deterministic soft-crate preview for intro minimaps (no RNG). */
      previewGrid(arenaId = this.selectedArena) {
        const template = this.arenaTemplate(arenaId);
        const grid = Array.from({ length: this.rows }, (_, r) =>
          Array.from({ length: this.cols }, (_, c) =>
            r === 0 || c === 0 || r === this.rows - 1 || c === this.cols - 1 ? 1 : 0
          )
        );
        template.placeHard(grid, this.rows, this.cols);
        const safe = this.spawnSafeCells();
        for (let r = 1; r < this.rows - 1; r++) {
          for (let c = 1; c < this.cols - 1; c++) {
            if (grid[r][c] === 1 || safe.has(`${r},${c}`)) continue;
            // Stable pseudo-density for UI: denser on template's crateChance
            const hash = ((r * 31 + c * 17 + arenaId.length * 13) >>> 0) % 100;
            if (hash < template.crateChance * 100) grid[r][c] = 2;
          }
        }
        return grid;
      }

      spawnSafeCells() {
        return new Set([
          `${this.rows - 2},1`, `${this.rows - 3},1`, `${this.rows - 2},2`,
          `1,${this.cols - 2}`, `2,${this.cols - 2}`, `1,${this.cols - 3}`
        ]);
      }

      selectArena(arenaId) {
        if (this.mode !== "intro") return;
        if (!ARENA_TEMPLATES.some((entry) => entry.id === arenaId)) return;
        this.selectedArena = arenaId;
        this.seed = 0xA57A2026;
        this.generateMap();
        this.resetPlayers();
        this.presentation.update(this);
      }

      generateMap() {
        const template = this.arenaTemplate();
        this.grid = Array.from({ length: this.rows }, (_, r) =>
          Array.from({ length: this.cols }, (_, c) =>
            r === 0 || c === 0 || r === this.rows - 1 || c === this.cols - 1 ? 1 : 0
          )
        );
        this.powerupPlan = new Map();
        template.placeHard(this.grid, this.rows, this.cols);

        const safe = this.spawnSafeCells();
        // Never hard-block spawn pockets even if a template is sloppy.
        for (const key of safe) {
          const [r, c] = key.split(",").map(Number);
          this.grid[r][c] = 0;
        }

        const seen = new Set();
        const types = ["range", "bomb", "speed", "shield"];
        for (let r = 1; r < this.rows - 1; r++) {
          for (let c = 1; c < this.cols - 1; c++) {
            const key = `${r},${c}`;
            if (seen.has(key) || safe.has(key) || this.grid[r][c] === 1) continue;
            const mr = this.rows - 1 - r;
            const mc = this.cols - 1 - c;
            const mirror = `${mr},${mc}`;
            seen.add(key);
            seen.add(mirror);
            const cells = [[r, c]];
            if (mr !== r || mc !== c) cells.push([mr, mc]);
            const breakable = this.random() < template.crateChance;
            const hidden = breakable && this.random() < template.powerupChance
              ? types[Math.floor(this.random() * types.length)]
              : null;
            for (const [rr, cc] of cells) {
              const cellKey = `${rr},${cc}`;
              if (safe.has(cellKey) || this.grid[rr][cc] === 1) continue;
              this.grid[rr][cc] = breakable ? 2 : 0;
              if (hidden) this.powerupPlan.set(cellKey, hidden);
            }
          }
        }
      }

      worldFromCell(r, c) {
        return [(c - (this.cols - 1) / 2) * this.tile, (r - (this.rows - 1) / 2) * this.tile];
      }

      audioPanAt(x, z = 0) {
        const numericX = Number(x);
        const numericZ = Number(z);
        if (!Number.isFinite(numericX) || !Number.isFinite(numericZ)) return 0;
        const viewPlayerId = this.renderer?.viewPlayerId;
        const focusPlayer = viewPlayerId
          ? this.players?.find((player) => player.id === viewPlayerId)
          : null;
        const zoom = focusPlayer
          ? clamp(Number(this.renderer?.viewZoom) || 0, 0, 1.35)
          : 0;
        const followZoom = clamp((zoom - 0.1) / 0.9, 0, 1);
        const centerX = focusPlayer ? focusPlayer.x * followZoom : 0;
        const centerZ = focusPlayer ? focusPlayer.z * followZoom : 0;
        const [rawRightX, , rawRightZ] = Array.isArray(this.renderer?.cameraRight)
          ? this.renderer.cameraRight
          : [1, 0, 0];
        const rightX = Number.isFinite(rawRightX) ? rawRightX : 1;
        const rightZ = Number.isFinite(rawRightZ) ? rawRightZ : 0;
        const rightLength = Math.max(0.0001, Math.hypot(rightX, rightZ));
        const projected = ((numericX - centerX) * rightX + (numericZ - centerZ) * rightZ) / rightLength;
        const halfArenaWidth = Math.max(this.tile, (this.cols - 2) * this.tile * 0.5);
        const zoomMix = clamp(zoom, 0, 1);
        const audibleHalfSpan = halfArenaWidth * (1 + (0.58 - 1) * zoomMix);
        return clamp(projected / Math.max(this.tile, audibleHalfSpan), -0.75, 0.75);
      }

      playSfxAt(type, position, strength = 1, options = {}) {
        const x = Number(position?.x);
        const z = Number(position?.z);
        if (typeof this.sfx?.emitGameEvent === "function") {
          return this.sfx.emitGameEvent({ type, strength, x, z, options });
        }
        this.sfx.effect(type, strength, {
          ...options,
          ...(Number.isFinite(x) && Number.isFinite(z) ? { x, z } : {}),
          pan: this.audioPanAt(x, z)
        });
      }

      playExplosionAt(position, strength = 1, options = {}) {
        const x = Number(position?.x);
        const z = Number(position?.z);
        if (typeof this.sfx?.emitGameEvent === "function") {
          return this.sfx.emitGameEvent({ type: "explosion", strength, x, z, options });
        }
        this.sfx.explosion(strength, {
          ...options,
          ...(Number.isFinite(x) && Number.isFinite(z) ? { x, z } : {}),
          pan: this.audioPanAt(x, z)
        });
      }

      cellFromWorld(x, z) {
        return {
          c: clamp(Math.round(x / this.tile + (this.cols - 1) / 2), 0, this.cols - 1),
          r: clamp(Math.round(z / this.tile + (this.rows - 1) / 2), 0, this.rows - 1)
        };
      }

      createPlayer(id) {
        const r = id === 1 ? this.rows - 2 : 1;
        const c = id === 1 ? 1 : this.cols - 2;
        const [x, z] = this.worldFromCell(r, c);
        const champion = id === 1 ? this.selectedChampion : this.selectedChampion2;
        const championNames = {
          katarina: "Katarina",
          zed: "Zed",
          renekton: "Renekton",
          vladimir: "Vladimir",
          gangplank: "Gangplank"
        };
        return {
          id,
          champion,
          side: id === 1 ? "blue" : "red",
          name: `${id === 1 ? "Blue" : "Red"} ${championNames[champion] || "Katarina"}`,
          x, z,
          health: 1,
          maxHealth: 1,
          alive: true,
          speed: 3.45,
          maxBombs: 1,
          range: 2,
          shield: 0,
          // Start with arena bomb only — Q/W/E/R unlock from crate skill drops.
          skillsUnlocked: [false, false, false, false],
          invulnerable: 1.25,
          hurt: 0,
          dashCooldown: 0,
          dashing: 0,
          dashRequested: false,
          qCooldown: 0,
          wCooldown: 0,
          eCooldown: 0,
          rCooldown: 0,
          speedBoost: 0,
          spin: 0,
          moving: false,
          castAnim: 0,
          abilityAnimAction: "",
          abilityAnimRemaining: 0,
          abilityAnimDuration: 0,
          ultChannel: 0,
          ultTick: 0,
          zedUltAnim: 0,
          zedSlashAnim: 0,
          zedSwapWindow: 0,
          zedDeathMarkCommitment: null,
          stunned: 0,
          fury: 0,
          renektonDominus: 0,
          renektonUltAnim: 0,
          renektonSlashAnim: 0,
          renektonDashAnim: 0,
          renektonDashRecast: 0,
          renektonUltTick: 0,
          vladimirPool: 0,
          vladimirPoolTick: 0,
          vladimirAttackAnim: 0,
          vladimirQAnim: 0,
          vladimirEAnim: 0,
          vladimirUltAnim: 0,
          vladimirQStacks: 0,
          gangplankShotAnim: 0,
          gangplankKegAnim: 0,
          gangplankUltAnim: 0,
          facing: id === 1 ? Math.PI : 0,
          lastDx: 0,
          lastDz: id === 1 ? -1 : 1,
          aiDx: 0,
          aiDz: 0,
          aiCommit: 0,
          aiThink: 0.15 + this.random() * 0.2
        };
      }

      resetPlayers() {
        this.abilityBuffer?.clear();
        this.players = [this.createPlayer(1), this.createPlayer(2)];
        this.player = this.players[0];
        this.resetBotPolicy();
        this.presentation.selectChampion(this.selectedChampion);
      }

      resetBotPolicy() {
        if (!this.botPolicy) return;
        const bot = this.players[1];
        this.botPolicy.reset({ random: () => 0 });
        // Baseline memory keeps the arena timers; the V1 policy wraps its own
        // arena memory, so only sync when the fields exist.
        if (!("think" in this.botPolicy.memory)) return;
        this.botPolicy.memory.think = bot?.aiThink ?? 0.15;
        this.botPolicy.memory.lastDx = bot?.aiDx ?? 0;
        this.botPolicy.memory.lastDz = bot?.aiDz ?? 1;
      }

      selectChampion(champion) {
        if (!["katarina", "zed", "renekton", "vladimir", "gangplank"].includes(champion) || this.mode !== "intro") return;
        this.selectedChampion = champion;
        void this.renderer.ensureChampionModel?.(champion);
        this.resetPlayers();
        this.presentation.update(this);
      }

      selectChampion2(champion) {
        if (!["katarina", "zed", "renekton", "vladimir", "gangplank"].includes(champion) || this.mode !== "intro") return;
        this.selectedChampion2 = champion;
        void this.renderer.ensureChampionModel?.(champion);
        this.resetPlayers();
        // The CPU pilot depends on the champion it actually plays.
        if (typeof RIFTBOMB_BOTS !== "undefined") {
          this.botPolicy = this.createBotPolicy();
          this.resetBotPolicy();
        }
        if (this.p2Human) this.presentation.announce(`Player 2 ready · ${this.players[1].name} is local`);
        this.presentation.update(this);
      }

      selectBotOpponent(botId) {
        if (this.mode !== "intro" || typeof RIFTBOMB_BOTS === "undefined") return false;
        const profile = RIFTBOMB_BOTS.profiles?.find((candidate) => candidate.id === botId);
        if (!profile) return false;
        this.p2Human = false;
        this.selectedBot = profile.id;
        this.selectedChampion2 = profile.champion;
        this.resetPlayers();
        this.botPolicy = this.createBotPolicy();
        this.resetBotPolicy();
        this.presentation.update(this);
        return true;
      }

      activateBotOpponent() {
        if (this.mode !== "intro") return;
        this.p2Human = false;
        const defaultBot = this.selectedBot || (typeof RIFTBOMB_BOTS === "undefined"
          ? null
          : RIFTBOMB_BOTS.profiles?.[0]?.id);
        if (defaultBot) this.selectBotOpponent(defaultBot);
      }

      start() {
        this.mode = "playing";
        this.seed = (Date.now() ^ 0xA57A2026) >>> 0;
        this.round = 0;
        this.wave = 1;
        this.roundWins = [0, 0];
        this.elapsed = 0;
        this.bombId = 0;
        this.abilityBuffer.clear();
        this.abilityCommandSequence = 0;
        for (const key of Object.keys(this.abilityBufferStats)) this.abilityBufferStats[key] = 0;
        this.pendingMatchWinner = null;
        this.particles = [];
        this.startRound();
      }

      startRound() {
        this.round += 1;
        this.wave = this.round;
        this.roundTime = 90;
        this.roundAge = 0;
        this.roundLocked = false;
        this.roundTransition = 0;
        this.roundDecisionTimer = -1;
        this.pendingMatchWinner = null;
        this.generateMap();
        this.resetPlayers();
        this.bombs = [];
        this.blasts = [];
        this.ultimates = [];
        this.pickups = [];
        this.enemies = [];
        this.daggers = [];
        this.projectiles = [];
        this.skillTrails = [];
        this.slashes = [];
        this.zedShadows = [];
        this.zedMarks = [];
        this.vladimirMarks = [];
        this.gangplankBarrels = [];
        this.gangplankBarrages = [];
        this.presentation.prepareRound();
        this.presentation.announce(`Round ${this.round} · ${this.player.name} enters the arena`);
        this.presentation.update(this);
      }

      activatePlayerTwo() {
        if (this.p2Human) return;
        this.p2Human = true;
        this.selectedBot = null;
        const p2 = this.players[1];
        if (p2) {
          p2.aiDx = 0;
          p2.aiDz = 0;
        }
        this.presentation.announce(`Player 2 joined · ${p2.name} is local`);
        this.presentation.update(this);
      }

      isBlocked(x, z, radius = 0.31, ignoreBombAt = null) {
        const points = [
          [x - radius, z - radius], [x + radius, z - radius],
          [x - radius, z + radius], [x + radius, z + radius]
        ];
        for (const [px, pz] of points) {
          const cell = this.cellFromWorld(px, pz);
          if (this.grid[cell.r][cell.c] !== 0) return true;
        }
        for (const bomb of this.bombs) {
          const isIgnored = Array.isArray(ignoreBombAt)
            ? ignoreBombAt.includes(bomb)
            : bomb === ignoreBombAt;
          if (isIgnored || bomb.exploded) continue;
          if (Math.abs(x - bomb.x) < this.tile * 0.55 + radius &&
              Math.abs(z - bomb.z) < this.tile * 0.55 + radius) return true;
        }
        return false;
      }

      moveEntity(entity, dx, dz, speed, dt, radius, ignoreBomb = null, assist = false) {
        const nx = entity.x + dx * speed * dt;
        if (!this.isBlocked(nx, entity.z, radius, ignoreBomb)) {
          entity.x = nx;
        } else if (assist && dx !== 0) {
          this.nudgeAroundCorner(entity, nx, "x", speed * dt, dz, radius, ignoreBomb);
        }
        const nz = entity.z + dz * speed * dt;
        if (!this.isBlocked(entity.x, nz, radius, ignoreBomb)) {
          entity.z = nz;
        } else if (assist && dz !== 0) {
          this.nudgeAroundCorner(entity, nz, "z", speed * dt, dx, radius, ignoreBomb);
        }
      }

      // Analog-stick corner assist: when the move along one axis is blocked near
      // a corner, slide the entity sideways (at most one frame of travel) until
      // the blocked axis opens. Deterministic: pure function of position, grid
      // and input; the preferred side follows the perpendicular stick component.
      nudgeAroundCorner(entity, target, axis, maxShift, perpendicular, radius, ignoreBomb) {
        const signs = perpendicular < 0 ? [-1, 1] : [1, -1];
        for (let i = 1; i <= 2; i += 1) {
          const shift = (maxShift * i) / 2;
          for (const sign of signs) {
            const px = axis === "x" ? target : entity.x + sign * shift;
            const pz = axis === "x" ? entity.z + sign * shift : target;
            if (this.isBlocked(px, pz, radius, ignoreBomb)) continue;
            entity.x = px;
            entity.z = pz;
            return;
          }
        }
      }

      activeBombsFor(player) {
        return this.bombs.filter((bomb) => !bomb.exploded && bomb.ownerId === player.id).length;
      }

      placeBomb(player = this.player) {
        if (this.mode !== "playing" || this.roundLocked || !player?.alive ||
            player.ultChannel > 0 || player.vladimirPool > 0 ||
            this.isZedDeathMarkCommitted(player)) return false;
        this.dropOwnerId = player.id;
        if (this.activeBombsFor(player) >= player.maxBombs) return false;
        const { r, c } = this.cellFromWorld(player.x, player.z);
        if (this.grid[r][c] !== 0 || this.bombs.some((b) => b.r === r && b.c === c && !b.exploded)) return false;
        const [x, z] = this.worldFromCell(r, c);
        const bomb = {
          id: ++this.bombId,
          ownerId: player.id,
          r, c, x, z,
          age: 0,
          fuse: 2.35,
          range: player.range,
          exploded: false,
          passOwners: new Set([player.id])
        };
        this.bombs.push(bomb);
        if (player.champion === "vladimir") player.vladimirAttackAnim = 0.42;
        this.playSfxAt("bomb", { x, z });
        this.spawnParticles(x, 0.45, z,
          player.id === 1 ? Renderer.colors.blueSide : Renderer.colors.redSide, 9, 0.6, 0.08);
        this.presentation.update(this);
        return true;
      }

      requestDash(_player = this.player) {
        // Legacy satchel dash removed with the bomber kit.
      }

      executeDash(player) {
        if (player.dashCooldown > 0 || player.dashing > 0 || !player.alive) return;
        player.dashing = 0.18;
        player.dashCooldown = 5;
        player.invulnerable = Math.max(player.invulnerable, 0.22);
        this.renderer.cameraShake = Math.max(this.renderer.cameraShake, 0.14);
        this.playSfxAt("dash", player);
        this.spawnParticles(player.x, 0.5, player.z,
          player.id === 1 ? Renderer.colors.rift : Renderer.colors.ember, 18, 0.48, 0.1);
      }

      isSkillUnlocked(player, slot) {
        if (!player?.skillsUnlocked) return true;
        return Boolean(player.skillsUnlocked[slot]);
      }

      lockedSkillSlots(player) {
        if (!player) return [];
        return [0, 1, 2, 3].filter((slot) => !player.skillsUnlocked[slot]);
      }

      skillSlotLabel(player, slot) {
        const kits = {
          katarina: ["Bouncing Blade", "Preparation", "Shunpo", "Death Lotus"],
          zed: ["Razor Shuriken", "Living Shadow", "Shadow Slash", "Death Mark"],
          renekton: ["Cull the Meek", "Ruthless Predator", "Slice and Dice", "Dominus"],
          vladimir: ["Transfusion", "Sanguine Pool", "Tides of Blood", "Hemoplague"],
          gangplank: ["Parrrley", "Remove Scurvy", "Powder Keg", "Cannon Barrage"]
        };
        return (kits[player.champion] || kits.katarina)[slot] || `Skill ${slot + 1}`;
      }

      abilityCooldown(player, slot) {
        if (player.champion === "zed" && slot === 1 && player.zedSwapWindow > 0) {
          if (this.zedLivingShadow(player)) return 0;
        }
        if (player.champion === "renekton" && slot === 2 && player.renektonDashRecast > 0) return 0;
        const cooldown = Number(player[["qCooldown", "wCooldown", "eCooldown", "rCooldown"][slot]]) || 0;
        return cooldown > ABILITY_TIME_EPSILON ? cooldown : 0;
      }

      zedDeathMarkCommitmentRemaining(player) {
        const commitment = player?.zedDeathMarkCommitment;
        if (!commitment || !["windup", "dash"].includes(commitment.phase)) return 0;
        const phaseRemaining = Math.max(0, Number(commitment.phaseRemaining) || 0);
        return commitment.phase === "windup"
          ? phaseRemaining + ZED_DEATH_MARK_DASH_SECONDS
          : phaseRemaining;
      }

      isZedDeathMarkCommitted(player) {
        return player?.champion === "zed" &&
          this.zedDeathMarkCommitmentRemaining(player) > ABILITY_TIME_EPSILON;
      }

      isContestantTargetable(player) {
        return Boolean(player?.alive) && !this.isZedDeathMarkCommitted(player) &&
          (Number(player.vladimirPool) || 0) <= ABILITY_TIME_EPSILON;
      }

      canMoveContestant(player) {
        return Boolean(player?.alive) && player.stunned <= ABILITY_TIME_EPSILON &&
          !this.isZedDeathMarkCommitted(player);
      }

      abilityBufferBlock(player, slot) {
        const blockers = [];
        // Remove Scurvy is the one explicit cleanse: it remains castable while
        // Gangplank is stunned, just like the authored kit promises.
        if (player.stunned > ABILITY_TIME_EPSILON &&
            !(player.champion === "gangplank" && slot === 1)) {
          blockers.push({ kind: "stun", remaining: player.stunned });
        }
        if (player.vladimirPool > ABILITY_TIME_EPSILON) {
          blockers.push({ kind: "pool", remaining: player.vladimirPool });
        }
        const deathMarkCommitment = this.zedDeathMarkCommitmentRemaining(player);
        if (deathMarkCommitment > ABILITY_TIME_EPSILON) {
          blockers.push({ kind: "death-mark", remaining: deathMarkCommitment });
        }
        const cooldown = this.abilityCooldown(player, slot);
        if (cooldown > 0) blockers.push({ kind: "cooldown", remaining: cooldown });
        return blockers.length ? {
          kinds: blockers.map(({ kind }) => kind),
          remaining: Math.max(...blockers.map(({ remaining }) => remaining))
        } : null;
      }

      rivalInRange(player, range) {
        return this.players.find((candidate) => candidate.id !== player.id &&
          this.isContestantTargetable(candidate) &&
          Math.hypot(candidate.x - player.x, candidate.z - player.z) <= range);
      }

      /**
       * Aimed casts (mouse hover on desktop, drag release on mobile) only lock
       * the rival when the aim point sits on them; aimless casts keep the
       * classic auto-target so keyboards, bots and legacy clients still work.
       */
      hoveredRival(player, range) {
        const rival = this.rivalInRange(player, range);
        const aim = player.castAim;
        if (!aim || !rival) return rival || null;
        return Math.hypot(rival.x - aim.x, rival.z - aim.z) <= this.tile * 1.1 ? rival : null;
      }

      katarinaShunpoTarget(player) {
        const range = this.tile * 5.1;
        const inRange = (candidate) =>
          Math.hypot(candidate.x - player.x, candidate.z - player.z) <= range;
        const daggers = this.daggers.filter((candidate) =>
          candidate.age >= candidate.readyAt && inRange(candidate));
        const rival = this.rivalInRange(player, range);
        const pickups = this.pickups.filter(inRange);
        const aim = player.castAim;
        if (aim) {
          // League-style hover: Shunpo goes to the entity under the cursor.
          return [...daggers, ...(rival ? [rival] : []), ...pickups]
            .map((candidate) => ({
              candidate,
              gap: Math.hypot(candidate.x - aim.x, candidate.z - aim.z)
            }))
            .filter(({ gap }) => gap <= this.tile * 1.1)
            .sort((a, b) => a.gap - b.gap)[0]?.candidate || null;
        }
        const nearest = (list) => list.sort((a, b) =>
          Math.hypot(a.x - player.x, a.z - player.z) -
          Math.hypot(b.x - player.x, b.z - player.z))[0];
        return nearest(daggers) || rival || nearest(pickups) || null;
      }

      zedLivingShadow(player) {
        return this.zedShadows.find((shadow) => shadow.ownerId === player.id &&
          shadow.kind === "living" && shadow.swapAvailable && shadow.age < shadow.life);
      }

      zedShadowLanding(player) {
        for (let steps = 3; steps >= 1; steps--) {
          const cell = this.cellFromWorld(
            player.x + player.lastDx * this.tile * steps,
            player.z + player.lastDz * this.tile * steps
          );
          if (this.grid[cell.r]?.[cell.c] !== 0) continue;
          const [x, z] = this.worldFromCell(cell.r, cell.c);
          if (!this.isBlocked(x, z, 0.28) && Math.hypot(x - player.x, z - player.z) >= this.tile * 0.55) {
            return { x, z, ...cell };
          }
        }
        return null;
      }

      gangplankKegPlacement(player) {
        if (this.gangplankBarrels.filter((barrel) =>
          barrel.ownerId === player.id && !barrel.exploded).length >= 3) return null;
        const length = Math.max(0.001, Math.hypot(player.lastDx, player.lastDz));
        let cell = this.cellFromWorld(
          player.x + player.lastDx / length * this.tile,
          player.z + player.lastDz / length * this.tile
        );
        if (this.grid[cell.r]?.[cell.c] !== 0) cell = this.cellFromWorld(player.x, player.z);
        if (this.grid[cell.r]?.[cell.c] !== 0 ||
            this.gangplankBarrels.some((barrel) => !barrel.exploded && barrel.r === cell.r && barrel.c === cell.c) ||
            this.bombs.some((bomb) => !bomb.exploded && bomb.r === cell.r && bomb.c === cell.c)) return null;
        const [x, z] = this.worldFromCell(cell.r, cell.c);
        return { cell, x, z };
      }

      abilityTargetAvailable(player, slot) {
        if (player.champion === "katarina") {
          if (slot === 2) return Boolean(this.katarinaShunpoTarget(player));
          if (slot === 3) return Boolean(this.hoveredRival(player, this.tile * 3.35));
        }
        if (player.champion === "zed") {
          if (slot === 1) return Boolean(
            (player.zedSwapWindow > ABILITY_TIME_EPSILON && this.zedLivingShadow(player)) ||
            this.zedShadowLanding(player)
          );
          if (slot === 3) return Boolean(this.hoveredRival(player, this.tile * 4.5));
        }
        if (player.champion === "vladimir" && slot === 0) {
          const target = this.katTargetInFront(player, this.tile * 5);
          return Boolean(target.player || (Number.isInteger(target.r) && Number.isInteger(target.c)));
        }
        if (player.champion === "gangplank" && slot === 2) {
          return Boolean(this.gangplankKegPlacement(player));
        }
        return true;
      }

      abilityTargetFailure(player, slot) {
        if (player.champion === "katarina" && slot === 2) return "Shunpo needs a dagger, pickup, or rival in range";
        if (player.champion === "katarina" && slot === 3) return "Death Lotus needs the rival nearby";
        if (player.champion === "zed" && slot === 1) return "Living Shadow needs a free arena cell";
        if (player.champion === "zed" && slot === 3) return "Death Mark needs the rival in range";
        if (player.champion === "vladimir" && slot === 0) return "Transfusion needs a rival or Hextech crate";
        return "";
      }

      /**
       * Point the champion at an aimed arena position (mouse ground point on
       * desktop, drag vector on mobile) so every direction-derived cast fires
       * toward it. Returns false and leaves facing untouched for invalid aim,
       * which keeps auto-aim behavior for keyboards, bots and legacy clients.
       */
      applyAbilityAim(player, aim) {
        const rawX = Number(aim?.x);
        const rawZ = Number(aim?.z);
        if (!Number.isFinite(rawX) || !Number.isFinite(rawZ)) return false;
        const halfWidth = (this.cols - 1) / 2 * this.tile;
        const halfDepth = (this.rows - 1) / 2 * this.tile;
        const dx = clamp(rawX, -halfWidth, halfWidth) - player.x;
        const dz = clamp(rawZ, -halfDepth, halfDepth) - player.z;
        const length = Math.hypot(dx, dz);
        if (length < 0.05) return false;
        player.lastDx = dx / length;
        player.lastDz = dz / length;
        player.facing = Math.atan2(player.lastDx, player.lastDz);
        return true;
      }

      queueAbility(slot, player, block, aim) {
        this.abilityBuffer.set(player.id, {
          sequence: ++this.abilityCommandSequence,
          playerId: player.id,
          slot,
          aim,
          remaining: ABILITY_BUFFER_SECONDS,
          initialBlockers: block?.kinds || []
        });
        this.abilityBufferStats.queued += 1;
        return true;
      }

      clearAbilityBuffer(playerId, reason = "canceled") {
        if (!this.abilityBuffer.delete(playerId)) return false;
        if (reason === "expired") this.abilityBufferStats.expired += 1;
        else this.abilityBufferStats.canceled += 1;
        return true;
      }

      cancelKatarinaChannel(player, reason = "") {
        if (player?.champion !== "katarina" || player.ultChannel <= 0) return false;
        player.ultChannel = 0;
        player.ultTick = 0;
        if (player.abilityAnimAction === "r") this.clearAbilityAnimation(player);
        this.slashes = this.slashes.filter((slash) =>
          !slash.lotus || slash.ownerId !== player.id
        );
        this.abilityBufferStats.channelsCanceled += 1;
        if (reason && player.alive) {
          this.presentation.announce(`Death Lotus canceled · ${reason}`);
          this.presentation.update(this);
        }
        return true;
      }

      castAbility(slot, player = this.player, options = {}) {
        if (!player?.alive || this.mode !== "playing" || this.roundLocked) return false;
        if (!Number.isInteger(slot) || slot < 0 || slot > 3) return false;
        this.dropOwnerId = player.id;
        const aimed = this.applyAbilityAim(player, options.aim) ? options.aim : null;
        player.castAim = aimed;
        if (!this.isSkillUnlocked(player, slot)) {
          this.presentation.announce(`${this.skillSlotLabel(player, slot)} locked · break crates`);
          return false;
        }
        // A postponed command preserves the target eligibility observed when
        // the player pressed the key; it cannot acquire a target later.
        if (!this.abilityTargetAvailable(player, slot)) {
          const failure = this.abilityTargetFailure(player, slot);
          if (failure) this.presentation.announce(failure);
          return false;
        }
        const block = this.abilityBufferBlock(player, slot);
        if (block) {
          if (options.buffer === false ||
              block.remaining > ABILITY_BUFFER_SECONDS + ABILITY_TIME_EPSILON) return false;
          if (this.abilityBuffer.has(player.id)) this.abilityBufferStats.replaced += 1;
          if (player.ultChannel > 0) this.cancelKatarinaChannel(player, "new ability");
          return this.queueAbility(slot, player, block, aimed);
        }
        if (player.ultChannel > 0) this.cancelKatarinaChannel(player, "new ability");
        const executed = this.executeAbility(slot, player);
        // A spatially invalid cast (for example Shunpo without a target) never
        // erases an earlier, still-valid postponed spell.
        if (executed && this.abilityBuffer.delete(player.id)) {
          this.abilityBufferStats.replaced += 1;
        }
        return executed;
      }

      clearAbilityAnimation(actor) {
        if (!actor) return;
        actor.abilityAnimAction = "";
        actor.abilityAnimRemaining = 0;
        actor.abilityAnimDuration = 0;
      }

      startAbilityAnimation(actor, action, duration) {
        if (!actor || !ABILITY_ANIMATION_ACTIONS.includes(action) ||
            !Number.isFinite(duration) || duration <= ABILITY_TIME_EPSILON) {
          this.clearAbilityAnimation(actor);
          return false;
        }
        actor.abilityAnimAction = action;
        actor.abilityAnimRemaining = duration;
        actor.abilityAnimDuration = duration;
        return true;
      }

      abilityAnimationDuration(player, slot) {
        return Number(ABILITY_ANIMATION_DURATIONS[player?.champion]?.[slot]) || 0;
      }

      updateAbilityAnimation(actor, dt) {
        if (!actor) return;
        const remaining = Math.max(0, (Number(actor.abilityAnimRemaining) || 0) - dt);
        if (remaining <= ABILITY_TIME_EPSILON) {
          this.clearAbilityAnimation(actor);
          return;
        }
        actor.abilityAnimRemaining = remaining;
      }

      executeAbility(slot, player) {
        let executed = false;
        if (player.champion === "zed") {
          if (slot === 0) executed = this.castZedQ(player);
          else if (slot === 1) executed = this.castZedW(player);
          else if (slot === 2) executed = this.castZedE(player);
          else if (slot === 3) executed = this.castZedR(player);
        } else if (player.champion === "renekton") {
          if (slot === 0) executed = this.castRenektonQ(player);
          else if (slot === 1) executed = this.castRenektonW(player);
          else if (slot === 2) executed = this.castRenektonE(player);
          else if (slot === 3) executed = this.castRenektonR(player);
        } else if (player.champion === "vladimir") {
          if (slot === 0) executed = this.castVladimirQ(player);
          else if (slot === 1) executed = this.castVladimirW(player);
          else if (slot === 2) executed = this.castVladimirE(player);
          else if (slot === 3) executed = this.castVladimirR(player);
        } else if (player.champion === "gangplank") {
          if (slot === 0) executed = this.castGangplankQ(player);
          else if (slot === 1) executed = this.castGangplankW(player);
          else if (slot === 2) executed = this.castGangplankE(player);
          else if (slot === 3) executed = this.castGangplankR(player);
        } else {
          if (slot === 0) executed = this.castKatarinaQ(player);
          else if (slot === 1) executed = this.castKatarinaW(player);
          else if (slot === 2) executed = this.castKatarinaE(player);
          else if (slot === 3) executed = this.castKatarinaR(player);
        }
        if (executed) {
          this.startAbilityAnimation(
            player,
            ABILITY_ANIMATION_ACTIONS[slot],
            this.abilityAnimationDuration(player, slot)
          );
        }
        return executed;
      }

      processAbilityBuffer(dt) {
        if (!this.abilityBuffer.size) return;
        const orderedPlayers = [...this.players].sort((a, b) => a.id - b.id);
        for (const player of orderedPlayers) {
          const command = this.abilityBuffer.get(player.id);
          if (!command) continue;
          command.remaining = Math.max(0, command.remaining - dt);
          if (command.remaining <= ABILITY_TIME_EPSILON) command.remaining = 0;
          if (this.mode !== "playing" || this.roundLocked || !player.alive ||
              !this.isSkillUnlocked(player, command.slot)) {
            this.clearAbilityBuffer(player.id);
            continue;
          }
          const block = this.abilityBufferBlock(player, command.slot);
          // Crowd control applied after a cooldown-buffered command cancels it;
          // a command deliberately entered during the final 150 ms of a stun
          // remains eligible. This makes ordering explicit and replayable.
          if (block?.kinds.includes("stun") && !command.initialBlockers.includes("stun")) {
            this.clearAbilityBuffer(player.id);
            continue;
          }
          if (block) {
            if (command.remaining <= 0) this.clearAbilityBuffer(player.id, "expired");
            continue;
          }
          this.abilityBuffer.delete(player.id);
          player.castAim = command.aim && this.applyAbilityAim(player, command.aim)
            ? command.aim
            : null;
          if (this.executeAbility(command.slot, player)) this.abilityBufferStats.executed += 1;
        }
      }

      katTargetInFront(player, maxDistance) {
        const rival = this.players.find((candidate) => candidate.id !== player.id &&
          this.isContestantTargetable(candidate));
        const facingX = player.lastDx;
        const facingZ = player.lastDz;
        if (rival) {
          const dx = rival.x - player.x;
          const dz = rival.z - player.z;
          const distance = Math.hypot(dx, dz);
          const alignment = distance > 0 ? (dx / distance) * facingX + (dz / distance) * facingZ : 1;
          if (distance <= maxDistance && alignment > -0.15) return { x: rival.x, z: rival.z, player: rival };
        }

        let best = null;
        for (let r = 1; r < this.rows - 1; r++) {
          for (let c = 1; c < this.cols - 1; c++) {
            if (this.grid[r][c] !== 2) continue;
            const [x, z] = this.worldFromCell(r, c);
            const dx = x - player.x;
            const dz = z - player.z;
            const distance = Math.hypot(dx, dz);
            if (distance > maxDistance || distance < 0.2) continue;
            const alignment = (dx / distance) * facingX + (dz / distance) * facingZ;
            if (alignment < 0.35) continue;
            const score = alignment * 4 - distance * 0.22;
            if (!best || score > best.score) best = { x, z, r, c, score };
          }
        }
        return best || {
          x: player.x + facingX * Math.min(maxDistance, this.tile * 3),
          z: player.z + facingZ * Math.min(maxDistance, this.tile * 3)
        };
      }

      castKatarinaQ(player) {
        if (player.qCooldown > 0 || player.ultChannel > 0) return false;
        const target = this.katTargetInFront(player, this.tile * 5.4);
        const distance = Math.hypot(target.x - player.x, target.z - player.z);
        player.qCooldown = 4.5;
        player.castAnim = 0.42;
        this.projectiles.push({
          id: ++this.daggerId,
          ownerId: player.id,
          startX: player.x,
          startZ: player.z,
          targetX: target.x,
          targetZ: target.z,
          targetPlayerId: target.player?.id || 0,
          targetR: target.r,
          targetC: target.c,
          x: player.x,
          y: 1.05,
          z: player.z,
          age: 0,
          duration: clamp(distance / 12, 0.28, 0.52)
        });
        this.playSfxAt("katQ", player);
        this.presentation.announce("Katarina · Bouncing Blade");
        this.presentation.update(this);
        return true;
      }

      castKatarinaW(player) {
        if (player.wCooldown > 0 || player.ultChannel > 0) return false;
        player.wCooldown = 8;
        player.castAnim = 0.42;
        player.speedBoost = 1.5;
        this.dropDagger(player.x, player.z, 0.48);
        this.spawnParticles(player.x, 0.72, player.z, Renderer.colors.katCrimson, 18, 0.75, 0.1);
        this.playSfxAt("katW", player);
        this.presentation.announce("Katarina · Preparation");
        this.presentation.update(this);
        return true;
      }

      castKatarinaE(player) {
        if (player.eCooldown > 0 || player.ultChannel > 0) return false;
        const target = this.katarinaShunpoTarget(player);
        if (!target) {
          this.presentation.announce("Shunpo needs a dagger, pickup, or rival in range");
          return false;
        }
        const rival = this.rivalInRange(player, this.tile * 5.1);
        const fromX = player.x;
        const fromZ = player.z;
        const landing = this.findOpenLanding(target.x, target.z, player);
        player.x = landing.x;
        player.z = landing.z;
        player.eCooldown = 8;
        player.castAnim = 0.42;
        player.invulnerable = Math.max(player.invulnerable, 0.14);
        this.skillTrails.push({
          x1: fromX, z1: fromZ, x2: player.x, z2: player.z,
          angle: Math.atan2(player.x - fromX, player.z - fromZ), age: 0, life: 0.38
        });
        this.renderer.addShock(player.x, player.z, 0.42);
        this.spawnParticles(player.x, 0.55, player.z, Renderer.colors.katCrimson, 28, 0.62, 0.11);
        if (rival && Math.hypot(rival.x - player.x, rival.z - player.z) < 1.15) {
          this.hitSkill(rival, 0.18, player, "Shunpo");
        }
        this.playSfxAt("shunpo", player);
        this.presentation.announce("Katarina · Shunpo");
        this.presentation.update(this);
        return true;
      }

      castKatarinaR(player) {
        if (player.rCooldown > 0 || player.ultChannel > 0) return false;
        const rival = this.hoveredRival(player, this.tile * 3.35);
        if (!rival) {
          this.presentation.announce("Death Lotus needs the rival nearby");
          return false;
        }
        player.rCooldown = 28;
        player.ultChannel = 1.65;
        player.ultTick = 0;
        this.slashes.push({
          ownerId: player.id,
          x: player.x,
          z: player.z,
          radius: this.tile * 2.75,
          age: 0,
          life: 1.65,
          lotus: true
        });
        this.playSfxAt("deathLotus", player);
        this.renderer.addShock(player.x, player.z, 0.8);
        this.presentation.announce("Katarina · Death Lotus");
        this.presentation.update(this);
        return true;
      }

      zedOrigins(player) {
        return [player, ...this.zedShadows.filter((shadow) =>
          shadow.ownerId === player.id && shadow.age < shadow.life
        )];
      }

      createZedShadow(player, x, z, kind = "living", life = 5.2) {
        const deathMarkDuration = kind === "death" ? ZED_DEATH_MARK_WINDUP_SECONDS : 0;
        const shadow = {
          id: 10000 + ++this.shadowId,
          ownerId: player.id,
          champion: "zed",
          kind,
          x,
          z,
          age: 0,
          life,
          alive: true,
          facing: player.facing,
          moving: false,
          castAnim: 0.46,
          castDuration: 0.48,
          abilityAnimAction: "",
          abilityAnimRemaining: 0,
          abilityAnimDuration: 0,
          zedUltAnim: deathMarkDuration,
          zedSlashAnim: 0,
          hurt: 0,
          invulnerable: 0,
          shield: 0,
          swapAvailable: kind === "living"
        };
        this.startAbilityAnimation(shadow, kind === "death" ? "r" : "w",
          kind === "death" ? deathMarkDuration : 0.48);
        this.zedShadows.push(shadow);
        return shadow;
      }

      castZedQ(player) {
        if (player.qCooldown > 0) return false;
        const dx = player.lastDx || Math.sin(player.facing);
        const dz = player.lastDz || Math.cos(player.facing);
        const length = Math.max(0.001, Math.hypot(dx, dz));
        const dirX = dx / length;
        const dirZ = dz / length;
        const origins = this.zedOrigins(player);
        player.qCooldown = 5.6;
        player.castAnim = 0.48;
        player.castDuration = 0.48;
        for (const [index, origin] of origins.entries()) {
          origin.castAnim = 0.48;
          origin.castDuration = 0.48;
          this.startAbilityAnimation(origin, "q", 0.48);
          origin.facing = player.facing;
          this.projectiles.push({
            id: ++this.daggerId,
            kind: "zed",
            ownerId: player.id,
            fromShadow: index > 0,
            x: origin.x + dirX * 0.36,
            y: 0.84,
            z: origin.z + dirZ * 0.36,
            dx: dirX,
            dz: dirZ,
            speed: 12.8,
            age: 0,
            life: this.tile * 6.4 / 12.8,
            resolved: false
          });
        }
        this.playSfxAt("zedQ", player);
        this.presentation.announce(`Zed · Razor Shuriken ×${origins.length}`);
        this.presentation.update(this);
        return true;
      }

      castZedW(player) {
        const living = this.zedLivingShadow(player);
        if (living && player.zedSwapWindow > 0) {
          const fromX = player.x;
          const fromZ = player.z;
          player.x = living.x;
          player.z = living.z;
          living.x = fromX;
          living.z = fromZ;
          living.facing = player.facing;
          living.swapAvailable = false;
          player.zedSwapWindow = 0;
          player.zedUltAnim = 0.42;
          this.startAbilityAnimation(living, "w", 0.48);
          player.invulnerable = Math.max(player.invulnerable, 0.2);
          this.skillTrails.push({
            x1: fromX, z1: fromZ, x2: player.x, z2: player.z,
            angle: Math.atan2(player.x - fromX, player.z - fromZ), age: 0, life: 0.42, zed: true
          });
          this.renderer.addShock(player.x, player.z, 0.54);
          this.spawnParticles(fromX, 0.52, fromZ, Renderer.colors.zedCrimson, 24, 0.62, 0.1);
          this.spawnParticles(player.x, 0.52, player.z, Renderer.colors.zedShadow, 28, 0.66, 0.12);
          this.playSfxAt("zedSwap", player);
          this.presentation.announce("Zed · Living Shadow exchange");
          return true;
        }
        if (player.wCooldown > 0) return false;

        const landing = this.zedShadowLanding(player);
        if (!landing) {
          this.presentation.announce("Living Shadow needs a free arena cell");
          return false;
        }
        this.zedShadows = this.zedShadows.filter((shadow) =>
          shadow.ownerId !== player.id || shadow.kind !== "living"
        );
        const shadow = this.createZedShadow(player, landing.x, landing.z, "living", 5.2);
        player.wCooldown = 14;
        player.zedSwapWindow = 5.2;
        player.castAnim = 0.48;
        player.castDuration = 0.48;
        this.skillTrails.push({
          x1: player.x, z1: player.z, x2: shadow.x, z2: shadow.z,
          angle: Math.atan2(shadow.x - player.x, shadow.z - player.z), age: 0, life: 0.5, zed: true
        });
        this.spawnParticles(shadow.x, 0.48, shadow.z, Renderer.colors.zedCrimson, 28, 0.72, 0.11);
        this.renderer.addShock(shadow.x, shadow.z, 0.42);
        this.playSfxAt("zedW", shadow);
        this.presentation.announce("Zed · Living Shadow · F again to exchange");
        this.presentation.update(this);
        return true;
      }

      castZedE(player) {
        if (player.eCooldown > 0) return false;
        const origins = this.zedOrigins(player);
        const radius = this.tile * 1.45;
        player.eCooldown = 5.2;
        player.zedSlashAnim = 0.52;
        player.castAnim = 0.4;
        player.castDuration = 0.4;
        let hitRival = false;
        const rival = this.players.find((candidate) => candidate.id !== player.id &&
          this.isContestantTargetable(candidate));
        for (const origin of origins) {
          origin.zedSlashAnim = 0.52;
          origin.castAnim = 0.4;
          origin.castDuration = 0.4;
          this.startAbilityAnimation(origin, "e", 0.52);
          this.slashes.push({ x: origin.x, z: origin.z, radius, age: 0, life: 0.52, zed: true });
          this.spawnParticles(origin.x, 0.48, origin.z, Renderer.colors.zedCrimson, 18, 0.62, 0.1);
          for (let r = 1; r < this.rows - 1; r++) {
            for (let c = 1; c < this.cols - 1; c++) {
              if (this.grid[r][c] !== 2) continue;
              const [x, z] = this.worldFromCell(r, c);
              if (Math.hypot(x - origin.x, z - origin.z) <= radius) {
                this.destroyBreakable(r, c, Renderer.colors.zedCrimson);
              }
            }
          }
          if (!hitRival && rival && Math.hypot(rival.x - origin.x, rival.z - origin.z) <= radius) {
            hitRival = this.hitSkill(rival, 0.28, player, "Shadow Slash");
          }
        }
        if (hitRival) player.wCooldown = Math.max(0, player.wCooldown - 2.2);
        this.renderer.addShock(player.x, player.z, 0.5);
        this.playSfxAt("zedE", player);
        this.presentation.announce(hitRival ? "Shadow Slash · Living Shadow cooldown reduced" : `Zed · Shadow Slash ×${origins.length}`);
        this.presentation.update(this);
        return true;
      }

      castZedR(player) {
        if (player.rCooldown > 0 || this.isZedDeathMarkCommitted(player)) return false;
        const rival = this.hoveredRival(player, this.tile * 4.5);
        if (!rival) {
          this.presentation.announce("Death Mark needs the rival in range");
          return false;
        }
        const fromX = player.x;
        const fromZ = player.z;
        const shadow = this.createZedShadow(
          player, fromX, fromZ, "death", ZED_DEATH_MARK_SHADOW_SECONDS
        );
        player.rCooldown = 30;
        player.castAnim = ZED_DEATH_MARK_COMMITMENT_SECONDS;
        player.castDuration = ZED_DEATH_MARK_COMMITMENT_SECONDS;
        player.zedUltAnim = ZED_DEATH_MARK_COMMITMENT_SECONDS;
        player.zedDeathMarkCommitment = {
          phase: "windup",
          phaseRemaining: ZED_DEATH_MARK_WINDUP_SECONDS,
          targetId: rival.id,
          originX: fromX,
          originZ: fromZ,
          dashStartX: fromX,
          dashStartZ: fromZ,
          dashEndX: fromX,
          dashEndZ: fromZ,
          shadowId: shadow.id
        };
        this.renderer.addShock(fromX, fromZ, 0.72);
        this.spawnParticles(fromX, 0.58, fromZ, Renderer.colors.zedShadow, 34, 0.86, 0.13);
        this.presentation.announce("Zed · Death Mark · vanishing");
        this.presentation.update(this);
        return true;
      }

      cancelZedDeathMarkCommitment(player, { targetLost = false } = {}) {
        const commitment = player?.zedDeathMarkCommitment;
        if (!commitment) return false;
        player.zedDeathMarkCommitment = null;
        player.zedUltAnim = 0;
        player.castAnim = 0;
        if (["r", "rStrike"].includes(player.abilityAnimAction)) {
          this.clearAbilityAnimation(player);
        }
        this.zedShadows = this.zedShadows.filter((shadow) => shadow.id !== commitment.shadowId);
        if (targetLost) player.rCooldown = Math.min(player.rCooldown, 0.5);
        return true;
      }

      beginZedDeathMarkDash(player, commitment, target) {
        if (!this.isContestantTargetable(target)) {
          this.cancelZedDeathMarkCommitment(player, { targetLost: true });
          return false;
        }
        const vx = target.x - player.x;
        const vz = target.z - player.z;
        const distance = Math.max(0.001, Math.hypot(vx, vz));
        const landing = this.findOpenLanding(
          target.x + vx / distance * this.tile * 0.82,
          target.z + vz / distance * this.tile * 0.82,
          player
        );
        commitment.phase = "dash";
        commitment.phaseRemaining = ZED_DEATH_MARK_DASH_SECONDS;
        commitment.dashStartX = player.x;
        commitment.dashStartZ = player.z;
        commitment.dashEndX = landing.x;
        commitment.dashEndZ = landing.z;
        this.startAbilityAnimation(player, "rStrike", ZED_DEATH_MARK_DASH_SECONDS);
        return true;
      }

      trackZedDeathMarkDashTarget(player, commitment, target) {
        if (!this.isContestantTargetable(target)) return false;
        const vx = target.x - commitment.dashStartX;
        const vz = target.z - commitment.dashStartZ;
        const distance = Math.max(0.001, Math.hypot(vx, vz));
        if (distance >= this.tile * 14.05) return false;
        const landing = this.findOpenLanding(
          target.x + vx / distance * this.tile * 0.82,
          target.z + vz / distance * this.tile * 0.82,
          player
        );
        commitment.dashEndX = landing.x;
        commitment.dashEndZ = landing.z;
        return true;
      }

      finishZedDeathMarkDash(player, commitment) {
        player.x = commitment.dashEndX;
        player.z = commitment.dashEndZ;
        const target = this.players.find((candidate) => candidate.id === commitment.targetId);
        const targetX = target?.x ?? commitment.dashEndX;
        const targetZ = target?.z ?? commitment.dashEndZ;
        player.facing = Math.atan2(targetX - player.x, targetZ - player.z);
        player.lastDx = Math.sin(player.facing);
        player.lastDz = Math.cos(player.facing);
        player.zedDeathMarkCommitment = null;
        if (["r", "rStrike"].includes(player.abilityAnimAction)) {
          this.clearAbilityAnimation(player);
        }
        this.skillTrails.push({
          x1: commitment.dashStartX,
          z1: commitment.dashStartZ,
          x2: player.x,
          z2: player.z,
          angle: Math.atan2(player.x - commitment.dashStartX, player.z - commitment.dashStartZ),
          age: 0,
          life: ZED_DEATH_MARK_DASH_SECONDS,
          zed: true
        });
        this.renderer.addShock(player.x, player.z, 0.76);
        this.spawnParticles(player.x, 0.58, player.z, Renderer.colors.zedCrimson, 34, 0.86, 0.13);
        let mark = null;
        const targetable = this.isContestantTargetable(target);
        const shieldBlocked = targetable && this.consumeSpellShield(target, "Death Mark");
        if (targetable && !shieldBlocked) {
          this.zedMarks = this.zedMarks.filter((mark) =>
            mark.ownerId !== player.id || mark.targetId !== target.id
          );
          mark = {
            ownerId: player.id,
            targetId: target.id,
            age: 0,
            fuse: ZED_DEATH_MARK_FUSE_SECONDS,
            stored: 0,
            detonated: false
          };
          this.zedMarks.push(mark);
          this.playSfxAt("deathMark", target);
          this.presentation.announce("Zed · Death Mark · target marked");
        } else if (!targetable) {
          this.presentation.announce("Zed · Death Mark · target lost");
        }
        this.presentation.update(this);
        return mark;
      }

      advanceZedMark(mark, dt) {
        if (!mark || mark.detonated) return false;
        mark.age += Math.max(0, Number(dt) || 0);
        const owner = this.players.find((player) => player.id === mark.ownerId);
        const target = this.players.find((player) => player.id === mark.targetId && player.alive);
        if (!owner || !target) {
          mark.detonated = true;
          return false;
        }
        if (mark.age + ABILITY_TIME_EPSILON < mark.fuse) return false;
        mark.detonated = true;
        const damage = clamp(0.32 + mark.stored, 0.32, 0.62);
        this.renderer.addShock(target.x, target.z, 0.92);
        this.slashes.push({ x: target.x, z: target.z, radius: this.tile * 1.08,
          age: 0, life: 0.68, zed: true });
        this.spawnParticles(target.x, 0.68, target.z, Renderer.colors.zedCrimson, 46, 0.94, 0.14);
        this.playSfxAt("markPop", target, 1, {
          sourceId: `${mark.ownerId}:${mark.targetId}`
        });
        // The mark is already attached. Later untargetability or short hit
        // invulnerability can stop new attacks, but cannot erase its pop.
        this.hitSkill(target, damage, owner, "Death Mark", false, 0.48, {
          requiresTargetable: false,
          respectsHitLocks: false,
          respectsShield: false
        });
        return true;
      }

      advanceZedDeathMarkCommitment(player, dt) {
        let remainingDt = Math.max(0, Number(dt) || 0);
        while (remainingDt > ABILITY_TIME_EPSILON && player?.zedDeathMarkCommitment) {
          const commitment = player.zedDeathMarkCommitment;
          if (!player.alive) {
            this.cancelZedDeathMarkCommitment(player);
            return;
          }
          const target = this.players.find((candidate) => candidate.id === commitment.targetId);
          const targetBeyondCancelRange = target && Math.hypot(
            target.x - player.x, target.z - player.z
          ) >= this.tile * 14.05;
          if (commitment.phase === "windup" &&
              (!this.isContestantTargetable(target) || targetBeyondCancelRange)) {
            this.cancelZedDeathMarkCommitment(player, { targetLost: true });
            return;
          }
          const step = Math.min(remainingDt, Math.max(0, commitment.phaseRemaining));
          commitment.phaseRemaining = Math.max(0, commitment.phaseRemaining - step);
          remainingDt -= step;

          if (player.abilityAnimAction === (commitment.phase === "windup" ? "r" : "rStrike")) {
            player.abilityAnimRemaining = commitment.phaseRemaining;
          }

          if (commitment.phase === "dash") {
            this.trackZedDeathMarkDashTarget(player, commitment, target);
            const progress = clamp(
              1 - commitment.phaseRemaining / ZED_DEATH_MARK_DASH_SECONDS, 0, 1
            );
            const eased = progress * progress * (3 - 2 * progress);
            player.x = lerp(commitment.dashStartX, commitment.dashEndX, eased);
            player.z = lerp(commitment.dashStartZ, commitment.dashEndZ, eased);
          }

          if (commitment.phaseRemaining > ABILITY_TIME_EPSILON) return;
          if (commitment.phase === "windup") {
            if (!this.beginZedDeathMarkDash(player, commitment, target)) return;
          } else {
            const mark = this.finishZedDeathMarkDash(player, commitment);
            if (mark && remainingDt > ABILITY_TIME_EPSILON) {
              this.advanceZedMark(mark, remainingDt);
            }
          }
        }
      }

      healChampion(player, amount) {
        if (!player?.alive || amount <= 0) return 0;
        const before = player.health;
        player.health = Math.min(player.maxHealth, player.health + amount);
        const healed = player.health - before;
        if (healed > 0.001) {
          this.spawnParticles(player.x, 0.72, player.z,
            player.champion === "renekton" ? Renderer.colors.renektonTeal
              : player.champion === "gangplank" ? Renderer.colors.gangplankGold
              : Renderer.colors.vladimirPale,
            12, 0.52, 0.08);
        }
        return healed;
      }

      payVladimirHealthCost(player, ability) {
        const config = ability === "sanguinePool"
          ? { cap: 0.08, ratio: 0.12, floor: 0.06 }
          : { cap: 0.065, ratio: 0.1, floor: 0.05 };
        const cost = Math.min(config.cap, player.health * config.ratio);
        player.health = Math.max(config.floor, player.health - cost);
        return cost;
      }

      gainRenektonFury(player, amount) {
        player.fury = clamp(player.fury + amount, 0, 100);
      }

      castRenektonQ(player) {
        if (player.qCooldown > 0) return false;
        const empowered = player.fury >= 50;
        const radius = this.tile * (empowered ? 1.78 : 1.52);
        player.qCooldown = 5.8;
        player.castAnim = 0.5;
        player.castDuration = 0.5;
        player.renektonSlashAnim = 0.58;
        let destroyed = 0;
        for (let r = 1; r < this.rows - 1; r++) {
          for (let c = 1; c < this.cols - 1; c++) {
            if (this.grid[r][c] !== 2) continue;
            const [x, z] = this.worldFromCell(r, c);
            if (Math.hypot(x - player.x, z - player.z) <= radius &&
                this.destroyBreakable(r, c, Renderer.colors.renektonGold)) destroyed++;
          }
        }
        const rival = this.players.find((candidate) => candidate.id !== player.id &&
          this.isContestantTargetable(candidate));
        const hitRival = rival && Math.hypot(rival.x - player.x, rival.z - player.z) <= radius
          ? this.hitSkill(rival, empowered ? 0.36 : 0.24, player, "Cull the Meek")
          : false;
        const healing = Math.min(empowered ? 0.28 : 0.2,
          destroyed * (empowered ? 0.045 : 0.028) + (hitRival ? (empowered ? 0.2 : 0.13) : 0));
        this.healChampion(player, healing);
        if (empowered) player.fury = Math.max(0, player.fury - 50);
        else this.gainRenektonFury(player, 10 + destroyed * 4 + (hitRival ? 16 : 0));
        this.slashes.push({ x: player.x, z: player.z, radius, age: 0, life: 0.58, renekton: true });
        this.renderer.addShock(player.x, player.z, empowered ? 0.72 : 0.5);
        this.spawnParticles(player.x, 0.56, player.z, Renderer.colors.renektonTeal,
          empowered ? 38 : 26, 0.82, 0.11);
        this.playSfxAt(empowered ? "renektonQEmpowered" : "renektonQ", player);
        this.presentation.announce(`Renekton · ${empowered ? "Empowered " : ""}Cull the Meek${healing > 0 ? " · healed" : ""}`);
        this.presentation.update(this);
        return true;
      }

      castRenektonW(player) {
        if (player.wCooldown > 0) return false;
        const empowered = player.fury >= 50;
        const target = this.katTargetInFront(player, this.tile * 3.05);
        const fromX = player.x;
        const fromZ = player.z;
        const dx = target.x - player.x;
        const dz = target.z - player.z;
        const distance = Math.max(0.001, Math.hypot(dx, dz));
        const desiredX = target.x - dx / distance * 0.58;
        const desiredZ = target.z - dz / distance * 0.58;
        const landing = this.findOpenLanding(desiredX, desiredZ, player);
        player.x = landing.x;
        player.z = landing.z;
        player.wCooldown = 9.5;
        player.castAnim = 0.5;
        player.castDuration = 0.5;
        player.renektonSlashAnim = 0.56;
        player.renektonDashAnim = 0.34;
        player.invulnerable = Math.max(player.invulnerable, 0.14);
        let connected = false;
        if (target.player && Math.hypot(target.player.x - player.x, target.player.z - player.z) <= 1.45) {
          connected = this.hitSkill(target.player, empowered ? 0.39 : 0.27, player, "Ruthless Predator");
          if (connected) target.player.stunned = Math.max(target.player.stunned, empowered ? 1.05 : 0.68);
        } else if (Number.isInteger(target.r) && Number.isInteger(target.c)) {
          connected = this.destroyBreakable(target.r, target.c, Renderer.colors.renektonBlood);
        }
        if (empowered) player.fury = Math.max(0, player.fury - 50);
        else this.gainRenektonFury(player, connected ? 22 : 8);
        this.skillTrails.push({
          x1: fromX, z1: fromZ, x2: player.x, z2: player.z,
          angle: Math.atan2(player.x - fromX, player.z - fromZ), age: 0, life: 0.4, renekton: true
        });
        this.slashes.push({ x: player.x, z: player.z, radius: this.tile * 0.82, age: 0, life: 0.42, renekton: true });
        this.renderer.addShock(player.x, player.z, empowered ? 0.78 : 0.54);
        this.playSfxAt(empowered ? "renektonWEmpowered" : "renektonW", player);
        this.presentation.announce(`Renekton · ${empowered ? "Empowered " : ""}Ruthless Predator`);
        this.presentation.update(this);
        return true;
      }

      distanceToSegment(px, pz, x1, z1, x2, z2) {
        const vx = x2 - x1;
        const vz = z2 - z1;
        const lengthSq = vx * vx + vz * vz;
        const t = lengthSq > 0 ? clamp(((px - x1) * vx + (pz - z1) * vz) / lengthSq, 0, 1) : 0;
        return Math.hypot(px - (x1 + vx * t), pz - (z1 + vz * t));
      }

      castRenektonE(player) {
        const recast = player.renektonDashRecast > 0;
        if (player.eCooldown > 0 && !recast) return false;
        const fromX = player.x;
        const fromZ = player.z;
        const maxDistance = this.tile * (recast ? 3.15 : 2.75);
        const length = Math.max(0.001, Math.hypot(player.lastDx, player.lastDz));
        const dirX = player.lastDx / length;
        const dirZ = player.lastDz / length;
        let landingX = player.x;
        let landingZ = player.z;
        let hitUnit = false;
        for (let distance = 0.24; distance <= maxDistance; distance += 0.24) {
          const x = fromX + dirX * distance;
          const z = fromZ + dirZ * distance;
          const cell = this.cellFromWorld(x, z);
          const tile = this.grid[cell.r]?.[cell.c];
          if (tile === 1) break;
          if (tile === 2) {
            hitUnit = this.destroyBreakable(cell.r, cell.c, Renderer.colors.renektonTeal) || hitUnit;
          }
          const bombBlocked = this.bombs.some((bomb) => !bomb.exploded &&
            Math.abs(x - bomb.x) < 0.48 && Math.abs(z - bomb.z) < 0.48);
          if (bombBlocked) break;
          landingX = x;
          landingZ = z;
        }
        const rival = this.players.find((candidate) => candidate.id !== player.id &&
          this.isContestantTargetable(candidate));
        const empowered = recast && player.fury >= 50;
        if (rival && this.distanceToSegment(rival.x, rival.z, fromX, fromZ, landingX, landingZ) <= 0.74) {
          hitUnit = this.hitSkill(rival, empowered ? 0.25 : recast ? 0.18 : 0.14,
            player, recast ? "Dice" : "Slice") || hitUnit;
        }
        player.x = landingX;
        player.z = landingZ;
        player.castAnim = 0.44;
        player.castDuration = 0.44;
        player.renektonDashAnim = 0.46;
        player.invulnerable = Math.max(player.invulnerable, 0.16);
        if (recast) {
          player.renektonDashRecast = 0;
          if (empowered) player.fury = Math.max(0, player.fury - 50);
          else if (hitUnit) this.gainRenektonFury(player, 12);
        } else {
          player.eCooldown = 11.5;
          player.renektonDashRecast = hitUnit ? 3.2 : 0;
          if (hitUnit) this.gainRenektonFury(player, 12);
        }
        this.skillTrails.push({
          x1: fromX, z1: fromZ, x2: player.x, z2: player.z,
          angle: Math.atan2(player.x - fromX, player.z - fromZ), age: 0, life: 0.46, renekton: true
        });
        this.renderer.addShock(player.x, player.z, recast ? 0.58 : 0.42);
        this.spawnParticles(player.x, 0.42, player.z, Renderer.colors.renektonTeal, 24, 0.66, 0.1);
        this.playSfxAt(recast ? "renektonDice" : "renektonE", player);
        this.presentation.announce(recast ? "Renekton · Dice" : `Renekton · Slice${hitUnit ? " · E again" : ""}`);
        this.presentation.update(this);
        return true;
      }

      castRenektonR(player) {
        if (player.rCooldown > 0 || player.renektonDominus > 0) return false;
        player.rCooldown = 31;
        player.renektonDominus = 7.2;
        player.renektonUltAnim = 0.72;
        player.renektonUltTick = 0;
        this.healChampion(player, 0.22);
        this.gainRenektonFury(player, 24);
        this.slashes.push({ x: player.x, z: player.z, radius: this.tile * 2.05, age: 0, life: 1.1, renekton: true });
        this.renderer.addShock(player.x, player.z, 1.05);
        this.spawnParticles(player.x, 0.75, player.z, Renderer.colors.renektonTeal, 52, 1.15, 0.14);
        this.playSfxAt("dominus", player);
        this.presentation.announce("Renekton · Dominus");
        this.presentation.update(this);
        return true;
      }

      castVladimirQ(player) {
        if (player.qCooldown > 0 || player.vladimirPool > 0) return false;
        const target = this.katTargetInFront(player, this.tile * 5);
        if (!target.player && !(Number.isInteger(target.r) && Number.isInteger(target.c))) {
          this.presentation.announce("Transfusion needs a rival or Hextech crate");
          return false;
        }
        const empowered = player.vladimirQStacks >= 2;
        player.vladimirQStacks = empowered ? 0 : player.vladimirQStacks + 1;
        player.qCooldown = empowered ? 3.4 : 4.4;
        player.vladimirQAnim = 0.56;
        player.castAnim = 0.56;
        player.castDuration = 0.56;
        let connected = false;
        if (target.player) {
          connected = this.hitSkill(target.player, empowered ? 0.34 : 0.22, player,
            empowered ? "Empowered Transfusion" : "Transfusion");
        } else {
          connected = this.destroyBreakable(target.r, target.c, Renderer.colors.vladimirCrimson);
        }
        if (connected) this.healChampion(player, target.player ? (empowered ? 0.24 : 0.14) : (empowered ? 0.13 : 0.07));
        this.skillTrails.push({
          x1: target.x, z1: target.z, x2: player.x, z2: player.z,
          angle: Math.atan2(player.x - target.x, player.z - target.z), age: 0, life: 0.5, vladimir: true
        });
        this.spawnParticles(target.x, 0.62, target.z, Renderer.colors.vladimirCrimson,
          empowered ? 34 : 22, 0.74, 0.1);
        this.renderer.addShock(target.x, target.z, empowered ? 0.62 : 0.38);
        this.playSfxAt(empowered ? "vladimirQEmpowered" : "vladimirQ", target);
        this.presentation.announce(`Vladimir · ${empowered ? "Empowered " : ""}Transfusion`);
        this.presentation.update(this);
        return true;
      }

      castVladimirW(player) {
        if (player.wCooldown > 0 || player.vladimirPool > 0) return false;
        player.wCooldown = 15;
        player.vladimirPool = 1.45;
        player.vladimirPoolTick = 0;
        player.invulnerable = Math.max(player.invulnerable, 1.48);
        player.speedBoost = Math.max(player.speedBoost, 1.45);
        this.payVladimirHealthCost(player, "sanguinePool");
        this.slashes.push({ x: player.x, z: player.z, radius: this.tile * 1.38, age: 0, life: 1.45, vladimir: true });
        this.renderer.addShock(player.x, player.z, 0.64);
        this.playSfxAt("sanguinePool", player);
        this.presentation.announce("Vladimir · Sanguine Pool");
        this.presentation.update(this);
        return true;
      }

      castVladimirE(player) {
        if (player.eCooldown > 0 || player.vladimirPool > 0) return false;
        const radius = this.tile * 1.78;
        player.eCooldown = 7.6;
        player.vladimirEAnim = 0.62;
        player.castAnim = 0.58;
        player.castDuration = 0.58;
        this.payVladimirHealthCost(player, "tidesOfBlood");
        let destroyed = 0;
        for (let r = 1; r < this.rows - 1; r++) {
          for (let c = 1; c < this.cols - 1; c++) {
            if (this.grid[r][c] !== 2) continue;
            const [x, z] = this.worldFromCell(r, c);
            if (Math.hypot(x - player.x, z - player.z) <= radius &&
                this.destroyBreakable(r, c, Renderer.colors.vladimirBlood)) destroyed++;
          }
        }
        const rival = this.players.find((candidate) => candidate.id !== player.id &&
          this.isContestantTargetable(candidate));
        if (rival && Math.hypot(rival.x - player.x, rival.z - player.z) <= radius) {
          this.hitSkill(rival, 0.29, player, "Tides of Blood");
        }
        this.slashes.push({ x: player.x, z: player.z, radius, age: 0, life: 0.66, vladimir: true });
        this.spawnParticles(player.x, 0.68, player.z, Renderer.colors.vladimirCrimson, 42, 0.96, 0.12);
        this.renderer.addShock(player.x, player.z, 0.72);
        this.playSfxAt("tidesOfBlood", player);
        this.presentation.announce(`Vladimir · Tides of Blood${destroyed ? ` · ${destroyed} crates` : ""}`);
        this.presentation.update(this);
        return true;
      }

      castVladimirR(player) {
        if (player.rCooldown > 0 || player.vladimirPool > 0) return false;
        const target = this.katTargetInFront(player, this.tile * 5.2);
        const landing = this.findOpenLanding(target.x, target.z, player);
        const radius = this.tile * 1.95;
        player.rCooldown = 30;
        player.vladimirUltAnim = 0.66;
        player.castAnim = 0.54;
        player.castDuration = 0.54;
        this.vladimirMarks.push({
          ownerId: player.id,
          x: landing.x,
          z: landing.z,
          radius,
          age: 0,
          fuse: 1.85,
          detonated: false
        });
        this.slashes.push({ x: landing.x, z: landing.z, radius, age: 0, life: 0.82, vladimir: true });
        this.renderer.addShock(landing.x, landing.z, 0.84);
        this.spawnParticles(landing.x, 0.58, landing.z, Renderer.colors.vladimirCrimson, 38, 0.92, 0.12);
        this.playSfxAt("hemoplague", landing);
        this.presentation.announce("Vladimir · Hemoplague");
        this.presentation.update(this);
        return true;
      }

      castGangplankQ(player) {
        if (player.qCooldown > 0) return false;
        const dx = player.lastDx || Math.sin(player.facing);
        const dz = player.lastDz || Math.cos(player.facing);
        const length = Math.max(0.001, Math.hypot(dx, dz));
        const dirX = dx / length;
        const dirZ = dz / length;
        player.qCooldown = 4.8;
        player.castAnim = 0.42;
        player.castDuration = 0.42;
        player.gangplankShotAnim = 0.48;
        this.projectiles.push({
          id: ++this.daggerId,
          kind: "gangplank",
          ownerId: player.id,
          x: player.x + dirX * 0.4,
          y: 0.9,
          z: player.z + dirZ * 0.4,
          dx: dirX,
          dz: dirZ,
          speed: 14.2,
          age: 0,
          life: this.tile * 7.2 / 14.2,
          resolved: false
        });
        this.playSfxAt("gangplankQ", player);
        this.presentation.announce("Gangplank · Parrrley");
        this.presentation.update(this);
        return true;
      }

      castGangplankW(player) {
        if (player.wCooldown > 0) return false;
        player.wCooldown = 12;
        player.castAnim = 0.4;
        player.castDuration = 0.4;
        player.stunned = 0;
        player.invulnerable = Math.max(player.invulnerable, 0.55);
        player.speedBoost = Math.max(player.speedBoost, 1.65);
        this.healChampion(player, 0.28);
        this.spawnParticles(player.x, 0.7, player.z, Renderer.colors.gangplankGold, 28, 0.7, 0.1);
        this.slashes.push({ x: player.x, z: player.z, radius: this.tile * 0.95, age: 0, life: 0.45, gangplank: true });
        this.playSfxAt("removeScurvy", player);
        this.presentation.announce("Gangplank · Remove Scurvy");
        this.presentation.update(this);
        return true;
      }

      castGangplankE(player) {
        if (player.eCooldown > 0) return false;
        const placement = this.gangplankKegPlacement(player);
        if (!placement) return false;
        const { cell, x, z } = placement;
        player.eCooldown = 7.5;
        player.castAnim = 0.36;
        player.castDuration = 0.36;
        player.gangplankKegAnim = 0.42;
        this.gangplankBarrels.push({
          id: ++this.bombId,
          ownerId: player.id,
          r: cell.r,
          c: cell.c,
          x, z,
          age: 0,
          life: 22,
          exploded: false
        });
        this.spawnParticles(x, 0.4, z, Renderer.colors.gangplankOrange, 18, 0.5, 0.08);
        this.playSfxAt("powderKeg", { x, z });
        this.presentation.announce("Gangplank · Powder Keg");
        this.presentation.update(this);
        return true;
      }

      castGangplankR(player) {
        if (player.rCooldown > 0) return false;
        const target = this.katTargetInFront(player, this.tile * 6.5);
        player.rCooldown = 32;
        player.castAnim = 0.55;
        player.castDuration = 0.55;
        player.gangplankUltAnim = 0.7;
        this.gangplankBarrages.push({
          ownerId: player.id,
          x: target.x,
          z: target.z,
          radius: this.tile * 2.35,
          age: 0,
          fuse: 2.4,
          detonated: false,
          tick: 0
        });
        this.slashes.push({ x: target.x, z: target.z, radius: this.tile * 2.35, age: 0, life: 2.5, gangplank: true });
        this.spawnParticles(target.x, 0.6, target.z, Renderer.colors.gangplankOrange, 36, 0.9, 0.12);
        this.playSfxAt("cannonBarrage", target);
        this.presentation.announce("Gangplank · Cannon Barrage");
        this.presentation.update(this);
        return true;
      }

      detonateGangplankBarrel(barrel, chainDepth = 0) {
        if (!barrel || barrel.exploded) return;
        barrel.exploded = true;
        const owner = this.players.find((p) => p.id === barrel.ownerId);
        const radius = this.tile * (1.75 + Math.min(chainDepth, 2) * 0.12);
        this.playSfxAt("barrelBoom", barrel, 1 + Math.min(chainDepth, 2) * 0.05, {
          chainDepth,
          sourceId: barrel.id
        });
        let destroyed = 0;
        for (let r = 1; r < this.rows - 1; r++) {
          for (let c = 1; c < this.cols - 1; c++) {
            if (this.grid[r][c] !== 2) continue;
            const [x, z] = this.worldFromCell(r, c);
            if (Math.hypot(x - barrel.x, z - barrel.z) <= radius &&
                this.destroyBreakable(r, c, Renderer.colors.gangplankOrange)) destroyed++;
          }
        }
        const rival = this.players.find((p) => p.id !== barrel.ownerId &&
          this.isContestantTargetable(p));
        if (rival && Math.hypot(rival.x - barrel.x, rival.z - barrel.z) <= radius) {
          this.hitSkill(rival, 0.3 + chainDepth * 0.04, owner, "Powder Keg");
        }
        if (owner?.alive && destroyed > 0) {
          owner.qCooldown = Math.max(0, owner.qCooldown - 1.1);
          this.healChampion(owner, Math.min(0.12, destroyed * 0.03));
        }
        this.renderer.addShock(barrel.x, barrel.z, 0.85);
        this.slashes.push({ x: barrel.x, z: barrel.z, radius, age: 0, life: 0.55, gangplank: true });
        this.spawnParticles(barrel.x, 0.55, barrel.z, Renderer.colors.gangplankOrange, 42, 0.95, 0.13);
        for (const other of this.gangplankBarrels) {
          if (other.exploded || other.id === barrel.id) continue;
          if (Math.hypot(other.x - barrel.x, other.z - barrel.z) <= this.tile * 1.85) {
            this.detonateGangplankBarrel(other, chainDepth + 1);
          }
        }
      }

      updateGangplank(dt) {
        for (const player of this.players) {
          if (player.champion !== "gangplank") continue;
          player.gangplankShotAnim = Math.max(0, player.gangplankShotAnim - dt);
          player.gangplankKegAnim = Math.max(0, player.gangplankKegAnim - dt);
          player.gangplankUltAnim = Math.max(0, player.gangplankUltAnim - dt);
        }

        for (const barrel of this.gangplankBarrels) {
          if (barrel.exploded) continue;
          barrel.age += dt;
          if (barrel.age >= barrel.life) barrel.exploded = true;
        }
        this.gangplankBarrels = this.gangplankBarrels.filter((b) => !b.exploded);

        const shots = this.projectiles.filter((p) => p.kind === "gangplank");
        for (const projectile of shots) {
          projectile.age += dt;
          projectile.x += projectile.dx * projectile.speed * dt;
          projectile.z += projectile.dz * projectile.speed * dt;
          projectile.y = 0.88 + Math.sin(projectile.age * 26) * 0.04;
          const cell = this.cellFromWorld(projectile.x, projectile.z);
          const tile = this.grid[cell.r]?.[cell.c];
          const owner = this.players.find((p) => p.id === projectile.ownerId && p.alive);
          const rival = this.players.find((p) => p.id !== projectile.ownerId &&
            this.isContestantTargetable(p));
          const hitBarrel = this.gangplankBarrels.find((b) =>
            !b.exploded && Math.hypot(b.x - projectile.x, b.z - projectile.z) <= 0.62
          );

          if (hitBarrel) {
            this.detonateGangplankBarrel(hitBarrel);
            projectile.resolved = true;
          } else if (tile === 1) {
            projectile.resolved = true;
          } else if (tile === 2) {
            this.destroyBreakable(cell.r, cell.c, Renderer.colors.gangplankGold);
            if (owner) {
              owner.qCooldown = Math.max(0, owner.qCooldown - 1.4);
              this.healChampion(owner, 0.06);
            }
            projectile.resolved = true;
          } else if (owner && rival && Math.hypot(rival.x - projectile.x, rival.z - projectile.z) <= 0.58) {
            this.hitSkill(rival, 0.22, owner, "Parrrley");
            if (owner) owner.qCooldown = Math.max(0, owner.qCooldown - 0.8);
            projectile.resolved = true;
          } else if (projectile.age >= projectile.life) {
            projectile.resolved = true;
          }

          if (projectile.resolved) {
            this.spawnParticles(projectile.x, projectile.y, projectile.z,
              Renderer.colors.gangplankGold, 12, 0.4, 0.07);
          }
        }
        this.projectiles = this.projectiles.filter((p) => !p.resolved);

        for (const barrage of this.gangplankBarrages) {
          barrage.age += dt;
          if (barrage.detonated) continue;
          if (barrage.age < barrage.fuse * 0.55) continue;
          barrage.tick -= dt;
          let playedCannonImpact = false;
          while (barrage.tick <= 0 && barrage.age < barrage.fuse + 1.35) {
            barrage.tick += 0.28;
            if (!playedCannonImpact) {
              this.playSfxAt("cannonImpact", barrage, 0.72, {
                sourceId: `${barrage.ownerId}:${Math.round(barrage.x * 100)}:${Math.round(barrage.z * 100)}`
              });
              playedCannonImpact = true;
            }
            const owner = this.players.find((p) => p.id === barrage.ownerId);
            const rival = this.players.find((p) => p.id !== barrage.ownerId &&
              this.isContestantTargetable(p));
            if (rival && Math.hypot(rival.x - barrage.x, rival.z - barrage.z) <= barrage.radius) {
              this.hitSkill(rival, 0.07, owner, "Cannon Barrage", true);
            }
            for (let r = 1; r < this.rows - 1; r++) {
              for (let c = 1; c < this.cols - 1; c++) {
                if (this.grid[r][c] !== 2) continue;
                const [x, z] = this.worldFromCell(r, c);
                if (Math.hypot(x - barrage.x, z - barrage.z) <= barrage.radius * 0.9) {
                  this.destroyBreakable(r, c, Renderer.colors.gangplankOrange);
                }
              }
            }
            for (const barrel of this.gangplankBarrels) {
              if (!barrel.exploded && Math.hypot(barrel.x - barrage.x, barrel.z - barrage.z) <= barrage.radius) {
                this.detonateGangplankBarrel(barrel);
              }
            }
            this.spawnParticles(barrage.x, 0.5, barrage.z, Renderer.colors.gangplankOrange, 10, 0.55, 0.08);
          }
          if (barrage.age >= barrage.fuse + 1.4) barrage.detonated = true;
        }
        this.gangplankBarrages = this.gangplankBarrages.filter((b) => !b.detonated);
      }


      dropDagger(x, z, readyAt = 0.4, owner = this.player) {
        const landing = this.findOpenLanding(x, z, owner);
        const dagger = {
          id: ++this.daggerId,
          ownerId: owner.id,
          x: landing.x,
          z: landing.z,
          age: 0,
          readyAt,
          life: 6.5
        };
        this.daggers.push(dagger);
        return dagger;
      }

      findOpenLanding(x, z, player) {
        const center = this.cellFromWorld(x, z);
        const candidates = [[0, 0], [0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
        for (const [dr, dc] of candidates) {
          const r = center.r + dr;
          const c = center.c + dc;
          if (r <= 0 || c <= 0 || r >= this.rows - 1 || c >= this.cols - 1 || this.grid[r][c] !== 0) continue;
          const [lx, lz] = this.worldFromCell(r, c);
          const blockingBomb = this.bombs.some((bomb) => !bomb.exploded && bomb.r === r && bomb.c === c && !bomb.passOwners?.has(player.id));
          if (!blockingBomb) return { x: lx, z: lz, r, c };
        }
        return { x: player.x, z: player.z, ...this.cellFromWorld(player.x, player.z) };
      }

      movementFor(player) {
        let dx = 0;
        let dz = 0;
        let analog = false;
        if (player.id === 1) {
          const stickX = this.touchStick?.x || 0;
          const stickZ = this.touchStick?.z || 0;
          const stickMag = Math.hypot(stickX, stickZ);
          if (stickMag > 0.18) {
            // Analog-only cardinal snap: inside ~13° of an axis (minor component
            // below sin(13°) of the magnitude) the stick reads as a straight lane
            // walk, so the minor component is zeroed to stop wall scraping.
            const snapLimit = 0.225 * stickMag;
            dx = Math.abs(stickX) <= snapLimit ? 0 : stickX;
            dz = Math.abs(stickZ) <= snapLimit ? 0 : stickZ;
            analog = true;
          } else {
            if (this.keys.has("KeyA") || this.touchDirs.has("left")) dx -= 1;
            if (this.keys.has("KeyD") || this.touchDirs.has("right")) dx += 1;
            if (this.keys.has("KeyW") || this.touchDirs.has("up")) dz -= 1;
            if (this.keys.has("KeyS") || this.touchDirs.has("down")) dz += 1;
          }
        } else if (this.p2Human) {
          if (this.keys.has("ArrowLeft")) dx -= 1;
          if (this.keys.has("ArrowRight")) dx += 1;
          if (this.keys.has("ArrowUp")) dz -= 1;
          if (this.keys.has("ArrowDown")) dz += 1;
        } else {
          dx = player.aiDx;
          dz = player.aiDz;
        }
        return { dx, dz, analog };
      }

      updateContestant(player, dt) {
        const wasStunned = player.stunned > 0;
        player.invulnerable = Math.max(0, player.invulnerable - dt);
        player.hurt = Math.max(0, player.hurt - dt);
        player.dashCooldown = Math.max(0, player.dashCooldown - dt);
        player.dashing = Math.max(0, player.dashing - dt);
        player.qCooldown = Math.max(0, player.qCooldown - dt);
        player.wCooldown = Math.max(0, player.wCooldown - dt);
        player.eCooldown = Math.max(0, player.eCooldown - dt);
        player.rCooldown = Math.max(0, player.rCooldown - dt);
        player.speedBoost = Math.max(0, player.speedBoost - dt);
        player.spin = Math.max(0, player.spin - dt);
        player.castAnim = Math.max(0, player.castAnim - dt);
        if (!this.isZedDeathMarkCommitted(player)) this.updateAbilityAnimation(player, dt);
        player.zedUltAnim = Math.max(0, player.zedUltAnim - dt);
        player.zedSlashAnim = Math.max(0, player.zedSlashAnim - dt);
        player.zedSwapWindow = Math.max(0, player.zedSwapWindow - dt);
        player.stunned = Math.max(0, player.stunned - dt);
        player.renektonUltAnim = Math.max(0, player.renektonUltAnim - dt);
        player.renektonSlashAnim = Math.max(0, player.renektonSlashAnim - dt);
        player.renektonDashAnim = Math.max(0, player.renektonDashAnim - dt);
        player.renektonDashRecast = Math.max(0, player.renektonDashRecast - dt);
        player.vladimirAttackAnim = Math.max(0, player.vladimirAttackAnim - dt);
        player.vladimirQAnim = Math.max(0, player.vladimirQAnim - dt);
        player.vladimirEAnim = Math.max(0, player.vladimirEAnim - dt);
        player.vladimirUltAnim = Math.max(0, player.vladimirUltAnim - dt);
        player.moving = false;
        if (!player.alive) {
          this.clearAbilityBuffer(player.id);
          this.cancelKatarinaChannel(player);
          return;
        }

        if (wasStunned) {
          this.cancelKatarinaChannel(player, "crowd control");
          const buffered = this.abilityBuffer.get(player.id);
          const gangplankCleanse = player.champion === "gangplank" && buffered?.slot === 1;
          if (buffered && !gangplankCleanse && !buffered.initialBlockers.includes("stun")) {
            this.clearAbilityBuffer(player.id);
          }
        }

        if (player.stunned > 0) {
          player.dashRequested = false;
          return;
        }

        if (this.isZedDeathMarkCommitted(player)) {
          player.dashRequested = false;
          return;
        }

        let movement = null;
        if (player.ultChannel > 0) {
          movement = this.movementFor(player);
          if (movement.dx === 0 && movement.dz === 0) {
            player.dashRequested = false;
            return;
          }
          this.cancelKatarinaChannel(player, "movement");
        }

        let { dx, dz, analog } = movement || this.movementFor(player);
        const moving = dx !== 0 || dz !== 0;
        player.moving = moving;
        if (moving) {
          const length = Math.hypot(dx, dz);
          dx /= length;
          dz /= length;
          player.lastDx = dx;
          player.lastDz = dz;
          player.facing = Math.atan2(dx, dz);
        } else {
          dx = player.lastDx;
          dz = player.lastDz;
        }

        if (player.dashRequested) {
          this.executeDash(player);
          player.dashRequested = false;
        }
        if (!moving && player.dashing <= 0) return;

        const passableBombs = this.bombs.filter((bomb) =>
          !bomb.exploded && bomb.passOwners?.has(player.id)
        );
        const preparation = player.speedBoost > 0 ? 1.3 : 1;
        this.moveEntity(player, dx, dz, player.speed * preparation * (player.dashing > 0 ? 2.7 : 1), dt, 0.3, passableBombs, analog);
        for (const bomb of passableBombs) {
          const fullyClear = Math.abs(player.x - bomb.x) > this.tile * 0.82 ||
            Math.abs(player.z - bomb.z) > this.tile * 0.82;
          if (fullyClear) bomb.passOwners.delete(player.id);
        }
      }

      destroyBreakable(r, c, color = Renderer.colors.katCrimson, ownerId = null) {
        if (this.grid[r]?.[c] !== 2) return false;
        this.grid[r][c] = 0;
        const dropOwner = ownerId ?? this.dropOwnerId ?? null;
        this.rollCrateDrop(r, c, dropOwner);
        const [x, z] = this.worldFromCell(r, c);
        this.spawnParticles(x, 0.42, z, color, 22, 0.78, 0.12);
        // No circular post ring — crates die inside bomb lanes constantly and the
        // expanding gold wave reads as a radial blast on top of the cross fire.
        if (typeof this.renderer.addImpact === "function") {
          this.renderer.addImpact(0.22);
        } else {
          this.renderer.cameraShake = Math.max(this.renderer.cameraShake || 0, 0.1);
          this.renderer.hitPulse = Math.max(this.renderer.hitPulse || 0, 0.22);
        }
        return true;
      }

      /**
       * Crate loot: 50% chance to drop one still-locked skill for the breaker.
       * Otherwise fall back to the pre-planned classic power-up (range/bomb/speed/shield).
       */
      rollCrateDrop(r, c, ownerId) {
        const key = `${r},${c}`;
        const owner = this.players.find((player) => player.id === ownerId);
        if (owner?.alive) {
          const locked = this.lockedSkillSlots(owner);
          if (locked.length && this.random() < 0.5) {
            const slot = locked[Math.floor(this.random() * locked.length)];
            this.spawnPickup(r, c, "skill", {
              slot,
              ownerId: owner.id,
              champion: owner.champion,
              label: this.skillSlotLabel(owner, slot),
              art: skillArtUrl(owner.champion, slot)
            });
            this.powerupPlan.delete(key);
            return;
          }
        }
        const hidden = this.powerupPlan.get(key);
        if (hidden) {
          this.spawnPickup(r, c, hidden);
          this.powerupPlan.delete(key);
        }
      }

      resolveKatarinaProjectile(projectile) {
        const owner = this.players.find((player) => player.id === projectile.ownerId);
        if (!owner) return;
        const target = this.players.find((player) => player.id === projectile.targetPlayerId &&
          this.isContestantTargetable(player));
        const hitX = target?.x ?? projectile.targetX;
        const hitZ = target?.z ?? projectile.targetZ;
        if (target && Math.hypot(target.x - hitX, target.z - hitZ) <= this.tile * 0.9) {
          this.hitSkill(target, 0.22, owner, "Bouncing Blade");
        }

        const breakables = [];
        if (Number.isInteger(projectile.targetR) && Number.isInteger(projectile.targetC) &&
            this.grid[projectile.targetR]?.[projectile.targetC] === 2) {
          breakables.push({ r: projectile.targetR, c: projectile.targetC, distance: 0 });
        }
        for (let r = 1; r < this.rows - 1; r++) {
          for (let c = 1; c < this.cols - 1; c++) {
            if (this.grid[r][c] !== 2 || breakables.some((cell) => cell.r === r && cell.c === c)) continue;
            const [x, z] = this.worldFromCell(r, c);
            const distance = Math.hypot(x - hitX, z - hitZ);
            if (distance <= this.tile * 2.25) breakables.push({ r, c, distance });
          }
        }
        breakables.sort((a, b) => a.distance - b.distance).slice(0, 3).forEach((cell, index) => {
          const [x, z] = this.worldFromCell(cell.r, cell.c);
          this.skillTrails.push({
            x1: index ? this.worldFromCell(breakables[index - 1].r, breakables[index - 1].c)[0] : hitX,
            z1: index ? this.worldFromCell(breakables[index - 1].r, breakables[index - 1].c)[1] : hitZ,
            x2: x,
            z2: z,
            angle: Math.atan2(x - hitX, z - hitZ),
            age: 0,
            life: 0.3
          });
          this.destroyBreakable(cell.r, cell.c, Renderer.colors.katBladeEdge);
        });

        const vx = projectile.targetX - projectile.startX;
        const vz = projectile.targetZ - projectile.startZ;
        const length = Math.max(0.001, Math.hypot(vx, vz));
        this.dropDagger(hitX + vx / length * 0.68, hitZ + vz / length * 0.68, 0.32, owner);
        this.slashes.push({ x: hitX, z: hitZ, radius: this.tile * 0.72, age: 0, life: 0.34 });
        this.spawnParticles(hitX, 0.7, hitZ, Renderer.colors.katBladeEdge, 18, 0.6, 0.09);
        this.playSfxAt("daggerLand", { x: hitX, z: hitZ });
      }

      triggerVoracity(player, dagger) {
        player.spin = 0.58;
        player.eCooldown = Math.max(0, player.eCooldown - 6.5);
        const radius = this.tile * 1.42;
        this.slashes.push({ x: dagger.x, z: dagger.z, radius, age: 0, life: 0.55, voracity: true });
        this.renderer.addShock(dagger.x, dagger.z, 0.64);
        this.playSfxAt("voracity", dagger);
        this.spawnParticles(dagger.x, 0.48, dagger.z, Renderer.colors.katCrimson, 34, 0.82, 0.12);

        const rival = this.players.find((candidate) => candidate.id !== player.id &&
          this.isContestantTargetable(candidate));
        if (rival && Math.hypot(rival.x - dagger.x, rival.z - dagger.z) <= radius) {
          this.hitSkill(rival, 0.4, player, "Voracity");
        }
        for (let r = 1; r < this.rows - 1; r++) {
          for (let c = 1; c < this.cols - 1; c++) {
            if (this.grid[r][c] !== 2) continue;
            const [x, z] = this.worldFromCell(r, c);
            if (Math.hypot(x - dagger.x, z - dagger.z) <= radius) {
              this.destroyBreakable(r, c, Renderer.colors.katCrimson);
            }
          }
        }
        this.presentation.announce("Voracity · dagger reclaimed · Shunpo refunded");
      }

      updateKatarina(dt) {
        for (const projectile of this.projectiles) {
          if (projectile.kind === "zed" || projectile.kind === "gangplank") continue;
          projectile.age += dt;
          const progress = clamp(projectile.age / projectile.duration, 0, 1);
          const eased = 1 - Math.pow(1 - progress, 2);
          projectile.x = lerp(projectile.startX, projectile.targetX, eased);
          projectile.z = lerp(projectile.startZ, projectile.targetZ, eased);
          projectile.y = 0.72 + Math.sin(progress * Math.PI) * 1.22;
          if (progress >= 1 && !projectile.resolved) {
            projectile.resolved = true;
            this.resolveKatarinaProjectile(projectile);
          }
        }
        this.projectiles = this.projectiles.filter((projectile) => !projectile.resolved);

        for (const dagger of this.daggers) dagger.age += dt;
        for (let index = this.daggers.length - 1; index >= 0; index--) {
          const dagger = this.daggers[index];
          const owner = this.players.find((player) => player.id === dagger.ownerId && player.alive && player.champion === "katarina");
          if (!owner || dagger.age >= dagger.life) {
            this.daggers.splice(index, 1);
            continue;
          }
          if (dagger.age >= dagger.readyAt && Math.hypot(owner.x - dagger.x, owner.z - dagger.z) <= 0.78) {
            this.daggers.splice(index, 1);
            this.triggerVoracity(owner, dagger);
          }
        }

        for (const player of this.players) {
          if (player.champion !== "katarina" || !player.alive || player.ultChannel <= 0) continue;
          player.ultChannel = Math.max(0, player.ultChannel - dt);
          player.ultTick -= dt;
          while (player.ultTick <= 0 && player.ultChannel > 0) {
            player.ultTick += 0.13;
            const rival = this.players.find((candidate) => candidate.id !== player.id &&
              this.isContestantTargetable(candidate));
            if (rival && Math.hypot(rival.x - player.x, rival.z - player.z) <= this.tile * 3.35) {
              this.hitSkill(rival, 0.082, player, "Death Lotus", true);
            }
            const angle = this.elapsed * 18 + player.ultChannel * 7;
            this.spawnParticles(
              player.x + Math.cos(angle) * 0.8,
              0.65,
              player.z + Math.sin(angle) * 0.8,
              Renderer.colors.katBladeEdge,
              6,
              0.42,
              0.07
            );
          }
        }

        for (const trail of this.skillTrails) trail.age += dt;
        for (const slash of this.slashes) slash.age += dt;
        this.skillTrails = this.skillTrails.filter((trail) => trail.age < trail.life);
        this.slashes = this.slashes.filter((slash) => slash.age < slash.life);
      }

      updateZed(dt) {
        for (const shadow of this.zedShadows) {
          shadow.age += dt;
          shadow.castAnim = Math.max(0, shadow.castAnim - dt);
          this.updateAbilityAnimation(shadow, dt);
          shadow.zedUltAnim = Math.max(0, shadow.zedUltAnim - dt);
          shadow.zedSlashAnim = Math.max(0, shadow.zedSlashAnim - dt);
        }
        this.zedShadows = this.zedShadows.filter((shadow) => {
          const owner = this.players.find((player) => player.id === shadow.ownerId);
          return owner?.alive && shadow.age < shadow.life;
        });

        const zedProjectiles = this.projectiles.filter((projectile) => projectile.kind === "zed");
        for (const projectile of zedProjectiles) {
          projectile.age += dt;
          projectile.x += projectile.dx * projectile.speed * dt;
          projectile.z += projectile.dz * projectile.speed * dt;
          projectile.y = 0.82 + Math.sin(projectile.age * 22) * 0.045;
          const cell = this.cellFromWorld(projectile.x, projectile.z);
          const tile = this.grid[cell.r]?.[cell.c];
          const owner = this.players.find((player) => player.id === projectile.ownerId && player.alive);
          const rival = this.players.find((player) => player.id !== projectile.ownerId &&
            this.isContestantTargetable(player));

          if (tile === 1) {
            projectile.resolved = true;
          } else if (tile === 2) {
            this.destroyBreakable(cell.r, cell.c, Renderer.colors.zedCrimson);
            projectile.resolved = true;
          } else if (owner && rival && Math.hypot(rival.x - projectile.x, rival.z - projectile.z) <= 0.58) {
            this.hitSkill(rival, projectile.fromShadow ? 0.12 : 0.18, owner, "Razor Shuriken");
            projectile.resolved = true;
          } else if (projectile.age >= projectile.life) {
            projectile.resolved = true;
          }

          if (projectile.resolved) {
            this.spawnParticles(projectile.x, projectile.y, projectile.z,
              Renderer.colors.zedCrimson, 14, 0.44, 0.08);
            this.slashes.push({ x: projectile.x, z: projectile.z, radius: 0.42, age: 0, life: 0.28, zed: true });
          }
        }
        this.projectiles = this.projectiles.filter((projectile) => !projectile.resolved);

        for (const mark of this.zedMarks) this.advanceZedMark(mark, dt);
        this.zedMarks = this.zedMarks.filter((mark) => !mark.detonated);
        for (const player of this.players) {
          if (player.champion === "zed" && player.zedDeathMarkCommitment) {
            this.advanceZedDeathMarkCommitment(player, dt);
          }
        }
        this.zedMarks = this.zedMarks.filter((mark) => !mark.detonated);
      }

      updateRenekton(dt) {
        for (const player of this.players) {
          if (player.champion !== "renekton" || !player.alive || player.renektonDominus <= 0) continue;
          player.renektonDominus = Math.max(0, player.renektonDominus - dt);
          this.gainRenektonFury(player, dt * 5.2);
          player.renektonUltTick -= dt;
          while (player.renektonUltTick <= 0 && player.renektonDominus > 0) {
            player.renektonUltTick += 0.42;
            const radius = this.tile * 1.72;
            const rival = this.players.find((candidate) => candidate.id !== player.id &&
              this.isContestantTargetable(candidate));
            if (rival && Math.hypot(rival.x - player.x, rival.z - player.z) <= radius) {
              this.hitSkill(rival, 0.045, player, "Dominus", true);
              this.gainRenektonFury(player, 3);
            }
            for (let r = 1; r < this.rows - 1; r++) {
              for (let c = 1; c < this.cols - 1; c++) {
                if (this.grid[r][c] !== 2) continue;
                const [x, z] = this.worldFromCell(r, c);
                if (Math.hypot(x - player.x, z - player.z) <= radius * 0.72) {
                  this.destroyBreakable(r, c, Renderer.colors.renektonTeal);
                  this.gainRenektonFury(player, 2);
                }
              }
            }
            const angle = this.elapsed * 5.4 + player.renektonDominus;
            this.spawnParticles(player.x + Math.cos(angle) * 0.76, 0.58,
              player.z + Math.sin(angle) * 0.76, Renderer.colors.renektonTeal, 5, 0.42, 0.07);
          }
        }
      }

      updateVladimir(dt) {
        for (const player of this.players) {
          if (player.champion !== "vladimir" || !player.alive || player.vladimirPool <= 0) continue;
          player.vladimirPool = Math.max(0, player.vladimirPool - dt);
          player.vladimirPoolTick -= dt;
          while (player.vladimirPoolTick <= 0 && player.vladimirPool > 0) {
            player.vladimirPoolTick += 0.28;
            const rival = this.players.find((candidate) => candidate.id !== player.id &&
              this.isContestantTargetable(candidate));
            if (rival && Math.hypot(rival.x - player.x, rival.z - player.z) <= this.tile * 1.38) {
              const hit = this.hitSkill(rival, 0.038, player, "Sanguine Pool", true);
              if (hit) this.healChampion(player, 0.022);
            }
            this.spawnParticles(player.x, 0.12, player.z,
              Renderer.colors.vladimirBlood, 5, 0.4, 0.065);
          }
        }

        for (const mark of this.vladimirMarks) {
          mark.age += dt;
          const owner = this.players.find((player) => player.id === mark.ownerId && player.alive);
          if (!owner) {
            mark.detonated = true;
            continue;
          }
          if (mark.age < mark.fuse || mark.detonated) continue;
          mark.detonated = true;
          this.playSfxAt("hemoplaguePop", mark, 1, {
            sourceId: `${mark.ownerId}:${Math.round(mark.x * 1000)}:${Math.round(mark.z * 1000)}`
          });
          let destroyed = 0;
          for (let r = 1; r < this.rows - 1; r++) {
            for (let c = 1; c < this.cols - 1; c++) {
              if (this.grid[r][c] !== 2) continue;
              const [x, z] = this.worldFromCell(r, c);
              if (Math.hypot(x - mark.x, z - mark.z) <= mark.radius &&
                  this.destroyBreakable(r, c, Renderer.colors.vladimirCrimson)) destroyed++;
            }
          }
          const rival = this.players.find((candidate) => candidate.id !== owner.id &&
            this.isContestantTargetable(candidate));
          const hitRival = rival && Math.hypot(rival.x - mark.x, rival.z - mark.z) <= mark.radius
            ? this.hitSkill(rival, 0.44, owner, "Hemoplague")
            : false;
          this.healChampion(owner, 0.12 + destroyed * 0.025 + (hitRival ? 0.2 : 0));
          this.slashes.push({ x: mark.x, z: mark.z, radius: mark.radius * 1.05, age: 0, life: 0.82, vladimir: true });
          this.spawnParticles(mark.x, 0.64, mark.z, Renderer.colors.vladimirCrimson, 58, 1.18, 0.15);
          this.renderer.addShock(mark.x, mark.z, 1.08);
        }
        this.vladimirMarks = this.vladimirMarks.filter((mark) => !mark.detonated);
      }

      blastPathClear(bomb, r, c) {
        const dr = Math.sign(r - bomb.r);
        const dc = Math.sign(c - bomb.c);
        const distance = Math.max(Math.abs(r - bomb.r), Math.abs(c - bomb.c));
        if (dr && dc || distance > bomb.range) return false;
        for (let i = 1; i <= distance; i++) {
          const rr = bomb.r + dr * i;
          const cc = bomb.c + dc * i;
          if (this.grid[rr][cc] === 1) return false;
          if (this.grid[rr][cc] === 2) return i === distance;
        }
        return true;
      }

      dangerAt(r, c) {
        if (this.blasts.some((blast) => blast.r === r && blast.c === c)) return 4;
        for (const bomb of this.bombs) {
          if (bomb.exploded) continue;
          if (bomb.r === r && bomb.c === c) return 3;
          if ((bomb.r === r || bomb.c === c) && this.blastPathClear(bomb, r, c)) {
            return bomb.age < bomb.fuse - 1.05 ? 1 : 2;
          }
        }
        return 0;
      }

      updateBot(dt) {
        const bot = this.players[1];
        if (!bot || !this.botPolicy) return;
        const view = RIFTBOMB_BOTS.buildWorldView(this, dt, bot.id);
        const intent = this.botPolicy.think(view, dt);
        bot.aiDx = intent.dx;
        bot.aiDz = intent.dz;
        bot.aiCommit = this.botPolicy.memory.commit ?? 0;
        bot.aiThink = this.botPolicy.memory.think ?? bot.aiThink;
        // A skill intent enters through the same entrypoint as human input;
        // castAbility validates alive/mode/lock/stun/unlock before casting.
        if (intent.skill != null && Object.hasOwn(BOT_SKILL_SLOTS, intent.skill)) {
          this.castAbility(BOT_SKILL_SLOTS[intent.skill], bot);
        }
        if (intent.plantBomb && this.placeBomb(bot)) {
          if ("commit" in this.botPolicy.memory) this.botPolicy.memory.commit = 0;
          bot.aiCommit = 0;
        }
      }

      updateBombs(dt) {
        const pending = [];
        for (const bomb of this.bombs) {
          if (bomb.exploded) {
            bomb.cleanup -= dt;
            continue;
          }
          bomb.age += dt;
          if (bomb.age >= bomb.fuse) pending.push(bomb);
        }
        for (const bomb of pending) this.explodeBomb(bomb);
        this.bombs = this.bombs.filter((bomb) => !bomb.exploded || bomb.cleanup > 0);
      }

      explodeBomb(bomb) {
        if (!bomb || bomb.exploded) return;
        bomb.exploded = true;
        bomb.cleanup = 0.04;
        // Core + corridor cells with explicit arm direction for Bomberman-style cross VFX.
        const cells = [{ r: bomb.r, c: bomb.c, core: true, dr: 0, dc: 0, step: 0 }];
        const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dr, dc] of directions) {
          for (let i = 1; i <= bomb.range; i++) {
            const r = bomb.r + dr * i;
            const c = bomb.c + dc * i;
            if (r < 0 || c < 0 || r >= this.rows || c >= this.cols || this.grid[r][c] === 1) break;
            cells.push({ r, c, core: false, dr, dc, step: i });
            if (this.grid[r][c] === 2) {
              this.destroyBreakable(
                r, c,
                bomb.ownerId === 1 ? Renderer.colors.gold : Renderer.colors.ember,
                bomb.ownerId
              );
              break;
            }
          }
        }
        for (const cell of cells) {
          this.blasts.push({
            ...cell,
            age: 0,
            // Fire-corridor window: punch + strong fire + short smoke (visual == hitbox).
            life: 0.5,
            source: bomb.id,
            ownerId: bomb.ownerId,
            originR: bomb.r,
            originC: bomb.c
          });
          const [x, z] = this.worldFromCell(cell.r, cell.c);
          // Dense corridor-locked sparks — never radial sphere cloud.
          // NO_RED_RIM_V1: amber/orange/smoke only — never pure deep-red layers
          // (those read as a red border under additive soft sprites).
          // Soft CPU sparks must finish inside blast life (0.5s) — no hanging tail.
          if (cell.core) {
            this.spawnCorridorParticles(x, 0.34, z, [1, 0.38, 0.05], 42, 0.30, 0.07, 0, 0, true);
            this.spawnCorridorParticles(x, 0.26, z, [0.98, 0.24, 0.03], 34, 0.34, 0.06, 0, 0, true);
            this.spawnCorridorParticles(x, 0.2, z, [0.62, 0.16, 0.03], 26, 0.38, 0.05, 0, 0, true);
            this.spawnCorridorParticles(x, 0.44, z, [0.08, 0.08, 0.09], 20, 0.45, 0.09, 0, 0, true);
            this.spawnCorridorParticles(x, 0.3, z, [1, 0.55, 0.2], 18, 0.26, 0.045, 0, 0, true);
          } else {
            this.spawnCorridorParticles(x, 0.28, z, [1, 0.34, 0.04], 22, 0.30, 0.06, cell.dr, cell.dc, false);
            this.spawnCorridorParticles(x, 0.22, z, [0.95, 0.22, 0.03], 16, 0.34, 0.05, cell.dr, cell.dc, false);
            this.spawnCorridorParticles(x, 0.18, z, [0.62, 0.16, 0.03], 12, 0.36, 0.045, cell.dr, cell.dc, false);
          }
          for (const other of this.bombs) {
            if (!other.exploded && other.r === cell.r && other.c === cell.c) other.age = other.fuse;
          }
        }
        // Camera kick only — never the expanding circular post-process ring
        // (that radial wave fights the Bomberman cross explosion read).
        if (typeof this.renderer.addImpact === "function") {
          this.renderer.addImpact(0.35 + bomb.range * 0.05);
        } else {
          this.renderer.cameraShake = Math.max(this.renderer.cameraShake || 0, (0.35 + bomb.range * 0.05) * 0.44);
          this.renderer.hitPulse = Math.max(this.renderer.hitPulse || 0, 0.35 + bomb.range * 0.05);
        }
        this.playExplosionAt(bomb, clamp(0.7 + bomb.range * 0.08, 0.7, 1.12), {
          sourceId: bomb.id,
          // Keep sample window locked to the fire-corridor visual (blasts[].life).
          visualLife: 0.5
        });
        this.damageAtCells(cells, bomb);
      }

      pendingRoundDecisionHold() {
        let active = false;
        let delay = 0;
        for (const player of this.players) {
          const commitmentDelay = this.zedDeathMarkCommitmentRemaining(player);
          if (commitmentDelay <= ABILITY_TIME_EPSILON) continue;
          active = true;
          delay = Math.max(delay, commitmentDelay);
        }
        for (const mark of this.zedMarks) {
          if (mark.detonated) continue;
          const owner = this.players.find((player) => player.id === mark.ownerId);
          const target = this.players.find((player) => player.id === mark.targetId);
          if (!owner || owner.alive || !target?.alive) continue;
          active = true;
          delay = Math.max(delay, Math.max(0, mark.fuse - mark.age));
        }
        return { active, delay };
      }

      pendingPostMortemDeathMarkDelay() {
        const pending = this.pendingRoundDecisionHold();
        return pending.active ? pending.delay : 0;
      }

      scheduleRoundDecision() {
        if (this.players.filter((player) => player.alive).length > 1) return false;
        const pending = this.pendingRoundDecisionHold();
        const delay = Math.max(0.16, pending.delay);
        if (this.roundDecisionTimer < 0) {
          this.roundDecisionTimer = delay;
        } else if (pending.active) {
          this.roundDecisionTimer = Math.max(this.roundDecisionTimer, delay);
        } else {
          // A new terminal event gets a short readable beat. This also clamps
          // an invalidated post-mortem fuse instead of preserving its old wait.
          this.roundDecisionTimer = 0.16;
        }
        return true;
      }

      damageAtCells(cells, bomb) {
        const includes = (player) => {
          const cell = this.cellFromWorld(player.x, player.z);
          return cells.some((blast) => blast.r === cell.r && blast.c === cell.c);
        };
        for (const player of this.players) {
          if (player.alive && includes(player)) this.hitContestant(player, bomb);
        }
        this.scheduleRoundDecision();
      }

      /**
       * HITBOX_VISUAL_MATCH_V1 — while a blast cell is alive on screen, its
       * grid cell remains lethal. Damage is no longer a one-shot at detonation
       * only: walking into the fire corridor during `blast.life` (0.5s) kills,
       * matching the particle display which is drawn for the same cells/time.
       */
      applyActiveBlastDamage() {
        if (!this.blasts.length || this.mode !== "playing") return;
        let hit = false;
        for (const player of this.players) {
          if (!player.alive) continue;
          const cell = this.cellFromWorld(player.x, player.z);
          const blast = this.blasts.find((entry) => entry.r === cell.r && entry.c === cell.c);
          if (!blast) continue;
          this.hitContestant(player, { ownerId: blast.ownerId });
          hit = true;
        }
        if (hit) this.scheduleRoundDecision();
      }

      hitContestant(player, bomb) {
        if (!this.isContestantTargetable(player) || player.invulnerable > 0 ||
            player.dashing > 0 || this.mode !== "playing") return;
        if (player.shield > 0) {
          player.shield -= 1;
          player.invulnerable = 0.72;
          this.playSfxAt("shield", player);
          this.presentation.announce(`${player.name} shield shattered`);
          this.spawnParticles(player.x, 0.55, player.z, Renderer.colors.ice, 28, 0.8, 0.13);
          this.renderer.addShock(player.x, player.z, 0.45);
          return;
        }
        player.alive = false;
        player.health = 0;
        this.clearAbilityBuffer(player.id);
        this.cancelKatarinaChannel(player);
        this.cancelZedDeathMarkCommitment(player);
        this.renderer.hitPulse = player.id === 1 ? 1.25 : 0.75;
        this.renderer.cameraShake = 0.82;
        // Spoken death line (forced VO). Procedural impact still available via
        // the championDeath → kill bus fallback when the sample bank is empty.
        this.playSfxAt("championDeath", player);
        this.spawnParticles(player.x, 0.58, player.z,
          player.id === 1 ? Renderer.colors.blueSide : Renderer.colors.redSide, 54, 1.1, 0.15);
        const owner = this.players.find((candidate) => candidate.id === bomb.ownerId);
        const cause = owner?.id === player.id ? "self-destructed" : "was caught in the blast";
        this.presentation.announce(`${player.name} ${cause}`);
        this.presentation.update(this);
        this.scheduleRoundDecision();
      }

      consumeSpellShield(player, label, shieldInvulnerability = 0.48) {
        if (!player || player.shield <= 0) return false;
        player.shield -= 1;
        player.invulnerable = shieldInvulnerability;
        this.playSfxAt("shield", player);
        this.presentation.announce(`${player.name} blocked ${label}`);
        this.spawnParticles(player.x, 0.55, player.z, Renderer.colors.ice, 26, 0.75, 0.12);
        this.renderer.addShock(player.x, player.z, 0.4);
        return true;
      }

      hitSkill(player, damage, source, label, quiet = false, shieldInvulnerability = 0.48,
        rules = {}) {
        const requiresTargetable = rules.requiresTargetable !== false;
        const respectsHitLocks = rules.respectsHitLocks !== false;
        const respectsShield = rules.respectsShield !== false;
        if (!player?.alive || this.mode !== "playing") return false;
        if (requiresTargetable && !this.isContestantTargetable(player)) return false;
        if (respectsHitLocks && (player.invulnerable > 0 || player.dashing > 0)) return false;
        if (source?.champion === "vladimir" && this.vladimirMarks.some((mark) =>
          mark.ownerId === source.id && Math.hypot(player.x - mark.x, player.z - mark.z) <= mark.radius
        )) damage *= 1.12;
        if (respectsShield && this.consumeSpellShield(player, label, shieldInvulnerability)) return false;
        player.health = Math.max(0, player.health - damage);
        if (source?.champion === "zed" && label !== "Death Mark") {
          const mark = this.zedMarks.find((candidate) =>
            candidate.ownerId === source.id && candidate.targetId === player.id && !candidate.detonated
          );
          if (mark) mark.stored = clamp(mark.stored + damage * 0.48, 0, 0.3);
        }
        player.hurt = Math.max(player.hurt, 0.14);
        this.renderer.hitPulse = player.id === 1 ? 0.62 : 0.34;
        this.renderer.cameraShake = Math.max(this.renderer.cameraShake,
          label === "Death Lotus" ? 0.16 : label === "Death Mark" ? 0.66 : 0.3);
        const impactColor = source?.champion === "renekton" ? Renderer.colors.renektonGold :
          source?.champion === "vladimir" ? Renderer.colors.vladimirCrimson : Renderer.colors.katCrimson;
        this.spawnParticles(player.x, 0.58, player.z,
          player.id === 1 ? Renderer.colors.blueSide : impactColor,
          label === "Death Lotus" ? 9 : 20, 0.58, 0.09);
        if (!quiet) this.playSfxAt("bladeHit", player, label === "Voracity" ? 1.12 : 0.9);

        if (player.health <= 0) {
          player.alive = false;
          this.clearAbilityBuffer(player.id);
          this.cancelKatarinaChannel(player);
          this.cancelZedDeathMarkCommitment(player);
          this.renderer.hitPulse = player.id === 1 ? 1.25 : 0.82;
          this.renderer.cameraShake = 0.86;
          this.playSfxAt("kill", player, 1, {
            sourceId: `${source?.id ?? "world"}:${player.id}:${label}`
          });
          this.spawnParticles(player.x, 0.62, player.z,
            player.id === 1 ? Renderer.colors.blueSide : Renderer.colors.redSide, 58, 1.12, 0.15);
          this.presentation.announce(`${source?.name || "Katarina"} eliminated ${player.name} with ${label}`);
          if (source?.champion === "katarina") {
            source.qCooldown = 0;
            source.wCooldown = 0;
            source.eCooldown = 0;
            source.rCooldown = Math.max(0, source.rCooldown - 15);
          }
          if (source?.champion === "zed") {
            source.qCooldown = 0;
            source.wCooldown = Math.max(0, source.wCooldown - 8);
            source.eCooldown = 0;
            source.rCooldown = Math.max(0, source.rCooldown - 14);
          }
          if (source?.champion === "renekton") {
            source.qCooldown = 0;
            source.wCooldown = Math.max(0, source.wCooldown - 5);
            source.eCooldown = 0;
            source.rCooldown = Math.max(0, source.rCooldown - 12);
            this.gainRenektonFury(source, 30);
          }
          if (source?.champion === "vladimir") {
            source.qCooldown = 0;
            source.wCooldown = Math.max(0, source.wCooldown - 7);
            source.eCooldown = 0;
            source.rCooldown = Math.max(0, source.rCooldown - 12);
            this.healChampion(source, 0.22);
          }
          this.scheduleRoundDecision();
        } else if (!quiet) {
          const healthPercent = player.maxHealth > 0
            ? Math.ceil(player.health / player.maxHealth * 100)
            : 0;
          this.presentation.announce(`${label} · ${healthPercent}% ${player.name} health`);
        }
        this.presentation.update(this);
        return true;
      }

      finalizeRound(forcedWinner = null) {
        if (this.roundLocked) return;
        for (const player of this.players) this.cancelZedDeathMarkCommitment(player);
        this.roundLocked = true;
        this.roundTransition = 2.15;
        const survivors = this.players.filter((player) => player.alive);
        const winner = forcedWinner || (survivors.length === 1 ? survivors[0] : null);
        if (winner) {
          this.roundWins[winner.id - 1] += 1;
          this.presentation.announce(`${winner.name} wins round ${this.round}`);
          this.spawnParticles(winner.x, 0.7, winner.z,
            winner.id === 1 ? Renderer.colors.blueSide : Renderer.colors.redSide, 72, 1.4, 0.17);
          if (this.roundWins[winner.id - 1] >= this.matchTarget) this.pendingMatchWinner = winner;
        } else {
          this.presentation.announce(`Double knockout · round ${this.round} is a draw`);
        }
        this.presentation.update(this);
      }

      resolveTimeout() {
        const power = (player) => player.maxBombs * 2 + player.range + player.shield * 3 + (player.speed - 3.45) * 4;
        const a = power(this.players[0]);
        const b = power(this.players[1]);
        this.finalizeRound(Math.abs(a - b) < 0.01 ? null : (a > b ? this.players[0] : this.players[1]));
      }

      spawnPickup(r, c, type, extra = {}) {
        const [x, z] = this.worldFromCell(r, c);
        this.pickups.push({ r, c, x, z, type, ...extra });
      }

      collectPickups() {
        for (let i = this.pickups.length - 1; i >= 0; i--) {
          const item = this.pickups[i];
          const player = this.players.find((candidate) =>
            candidate.alive && Math.hypot(item.x - candidate.x, item.z - candidate.z) <= 0.58
          );
          if (!player) continue;
          if (item.type === "skill") {
            // Skill orbs only unlock for the breaker who earned them.
            if (player.id !== item.ownerId) continue;
            if (player.skillsUnlocked[item.slot]) {
              this.pickups.splice(i, 1);
              continue;
            }
            player.skillsUnlocked[item.slot] = true;
            const skillName = item.label || this.skillSlotLabel(player, item.slot);
            this.presentation.announce(`${player.name} unlocked ${skillName}`);
            this.playSfxAt("pickup", player);
            this.spawnParticles(item.x, 0.5, item.z,
              player.id === 1 ? Renderer.colors.gold : Renderer.colors.ember, 28, 0.95, 0.12);
            this.pickups.splice(i, 1);
            this.presentation.update(this);
            continue;
          }
          if (item.type === "range") player.range = Math.min(6, player.range + 1);
          else if (item.type === "bomb") player.maxBombs = Math.min(5, player.maxBombs + 1);
          else if (item.type === "speed") player.speed = Math.min(4.75, player.speed + 0.25);
          else if (item.type === "shield") player.shield = Math.min(2, player.shield + 1);
          const labels = {
            range: "blast range +1",
            bomb: "bomb capacity +1",
            speed: "movement speed +1",
            shield: "spell shield acquired"
          };
          this.presentation.announce(`${player.name} · ${labels[item.type]}`);
          this.playSfxAt("pickup", player);
          this.spawnParticles(item.x, 0.5, item.z,
            player.id === 1 ? Renderer.colors.ice : Renderer.colors.ember, 24, 0.85, 0.11);
          this.pickups.splice(i, 1);
          this.presentation.update(this);
        }
      }

      spawnParticles(x, y, z, color, count, life, size) {
        // Only the renderer mobile profile may cut VFX — never window width alone (PC windows).
        const mobile = Boolean(this.renderer?.mobilePerf);
        const density = mobile ? 0.32 : 1;
        const limit = Math.max(2, Math.ceil(count * density));
        for (let i = 0; i < limit; i++) {
          const angle = this.random() * TAU;
          const speed = 0.8 + this.random() * 3.8;
          this.particles.push({
            x, y, z,
            vx: Math.cos(angle) * speed,
            vy: 1.1 + this.random() * 3.7,
            vz: Math.sin(angle) * speed,
            age: 0,
            life: life * (0.7 + this.random() * 0.55) * (mobile ? 0.82 : 1),
            size: size * (0.65 + this.random() * 0.8),
            alpha: 0.7 + this.random() * 0.3,
            color
          });
        }
        const maxParticles = mobile ? 110 : 520;
        if (this.particles.length > maxParticles) {
          this.particles.splice(0, this.particles.length - maxParticles);
        }
      }

      /**
       * Corridor-locked sparks for bomb detonation (Bomberman cross).
       * core=true: four cardinal axes only. Else: single axis from dr/dc.
       * Never emits a radial sphere cloud.
       */
      spawnCorridorParticles(x, y, z, color, count, life, size, dr = 0, dc = 0, core = false) {
        const mobile = Boolean(this.renderer?.mobilePerf);
        const density = mobile ? 0.4 : 1;
        const limit = Math.max(2, Math.ceil(count * density));
        const axes = core
          ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
          : [[dr || 0, dc || (Math.abs(dr) + Math.abs(dc) === 0 ? 1 : 0)]];
        // Normalize single axis if zero
        if (!core && axes[0][0] === 0 && axes[0][1] === 0) axes[0] = [0, 1];
        // HITBOX_VISUAL_MATCH_V1: keep CPU sparks inside ~one cell so they do not
        // paint fire over safe tiles outside the lethal blast footprint.
        const half = this.tile * 0.42;
        for (let i = 0; i < limit; i++) {
          const axis = axes[i % axes.length];
          const along = (0.08 + this.random() * 0.55) * (this.random() < 0.5 ? 1 : -1);
          const side = (this.random() - 0.5) * 0.35;
          // axis[0]=dr (world Z), axis[1]=dc (world X)
          const vx = axis[1] * along + axis[0] * side;
          const vz = axis[0] * along + axis[1] * side;
          const ox = (this.random() - 0.5) * half;
          const oz = (this.random() - 0.5) * half;
          this.particles.push({
            x: x + ox, y, z: z + oz,
            // Snappier corridor sparks so the soft layer keeps pace with GPU burst.
            vx: vx * 1.35,
            vy: 0.75 + this.random() * 2.1,
            vz: vz * 1.35,
            age: 0,
            life: life * (0.7 + this.random() * 0.45) * (mobile ? 0.82 : 1),
            size: size * (0.55 + this.random() * 0.55),
            alpha: 0.55 + this.random() * 0.35,
            color,
            // Optional home cell clamp during integrate (visual == hitbox cell).
            homeX: x,
            homeZ: z,
            homeHalf: half
          });
        }
        const maxParticles = mobile ? 110 : 520;
        if (this.particles.length > maxParticles) {
          this.particles.splice(0, this.particles.length - maxParticles);
        }
      }

      updateParticles(dt) {
        for (const particle of this.particles) {
          particle.age += dt;
          particle.x += particle.vx * dt;
          particle.y += particle.vy * dt;
          particle.z += particle.vz * dt;
          particle.vy -= 5.8 * dt;
          particle.vx *= Math.pow(0.3, dt);
          particle.vz *= Math.pow(0.3, dt);
          // HITBOX_VISUAL_MATCH_V1: corridor bomb sparks stay in their blast cell.
          if (Number.isFinite(particle.homeX) && Number.isFinite(particle.homeHalf)) {
            const half = particle.homeHalf;
            particle.x = clamp(particle.x, particle.homeX - half, particle.homeX + half);
            particle.z = clamp(particle.z, particle.homeZ - half, particle.homeZ + half);
          }
        }
        // PARTICLES_COMPACT_IN_PLACE_V1: reuse the bounded list instead of
        // allocating a new array every simulation frame.
        compactLiveParticles(this.particles);
      }

      update(dt) {
        if (this.mode !== "playing") {
          this.updateParticles(dt * 0.35);
          return;
        }
        this.elapsed += dt;
        for (const blast of this.blasts) blast.age += dt;
        this.blasts = this.blasts.filter((blast) => blast.age < blast.life);
        this.updateParticles(dt);

        if (this.roundLocked) {
          this.roundTransition -= dt;
          if (this.roundTransition <= 0) {
            if (this.pendingMatchWinner) this.finishMatch(this.pendingMatchWinner);
            else this.startRound();
          }
          this.statusTimer -= dt;
          if (this.statusTimer <= 0) {
            this.statusTimer = 0.1;
            this.presentation.update(this);
          }
          return;
        }

        this.roundTime = Math.max(0, this.roundTime - dt);
        this.roundAge += dt;
        if (!this.p2Human) this.updateBot(dt);
        for (const player of this.players) this.updateContestant(player, dt);
        this.updateKatarina(dt);
        this.updateZed(dt);
        this.updateRenekton(dt);
        this.updateVladimir(dt);
        this.updateGangplank(dt);
        this.processAbilityBuffer(dt);
        this.updateBombs(dt);
        // After movement + new detonations: lethal cells == visible blast cells.
        this.applyActiveBlastDamage();
        this.collectPickups();

        if (this.roundDecisionTimer >= 0) {
          const pendingBeforeTick = this.pendingRoundDecisionHold();
          if (!pendingBeforeTick.active && this.roundDecisionTimer > 0.16) {
            this.roundDecisionTimer = 0.16;
          }
          this.roundDecisionTimer -= dt;
          if (this.roundDecisionTimer <= 0) {
            const pending = this.pendingRoundDecisionHold();
            if (pending.active) {
              // Mechanics are advanced before settlement in every frame. A
              // pending attached mark or dash therefore always gets one more
              // authoritative tick instead of being frozen by roundLocked.
              this.roundDecisionTimer = Math.max(ABILITY_TIME_EPSILON, pending.delay);
            } else {
              this.finalizeRound();
            }
          }
        } else if (this.roundTime <= 0) {
          this.resolveTimeout();
        }

        this.statusTimer -= dt;
        if (this.statusTimer <= 0) {
          this.statusTimer = 0.1;
          this.presentation.update(this);
        }
      }

      finishMatch(winner) {
        if (this.mode !== "playing") return;
        this.mode = "matchover";
        this.presentation.finish(winner, this.roundWins, this.elapsed);
        this.presentation.announce(`${winner.name} wins the Rift Bomber match`);
      }
    }
