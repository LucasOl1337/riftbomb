const TICK_RATE = 60;
const SNAPSHOT_RATE = 30;
const ROOMS_PER_TURN = 8;
const INPUT_PROTOCOL_VERSION = 1;
const ACTION_PROTOCOL_VERSION = 1;
const MAX_INPUT_SEQUENCE = 0x7fffffff;
const loadDefaultDuelRuntime = () => import("../../../game/create-authoritative-duel.mjs");
const CHAMPIONS = new Set(["katarina", "zed", "renekton", "vladimir", "gangplank"]);
const ARENAS = new Set(["lattice", "clearing", "labyrinth", "forts", "pit"]);

export const isChampion = (value) => CHAMPIONS.has(value);

export function validPreset(value = {}) {
  const preset = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    hostChampion: isChampion(preset.hostChampion) ? preset.hostChampion : "katarina",
    guestChampion: isChampion(preset.guestChampion) ? preset.guestChampion : "zed",
    arena: ARENAS.has(preset.arena) ? preset.arena : "lattice",
    matchTarget: preset.matchTarget === 10 ? 10 : 3
  };
}

export function updateGridCache(room, grid) {
  const cache = room.gridCache;
  const shapeChanged = !cache || cache.length !== grid.length ||
    grid.some((row, index) => cache[index]?.length !== row.length);
  if (shapeChanged) {
    room.gridCache = grid.map((row) => row.slice());
    return true;
  }

  let changed = false;
  for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
    const row = grid[rowIndex];
    const cachedRow = cache[rowIndex];
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      if (cachedRow[columnIndex] === row[columnIndex]) continue;
      cachedRow[columnIndex] = row[columnIndex];
      changed = true;
    }
  }
  return changed;
}

export class AuthoritativeRooms {
  constructor({
    rooms,
    broadcast,
    scheduleInterval = setInterval,
    cancelInterval = clearInterval,
    scheduleImmediate = setImmediate,
    now = () => performance.now(),
    loadDuelRuntime = loadDefaultDuelRuntime
  }) {
    this.rooms = rooms;
    this.broadcast = broadcast;
    this.scheduleInterval = scheduleInterval;
    this.cancelInterval = cancelInterval;
    this.scheduleImmediate = scheduleImmediate;
    this.now = now;
    this.loadDuelRuntime = loadDuelRuntime;
    this.duelRuntime = null;
    this.duelRuntimePromise = null;
    this.tickTimer = null;
    this.snapshotTimer = null;
    this.tickQueueActive = false;
    this.snapshotQueueActive = false;
    this.performanceCounters = {
      tickCycles: 0,
      skippedTickCycles: 0,
      snapshotCycles: 0,
      skippedSnapshotCycles: 0,
      snapshotsProduced: 0
    };
  }

  async getDuelRuntime() {
    if (this.duelRuntime) return this.duelRuntime;
    this.duelRuntimePromise ??= Promise.resolve(this.loadDuelRuntime())
      .then((runtime) => (this.duelRuntime = runtime));
    return this.duelRuntimePromise;
  }

  create(code, preset) {
    const room = {
      code,
      preset: validPreset(preset),
      game: null,
      players: [null, null],
      inputs: [0, 0],
      inputEpoch: 0,
      inputAccepted: [0, 0],
      inputApplied: [0, 0],
      inputReliable: [false, false],
      actionAck: [0, 0],
      actionReliable: [false, false],
      sequence: 0,
      soundEventSequence: 0,
      lastTick: 0,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      gridCache: null
    };
    this.rooms.set(code, room);
    return room;
  }

  lobbyMessage(room) {
    return {
      type: "lobby",
      ...room.preset,
      guestReady: Boolean(room.players[1]?.ready),
      guestConnected: Boolean(room.players[1]?.socket),
      inviteMode: room.preset.matchTarget === 10,
      serverAuthoritative: true
    };
  }

  inputProtocol(room) {
    return {
      v: INPUT_PROTOCOL_VERSION,
      epoch: room.inputEpoch,
      accepted: room.inputAccepted.slice(),
      ack: room.inputApplied.slice()
    };
  }

  actionProtocol(room) {
    return {
      v: ACTION_PROTOCOL_VERSION,
      epoch: room.inputEpoch,
      ack: room.actionAck.slice()
    };
  }

