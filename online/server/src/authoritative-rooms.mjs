import { createQuickMatchQueue } from "./quick-match-queue.mjs";

const TICK_RATE = 60;
const SNAPSHOT_RATE = 30;
const ROOMS_PER_TURN = 8;
const INPUT_PROTOCOL_VERSION = 1;
const ACTION_PROTOCOL_VERSION = 1;
const MAX_INPUT_SEQUENCE = 0x7fffffff;
const RESUME_PROTOCOL_VERSION = 1;
const RESUME_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const ROOM_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SESSION_REPLACED_CLOSE_CODE = 4001;
const SESSION_EXPIRED_CLOSE_CODE = 4002;
const DEFAULT_ROOM_TTL_MS = 30 * 60_000;
const DEFAULT_RECONNECT_GRACE_MS = 20_000;
const DEFAULT_MAX_ROOMS = 256;
const DEFAULT_REVOKED_RESUME_SWEEP_LIMIT = 64;
const loadDefaultDuelRuntime = () => import("../../../game/create-authoritative-duel.mjs");
const CHAMPIONS = new Set(["katarina", "zed", "renekton", "vladimir", "gangplank"]);
const ARENAS = new Set(["lattice", "clearing", "labyrinth", "forts", "pit"]);

function missingTransportOperation(name) {
  return () => {
    throw new TypeError(`transport.${name} is required`);
  };
}

function sameResumeToken(expected, presented, cryptoRuntime) {
  return Buffer.isBuffer(expected) && Buffer.isBuffer(presented) &&
    expected.length === presented.length && cryptoRuntime.timingSafeEqual(expected, presented);
}

function digestResumeToken(value, cryptoRuntime) {
  if (typeof value !== "string" || !RESUME_TOKEN_PATTERN.test(value)) return null;
  return cryptoRuntime.createHash("sha256").update(value, "utf8").digest();
}

export function createBoundedRevokedResumeTokens({ capacity, sweepLimit }) {
  if (!Number.isInteger(capacity) || capacity <= 0 ||
      !Number.isInteger(sweepLimit) || sweepLimit <= 0) {
    throw new TypeError("invalid revoked resume token bounds");
  }
  const entries = new Map();
  const keyFor = (digest) => Buffer.isBuffer(digest) ? digest.toString("hex") : "";
  return Object.freeze({
    revoke(digest, expiresAt) {
      const key = keyFor(digest);
      if (!key || !Number.isFinite(expiresAt)) return false;
      if (entries.has(key)) entries.delete(key);
      while (entries.size >= capacity) entries.delete(entries.keys().next().value);
      entries.set(key, expiresAt);
      return true;
    },
    isRevoked(digest, now) {
      const key = keyFor(digest);
      if (!key) return false;
      const expiresAt = entries.get(key) || 0;
      if (expiresAt <= now) {
        if (expiresAt) entries.delete(key);
        return false;
      }
      return true;
    },
    sweep(now) {
      let inspected = 0;
      let deleted = 0;
      for (const [key, expiresAt] of entries) {
        if (inspected >= sweepLimit) break;
        inspected += 1;
        if (expiresAt <= now) {
          entries.delete(key);
          deleted += 1;
        }
      }
      return { inspected, deleted };
    },
    snapshot() {
      return { size: entries.size, capacity, sweepLimit };
    },
    clear() {
      entries.clear();
    }
  });
}

export function createQuickMatchResumeIndex() {
  const seatsByDigest = new Map();
  const keyFor = (digest) => Buffer.isBuffer(digest) ? digest.toString("hex") : "";

  function add(room, index, digest) {
    const key = keyFor(digest);
    if (!key || !room?.players?.[index]) return false;
    let seats = seatsByDigest.get(key);
    if (!seats) {
      seats = [];
      seatsByDigest.set(key, seats);
    }
    if (seats.some((seat) => seat.room === room && seat.index === index)) return false;
    seats.push({ room, index });
    return true;
  }

  function remove(room, index, digest) {
    const key = keyFor(digest);
    if (!key) return false;
    const seats = seatsByDigest.get(key);
    if (!seats) return false;
    const remaining = seats.filter((seat) => seat.room !== room || seat.index !== index);
    if (remaining.length === seats.length) return false;
    if (remaining.length === 0) seatsByDigest.delete(key);
    else seatsByDigest.set(key, remaining);
    return true;
  }

  function find(presented, cryptoRuntime) {
    const seats = seatsByDigest.get(keyFor(presented));
    if (!seats) return null;
    for (const seat of seats) {
      const player = seat.room.players[seat.index];
      if (player?.quickMatch !== true ||
          player.resumeProtocol !== RESUME_PROTOCOL_VERSION ||
          !sameResumeToken(player.resumeTokenDigest, presented, cryptoRuntime)) continue;
      return { room: seat.room, index: seat.index, role: seat.index === 0 ? "host" : "guest" };
    }
    return null;
  }

  return Object.freeze({
    add,
    remove,
    find,
    size: () => [...seatsByDigest.values()].reduce((total, seats) => total + seats.length, 0)
  });
}

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

