"use strict";

// The Offline game is reconstructed with document.write(), so Match continuity
// must load as a classic script before the deferred online bridge.
(() => {
  const SESSION_KEY = "riftbomb-online-session-v1";
  const PENDING_RESUME_KEY = "riftbomb-online-resume-pending-v1";
  const RESUME_PROTOCOL_VERSION = 1;
  const RESUME_TOKEN_BYTES = 32;
  const RESUME_ROLE_RETRY_DELAYS_MS = Object.freeze([
    100, 250, 500, 1_000, 2_000, 4_000, 8_000, 12_000, 16_000, 16_000
  ]);
  const INPUT_PROTOCOL_VERSION = 1;
  const INPUT_RETRY_MS = 120;
  const INPUT_OUTBOX_LIMIT = 64;
  const MAX_INPUT_SEQUENCE = 0x7fffffff;
  const ACTION_PROTOCOL_VERSION = 1;
  const ACTION_RETRY_MS = 120;
  const ACTION_OUTBOX_LIMIT = 16;
  const MAX_ACTION_SEQUENCE = 0x7fffffff;

  function validResumeToken(value) {
    return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  }

  function createLatestSnapshotBuffer() {
    let latest = null;
    const push = (snapshot) => {
      if (!snapshot || !Number.isFinite(snapshot.s) || snapshot.s <= 0 ||
          (latest && snapshot.s <= latest.s)) return false;
      latest = !Array.isArray(snapshot.grid) && Array.isArray(latest?.grid)
        ? { ...snapshot, grid: latest.grid }
        : snapshot;
      return true;
    };
    const take = () => {
      const snapshot = latest;
      latest = null;
      return snapshot;
    };
    return Object.freeze({
      peek: () => latest,
      push,
      reset: () => { latest = null; },
      take
    });
  }

  function createReliableInputStream({ send, now, retryMs, outboxLimit }) {
    let epoch = 0;
    let nextSequence = 1;
    let acceptedSequence = 0;
    let acknowledgedSequence = 0;
    let lastMask = -1;
    let lastLegacyMask = -1;
    let replayCount = 0;
    let roundTripMs = null;
    let outbox = [];

    const seatCursor = (protocol, seatIndex) => {
      if (!protocol || protocol.v !== INPUT_PROTOCOL_VERSION ||
          !Number.isSafeInteger(protocol.epoch) || protocol.epoch < 0 ||
          !Array.isArray(protocol.accepted) || !Array.isArray(protocol.ack) ||
          !Number.isInteger(seatIndex) || seatIndex < 0) return null;
      const accepted = protocol.accepted[seatIndex];
      const ack = protocol.ack[seatIndex];
      if (!Number.isSafeInteger(accepted) || accepted < 0 ||
          accepted > MAX_INPUT_SEQUENCE || !Number.isSafeInteger(ack) || ack < 0 ||
          ack > accepted || ack > MAX_INPUT_SEQUENCE) return null;
      return { epoch: protocol.epoch, accepted, ack };
    };
    const transmit = (entry, replay = false) => {
      entry.sentAt = now();
      const delivered = send(entry.message) === true;
      if (delivered && replay) replayCount += 1;
      return delivered;
    };
    const synchronize = (protocol, seatIndex) => {
      const cursor = seatCursor(protocol, seatIndex);
      if (!cursor || cursor.epoch < epoch) return false;
      if (cursor.epoch > epoch) {
        epoch = cursor.epoch;
        nextSequence = Math.min(MAX_INPUT_SEQUENCE + 1, cursor.accepted + 1);
        acceptedSequence = cursor.accepted;
        acknowledgedSequence = cursor.ack;
        lastMask = -1;
        lastLegacyMask = -1;
        roundTripMs = null;
        outbox = [];
        return true;
      }
      if (cursor.accepted < acceptedSequence || cursor.ack < acknowledgedSequence ||
          cursor.accepted >= nextSequence) return false;
      acceptedSequence = cursor.accepted;
      acknowledgedSequence = cursor.ack;
      nextSequence = Math.max(nextSequence, Math.min(MAX_INPUT_SEQUENCE + 1, cursor.accepted + 1));
      const acknowledged = outbox.filter(({ message }) => message.inputSeq <= acknowledgedSequence);
      const latestAcknowledged = acknowledged.at(-1);
      if (latestAcknowledged && Number.isFinite(latestAcknowledged.createdAt)) {
        const sample = Math.max(0, now() - latestAcknowledged.createdAt);
        roundTripMs = roundTripMs === null ? sample : roundTripMs + (sample - roundTripMs) * 0.2;
      }
      outbox = outbox.filter(({ message }) => message.inputSeq > acknowledgedSequence);
      return true;
    };
    const queue = (mask) => {
      if (!Number.isInteger(mask) || mask < 0 || mask > 15 || epoch <= 0 ||
          mask === lastMask || outbox.length >= outboxLimit ||
          nextSequence > MAX_INPUT_SEQUENCE) return false;
      const message = { type: "input", mask, inputEpoch: epoch, inputSeq: nextSequence++ };
      const entry = { message, createdAt: now(), sentAt: Number.NEGATIVE_INFINITY };
      outbox.push(entry);
      lastMask = mask;
      transmit(entry);
      return true;
    };
    const replay = () => {
      if (!outbox.length || now() - outbox[0].sentAt < retryMs) return false;
      transmit(outbox[0], true);
      return true;
    };
    const sendMovement = (mask) => {
      if (!Number.isInteger(mask) || mask < 0 || mask > 15) return false;
      if (epoch <= 0) {
        if (mask === lastLegacyMask) return false;
        const delivered = send({ type: "input", mask }) === true;
        if (delivered) lastLegacyMask = mask;
        return delivered;
      }
      lastLegacyMask = -1;
      if (!queue(mask)) replay();
      return true;
    };
    const reset = () => {
      epoch = 0;
      nextSequence = 1;
      acceptedSequence = 0;
      acknowledgedSequence = 0;
      lastMask = -1;
      lastLegacyMask = -1;
      replayCount = 0;
      roundTripMs = null;
      outbox = [];
    };
    const snapshot = () => ({
      version: INPUT_PROTOCOL_VERSION,
      epoch,
      nextSequence,
      acceptedSequence,
      acknowledgedSequence,
      pendingSequences: outbox.map(({ message }) => message.inputSeq),
      pendingMasks: outbox.map(({ message }) => message.mask),
      oldestPendingAgeMs: outbox.length ? Math.max(0, now() - outbox[0].createdAt) : null,
      roundTripMs,
      replayCount
    });
    return Object.freeze({
      currentEpoch: () => epoch,
      rearmLegacy: () => { lastLegacyMask = -1; },
      replay,
      reset,
      sendMovement,
      snapshot,
      synchronize
    });
  }

  function createReliableActionStream({ send, persist, now, retryMs, outboxLimit }) {
    let mode = "unknown";
    let epoch = 0;
    let nextSequence = 1;
    let acknowledgedSequence = 0;
    let replayCount = 0;
    let outbox = [];
    let failure = "";

    const validAction = (kind, slot) => kind === "bomb" ||
      (kind === "ability" && Number.isInteger(slot) && slot >= 0 && slot <= 3);
    const validRound = (round) => Number.isSafeInteger(round) && round >= 0;
    const seatCursor = (protocol, seatIndex) => {
      if (!protocol || protocol.v !== ACTION_PROTOCOL_VERSION ||
          !Number.isSafeInteger(protocol.epoch) || protocol.epoch < 0 ||
          !Array.isArray(protocol.ack) || !Number.isInteger(seatIndex) || seatIndex < 0) return null;
      const ack = protocol.ack[seatIndex];
      if (!Number.isSafeInteger(ack) || ack < 0 || ack > MAX_ACTION_SEQUENCE) return null;
      return { epoch: protocol.epoch, ack };
    };
    const persistedState = () => ({
      v: ACTION_PROTOCOL_VERSION,
      epoch,
      nextSequence,
      acknowledgedSequence,
      outbox: outbox.map(({ message }) => ({ ...message }))
    });
    const persistNow = () => {
      try { return persist() !== false; } catch { return false; }
    };
    const transmit = (entry, replay = false) => {
      entry.sentAt = now();
      const delivered = send(entry.message) === true;
      if (delivered && replay) replayCount += 1;
      return delivered;
    };
    const clear = (nextMode = "unknown") => {
      mode = nextMode;
      epoch = 0;
      nextSequence = 1;
      acknowledgedSequence = 0;
      replayCount = 0;
      outbox = [];
      failure = "";
    };
    const synchronize = (protocol, seatIndex) => {
      const cursor = seatCursor(protocol, seatIndex);
      if (!cursor || cursor.epoch < epoch) return false;
      if (cursor.epoch > epoch) {
        mode = "reliable";
        epoch = cursor.epoch;
        nextSequence = Math.min(MAX_ACTION_SEQUENCE + 1, cursor.ack + 1);
        acknowledgedSequence = cursor.ack;
        outbox = [];
        persistNow();
        return true;
      }
      if (cursor.ack < acknowledgedSequence) return false;
      const changed = mode !== "reliable" || cursor.ack !== acknowledgedSequence ||
        cursor.ack >= nextSequence || outbox.some(({ message }) => message.actionSeq <= cursor.ack);
      const previousHead = outbox[0];
      mode = "reliable";
      acknowledgedSequence = cursor.ack;
      nextSequence = Math.max(nextSequence, Math.min(MAX_ACTION_SEQUENCE + 1, cursor.ack + 1));
      outbox = outbox.filter(({ message }) => message.actionSeq > cursor.ack);
      if (changed) persistNow();
      if (outbox.length && outbox[0] !== previousHead) transmit(outbox[0]);
      return true;
    };
    const negotiate = (protocol, seatIndex) => {
      if (seatCursor(protocol, seatIndex)) return synchronize(protocol, seatIndex);
      const nextMode = protocol === undefined ? "legacy" : "disabled";
      const changed = mode !== nextMode || epoch !== 0 || outbox.length > 0;
      clear(nextMode);
      if (changed) persistNow();
      return false;
    };
    const hydrate = (saved) => {
      clear();
      if (!saved || saved.v !== ACTION_PROTOCOL_VERSION ||
          !Number.isSafeInteger(saved.epoch) || saved.epoch <= 0 ||
          !Number.isSafeInteger(saved.nextSequence) || saved.nextSequence <= 0 ||
          saved.nextSequence > MAX_ACTION_SEQUENCE + 1 ||
          !Number.isSafeInteger(saved.acknowledgedSequence) ||
          saved.acknowledgedSequence < 0 || saved.acknowledgedSequence >= saved.nextSequence ||
          !Array.isArray(saved.outbox) || saved.outbox.length > outboxLimit ||
          saved.nextSequence !== saved.acknowledgedSequence + saved.outbox.length + 1) return false;
      const restored = [];
      for (let index = 0; index < saved.outbox.length; index += 1) {
        const message = saved.outbox[index];
        const expectedSequence = saved.acknowledgedSequence + index + 1;
        if (!message || message.type !== "action" ||
            !validAction(message.kind, message.slot) || !validRound(message.actionRound) ||
            message.actionEpoch !== saved.epoch || message.actionSeq !== expectedSequence) return false;
        const restoredMessage = {
          type: "action",
          kind: message.kind,
          actionEpoch: message.actionEpoch,
          actionSeq: message.actionSeq,
          actionRound: message.actionRound
        };
        if (message.kind === "ability") {
          restoredMessage.slot = message.slot;
          if (Number.isFinite(message.aimX) && Number.isFinite(message.aimZ)) {
            restoredMessage.aimX = message.aimX;
            restoredMessage.aimZ = message.aimZ;
          }
        }
        restored.push({ message: restoredMessage, sentAt: Number.NEGATIVE_INFINITY });
      }
      epoch = saved.epoch;
      nextSequence = saved.nextSequence;
      acknowledgedSequence = saved.acknowledgedSequence;
      outbox = restored;
      return true;
    };
    const queue = (kind, slot, round, aim = null) => {
      failure = "";
      if (mode !== "reliable" || epoch <= 0) {
        failure = "protocol";
        return false;
      }
      if (!validAction(kind, slot) || !validRound(round)) {
        failure = "invalid";
        return false;
      }
      if (outbox.length >= outboxLimit) {
        failure = "capacity";
        return false;
      }
      if (nextSequence > MAX_ACTION_SEQUENCE) {
        failure = "sequence";
        return false;
      }
      const message = {
        type: "action",
        kind,
        actionEpoch: epoch,
        actionSeq: nextSequence++,
        actionRound: round
      };
      if (kind === "ability") {
        message.slot = slot;
        if (Number.isFinite(aim?.x) && Number.isFinite(aim?.z)) {
          message.aimX = aim.x;
          message.aimZ = aim.z;
        }
      }
      const entry = { message, sentAt: Number.NEGATIVE_INFINITY };
      outbox.push(entry);
      if (!persistNow()) {
        outbox.pop();
        nextSequence -= 1;
        failure = "storage";
        return false;
      }
      if (outbox.length === 1) transmit(entry);
      return true;
    };
    const sendAction = (kind, slot, round, aim = null) => {
      if (mode === "reliable") return queue(kind, slot, round, aim);
      failure = "";
      if (mode !== "legacy") {
        failure = "protocol";
        return false;
      }
      if (!validAction(kind, slot)) {
        failure = "invalid";
        return false;
      }
      const message = { type: "action", kind };
      if (kind === "ability") {
        message.slot = slot;
        if (Number.isFinite(aim?.x) && Number.isFinite(aim?.z)) {
          message.aimX = aim.x;
          message.aimZ = aim.z;
        }
      }
      return send(message) === true;
    };
    const replay = () => {
      if (mode !== "reliable" || !outbox.length || now() - outbox[0].sentAt < retryMs) {
        return false;
      }
      transmit(outbox[0], true);
      return true;
    };
    const snapshot = () => ({
      version: ACTION_PROTOCOL_VERSION,
      mode,
      epoch,
      nextSequence,
      acknowledgedSequence,
      pendingSequences: outbox.map(({ message }) => message.actionSeq),
      pendingKinds: outbox.map(({ message }) => message.kind),
      replayCount
    });
    return Object.freeze({
      currentFailure: () => failure,
      currentMode: () => mode,
      hydrate,
      negotiate,
      persistedState,
      replay,
      reset: () => clear(),
      send: sendAction,
      snapshot,
      synchronize
    });
  }

  function createMatchContinuity({
    send,
    storage,
    captureSession = () => null,
    randomBytes = (bytes) => globalThis.crypto.getRandomValues(bytes),
    now = () => performance.now(),
    wallNow = () => Date.now(),
    wait = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
    openSocket = (url) => new WebSocket(url),
    scheduleTimeout = (callback, delay) => setTimeout(callback, delay),
    cancelTimeout = (timer) => clearTimeout(timer),
    inputRetryMs = INPUT_RETRY_MS,
    actionRetryMs = ACTION_RETRY_MS
  } = {}) {
    if (typeof send !== "function") throw new TypeError("Match continuity requires transport.send");
    if (!storage || typeof storage.getItem !== "function" ||
        typeof storage.setItem !== "function" || typeof storage.removeItem !== "function") {
      throw new TypeError("Match continuity requires a storage adapter");
    }

    const snapshots = createLatestSnapshotBuffer();
    let lifecycleGeneration = 0;
    let matchRuntimeEpoch = 0;
    let runtimeBootRecord = null;
    let runtimeBootTail = Promise.resolve();
    let action;

    const saveSession = () => {
      try {
        const session = captureSession();
        if (!session || session.role === "offline" || !session.roomCode) return false;
        storage.setItem(SESSION_KEY, JSON.stringify({
          ...session,
          actionDelivery: action.persistedState(),
          savedAt: wallNow()
        }));
        return true;
      } catch {
        return false;
      }
    };
    const input = createReliableInputStream({
      send,
      now,
      retryMs: inputRetryMs,
      outboxLimit: INPUT_OUTBOX_LIMIT
    });
    action = createReliableActionStream({
      send,
      persist: saveSession,
      now,
      retryMs: actionRetryMs,
      outboxLimit: ACTION_OUTBOX_LIMIT
    });

    const clearSaved = () => {
      try { storage.removeItem(SESSION_KEY); } catch {}
    };
    const clearPending = () => {
      try { storage.removeItem(PENDING_RESUME_KEY); } catch {}
    };
    const clear = () => {
      clearSaved();
      clearPending();
    };
    const loadSession = () => {
      try {
        const raw = storage.getItem(SESSION_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data?.roomCode || !data?.role ||
            !/^[A-HJ-NP-Z2-9]{6}$/.test(String(data.roomCode)) ||
            (data.role !== "host" && data.role !== "guest") ||
            (data.resumeToken !== undefined && data.resumeToken !== "" &&
              !validResumeToken(data.resumeToken))) return null;
        return data;
      } catch {
        return null;
      }
    };
    const savePending = (pending) => {
      if (!validResumeToken(pending?.resumeToken) || !pending.quickMatch || pending.roomCode) {
        return false;
      }
      try {
        storage.setItem(PENDING_RESUME_KEY, JSON.stringify({
          resumeToken: pending.resumeToken,
          quickMatch: true,
          hostChampion: pending.hostChampion,
          arena: pending.arena,
          savedAt: wallNow()
        }));
        return true;
      } catch {
        return false;
      }
    };
    const loadPending = () => {
      try {
        const data = JSON.parse(storage.getItem(PENDING_RESUME_KEY) || "null");
        if (!data?.quickMatch || !validResumeToken(data.resumeToken)) {
          clearPending();
          return null;
        }
        return data;
      } catch {
        clearPending();
        return null;
      }
    };
    const ensureToken = (current) => {
      if (validResumeToken(current)) return current;
      const pending = loadPending();
      if (pending) return pending.resumeToken;
      const bytes = new Uint8Array(RESUME_TOKEN_BYTES);
      randomBytes(bytes);
      return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
    };
    const definitiveResumeFailure = (error) => new Set([
      "resume_denied", "resume_expired", "room_not_found", "invalid_resume", "invalid_hello"
    ]).has(error?.message);
    const definitiveInitialFailure = (error) => definitiveResumeFailure(error) ||
      ["role_taken", "room_full"].includes(error?.message);
    const retryResume = async (connect, {
      delays = RESUME_ROLE_RETRY_DELAYS_MS,
      active = () => true
    } = {}) => {
      for (let attempt = 0; ; attempt += 1) {
        if (!active()) throw new Error("resume_cancelled");
        try {
          return await connect();
        } catch (error) {
          if (error?.message !== "role_taken" || attempt >= delays.length || !active()) throw error;
          await wait(delays[attempt]);
        }
      }
    };

    let activeSocket = null;
    let pendingConnectionCancel = null;
    const cancelPendingConnection = () => {
      pendingConnectionCancel?.();
      pendingConnectionCancel = null;
    };
    const connect = ({
      url,
      hello,
      resume = false,
      resumePhase = "",
      handlers = {},
      timeoutMs = 12_000
    } = {}) => {
      cancelPendingConnection();
      const socket = openSocket(url);
      activeSocket = socket;
      return new Promise((resolve, reject) => {
        let settled = false;
        let connectedReceived = false;
        let timeout = null;
        let cancel = null;
        const clearPending = () => {
          if (pendingConnectionCancel === cancel) pendingConnectionCancel = null;
        };
        const fail = (reason) => {
          if (settled) return;
          settled = true;
          cancelTimeout(timeout);
          clearPending();
          try { socket.close(); } catch {}
          reject(new Error(reason));
        };
        const succeed = (message) => {
          if (settled) return;
          settled = true;
          cancelTimeout(timeout);
          clearPending();
          resolve(message);
        };
        cancel = () => fail("resume_cancelled");
        pendingConnectionCancel = cancel;
        timeout = scheduleTimeout(() => {
          if (activeSocket === socket) fail("authoritative_server_timeout");
        }, timeoutMs);
        socket.addEventListener("open", () => {
          if (activeSocket !== socket) return;
          socket.send(JSON.stringify(hello));
        });
        socket.addEventListener("message", (event) => {
          if (activeSocket !== socket) return;
          let message;
          try { message = JSON.parse(event.data); } catch { return; }
          if (message.type === "error") return fail(message.error || "authoritative_server_error");
          if (message.type === "quick-queued") {
            cancelTimeout(timeout);
            settled = true;
            clearPending();
            handlers.queued?.(message);
            resolve(message);
            return;
          }
          if (message.type === "connected") {
            const index = message.role === "guest" ? 1 : 0;
            synchronize(message, index, { negotiateAction: true });
            connectedReceived = true;
            const freshLobbyClaim = resume && resumePhase === "lobby" &&
              hello?.resumeOnly !== true &&
              message.resume?.v === RESUME_PROTOCOL_VERSION && message.resume.resumed === false;
            if (resume && message.resume?.v === RESUME_PROTOCOL_VERSION &&
                message.resume.resumed !== true && !freshLobbyClaim) {
              fail("resume_denied");
              return;
            }
            handlers.connected?.(message);
            if (freshLobbyClaim) {
              handlers.control?.({
                ...(hello?.preset || {}),
                type: "resume",
                activeMatch: false,
                input: message.input,
                action: message.action
              });
              succeed(message);
              return;
            }
            if (resume && message.resume?.v !== RESUME_PROTOCOL_VERSION) {
              handlers.control?.({
                ...(hello?.preset || {}),
                type: "resume",
                activeMatch: resumePhase === "match",
                input: message.input,
                action: message.action
              });
            }
            if (!resume || message.resume?.v !== RESUME_PROTOCOL_VERSION) succeed(message);
            return;
          }
          if (message.type === "snapshot") {
            handlers.snapshot?.(message.data);
            return;
          }
          if (message.type === "ping") {
            try {
              socket.send(JSON.stringify({ type: "pong", clientTime: wallNow() }));
            } catch {}
            return;
          }
          if (message.type === "presence") {
            handlers.presence?.(message);
            return;
          }
          handlers.control?.(message);
          if (resume && message.type === "resume") succeed(message);
        });
        socket.addEventListener("close", () => {
          cancelTimeout(timeout);
          if (activeSocket !== socket) return;
          if (!settled) fail("authoritative_server_unavailable");
          else handlers.disconnected?.({ connectedReceived });
        });
        socket.addEventListener("error", () => {
          if (activeSocket === socket && !settled) fail("authoritative_server_unavailable");
        });
      });
    };
    const sendMessage = (message) => {
      if (!activeSocket || activeSocket.readyState !== 1) return false;
      try {
        activeSocket.send(JSON.stringify(message));
        return true;
      } catch {
        return false;
      }
    };
    const closeConnection = () => {
      cancelPendingConnection();
      const socket = activeSocket;
      activeSocket = null;
      try { socket?.close(); } catch {}
    };

    const synchronize = (protocol, seatIndex, {
      negotiateAction = false
    } = {}) => {
      const { input: inputProtocol, action: actionProtocol } = protocol || {};
      input.synchronize(inputProtocol, seatIndex);
      if (negotiateAction) action.negotiate(actionProtocol, seatIndex);
      else action.synchronize(actionProtocol, seatIndex);
    };
    const receiveSnapshot = (data, { seatIndex, lastSequence = 0, defer = false } = {}) => {
      if (!data || ![2, 3].includes(data.v) || !Array.isArray(data.players) ||
          (Number.isFinite(data.s) && data.s <= lastSequence)) return { status: "ignored" };
      synchronize(data, seatIndex);
      if (defer) {
        snapshots.push(data);
        return { status: "buffered" };
      }
      return { status: "ready", snapshot: data };
    };
    const inputEpochFor = (message, currentMode) => {
      const epoch = message?.input?.epoch;
      if (Number.isSafeInteger(epoch) && epoch > 0) return epoch;
      if (message?.type === "rematch") {
        if (currentMode !== "matchover" && matchRuntimeEpoch > 0) return matchRuntimeEpoch;
        return Math.max(1, matchRuntimeEpoch + 1);
      }
      return Math.max(1, matchRuntimeEpoch);
    };
    const ensureRuntime = ({ message, currentMode, active, begin, rollback }) => {
      const generation = lifecycleGeneration;
      const epoch = inputEpochFor(message, currentMode());
      if (matchRuntimeEpoch === epoch && currentMode() !== "intro") return Promise.resolve(true);
      if (runtimeBootRecord?.generation === generation && runtimeBootRecord.epoch === epoch) {
        return runtimeBootRecord.promise;
      }
      const promise = runtimeBootTail.catch(() => undefined).then(async () => {
        if (generation !== lifecycleGeneration || !active()) return false;
        await begin();
        if (generation !== lifecycleGeneration || !active()) {
          rollback();
          return false;
        }
        matchRuntimeEpoch = epoch;
        return true;
      });
      runtimeBootRecord = { epoch, generation, promise };
      runtimeBootTail = promise.catch(() => undefined);
      return promise.finally(() => {
        if (runtimeBootRecord?.promise === promise) runtimeBootRecord = null;
      });
    };
    const reset = () => {
      closeConnection();
      lifecycleGeneration += 1;
      matchRuntimeEpoch = 0;
      runtimeBootRecord = null;
      snapshots.reset();
      input.reset();
      action.reset();
    };

    return Object.freeze({
      connection: Object.freeze({
        cancelPending: cancelPendingConnection,
        close: closeConnection,
        connect,
        isOpen: () => activeSocket?.readyState === 1,
        send: sendMessage
      }),
      delivery: Object.freeze({
        actionFailure: action.currentFailure,
        actionMode: action.currentMode,
        beginMatch(protocol, seatIndex) {
          synchronize(protocol, seatIndex);
          if (input.currentEpoch() <= 0) input.rearmLegacy();
        },
        hydrateAction: action.hydrate,
        inputEpoch: input.currentEpoch,
        inputSnapshot: input.snapshot,
        negotiate: (protocol, seatIndex) => synchronize(protocol, seatIndex, { negotiateAction: true }),
        persistedAction: action.persistedState,
        replay() {
          input.replay();
          action.replay();
        },
        sendAction: action.send,
        sendMovement: input.sendMovement,
        snapshot: () => ({ input: input.snapshot(), action: action.snapshot() }),
        synchronize
      }),
      reset,
      runtime: Object.freeze({
        booting: () => Boolean(runtimeBootRecord),
        ensure: ensureRuntime,
        generation: () => lifecycleGeneration,
        receiveSnapshot,
        takeSnapshot: snapshots.take
      }),
      session: Object.freeze({
        clear,
        clearPending,
        clearSaved,
        definitiveInitialFailure,
        definitiveResumeFailure,
        ensureToken,
        load: loadSession,
        loadPending,
        matchesRoom: (session, room) => Boolean(session && typeof room === "string" &&
          session.roomCode === room.toUpperCase()),
        retryResume,
        save: saveSession,
        savePending,
        validToken: validResumeToken
      })
    });
  }

  globalThis.RIFTBOMB_MATCH_CONTINUITY = Object.freeze({ create: createMatchContinuity });
})();
