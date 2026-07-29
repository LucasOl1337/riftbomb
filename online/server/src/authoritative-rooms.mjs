const TICK_RATE = 60;
const SNAPSHOT_RATE = 30;
const ROOMS_PER_TURN = 8;
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
      soundEventSequence: 0,
      lastTick: 0,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      gridSignature: ""
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
    room.soundEventSequence = Math.max(
      room.soundEventSequence || 0,
      room.game?.authoritativeSound?.latest || 0
    );
    room.game = null;
    room.inputs = [0, 0];
    room.lastTick = 0;
    room.gridSignature = "";
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
          const gridSignature = JSON.stringify(room.game.grid);
          const includeGrid = gridSignature !== room.gridSignature || room.sequence % 60 === 0;
          room.gridSignature = gridSignature;
          const snapshot = this.duelRuntime.serializeAuthoritativeSnapshot(
            room.game,
            ++room.sequence,
            includeGrid
          );
          room.soundEventSequence = Math.max(room.soundEventSequence, snapshot.sound.latest);
          this.broadcast(room, { type: "snapshot", data: snapshot });
        });
      }, 1000 / SNAPSHOT_RATE);
    }
  }

  runRoomQueue(activeFlag, visit) {
    if (this[activeFlag]) return;
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
      room.game = await duelRuntime.createAuthoritativeDuel({
        ...room.preset,
        soundEventStartId: room.soundEventSequence
      });
      room.inputs = [0, 0];
      room.gridSignature = "";
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
