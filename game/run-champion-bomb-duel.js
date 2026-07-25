"use strict";

    class Game {
      constructor(renderer, music, presentation) {
        this.renderer = renderer;
        this.music = music;
        this.presentation = presentation;
        this.cols = 13;
        this.rows = 11;
        this.tile = 1.32;
        this.mode = "intro";
        this.paused = false;
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
        this.players = [];
        this.player = null;
        this.daggerId = 0;
        this.shadowId = 0;
        this.selectedChampion = "katarina";
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
        this.statusTimer = 0;
        this.p2Human = false;
        this.generateMap();
        this.resetPlayers();
      }

      random() {
        this.seed ^= this.seed << 13;
        this.seed ^= this.seed >>> 17;
        this.seed ^= this.seed << 5;
        return (this.seed >>> 0) / 4294967296;
      }

      generateMap() {
        this.grid = Array.from({ length: this.rows }, (_, r) =>
          Array.from({ length: this.cols }, (_, c) =>
            r === 0 || c === 0 || r === this.rows - 1 || c === this.cols - 1 ? 1 : 0
          )
        );
        this.powerupPlan = new Map();
        const safe = new Set([
          `${this.rows - 2},1`, `${this.rows - 3},1`, `${this.rows - 2},2`,
          `1,${this.cols - 2}`, `2,${this.cols - 2}`, `1,${this.cols - 3}`
        ]);

        for (let r = 2; r < this.rows - 1; r += 2) {
          for (let c = 2; c < this.cols - 1; c += 2) this.grid[r][c] = 1;
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
            const breakable = this.random() < 0.73;
            const hidden = breakable && this.random() < 0.48
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
        const champion = id === 1 ? this.selectedChampion : "ziggs";
        return {
          id,
          champion,
          side: id === 1 ? "blue" : "red",
          name: id === 1
            ? ({ katarina: "Katarina", zed: "Zed", renekton: "Renekton", vladimir: "Vladimir" }[champion] || "Blue Ziggs")
            : "Red Ziggs",
          x, z,
          health: 1,
          maxHealth: 1,
          alive: true,
          speed: 3.45,
          maxBombs: 1,
          range: 2,
          shield: 0,
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
          ultChannel: 0,
          ultTick: 0,
          zedUltAnim: 0,
          zedSlashAnim: 0,
          zedSwapWindow: 0,
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
          vladimirEAnim: 0,
          vladimirUltAnim: 0,
          vladimirQStacks: 0,
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
        this.players = [this.createPlayer(1), this.createPlayer(2)];
        this.player = this.players[0];
        this.presentation.selectChampion(this.selectedChampion);
      }

      selectChampion(champion) {
        if (!["katarina", "zed", "renekton", "vladimir", "ziggs"].includes(champion) || this.mode !== "intro") return;
        this.selectedChampion = champion;
        this.resetPlayers();
        this.presentation.update(this);
      }

      start() {
        this.mode = "playing";
        this.paused = false;
        this.seed = (Date.now() ^ 0xA57A2026) >>> 0;
        this.round = 0;
        this.wave = 1;
        this.roundWins = [0, 0];
        this.elapsed = 0;
        this.bombId = 0;
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
        this.presentation.prepareRound();
        this.presentation.announce(`Round ${this.round} · ${this.player.name} enters the arena`);
        this.presentation.update(this);
      }

      activatePlayerTwo() {
        if (this.p2Human) return;
        this.p2Human = true;
        const p2 = this.players[1];
        if (p2) {
          p2.aiDx = 0;
          p2.aiDz = 0;
        }
        this.presentation.announce("Player 2 joined · Red Ziggs is local");
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

      moveEntity(entity, dx, dz, speed, dt, radius, ignoreBomb = null) {
        const nx = entity.x + dx * speed * dt;
        if (!this.isBlocked(nx, entity.z, radius, ignoreBomb)) entity.x = nx;
        const nz = entity.z + dz * speed * dt;
        if (!this.isBlocked(entity.x, nz, radius, ignoreBomb)) entity.z = nz;
      }

      activeBombsFor(player) {
        return this.bombs.filter((bomb) => !bomb.exploded && bomb.ownerId === player.id).length;
      }

      placeBomb(player = this.player) {
        if (this.mode !== "playing" || this.paused || this.roundLocked || !player?.alive ||
            player.ultChannel > 0 || player.vladimirPool > 0) return false;
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
        this.music.effect("bomb");
        this.spawnParticles(x, 0.45, z,
          player.id === 1 ? Renderer.colors.blueSide : Renderer.colors.redSide, 9, 0.6, 0.08);
        this.presentation.update(this);
        return true;
      }

      requestDash(player = this.player) {
        if (this.mode !== "playing" || this.paused || this.roundLocked || !player?.alive ||
            player.dashCooldown > 0 || player.champion !== "ziggs") return;
        player.dashRequested = true;
      }

      executeDash(player) {
        if (player.dashCooldown > 0 || player.dashing > 0 || !player.alive) return;
        player.dashing = 0.18;
        player.dashCooldown = 5;
        player.invulnerable = Math.max(player.invulnerable, 0.22);
        this.renderer.cameraShake = Math.max(this.renderer.cameraShake, 0.14);
        this.music.effect("dash");
        this.spawnParticles(player.x, 0.5, player.z,
          player.id === 1 ? Renderer.colors.rift : Renderer.colors.ember, 18, 0.48, 0.1);
      }

      castAbility(slot, player = this.player) {
        if (!player?.alive || this.mode !== "playing" || this.paused || this.roundLocked) return false;
        if (player.vladimirPool > 0) return false;
        if (player.champion === "ziggs") {
          if (slot === 0) return this.placeBomb(player);
          if (slot === 1) {
            this.requestDash(player);
            return true;
          }
          return false;
        }
        if (player.champion === "zed") {
          if (slot === 0) return this.castZedQ(player);
          if (slot === 1) return this.castZedW(player);
          if (slot === 2) return this.castZedE(player);
          if (slot === 3) return this.castZedR(player);
          return false;
        }
        if (player.champion === "renekton") {
          if (slot === 0) return this.castRenektonQ(player);
          if (slot === 1) return this.castRenektonW(player);
          if (slot === 2) return this.castRenektonE(player);
          if (slot === 3) return this.castRenektonR(player);
          return false;
        }
        if (player.champion === "vladimir") {
          if (slot === 0) return this.castVladimirQ(player);
          if (slot === 1) return this.castVladimirW(player);
          if (slot === 2) return this.castVladimirE(player);
          if (slot === 3) return this.castVladimirR(player);
          return false;
        }
        if (slot === 0) return this.castKatarinaQ(player);
        if (slot === 1) return this.castKatarinaW(player);
        if (slot === 2) return this.castKatarinaE(player);
        if (slot === 3) return this.castKatarinaR(player);
        return false;
      }

      katTargetInFront(player, maxDistance) {
        const rival = this.players.find((candidate) => candidate.id !== player.id && candidate.alive);
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
        this.music.effect("katQ");
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
        this.music.effect("katW");
        this.presentation.announce("Katarina · Preparation");
        this.presentation.update(this);
        return true;
      }

      castKatarinaE(player) {
        if (player.eCooldown > 0 || player.ultChannel > 0) return false;
        const range = this.tile * 5.1;
        const readyDaggers = this.daggers
          .filter((dagger) => dagger.age >= dagger.readyAt && Math.hypot(dagger.x - player.x, dagger.z - player.z) <= range)
          .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z));
        const rival = this.players.find((candidate) => candidate.id !== player.id && candidate.alive &&
          Math.hypot(candidate.x - player.x, candidate.z - player.z) <= range);
        const pickup = this.pickups
          .filter((item) => Math.hypot(item.x - player.x, item.z - player.z) <= range)
          .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0];
        const target = readyDaggers[0] || rival || pickup;
        if (!target) {
          this.presentation.announce("Shunpo needs a dagger, pickup, or rival in range");
          return false;
        }
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
        this.music.effect("shunpo");
        this.presentation.announce("Katarina · Shunpo");
        this.presentation.update(this);
        return true;
      }

      castKatarinaR(player) {
        if (player.rCooldown > 0 || player.ultChannel > 0) return false;
        const rival = this.players.find((candidate) => candidate.id !== player.id && candidate.alive);
        if (!rival || Math.hypot(rival.x - player.x, rival.z - player.z) > this.tile * 3.35) {
          this.presentation.announce("Death Lotus needs Red Ziggs nearby");
          return false;
        }
        player.rCooldown = 28;
        player.ultChannel = 1.65;
        player.ultTick = 0;
        this.slashes.push({ x: player.x, z: player.z, radius: this.tile * 2.75, age: 0, life: 1.65, lotus: true });
        this.music.effect("deathLotus");
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
          zedUltAnim: kind === "death" ? 0.68 : 0,
          zedSlashAnim: 0,
          hurt: 0,
          invulnerable: 0,
          shield: 0,
          swapAvailable: kind === "living"
        };
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
        this.music.effect("zedQ");
        this.presentation.announce(`Zed · Razor Shuriken ×${origins.length}`);
        this.presentation.update(this);
        return true;
      }

      castZedW(player) {
        const living = this.zedShadows.find((shadow) =>
          shadow.ownerId === player.id && shadow.kind === "living" && shadow.swapAvailable && shadow.age < shadow.life
        );
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
          player.invulnerable = Math.max(player.invulnerable, 0.2);
          this.skillTrails.push({
            x1: fromX, z1: fromZ, x2: player.x, z2: player.z,
            angle: Math.atan2(player.x - fromX, player.z - fromZ), age: 0, life: 0.42, zed: true
          });
          this.renderer.addShock(player.x, player.z, 0.54);
          this.spawnParticles(fromX, 0.52, fromZ, Renderer.colors.zedCrimson, 24, 0.62, 0.1);
          this.spawnParticles(player.x, 0.52, player.z, Renderer.colors.zedShadow, 28, 0.66, 0.12);
          this.music.effect("zedSwap");
          this.presentation.announce("Zed · Living Shadow exchange");
          return true;
        }
        if (player.wCooldown > 0) return false;

        let landing = null;
        for (let steps = 3; steps >= 1; steps--) {
          const targetX = player.x + player.lastDx * this.tile * steps;
          const targetZ = player.z + player.lastDz * this.tile * steps;
          const cell = this.cellFromWorld(targetX, targetZ);
          if (this.grid[cell.r]?.[cell.c] !== 0) continue;
          const [x, z] = this.worldFromCell(cell.r, cell.c);
          if (!this.isBlocked(x, z, 0.28)) {
            landing = { x, z, ...cell };
            break;
          }
        }
        if (!landing || Math.hypot(landing.x - player.x, landing.z - player.z) < this.tile * 0.55) {
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
        this.music.effect("zedW");
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
        const rival = this.players.find((candidate) => candidate.id !== player.id && candidate.alive);
        for (const origin of origins) {
          origin.zedSlashAnim = 0.52;
          origin.castAnim = 0.4;
          origin.castDuration = 0.4;
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
        this.music.effect("zedE");
        this.presentation.announce(hitRival ? "Shadow Slash · Living Shadow cooldown reduced" : `Zed · Shadow Slash ×${origins.length}`);
        this.presentation.update(this);
        return true;
      }

      castZedR(player) {
        if (player.rCooldown > 0) return false;
        const rival = this.players.find((candidate) => candidate.id !== player.id && candidate.alive);
        if (!rival || Math.hypot(rival.x - player.x, rival.z - player.z) > this.tile * 4.5) {
          this.presentation.announce("Death Mark needs Red Ziggs in range");
          return false;
        }
        const fromX = player.x;
        const fromZ = player.z;
        const vx = rival.x - player.x;
        const vz = rival.z - player.z;
        const distance = Math.max(0.001, Math.hypot(vx, vz));
        const landing = this.findOpenLanding(
          rival.x + vx / distance * this.tile * 0.82,
          rival.z + vz / distance * this.tile * 0.82,
          player
        );
        this.createZedShadow(player, fromX, fromZ, "death", 4.1);
        player.x = landing.x;
        player.z = landing.z;
        player.facing = Math.atan2(rival.x - player.x, rival.z - player.z);
        player.lastDx = Math.sin(player.facing);
        player.lastDz = Math.cos(player.facing);
        player.rCooldown = 30;
        player.zedUltAnim = 0.68;
        player.invulnerable = Math.max(player.invulnerable, 0.38);
        this.zedMarks = this.zedMarks.filter((mark) => mark.ownerId !== player.id || mark.targetId !== rival.id);
        this.zedMarks.push({
          ownerId: player.id,
          targetId: rival.id,
          age: 0,
          fuse: 1.85,
          stored: 0,
          detonated: false
        });
        this.skillTrails.push({
          x1: fromX, z1: fromZ, x2: player.x, z2: player.z,
          angle: Math.atan2(player.x - fromX, player.z - fromZ), age: 0, life: 0.48, zed: true
        });
        this.renderer.addShock(fromX, fromZ, 0.72);
        this.renderer.addShock(player.x, player.z, 0.76);
        this.spawnParticles(fromX, 0.58, fromZ, Renderer.colors.zedShadow, 34, 0.86, 0.13);
        this.spawnParticles(player.x, 0.58, player.z, Renderer.colors.zedCrimson, 34, 0.86, 0.13);
        this.music.effect("deathMark");
        this.presentation.announce("Zed · Death Mark");
        this.presentation.update(this);
        return true;
      }

      healChampion(player, amount) {
        if (!player?.alive || amount <= 0) return 0;
        const before = player.health;
        player.health = Math.min(player.maxHealth, player.health + amount);
        const healed = player.health - before;
        if (healed > 0.001) {
          this.spawnParticles(player.x, 0.72, player.z,
            player.champion === "renekton" ? Renderer.colors.renektonTeal : Renderer.colors.vladimirPale,
            12, 0.52, 0.08);
        }
        return healed;
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
        const rival = this.players.find((candidate) => candidate.id !== player.id && candidate.alive);
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
        this.music.effect(empowered ? "renektonQEmpowered" : "renektonQ");
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
        this.music.effect(empowered ? "renektonWEmpowered" : "renektonW");
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
        const rival = this.players.find((candidate) => candidate.id !== player.id && candidate.alive);
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
        this.music.effect(recast ? "renektonDice" : "renektonE");
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
        this.music.effect("dominus");
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
        this.music.effect(empowered ? "vladimirQEmpowered" : "vladimirQ");
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
        player.health = Math.max(0.06, player.health - Math.min(0.08, player.health * 0.12));
        this.slashes.push({ x: player.x, z: player.z, radius: this.tile * 1.38, age: 0, life: 1.45, vladimir: true });
        this.renderer.addShock(player.x, player.z, 0.64);
        this.music.effect("sanguinePool");
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
        player.health = Math.max(0.05, player.health - Math.min(0.065, player.health * 0.1));
        let destroyed = 0;
        for (let r = 1; r < this.rows - 1; r++) {
          for (let c = 1; c < this.cols - 1; c++) {
            if (this.grid[r][c] !== 2) continue;
            const [x, z] = this.worldFromCell(r, c);
            if (Math.hypot(x - player.x, z - player.z) <= radius &&
                this.destroyBreakable(r, c, Renderer.colors.vladimirBlood)) destroyed++;
          }
        }
        const rival = this.players.find((candidate) => candidate.id !== player.id && candidate.alive);
        if (rival && Math.hypot(rival.x - player.x, rival.z - player.z) <= radius) {
          this.hitSkill(rival, 0.29, player, "Tides of Blood");
        }
        this.slashes.push({ x: player.x, z: player.z, radius, age: 0, life: 0.66, vladimir: true });
        this.spawnParticles(player.x, 0.68, player.z, Renderer.colors.vladimirCrimson, 42, 0.96, 0.12);
        this.renderer.addShock(player.x, player.z, 0.72);
        this.music.effect("tidesOfBlood");
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
        this.music.effect("hemoplague");
        this.presentation.announce("Vladimir · Hemoplague");
        this.presentation.update(this);
        return true;
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
        if (player.id === 1) {
          if (this.keys.has("KeyA") || this.touchDirs.has("left")) dx -= 1;
          if (this.keys.has("KeyD") || this.touchDirs.has("right")) dx += 1;
          if (this.keys.has("KeyW") || this.touchDirs.has("up")) dz -= 1;
          if (this.keys.has("KeyS") || this.touchDirs.has("down")) dz += 1;
        } else if (this.p2Human) {
          if (this.keys.has("ArrowLeft")) dx -= 1;
          if (this.keys.has("ArrowRight")) dx += 1;
          if (this.keys.has("ArrowUp")) dz -= 1;
          if (this.keys.has("ArrowDown")) dz += 1;
        } else {
          dx = player.aiDx;
          dz = player.aiDz;
        }
        return { dx, dz };
      }

      updateContestant(player, dt) {
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
        player.zedUltAnim = Math.max(0, player.zedUltAnim - dt);
        player.zedSlashAnim = Math.max(0, player.zedSlashAnim - dt);
        player.zedSwapWindow = Math.max(0, player.zedSwapWindow - dt);
        player.stunned = Math.max(0, player.stunned - dt);
        player.renektonUltAnim = Math.max(0, player.renektonUltAnim - dt);
        player.renektonSlashAnim = Math.max(0, player.renektonSlashAnim - dt);
        player.renektonDashAnim = Math.max(0, player.renektonDashAnim - dt);
        player.renektonDashRecast = Math.max(0, player.renektonDashRecast - dt);
        player.vladimirEAnim = Math.max(0, player.vladimirEAnim - dt);
        player.vladimirUltAnim = Math.max(0, player.vladimirUltAnim - dt);
        player.moving = false;
        if (!player.alive) return;

        if (player.stunned > 0) {
          player.dashRequested = false;
          return;
        }

        if (player.ultChannel > 0) {
          player.dashRequested = false;
          return;
        }

        let { dx, dz } = this.movementFor(player);
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
        this.moveEntity(player, dx, dz, player.speed * preparation * (player.dashing > 0 ? 2.7 : 1), dt, 0.3, passableBombs);
        for (const bomb of passableBombs) {
          const fullyClear = Math.abs(player.x - bomb.x) > this.tile * 0.82 ||
            Math.abs(player.z - bomb.z) > this.tile * 0.82;
          if (fullyClear) bomb.passOwners.delete(player.id);
        }
      }

      destroyBreakable(r, c, color = Renderer.colors.katCrimson) {
        if (this.grid[r]?.[c] !== 2) return false;
        this.grid[r][c] = 0;
        const hidden = this.powerupPlan.get(`${r},${c}`);
        if (hidden) this.spawnPickup(r, c, hidden);
        const [x, z] = this.worldFromCell(r, c);
        this.spawnParticles(x, 0.42, z, color, 22, 0.78, 0.12);
        this.renderer.addShock(x, z, 0.3);
        return true;
      }

      resolveKatarinaProjectile(projectile) {
        const owner = this.players.find((player) => player.id === projectile.ownerId);
        if (!owner) return;
        const target = this.players.find((player) => player.id === projectile.targetPlayerId && player.alive);
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
        this.music.effect("daggerLand");
      }

      triggerVoracity(player, dagger) {
        player.spin = 0.58;
        player.eCooldown = Math.max(0, player.eCooldown - 6.5);
        const radius = this.tile * 1.42;
        this.slashes.push({ x: dagger.x, z: dagger.z, radius, age: 0, life: 0.55, voracity: true });
        this.renderer.addShock(dagger.x, dagger.z, 0.64);
        this.music.effect("voracity");
        this.spawnParticles(dagger.x, 0.48, dagger.z, Renderer.colors.katCrimson, 34, 0.82, 0.12);

        const rival = this.players.find((candidate) => candidate.id !== player.id && candidate.alive);
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
          if (projectile.kind === "zed") continue;
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
            const rival = this.players.find((candidate) => candidate.id !== player.id && candidate.alive);
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
          const rival = this.players.find((player) => player.id !== projectile.ownerId && player.alive);

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

        for (const mark of this.zedMarks) {
          mark.age += dt;
          const owner = this.players.find((player) => player.id === mark.ownerId && player.alive);
          const target = this.players.find((player) => player.id === mark.targetId && player.alive);
          if (!owner || !target) {
            mark.detonated = true;
            continue;
          }
          if (mark.age >= mark.fuse && !mark.detonated) {
            mark.detonated = true;
            const damage = clamp(0.32 + mark.stored, 0.32, 0.62);
            this.renderer.addShock(target.x, target.z, 0.92);
            this.slashes.push({ x: target.x, z: target.z, radius: this.tile * 1.08, age: 0, life: 0.68, zed: true });
            this.spawnParticles(target.x, 0.68, target.z, Renderer.colors.zedCrimson, 46, 0.94, 0.14);
            this.music.effect("markPop");
            this.hitSkill(target, damage, owner, "Death Mark");
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
            const rival = this.players.find((candidate) => candidate.id !== player.id && candidate.alive);
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
            const rival = this.players.find((candidate) => candidate.id !== player.id && candidate.alive);
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
          let destroyed = 0;
          for (let r = 1; r < this.rows - 1; r++) {
            for (let c = 1; c < this.cols - 1; c++) {
              if (this.grid[r][c] !== 2) continue;
              const [x, z] = this.worldFromCell(r, c);
              if (Math.hypot(x - mark.x, z - mark.z) <= mark.radius &&
                  this.destroyBreakable(r, c, Renderer.colors.vladimirCrimson)) destroyed++;
            }
          }
          const rival = this.players.find((candidate) => candidate.id !== owner.id && candidate.alive);
          const hitRival = rival && Math.hypot(rival.x - mark.x, rival.z - mark.z) <= mark.radius
            ? this.hitSkill(rival, 0.44, owner, "Hemoplague")
            : false;
          this.healChampion(owner, 0.12 + destroyed * 0.025 + (hitRival ? 0.2 : 0));
          this.slashes.push({ x: mark.x, z: mark.z, radius: mark.radius * 1.05, age: 0, life: 0.82, vladimir: true });
          this.spawnParticles(mark.x, 0.64, mark.z, Renderer.colors.vladimirCrimson, 58, 1.18, 0.15);
          this.renderer.addShock(mark.x, mark.z, 1.08);
          this.music.effect("hemoplaguePop");
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
        const rival = this.players[0];
        if (!bot?.alive || !rival?.alive) return;
        bot.aiCommit = Math.max(0, bot.aiCommit - dt);
        bot.aiThink -= dt;
        if (bot.aiThink > 0) return;
        bot.aiThink = 0.16 + this.random() * 0.16;
        const cell = this.cellFromWorld(bot.x, bot.z);
        const [cellX, cellZ] = this.worldFromCell(cell.r, cell.c);
        const nearCenter = Math.hypot(bot.x - cellX, bot.z - cellZ) < 0.16;
        const currentDanger = this.dangerAt(cell.r, cell.c);
        if (!nearCenter || (bot.aiCommit > 0 && currentDanger === 0)) return;
        const choices = [
          { dx: 1, dz: 0 }, { dx: -1, dz: 0 },
          { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
          { dx: 0, dz: 0 }
        ].filter((choice) => {
          if (!choice.dx && !choice.dz) return true;
          const [x, z] = this.worldFromCell(cell.r + choice.dz, cell.c + choice.dx);
          const passable = this.bombs.filter((bomb) => bomb.passOwners?.has(bot.id));
          return !this.isBlocked(x, z, 0.27, passable);
        });

        const nearestPickup = (r, c) => this.pickups.reduce((best, pickup) =>
          Math.min(best, Math.abs(pickup.r - r) + Math.abs(pickup.c - c)), 12);
        let best = choices[0] || { dx: 0, dz: 0 };
        let bestScore = -Infinity;
        for (const choice of choices) {
          const r = cell.r + choice.dz;
          const c = cell.c + choice.dx;
          const [x, z] = this.worldFromCell(r, c);
          const danger = this.dangerAt(r, c);
          const distance = Math.hypot(x - rival.x, z - rival.z);
          const pickupDistance = nearestPickup(r, c);
          const reverse = choice.dx === -bot.aiDx && choice.dz === -bot.aiDz ? 0.35 : 0;
          const score = -danger * 120 - distance * 0.7 - pickupDistance * 0.95 - reverse + this.random() * 1.8;
          if (score > bestScore) {
            bestScore = score;
            best = choice;
          }
        }
        bot.aiDx = best.dx;
        bot.aiDz = best.dz;
        bot.aiCommit = currentDanger > 0 ? 0.38 : 0.58;

        const adjacentBreakable = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) =>
          this.grid[cell.r + dr]?.[cell.c + dc] === 2
        );
        const aligned = (cell.r === this.cellFromWorld(rival.x, rival.z).r ||
          cell.c === this.cellFromWorld(rival.x, rival.z).c) &&
          Math.hypot(bot.x - rival.x, bot.z - rival.z) < this.tile * 4.2;
        if (this.roundAge > 1.4 && currentDanger === 0 &&
            ((adjacentBreakable && this.random() < 0.18) || (aligned && this.random() < 0.26))) {
          if (this.placeBomb(bot)) bot.aiCommit = 0;
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
        const cells = [{ r: bomb.r, c: bomb.c, core: true }];
        const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dr, dc] of directions) {
          for (let i = 1; i <= bomb.range; i++) {
            const r = bomb.r + dr * i;
            const c = bomb.c + dc * i;
            if (r < 0 || c < 0 || r >= this.rows || c >= this.cols || this.grid[r][c] === 1) break;
            cells.push({ r, c, core: false });
            if (this.grid[r][c] === 2) {
              this.destroyBreakable(r, c, bomb.ownerId === 1 ? Renderer.colors.gold : Renderer.colors.ember);
              break;
            }
          }
        }
        for (const cell of cells) {
          this.blasts.push({ ...cell, age: 0, life: 0.58, source: bomb.id, ownerId: bomb.ownerId });
          const [x, z] = this.worldFromCell(cell.r, cell.c);
          this.spawnParticles(x, 0.32, z,
            cell.core ? Renderer.colors.whiteGold : (bomb.ownerId === 1 ? Renderer.colors.gold : Renderer.colors.ember),
            cell.core ? 24 : 13, 0.72, cell.core ? 0.14 : 0.1);
          for (const other of this.bombs) {
            if (!other.exploded && other.r === cell.r && other.c === cell.c) other.age = other.fuse;
          }
        }
        this.renderer.addShock(bomb.x, bomb.z, 0.78 + bomb.range * 0.12);
        this.music.explosion(clamp(0.7 + bomb.range * 0.08, 0.7, 1.12));
        this.damageAtCells(cells, bomb);
      }

      damageAtCells(cells, bomb) {
        const includes = (player) => {
          const cell = this.cellFromWorld(player.x, player.z);
          return cells.some((blast) => blast.r === cell.r && blast.c === cell.c);
        };
        for (const player of this.players) {
          if (player.alive && includes(player)) this.hitContestant(player, bomb);
        }
        if (this.players.filter((player) => player.alive).length <= 1 && this.roundDecisionTimer < 0) {
          this.roundDecisionTimer = 0.16;
        }
      }

      hitContestant(player, bomb) {
        if (!player.alive || player.invulnerable > 0 || player.dashing > 0 || this.mode !== "playing") return;
        if (player.shield > 0) {
          player.shield -= 1;
          player.invulnerable = 0.72;
          this.music.effect("shield");
          this.presentation.announce(`${player.name} shield shattered`);
          this.spawnParticles(player.x, 0.55, player.z, Renderer.colors.ice, 28, 0.8, 0.13);
          this.renderer.addShock(player.x, player.z, 0.45);
          return;
        }
        player.alive = false;
        player.health = 0;
        this.renderer.hitPulse = player.id === 1 ? 1.25 : 0.75;
        this.renderer.cameraShake = 0.82;
        this.music.effect("hit");
        this.spawnParticles(player.x, 0.58, player.z,
          player.id === 1 ? Renderer.colors.blueSide : Renderer.colors.redSide, 54, 1.1, 0.15);
        const owner = this.players.find((candidate) => candidate.id === bomb.ownerId);
        const cause = owner?.id === player.id ? "self-destructed" : "was caught in the blast";
        this.presentation.announce(`${player.name} ${cause}`);
        this.presentation.update(this);
      }

      hitSkill(player, damage, source, label, quiet = false) {
        if (!player.alive || player.invulnerable > 0 || player.dashing > 0 || this.mode !== "playing") return false;
        if (source?.champion === "vladimir" && this.vladimirMarks.some((mark) =>
          mark.ownerId === source.id && Math.hypot(player.x - mark.x, player.z - mark.z) <= mark.radius
        )) damage *= 1.12;
        if (player.shield > 0) {
          player.shield -= 1;
          player.invulnerable = 0.48;
          this.music.effect("shield");
          this.presentation.announce(`${player.name} blocked ${label}`);
          this.spawnParticles(player.x, 0.55, player.z, Renderer.colors.ice, 26, 0.75, 0.12);
          this.renderer.addShock(player.x, player.z, 0.4);
          return false;
        }
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
        if (!quiet) this.music.effect("bladeHit", label === "Voracity" ? 1.12 : 0.9);

        if (player.health <= 0) {
          player.alive = false;
          player.ultChannel = 0;
          this.renderer.hitPulse = player.id === 1 ? 1.25 : 0.82;
          this.renderer.cameraShake = 0.86;
          this.music.effect("kill");
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
          if (this.roundDecisionTimer < 0) this.roundDecisionTimer = 0.16;
        } else if (!quiet) {
          this.presentation.announce(`${label} · ${Math.ceil(player.health * 100)}% ${player.name} health`);
        }
        this.presentation.update(this);
        return true;
      }

      finalizeRound(forcedWinner = null) {
        if (this.roundLocked) return;
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

      spawnPickup(r, c, type) {
        const [x, z] = this.worldFromCell(r, c);
        this.pickups.push({ r, c, x, z, type });
      }

      collectPickups() {
        for (let i = this.pickups.length - 1; i >= 0; i--) {
          const item = this.pickups[i];
          const player = this.players.find((candidate) =>
            candidate.alive && Math.hypot(item.x - candidate.x, item.z - candidate.z) <= 0.58
          );
          if (!player) continue;
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
          this.music.effect("pickup");
          this.spawnParticles(item.x, 0.5, item.z,
            player.id === 1 ? Renderer.colors.ice : Renderer.colors.ember, 24, 0.85, 0.11);
          this.pickups.splice(i, 1);
          this.presentation.update(this);
        }
      }

      spawnParticles(x, y, z, color, count, life, size) {
        const limit = innerWidth < 600 ? Math.ceil(count * 0.62) : count;
        for (let i = 0; i < limit; i++) {
          const angle = this.random() * TAU;
          const speed = 0.8 + this.random() * 3.8;
          this.particles.push({
            x, y, z,
            vx: Math.cos(angle) * speed,
            vy: 1.1 + this.random() * 3.7,
            vz: Math.sin(angle) * speed,
            age: 0,
            life: life * (0.7 + this.random() * 0.55),
            size: size * (0.65 + this.random() * 0.8),
            alpha: 0.7 + this.random() * 0.3,
            color
          });
        }
        if (this.particles.length > 520) this.particles.splice(0, this.particles.length - 520);
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
        }
        this.particles = this.particles.filter((particle) => particle.age < particle.life && particle.y > -0.2);
      }

      update(dt) {
        if (this.mode !== "playing" || this.paused) {
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
        this.updateBombs(dt);
        this.collectPickups();

        if (this.roundDecisionTimer >= 0) {
          this.roundDecisionTimer -= dt;
          if (this.roundDecisionTimer <= 0) this.finalizeRound();
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
        this.paused = false;
        this.presentation.finish(winner, this.roundWins, this.elapsed);
        this.presentation.announce(`${winner.name} wins the Rift Bomber match`);
      }

      togglePause(force) {
        if (this.mode !== "playing") return false;
        this.paused = typeof force === "boolean" ? force : !this.paused;
        this.presentation.setPaused(this.paused);
        this.music.togglePause(this.paused);
        this.presentation.announce(this.paused ? "Game paused" : "Game resumed");
        return this.paused;
      }
    }