function getProtocolCache(room) {
  return room.protocolCache ??= { input: null, action: null };
}

export function invalidateProtocolCache(room, kind = "all") {
  const cache = room.protocolCache;
  if (!cache) return;
  if (kind === "input" || kind === "all") cache.input = null;
  if (kind === "action" || kind === "all") cache.action = null;
}

export class AuthoritativeRooms {
  constructor({
    rooms,
    transport = {},
    maxRooms = DEFAULT_MAX_ROOMS,
    roomTtlMs = DEFAULT_ROOM_TTL_MS,
    reconnectGraceMs = DEFAULT_RECONNECT_GRACE_MS,
    revokedResumeCapacity = Math.max(256, Math.min(16_384, maxRooms * 16)),
    revokedResumeSweepLimit = DEFAULT_REVOKED_RESUME_SWEEP_LIMIT,
    scheduleInterval = setInterval,
    cancelInterval = clearInterval,
    scheduleImmediate = setImmediate,
    now = () => performance.now(),
    wallNow = () => Date.now(),
    loadDuelRuntime = loadDefaultDuelRuntime
  }) {
    this.rooms = rooms;
    this.activeRooms = new Set();
    this.transport = Object.freeze({
      send: typeof transport.send === "function" ? transport.send : missingTransportOperation("send"),
      broadcast: typeof transport.broadcast === "function"
        ? transport.broadcast
        : missingTransportOperation("broadcast"),
      close: typeof transport.close === "function" ? transport.close : missingTransportOperation("close"),
      isOpen: typeof transport.isOpen === "function"
        ? transport.isOpen
        : missingTransportOperation("isOpen")
    });
    this.maxRooms = maxRooms;
    this.roomTtlMs = roomTtlMs;
    this.reconnectGraceMs = reconnectGraceMs;
    this.scheduleInterval = scheduleInterval;
    this.cancelInterval = cancelInterval;
    this.scheduleImmediate = scheduleImmediate;
    this.now = now;
    this.wallNow = wallNow;
    this.loadDuelRuntime = loadDuelRuntime;
    this.quickMatchResumeIndex = createQuickMatchResumeIndex();
    this.revokedResumeTokens = createBoundedRevokedResumeTokens({
      capacity: revokedResumeCapacity,
      sweepLimit: revokedResumeSweepLimit
    });
    this.quickMatchQueue = createQuickMatchQueue({ sameResumeToken });
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

  roomSockets(room) {
    return [room.players[0]?.socket, room.players[1]?.socket];
  }

  send(socket, message) {
    return this.transport.send(socket, message);
  }

  broadcast(room, message) {
    return this.transport.broadcast(this.roomSockets(room), message);
  }

  async getDuelRuntime() {
    if (this.duelRuntime) return this.duelRuntime;
    this.duelRuntimePromise ??= Promise.resolve(this.loadDuelRuntime())
      .then((runtime) => (this.duelRuntime = runtime));
    return this.duelRuntimePromise;
  }

  readResumeClaim(message, cryptoRuntime) {
    if (message?.resumeProtocol === undefined) {
      return { valid: true, version: 0, digest: null };
    }
    if (message.resumeProtocol !== RESUME_PROTOCOL_VERSION) {
      return { valid: false, version: 0, digest: null };
    }
    const digest = digestResumeToken(message.resumeToken, cryptoRuntime);
    if (!digest) return { valid: false, version: RESUME_PROTOCOL_VERSION, digest: null };
    if (this.revokedResumeTokens.isRevoked(digest, this.wallNow())) {
      return {
        valid: false,
        version: RESUME_PROTOCOL_VERSION,
        digest,
        error: "resume_expired"
      };
    }
    return { valid: true, version: RESUME_PROTOCOL_VERSION, digest };
  }

  nextRoomCode(cryptoRuntime) {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      let code = "";
      for (let index = 0; index < 6; index += 1) {
        code += ROOM_ALPHABET[cryptoRuntime.randomInt(ROOM_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    return "";
  }

  resumeDeadlineExpired(player, now) {
    return player?.resumeProtocol === RESUME_PROTOCOL_VERSION && !player.socket &&
      player.disconnectedAt > 0 && now - player.disconnectedAt >= this.reconnectGraceMs;
  }

  revokePlayerResumeToken(room, index, now) {
    const player = room.players[index];
    if (player?.resumeProtocol !== RESUME_PROTOCOL_VERSION ||
        !Buffer.isBuffer(player.resumeTokenDigest)) return null;
    const digest = player.resumeTokenDigest;
    this.quickMatchResumeIndex.remove(room, index, digest);
    this.revokedResumeTokens.revoke(digest, now + this.roomTtlMs);
    player.resumeProtocol = 0;
    player.resumeTokenDigest = null;
    return digest;
  }

  findQuickMatchResumeSeat(presented, cryptoRuntime) {
    if (!Buffer.isBuffer(presented)) return null;
    const resumedSeat = this.quickMatchResumeIndex.find(presented, cryptoRuntime);
    if (!resumedSeat) return null;
    if (this.rooms.get(resumedSeat.room.code) !== resumedSeat.room) {
      this.quickMatchResumeIndex.remove(resumedSeat.room, resumedSeat.index, presented);
      return null;
    }
    const now = this.wallNow();
    const player = resumedSeat.room.players[resumedSeat.index];
    if (this.resumeDeadlineExpired(player, now)) {
      this.expireDisconnectedSeat(resumedSeat.room, resumedSeat.index, now);
      return { expired: true };
    }
    return resumedSeat;
  }

  removeFromQuickMatchQueue(socket) {
    this.quickMatchQueue.removeBySocket(socket);
    socket.quickMatchQueued = false;
  }

  joinQuickMatch(socket, message, resumeClaim, cryptoRuntime) {
    // Repeated frames from the queued socket are inert. A new socket carrying
    // the same bearer can still atomically replace it after a reload.
    if (socket.quickMatchQueued) return;
    if (resumeClaim.version === RESUME_PROTOCOL_VERSION) {
      const resumedSeat = this.findQuickMatchResumeSeat(resumeClaim.digest, cryptoRuntime);
      if (resumedSeat?.expired) {
        return this.send(socket, { type: "error", error: "resume_expired" });
      }
      if (resumedSeat) {
        return this.attachPlayerToRoom(socket, {
          ready: true,
          inputProtocol: message.inputProtocol,
          actionProtocol: message.actionProtocol
        }, resumedSeat.room, resumedSeat.role, { quickMatch: true, resumeClaim, cryptoRuntime });
      }
      const replacement = this.quickMatchQueue.replaceByResume(resumeClaim.digest, {
        socket,
        preset: validPreset(message.preset),
        inputProtocol: message.inputProtocol === 1 ? 1 : 0,
        actionProtocol: message.actionProtocol === 1 ? 1 : 0,
        resumeClaim
      }, cryptoRuntime);
      if (replacement) {
        const queued = replacement.entry;
        if (queued.socket === socket) return;
        queued.socket.quickMatchQueued = false;
        queued.socket.riftbombSuperseded = true;
        socket.quickMatchQueued = true;
        this.transport.close(queued.socket, SESSION_REPLACED_CLOSE_CODE, "session_replaced");
        this.send(socket, { type: "quick-queued", position: replacement.position });
        return;
      }
    }
    if (this.rooms.size >= this.maxRooms) {
      return this.send(socket, { type: "error", error: "server_full" });
    }

    while (this.quickMatchQueue.size()) {
      const waiting = this.quickMatchQueue.shift();
      waiting.socket.quickMatchQueued = false;
      if (!this.transport.isOpen(waiting.socket) || waiting.socket.riftbomb) continue;

      const code = this.nextRoomCode(cryptoRuntime);
      if (!code) return this.send(socket, { type: "error", error: "server_full" });
      const firstPreset = validPreset(waiting.preset);
      const secondPreset = validPreset(message.preset);
      const room = this.create(code, {
        hostChampion: firstPreset.hostChampion,
        guestChampion: secondPreset.hostChampion,
        arena: firstPreset.arena,
        matchTarget: 3
      });
      this.attachPlayerToRoom(waiting.socket, {
        ready: true,
        inputProtocol: waiting.inputProtocol,
        actionProtocol: waiting.actionProtocol
      }, room, "host", {
        quickMatch: true,
        resumeClaim: waiting.resumeClaim,
        cryptoRuntime
      });
      this.attachPlayerToRoom(socket, {
        ready: true,
        inputProtocol: message.inputProtocol,
        actionProtocol: message.actionProtocol
      }, room, "guest", { quickMatch: true, resumeClaim, cryptoRuntime });
      return;
    }

    socket.quickMatchQueued = true;
    this.quickMatchQueue.push({
      socket,
      preset: validPreset(message.preset),
      inputProtocol: message.inputProtocol === 1 ? 1 : 0,
      actionProtocol: message.actionProtocol === 1 ? 1 : 0,
      resumeClaim
    });
    this.send(socket, { type: "quick-queued", position: this.quickMatchQueue.size() });
  }

  acceptConnection(socket, message, cryptoRuntime) {
    const resumeClaim = this.readResumeClaim(message, cryptoRuntime);
    if (!resumeClaim.valid) {
      return this.send(socket, { type: "error", error: resumeClaim.error || "invalid_resume" });
    }
    if (message.resumeOnly === true && resumeClaim.version !== RESUME_PROTOCOL_VERSION) {
      return this.send(socket, { type: "error", error: "invalid_resume" });
    }
    if (message.type === "quick-match") {
      return this.joinQuickMatch(socket, message, resumeClaim, cryptoRuntime);
    }
    if (message.type === "cancel-quick-match") {
      this.removeFromQuickMatchQueue(socket);
      return this.send(socket, { type: "quick-cancelled" });
    }

    const code = typeof message.room === "string" ? message.room.toUpperCase() : "";
    const role = message.role === "host" ? "host" : message.role === "guest" ? "guest" : "";
    if (!ROOM_PATTERN.test(code) || !role) {
      return this.send(socket, { type: "error", error: "invalid_hello" });
    }
    let room = this.rooms.get(code);
    if (!room && this.rooms.size >= this.maxRooms) {
      return this.send(socket, { type: "error", error: "server_full" });
    }
    if (role === "host" && !room && message.resumeOnly === true) {
      return this.send(socket, { type: "error", error: "room_not_found" });
    }
    if (role === "host" && !room) room = this.create(code, message.preset);
    if (!room) return this.send(socket, { type: "error", error: "room_not_found" });
    return this.attachPlayerToRoom(socket, message, room, role, {
      resumeClaim,
      cryptoRuntime,
      resumeOnly: message.resumeOnly === true
    });
  }

  attachPlayerToRoom(socket, message, room, role, {
    quickMatch = false,
    resumeClaim,
    cryptoRuntime,
    resumeOnly = false
  } = {}) {
    const index = role === "host" ? 0 : 1;
    let current = room.players[index];
    const expiredDigest = this.expireDisconnectedSeat(room, index, this.wallNow());
    if (expiredDigest) {
      if (sameResumeToken(expiredDigest, resumeClaim.digest, cryptoRuntime)) {
        return this.send(socket, { type: "error", error: "resume_expired" });
      }
      if (index === 0) return this.send(socket, { type: "error", error: "room_not_found" });
      current = room.players[index];
    }
    if (resumeOnly && !current) {
      return this.send(socket, { type: "error", error: "resume_denied" });
    }
    const protectedSeat = current?.resumeProtocol === RESUME_PROTOCOL_VERSION;
    if (protectedSeat && !sameResumeToken(current.resumeTokenDigest, resumeClaim.digest, cryptoRuntime)) {
      return this.send(socket, { type: "error", error: "resume_denied" });
    }
    if (!protectedSeat && current?.socket) {
      return this.send(socket, { type: "error", error: "role_taken" });
    }

    const previousSocket = current?.socket || null;
    const resumed = Boolean(current);
    const reconnected = resumed && !previousSocket;
    const player = current || {
      ready: role === "host" || Boolean(message.ready),
      disconnectedAt: 0,
      inputProtocol: 0,
      actionProtocol: 0,
      quickMatch: Boolean(quickMatch),
      resumeProtocol: 0,
      resumeTokenDigest: null,
      connectionGeneration: 0
    };
    player.socket = socket;
    player.disconnectedAt = 0;
    player.inputProtocol = Math.max(player.inputProtocol || 0, message.inputProtocol === 1 ? 1 : 0);
    player.actionProtocol = Math.max(player.actionProtocol || 0, message.actionProtocol === 1 ? 1 : 0);
    if (!protectedSeat && resumeClaim.version === RESUME_PROTOCOL_VERSION) {
      this.quickMatchResumeIndex.remove(room, index, player.resumeTokenDigest);
      player.resumeProtocol = RESUME_PROTOCOL_VERSION;
      player.resumeTokenDigest = resumeClaim.digest;
    }
    player.connectionGeneration = (player.connectionGeneration || 0) + 1;
    room.players[index] = player;
    if (player.quickMatch && player.resumeProtocol === RESUME_PROTOCOL_VERSION) {
      this.quickMatchResumeIndex.add(room, index, player.resumeTokenDigest);
    }
    socket.riftbomb = { room, index, generation: player.connectionGeneration };
    room.lastActivity = this.wallNow();
    if (room.game) {
      room.inputs[index] = 0;
      if (player.inputProtocol === 1) room.inputReliable[index] = true;
      if (player.actionProtocol === 1) room.actionReliable[index] = true;
      room.gridCache = null;
    }
    if (previousSocket && previousSocket !== socket) {
      previousSocket.riftbombSuperseded = true;
      this.transport.close(previousSocket, SESSION_REPLACED_CLOSE_CODE, "session_replaced");
    }

    this.send(socket, {
      type: "connected",
      role,
      playerId: index + 1,
      room: room.code,
      quickMatch: Boolean(player.quickMatch),
      soundCursor: room.game?.authoritativeSound?.latest || room.soundEventSequence || 0,
      input: this.inputProtocol(room),
      action: this.actionProtocol(room),
      resume: {
        v: RESUME_PROTOCOL_VERSION,
        protected: player.resumeProtocol === RESUME_PROTOCOL_VERSION,
        resumed
      }
    });
    if (resumed && resumeClaim.version === RESUME_PROTOCOL_VERSION) {
      this.send(socket, {
        ...this.lobbyMessage(room),
        type: "resume",
        activeMatch: Boolean(room.game),
        hostConnected: Boolean(room.players[0]?.socket),
        input: this.inputProtocol(room),
        action: this.actionProtocol(room)
      });
    } else if (room.game) {
      this.send(socket, {
        ...this.lobbyMessage(room),
        type: "start",
        input: this.inputProtocol(room),
        action: this.actionProtocol(room)
      });
    }
    if (reconnected) {
      this.broadcast(room, { type: "presence", playerId: index + 1, connected: true });
    }
    this.broadcast(room, this.lobbyMessage(room));
    void this.start(room);
  }

  leave(socket) {
    const { room, index, generation } = socket.riftbomb || {};
    if (!room || room.players[index]?.socket !== socket ||
        room.players[index]?.connectionGeneration !== generation) return false;
    socket.riftbombReleased = true;
    if (index === 0) {
      const now = this.wallNow();
      const peers = this.roomSockets(room).filter((peer) => peer && peer !== socket);
      for (let playerIndex = 0; playerIndex < room.players.length; playerIndex += 1) {
        this.revokePlayerResumeToken(room, playerIndex, now);
      }
      room.players = [null, null];
      room.inputs = [0, 0];
      this.stop(room);
      for (const peer of peers) {
        this.send(peer, { type: "room-closed" });
        this.transport.close(peer, SESSION_EXPIRED_CLOSE_CODE, "room_closed");
      }
      return true;
    }

    this.revokePlayerResumeToken(room, index, this.wallNow());
    room.players[index] = null;
    room.inputs[index] = 0;
    room.inputAccepted[index] = 0;
    room.inputApplied[index] = 0;
    room.inputReliable[index] = false;
    room.actionAck[index] = 0;
    room.actionReliable[index] = false;
    invalidateProtocolCache(room);
    room.lastActivity = this.wallNow();
    this.broadcast(room, { type: "presence", playerId: index + 1, connected: false });
    this.broadcast(room, this.lobbyMessage(room));
    return true;
  }

  receive(socket, message) {
    const { room, index, generation } = socket.riftbomb || {};
    if (!room || room.players[index]?.socket !== socket ||
        room.players[index]?.connectionGeneration !== generation) return false;
    if (message.type === "leave") return this.leave(socket);
    room.lastActivity = this.wallNow();

    if (message.type === "input") this.acceptInput(room, index, message);
    if (message.type === "action") this.processPlayerAction(room, index, message);
    if (message.type === "guest-config" && index === 1 && !room.game) {
      room.players[1].ready = Boolean(message.ready);
      if (isChampion(message.champion)) room.preset.guestChampion = message.champion;
      this.broadcast(room, this.lobbyMessage(room));
      void this.start(room);
    }
    if (message.type === "lobby" && index === 0 && !room.game) {
      room.preset = validPreset(message);
      this.broadcast(room, this.lobbyMessage(room));
    }
    const validRematchEpoch = message.inputEpoch === room.inputEpoch ||
      (room.players[0]?.inputProtocol !== 1 && message.inputEpoch === undefined);
    if (message.type === "rematch" && index === 0 && room.game?.mode === "matchover" &&
        validRematchEpoch) {
      room.preset = validPreset({ ...room.preset, ...message });
      if (room.players[0]) room.players[0].ready = true;
      if (room.players[1]) room.players[1].ready = true;
      void this.start(room, { rematch: true });
    }
    if (message.type === "start" && index === 0 && !room.game) {
      room.preset = validPreset({ ...room.preset, ...message });
      if (room.players[1]) room.players[1].ready = true;
      void this.start(room);
    }
    return true;
  }

  disconnect(socket, now = this.wallNow()) {
    this.removeFromQuickMatchQueue(socket);
    const { room, index, generation } = socket.riftbomb || {};
    if (!room || room.players[index]?.socket !== socket ||
        room.players[index]?.connectionGeneration !== generation) return false;
    room.players[index].socket = null;
    room.players[index].disconnectedAt = now;
    room.inputs[index] = 0;
    this.broadcast(room, { type: "presence", playerId: index + 1, connected: false });
    return true;
  }

  closeRoomAfterHostResumeExpiry(room, now) {
    for (let index = 0; index < room.players.length; index += 1) {
      this.revokePlayerResumeToken(room, index, now);
    }
    for (const player of room.players) {
      if (!player) continue;
      const activeSocket = player.socket;
      player.socket = null;
      player.disconnectedAt = now;
      player.connectionGeneration = (player.connectionGeneration || 0) + 1;
      if (!activeSocket) continue;
      activeSocket.riftbombSuperseded = true;
      this.send(activeSocket, { type: "room-closed" });
      this.transport.close(
        activeSocket,
        SESSION_EXPIRED_CLOSE_CODE,
        "resume_expired",
        { terminatePending: true }
      );
    }
    room.inputs = [0, 0];
    this.stop(room);
  }

  releaseGuestAfterResumeExpiry(room, now) {
    const expiredDigest = this.revokePlayerResumeToken(room, 1, now);
    room.players[1] = null;
    room.inputs[1] = 0;
    room.inputAccepted[1] = 0;
    room.inputApplied[1] = 0;
    room.inputReliable[1] = false;
    room.actionAck[1] = 0;
    room.actionReliable[1] = false;
    invalidateProtocolCache(room);
    room.gridCache = null;
    room.lastActivity = now;
    this.broadcast(room, { type: "presence", playerId: 2, connected: false });
    this.broadcast(room, this.lobbyMessage(room));
    return expiredDigest;
  }

  expireDisconnectedSeat(room, index, now) {
    const player = room.players[index];
    if (!this.resumeDeadlineExpired(player, now)) return null;
    const expiredDigest = player.resumeTokenDigest;
    if (index === 0) this.closeRoomAfterHostResumeExpiry(room, now);
    else this.releaseGuestAfterResumeExpiry(room, now);
    return expiredDigest;
  }

  maintain(now = this.wallNow()) {
    this.revokedResumeTokens.sweep(now);
    for (const room of [...this.rooms.values()]) {
      if (this.resumeDeadlineExpired(room.players[0], now)) {
        this.expireDisconnectedSeat(room, 0, now);
        continue;
      }
      if (this.resumeDeadlineExpired(room.players[1], now)) {
        this.expireDisconnectedSeat(room, 1, now);
      }
      const bothGone = room.players.every((player) => !player?.socket);
      const expired = bothGone && now - room.lastActivity > this.roomTtlMs;
      const reconnectExpired = bothGone && room.players.some((player) => player) &&
        room.players.every((player) => !player || now - player.disconnectedAt > this.reconnectGraceMs);
      if (expired || reconnectExpired) this.stop(room);
    }
  }

  lifecycleSnapshot() {
    return {
      rooms: this.rooms.size,
      quickMatchWaiting: this.quickMatchQueue.size(),
      resumeSecurity: this.revokedResumeTokens.snapshot()
    };
  }

  shutdown() {
    while (this.quickMatchQueue.size()) {
      const queued = this.quickMatchQueue.shift();
      if (queued?.socket) queued.socket.quickMatchQueued = false;
    }
    for (const room of [...this.rooms.values()]) this.stop(room);
    this.revokedResumeTokens.clear();
  }

  create(code, preset) {
    const now = this.wallNow();
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
      createdAt: now,
      lastActivity: now,
      gridCache: null,
      protocolCache: { input: null, action: null }
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
    const cache = getProtocolCache(room);
    if (cache.input?.epoch === room.inputEpoch) return cache.input;
    const accepted = room.inputAccepted;
    const applied = room.inputApplied;
    const value = {
      v: INPUT_PROTOCOL_VERSION,
      epoch: room.inputEpoch,
      accepted: accepted.slice(),
      ack: applied.slice()
    };
    cache.input = value;
    return value;
  }

  actionProtocol(room) {
    const cache = getProtocolCache(room);
    if (cache.action?.epoch === room.inputEpoch) return cache.action;
    const ack = room.actionAck;
    const value = {
      v: ACTION_PROTOCOL_VERSION,
      epoch: room.inputEpoch,
      ack: ack.slice()
    };
    cache.action = value;
    return value;
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
    invalidateProtocolCache(room, "input");
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
    invalidateProtocolCache(room, "action");
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
    this.activeRooms.delete(room);
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
          const applied0 = room.inputAccepted[0];
          const applied1 = room.inputAccepted[1];
          if (room.inputApplied[0] !== applied0 || room.inputApplied[1] !== applied1) {
            room.inputApplied[0] = applied0;
            room.inputApplied[1] = applied1;
            invalidateProtocolCache(room, "input");
          }
          room.lastActivity = this.wallNow();
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
    const rooms = this.activeRooms.values();
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
    return {
      activeMatches: this.activeRooms.size,
      tickClockActive: Boolean(this.tickTimer),
      snapshotClockActive: Boolean(this.snapshotTimer),
      ...this.performanceCounters
    };
  }

  stopClockIfIdle() {
    if (this.activeRooms.size > 0) return;
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
      this.activeRooms.add(room);
      room.inputEpoch = room.inputEpoch >= MAX_INPUT_SEQUENCE ? 1 : room.inputEpoch + 1;
      room.inputs = [0, 0];
      room.inputAccepted = [0, 0];
      room.inputApplied = [0, 0];
      room.inputReliable = room.players.map((player) => player?.inputProtocol === 1);
      room.actionAck = [0, 0];
      room.actionReliable = room.players.map((player) => player?.actionProtocol === 1);
      room.gridCache = null;
      invalidateProtocolCache(room);
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
    for (let index = 0; index < room.players.length; index += 1) {
      this.quickMatchResumeIndex.remove(room, index, room.players[index]?.resumeTokenDigest);
    }
    this.stopMatch(room);
    this.rooms.delete(room.code);
  }
}