  acceptInput(room, playerIndex, message) {
    if (!room.game || !Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1 ||
        !Number.isInteger(message?.mask) || message.mask < 0 || message.mask > 15) return false;
    const hasReliableEnvelope = message.inputEpoch !== undefined || message.inputSeq !== undefined;
    if (!hasReliableEnvelope) {
      if (room.inputReliable[playerIndex]) return false;
      room.inputs[playerIndex] = message.mask;
      return true;
    }
    if (!Number.isSafeInteger(message.inputEpoch) || message.inputEpoch !== room.inputEpoch ||
        !Number.isSafeInteger(message.inputSeq) || message.inputSeq <= 0 ||
        message.inputSeq > MAX_INPUT_SEQUENCE ||
        message.inputSeq !== room.inputAccepted[playerIndex] + 1) return false;
    room.inputs[playerIndex] = message.mask;
    room.inputAccepted[playerIndex] = message.inputSeq;
    room.inputReliable[playerIndex] = true;
    return true;
  }

  processPlayerAction(room, playerIndex, message) {
    if (!room.game || !Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1 ||
        !message || typeof message !== "object") return false;
    const validAction = message.kind === "bomb" ||
      (message.kind === "ability" && Number.isInteger(message.slot) &&
        message.slot >= 0 && message.slot <= 3);
    if (!validAction) return false;

    const hasReliableEnvelope = message.actionEpoch !== undefined || message.actionSeq !== undefined;
    if (!hasReliableEnvelope) {
      if (room.actionReliable[playerIndex]) return false;
      return this.applyPlayerAction(room, playerIndex + 1, message);
    }
    if (!Number.isSafeInteger(message.actionEpoch) || message.actionEpoch !== room.inputEpoch ||
        !Number.isSafeInteger(message.actionSeq) || message.actionSeq <= 0 ||
        message.actionSeq > MAX_INPUT_SEQUENCE ||
        !Number.isSafeInteger(message.actionRound) || message.actionRound < 0 ||
        message.actionSeq !== room.actionAck[playerIndex] + 1) return false;

    // ACK means the syntactically valid intention was processed. A cooldown,
    // full bomb inventory, or another game rule may reject the effect, but the
    // transport must still consume this sequence so one rejection cannot block
    // every later action in the stream. An action retained across a round reset
    // is also consumed without being allowed to fire on the next spawn.
    if (message.actionRound === room.game.round) {
      this.applyPlayerAction(room, playerIndex + 1, message);
    }
    room.actionAck[playerIndex] = message.actionSeq;
    room.actionReliable[playerIndex] = true;
    return true;
  }

  stopMatch(room) {
    room.soundEventSequence = Math.max(
      room.soundEventSequence || 0,
      room.game?.authoritativeSound?.latest || 0
    );
    room.game = null;
    room.inputs = [0, 0];
    room.lastTick = 0;
    room.gridCache = null;
    this.stopClockIfIdle();
  }

  startClock() {
    if (!this.tickTimer) {
      this.tickTimer = this.scheduleInterval(() => {
        const now = this.now();
        this.runRoomQueue("tickQueueActive", (room) => {
          if (!room.game) return;
          const dt = Math.min(0.05, Math.max(0, (now - room.lastTick) / 1000));
          room.lastTick = now;
          this.duelRuntime.applyInputMask(room.game, 1, room.inputs[0]);
          this.duelRuntime.applyInputMask(room.game, 2, room.inputs[1]);
          room.game.update(dt);
          room.inputApplied[0] = room.inputAccepted[0];
          room.inputApplied[1] = room.inputAccepted[1];
          room.lastActivity = Date.now();
        });
      }, 1000 / TICK_RATE);
    }
    if (!this.snapshotTimer) {
      this.snapshotTimer = this.scheduleInterval(() => {
        this.runRoomQueue("snapshotQueueActive", (room) => {
          if (!room.game) return;
          const includeGrid = updateGridCache(room, room.game.grid) || room.sequence % 60 === 0;
          const snapshot = this.duelRuntime.serializeAuthoritativeSnapshot(
            room.game,
            ++room.sequence,
            includeGrid
          );
          snapshot.input = this.inputProtocol(room);
          snapshot.action = this.actionProtocol(room);
          room.soundEventSequence = Math.max(room.soundEventSequence, snapshot.sound.latest);
          this.broadcast(room, { type: "snapshot", data: snapshot });
          this.performanceCounters.snapshotsProduced += 1;
        });
      }, 1000 / SNAPSHOT_RATE);
    }
  }

