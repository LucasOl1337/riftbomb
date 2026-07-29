const TICK_RATE = 60;
const SNAPSHOT_RATE = 30;
const ROOMS_PER_TURN = 8;
const loadDefaultDuelRuntime = () => import("../../../game/create-authoritative-duel.mjs");
const CHAMPIONS = new Set(["katarina", "zed", "renekton", "vladimir", "gangplank"]);
const ARENAS = new Set(["lattice", "clearing", "labyrinth", "forts", "pit"]);

export const isChampion = (value) => CHAMPIONS.has(value);

export function validPreset(value = {}) {
  return {
    hostChampion: isChampion(value.hostChampion) ? value.hostChampion : "katarina",
    guestChampion: isChampion(value.guestChampion) ? value.guestChampion : "zed",
    arena: ARENAS.has(value.arena) ? value.arena : "lattice",
    matchTarget: value.matchTarget === 10 ? 10 : 3
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
      sequence: 0,
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

  stopMatch(room) {
    room.game = null;
    room.sequence = 0;
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
          room.lastActivity = Date.now();
        });
      }, 1000 / TICK_RATE);
    }
    if (!this.snapshotTimer) {
      this.snapshotTimer = this.scheduleInterval(() => {
        this.runRoomQueue("snapshotQueueActive", (room) => {
          if (!room.game) return;
          const includeGrid = updateGridCache(room, room.game.grid) || room.sequence % 60 === 0;
          this.broadcast(room, {
            type: "snapshot",
            data: this.duelRuntime.serializeAuthoritativeSnapshot(
              room.game,
              ++room.sequence,
              includeGrid
            )
          });
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

  async start(room, { rematch = false } = {}) {
    if (!room.players[0]?.socket || !room.players[1]?.socket) return;
    if (!room.players[1].ready || (room.game && !rematch) || room.starting) return;
    room.starting = true;
    try {
      if (rematch) this.stopMatch(room);
      const duelRuntime = await this.getDuelRuntime();
      room.game = await duelRuntime.createAuthoritativeDuel(room.preset);
      room.sequence = 0;
      room.inputs = [0, 0];
      room.gridCache = null;
      room.lastTick = this.now();
      this.startClock();
      this.broadcast(room, { ...this.lobbyMessage(room), type: rematch ? "rematch" : "start" });
    } catch (error) {
      console.error("startMatch failed", room.code, error);
      this.stopMatch(room);
    } finally {
      room.starting = false;
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
