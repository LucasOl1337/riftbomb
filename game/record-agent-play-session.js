"use strict";

    // Local Training session schema. The match already announces deaths, locks,
    // unlocks and round results; this recorder turns those presentation seams
    // plus a snapshot diff into JSONL the agent can Read.

    const AGENT_PLAY_SCHEMA = 1;
    const AGENT_PLAY_EVENT_TYPES = Object.freeze([
      "session_start",
      "match_setup",
      "round_start",
      "round_end",
      "score",
      "player_hp",
      "bomb_plant",
      "death",
      "skill_unlock",
      "skill_cast",
      "skill_locked",
      "p2_control",
      "heartbeat",
      "note",
      "match_end"
    ]);
    const AGENT_PLAY_NOTE_KINDS = Object.freeze([
      "feel", "unfair", "death_reason", "hypothesis", "retest"
    ]);
    const HEARTBEAT_MS = 1000;
    const COOLDOWN_CAST_JUMP = 0.4;

    function agentPlayPad(value, width = 2) {
      return String(value).padStart(width, "0");
    }

    function createAgentPlaySessionId(timestamp = Date.now()) {
      const date = new Date(timestamp);
      const stamp = [
        date.getUTCFullYear(),
        agentPlayPad(date.getUTCMonth() + 1),
        agentPlayPad(date.getUTCDate()),
        "-",
        agentPlayPad(date.getUTCHours()),
        agentPlayPad(date.getUTCMinutes()),
        agentPlayPad(date.getUTCSeconds())
      ].join("");
      const rand = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, "0");
      return `ap-${stamp}-${rand}`;
    }

    function countHextechCrates(grid) {
      if (!Array.isArray(grid)) return 0;
      let crates = 0;
      for (const row of grid) {
        if (!Array.isArray(row)) continue;
        for (const tile of row) if (tile === 2) crates += 1;
      }
      return crates;
    }

    function p2ControlLabel(match) {
      return match?.p2Human ? "human" : "cpu";
    }

    function p2ControlHud(match) {
      return match?.p2Human ? "Player 2 online/local" : "CPU controls Red";
    }

    function skillNamesFor(match, player) {
      if (typeof match?.skillSlotLabel === "function" && player) {
        return [0, 1, 2, 3].map((slot) => match.skillSlotLabel(player, slot));
      }
      return ["Q", "W", "E", "R"];
    }

    function integerOrNull(value) {
      return Number.isInteger(value) ? value : null;
    }

    // Players live in world x/z. Tile is the same cell placeBomb uses
    // (match.cellFromWorld), or player.r/c when a stub already has a cell.
    // Null means the match has no tile yet.
    function snapshotPlayerTile(match, player) {
      const directR = integerOrNull(player?.r);
      const directC = integerOrNull(player?.c);
      if (directR != null && directC != null) return { r: directR, c: directC };
      if (
        typeof match?.cellFromWorld === "function"
        && Number.isFinite(player?.x)
        && Number.isFinite(player?.z)
      ) {
        const cell = match.cellFromWorld(player.x, player.z);
        const r = integerOrNull(cell?.r);
        const c = integerOrNull(cell?.c);
        if (r != null && c != null) return { r, c };
      }
      return { r: null, c: null };
    }

    function snapshotPlayer(match, player) {
      const unlocked = Array.isArray(player?.skillsUnlocked)
        ? player.skillsUnlocked.map(Boolean)
        : [true, true, true, true];
      const tile = snapshotPlayerTile(match, player);
      const maxBombs = Number(player?.maxBombs);
      return {
        id: player?.id ?? 0,
        name: player?.name || "",
        champion: player?.champion || "",
        side: player?.side || "",
        health: Number(player?.health) || 0,
        alive: Boolean(player?.alive),
        unlocked,
        r: tile.r,
        c: tile.c,
        maxBombs: Number.isFinite(maxBombs) ? Math.trunc(maxBombs) : 0,
        cooldowns: [
          Number(player?.qCooldown) || 0,
          Number(player?.wCooldown) || 0,
          Number(player?.eCooldown) || 0,
          Number(player?.rCooldown) || 0
        ],
        bombs: typeof match?.activeBombsFor === "function" && player
          ? match.activeBombsFor(player)
          : 0
      };
    }

    function snapshotBombs(match) {
      return (match?.bombs || [])
        .filter((bomb) => bomb && !bomb.exploded)
        .map((bomb) => ({
          id: bomb.id,
          ownerId: bomb.ownerId,
          r: bomb.r,
          c: bomb.c
        }));
    }

    function snapshotMatch(match) {
      if (!match) return null;
      const players = Array.isArray(match.players) ? match.players.map((player) => snapshotPlayer(match, player)) : [];
      return {
        mode: match.mode || "",
        round: Number(match.round) || 0,
        roundWins: Array.isArray(match.roundWins) ? match.roundWins.slice(0, 2) : [0, 0],
        roundLocked: Boolean(match.roundLocked),
        p2Human: Boolean(match.p2Human),
        p2Control: p2ControlLabel(match),
        selectedChampion: match.selectedChampion || players[0]?.champion || "",
        selectedChampion2: match.selectedChampion2 || players[1]?.champion || "",
        selectedBot: match.selectedBot || null,
        selectedArena: match.selectedArena || match.arenaTemplate?.()?.id || "",
        arenaLabel: match.arenaTemplate?.()?.label || "",
        matchTarget: Number(match.matchTarget) || 3,
        roundTime: Number(match.roundTime) || 0,
        elapsed: Number(match.elapsed) || 0,
        crates: countHextechCrates(match.grid),
        players,
        bombs: snapshotBombs(match)
      };
    }

    function classifyDeathCause(line, playerName) {
      const text = String(line || "");
      if (/self-destructed/i.test(text)) return "self-destructed";
      if (/was caught in the blast/i.test(text)) return "blast";
      const skill = text.match(/eliminated .+ with (.+)$/i);
      if (skill) return { kind: "skill", label: skill[1] };
      if (playerName && text.includes(playerName) && /eliminated/i.test(text)) return "skill";
      if (/blast|bomb/i.test(text)) return "blast";
      return "unknown";
    }

    function classifyAnnounce(line) {
      const text = String(line || "");
      if (/locked · break crates/i.test(text)) {
        const name = text.replace(/\s+locked · break crates.*$/i, "").trim();
        return { type: "skill_locked", skill: name };
      }
      const unlocked = text.match(/^(.+?) unlocked (.+)$/i);
      if (unlocked) return { type: "skill_unlock", who: unlocked[1], skill: unlocked[2] };
      if (/Player 2 joined/i.test(text)) return { type: "p2_control", control: "human" };
      if (/wins round|is a draw/i.test(text)) return { type: "round_end", line: text };
      if (/wins the Rift Bomber match/i.test(text)) return { type: "match_end", line: text };
      return null;
    }

    function formatAgentPlayJsonl(events) {
      return events.map((event) => JSON.stringify(event)).join("\n") + (events.length ? "\n" : "");
    }

    function parseAgentPlaySession(text) {
      const events = String(text || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      return {
        schema: AGENT_PLAY_SCHEMA,
        sessionId: events[0]?.sessionId || "",
        events
      };
    }

    function createAgentPlaySession(options = {}) {
      const now = typeof options.now === "function" ? options.now : () => Date.now();
      const emit = typeof options.emit === "function" ? options.emit : () => {};
      const sessionId = options.sessionId || createAgentPlaySessionId(now());
      const events = options.events || [];
      let seq = 0;
      let last = null;
      let lastHeartbeatAt = 0;
      let lastAnnounce = "";
      let started = false;
      let ended = false;

      function write(type, payload, match) {
        if (!AGENT_PLAY_EVENT_TYPES.includes(type)) {
          throw new Error(`Unknown agent-play event ${type}`);
        }
        seq += 1;
        const event = {
          v: AGENT_PLAY_SCHEMA,
          sessionId,
          seq,
          t: now(),
          matchTime: Number(match?.elapsed ?? last?.elapsed) || 0,
          type,
          payload: payload && typeof payload === "object" ? payload : {}
        };
        events.push(event);
        emit(event);
        return event;
      }

      function setupPayload(snap) {
        const training = Boolean(snap.selectedBot) || !snap.p2Human;
        return {
          mode: training ? "training" : "local",
          map: snap.selectedArena,
          arenaLabel: snap.arenaLabel,
          champion: snap.selectedChampion,
          rival: snap.selectedChampion2,
          bot: snap.selectedBot,
          matchTarget: snap.matchTarget,
          p2Control: snap.p2Control,
          p2Hud: snap.p2Human ? "Player 2 online/local" : "CPU controls Red",
          score: snap.roundWins.slice()
        };
      }

      function heartbeatPayload(snap) {
        return {
          crates: snap.crates,
          clock: Math.ceil(snap.roundTime),
          score: snap.roundWins.slice(),
          p2Control: snap.p2Control,
          p2Hud: snap.p2Human ? "Player 2 online/local" : "CPU controls Red",
          players: snap.players.map((player) => ({
            id: player.id,
            name: player.name,
            health: player.health,
            alive: player.alive,
            unlocked: player.unlocked.slice(),
            r: player.r,
            c: player.c,
            maxBombs: player.maxBombs,
            bombs: player.bombs
          }))
        };
      }

      function startIfNeeded(match, snap) {
        if (started || !snap || snap.mode !== "playing") return;
        started = true;
        last = snap;
        lastHeartbeatAt = now();
        write("session_start", { sessionId }, match);
        write("match_setup", setupPayload(snap), match);
        if (snap.round > 0) write("round_start", { round: snap.round }, match);
      }

      function emitHeartbeat(match, snap, force = false) {
        const t = now();
        if (!force && t - lastHeartbeatAt < HEARTBEAT_MS) return;
        lastHeartbeatAt = t;
        write("heartbeat", heartbeatPayload(snap), match);
      }

      function diffPlayers(match, snap) {
        if (!last) return;
        const names = new Map((match?.players || []).map((player) => [player.id, skillNamesFor(match, player)]));
        for (const player of snap.players) {
          const prev = last.players.find((entry) => entry.id === player.id);
          if (!prev) continue;
          if (Math.abs(prev.health - player.health) > 1e-6 || prev.alive !== player.alive) {
            write("player_hp", {
              playerId: player.id,
              name: player.name,
              health: player.health,
              alive: player.alive
            }, match);
          }
          if (prev.alive && !player.alive) {
            write("death", {
              who: player.name,
              playerId: player.id,
              cause: classifyDeathCause(lastAnnounce, player.name),
              line: lastAnnounce
            }, match);
          }
          const labels = names.get(player.id) || ["Q", "W", "E", "R"];
          for (let slot = 0; slot < 4; slot += 1) {
            if (!prev.unlocked[slot] && player.unlocked[slot]) {
              write("skill_unlock", {
                playerId: player.id,
                name: player.name,
                slot,
                skill: labels[slot]
              }, match);
            }
            if (
              player.unlocked[slot]
              && player.cooldowns[slot] > prev.cooldowns[slot] + COOLDOWN_CAST_JUMP
            ) {
              write("skill_cast", {
                playerId: player.id,
                name: player.name,
                slot,
                skill: labels[slot]
              }, match);
            }
          }
        }
      }

      function diffBombs(match, snap) {
        if (!last) return;
        const seen = new Set(last.bombs.map((bomb) => bomb.id));
        for (const bomb of snap.bombs) {
          if (seen.has(bomb.id)) continue;
          const owner = snap.players.find((player) => player.id === bomb.ownerId);
          write("bomb_plant", {
            bombId: bomb.id,
            ownerId: bomb.ownerId,
            who: owner?.name || `P${bomb.ownerId}`,
            r: bomb.r,
            c: bomb.c
          }, match);
        }
      }

      function ingestMatch(match, hint = "update") {
        const snap = snapshotMatch(match);
        if (!snap) return;
        startIfNeeded(match, snap);
        if (!started) {
          last = snap;
          return;
        }

        if (hint === "prepareRound" && snap.round > 0 && snap.round !== last.round) {
          write("round_start", { round: snap.round }, match);
          last = snap;
          emitHeartbeat(match, snap, true);
          return;
        }

        if (last && last.p2Control !== snap.p2Control) {
          write("p2_control", {
            control: snap.p2Control,
            hud: p2ControlHud(match),
            line: lastAnnounce
          }, match);
        }

        if (last && last.roundLocked !== snap.roundLocked && snap.roundLocked) {
          const survivors = snap.players.filter((player) => player.alive);
          write("round_end", {
            round: snap.round,
            draw: survivors.length !== 1,
            winnerId: survivors.length === 1 ? survivors[0].id : null,
            winner: survivors.length === 1 ? survivors[0].name : null,
            score: snap.roundWins.slice(),
            line: lastAnnounce
          }, match);
        }

        if (last && (last.roundWins[0] !== snap.roundWins[0] || last.roundWins[1] !== snap.roundWins[1])) {
          write("score", { score: snap.roundWins.slice() }, match);
        }

        if (hint !== "prepareRound") {
          diffPlayers(match, snap);
          diffBombs(match, snap);
        }

        if (last && snap.round > last.round && snap.mode === "playing") {
          write("round_start", { round: snap.round }, match);
        }

        last = snap;
        if (hint === "update" || hint === "announce") emitHeartbeat(match, snap);
      }

      function ingestAnnounce(text, match) {
        lastAnnounce = String(text || "");
        const classified = classifyAnnounce(lastAnnounce);
        if (classified?.type === "skill_locked") {
          write("skill_locked", { skill: classified.skill, line: lastAnnounce }, match);
        }
        ingestMatch(match, "announce");
      }

      function note(text, extra = {}) {
        const kind = AGENT_PLAY_NOTE_KINDS.includes(extra.kind) ? extra.kind : "feel";
        const payload = { text: String(text || "").trim(), kind };
        if (extra.hypothesis) payload.hypothesis = String(extra.hypothesis);
        if (extra.deathReason) payload.deathReason = String(extra.deathReason);
        if (extra.unfair != null) payload.unfair = Boolean(extra.unfair);
        return write("note", payload, extra.match);
      }

      function end(match, extra = {}) {
        if (ended) return null;
        ended = true;
        const snap = snapshotMatch(match) || last;
        if (snap) last = snap;
        return write("match_end", {
          winnerId: extra.winner?.id ?? extra.winnerId ?? null,
          winner: extra.winner?.name ?? extra.winnerName ?? null,
          score: extra.roundWins || snap?.roundWins || [0, 0],
          elapsed: extra.elapsed ?? snap?.elapsed ?? 0
        }, match);
      }

      return {
        sessionId,
        events,
        ingestMatch,
        ingestAnnounce,
        note,
        end,
        snapshot: () => last
      };
    }

    Object.assign(globalThis, {
      AGENT_PLAY_SCHEMA,
      AGENT_PLAY_EVENT_TYPES,
      AGENT_PLAY_NOTE_KINDS,
      createAgentPlaySessionId,
      createAgentPlaySession,
      snapshotMatch,
      formatAgentPlayJsonl,
      parseAgentPlaySession,
      countHextechCrates,
      p2ControlLabel,
      p2ControlHud
    });