  runRoomQueue(activeFlag, visit) {
    const isTick = activeFlag === "tickQueueActive";
    const startedCounter = isTick ? "tickCycles" : "snapshotCycles";
    const skippedCounter = isTick ? "skippedTickCycles" : "skippedSnapshotCycles";
    if (this[activeFlag]) {
      this.performanceCounters[skippedCounter] += 1;
      return;
    }
    this.performanceCounters[startedCounter] += 1;
    this[activeFlag] = true;
    const rooms = this.rooms.values();
    const drain = () => {
      for (let count = 0; count < ROOMS_PER_TURN; count += 1) {
        const next = rooms.next();
        if (next.done) {
          this[activeFlag] = false;
          return;
        }
        visit(next.value);
      }
      this.scheduleImmediate(drain);
    };
    drain();
  }

  performanceSnapshot() {
    let activeMatches = 0;
    for (const room of this.rooms.values()) {
      if (room.game) activeMatches += 1;
    }
    return {
      activeMatches,
      tickClockActive: Boolean(this.tickTimer),
      snapshotClockActive: Boolean(this.snapshotTimer),
      ...this.performanceCounters
    };
  }

  stopClockIfIdle() {
    if ([...this.rooms.values()].some((room) => room.game)) return;
    this.cancelInterval(this.tickTimer);
    this.cancelInterval(this.snapshotTimer);
    this.tickTimer = null;
    this.snapshotTimer = null;
  }

  startClaimIsCurrent(room, players) {
    return this.rooms.get(room.code) === room &&
      room.players.every((player, index) => {
        const claim = players[index];
        return player === claim.player &&
          player?.socket === claim.socket &&
          (player?.connectionGeneration || 0) === claim.connectionGeneration;
      }) &&
      Boolean(room.players[0]?.socket && room.players[1]?.socket && room.players[1]?.ready);
  }

  async start(room, { rematch = false } = {}) {
    if (!room.players[0]?.socket || !room.players[1]?.socket) return;
    if (!room.players[1].ready || (room.game && !rematch) || room.starting) return;
    const players = room.players.map((player) => ({
      player,
      socket: player?.socket,
      connectionGeneration: player?.connectionGeneration || 0
    }));
    let retryWithCurrentPlayers = false;
    room.starting = true;
    try {
      if (rematch) this.stopMatch(room);
      const duelRuntime = await this.getDuelRuntime();
      if (!this.startClaimIsCurrent(room, players)) {
        retryWithCurrentPlayers = this.rooms.get(room.code) === room;
        return;
      }
      const game = await duelRuntime.createAuthoritativeDuel({
        ...room.preset,
        soundEventStartId: room.soundEventSequence
      });
      if (!this.startClaimIsCurrent(room, players)) {
        retryWithCurrentPlayers = this.rooms.get(room.code) === room;
        return;
      }
      room.game = game;
      room.inputEpoch = room.inputEpoch >= MAX_INPUT_SEQUENCE ? 1 : room.inputEpoch + 1;
      room.inputs = [0, 0];
      room.inputAccepted = [0, 0];
      room.inputApplied = [0, 0];
      room.inputReliable = room.players.map((player) => player?.inputProtocol === 1);
      room.actionAck = [0, 0];
      room.actionReliable = room.players.map((player) => player?.actionProtocol === 1);
      room.gridCache = null;
      room.lastTick = this.now();
      this.startClock();
      this.broadcast(room, {
        ...this.lobbyMessage(room),
        type: rematch ? "rematch" : "start",
        input: this.inputProtocol(room),
        action: this.actionProtocol(room)
      });
    } catch (error) {
      console.error("startMatch failed", room.code, error);
      this.stopMatch(room);
    } finally {
      room.starting = false;
      if (retryWithCurrentPlayers && this.rooms.get(room.code) === room) {
        void this.start(room, { rematch });
      }
    }
  }

  applyPlayerAction(room, playerId, action) {
    if (!room.game || !this.duelRuntime) return false;
    return this.duelRuntime.applyPlayerAction(room.game, playerId, action);
  }

  stop(room) {
    this.stopMatch(room);
    this.rooms.delete(room.code);
  }
}
