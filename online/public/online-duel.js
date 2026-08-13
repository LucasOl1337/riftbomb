"use strict";

/* RIFTBOMB_AUTHORITATIVE_AUDIO_INLINE_V1 */
(() => {
  const CUES = new Set([
    "barrelBoom", "bladeHit", "bomb", "cannonBarrage", "cannonImpact",
    "daggerLand", "deathLotus", "deathMark", "dominus", "explosion",
    "gangplankQ", "hemoplague", "hemoplaguePop", "hit", "katQ", "katW",
    "kill", "markPop", "pickup", "powderKeg", "removeScurvy", "renektonDice",
    "renektonE", "renektonQ", "renektonQEmpowered", "renektonW",
    "renektonWEmpowered", "sanguinePool", "shield", "shunpo", "tidesOfBlood",
    "vladimirQ", "vladimirQEmpowered", "voracity", "zedE", "zedQ", "zedSwap",
    "zedW"
  ]);

  const finiteBetween = (value, min, max, fallback = null) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  };

  function normalize(candidate) {
    if (!candidate || !Number.isSafeInteger(candidate.id) || candidate.id <= 0) return null;
    const cue = String(candidate.cue || candidate.action ||
      (candidate.kind === "explosion" ? "explosion" : ""));
    if (!CUES.has(cue)) return null;
    const event = {
      id: candidate.id,
      cue,
      strength: finiteBetween(candidate.strength, 0.5, 1.45, 1),
      x: finiteBetween(candidate.x, -64, 64),
      z: finiteBetween(candidate.z, -64, 64)
    };
    const chainDepth = finiteBetween(candidate.chainDepth, 0, 4);
    if (chainDepth !== null) event.chainDepth = Math.trunc(chainDepth);
    return event;
  }

  function consume({ events = [], cursor = 0, play = () => undefined } = {}) {
    let nextCursor = Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
    let played = 0;
    let playbackErrors = 0;
    const ordered = Array.isArray(events)
      ? events.map(normalize).filter(Boolean).sort((left, right) => left.id - right.id)
      : [];
    const firstNewEvent = ordered.find((event) => event.id > nextCursor);
    const gap = firstNewEvent && firstNewEvent.id > nextCursor + 1
      ? {
          from: nextCursor + 1,
          to: firstNewEvent.id - 1,
          count: firstNewEvent.id - nextCursor - 1
        }
      : null;
    for (const event of ordered) {
      if (event.id <= nextCursor) continue;
      try { play(event); }
      catch { playbackErrors += 1; }
      nextCursor = event.id;
      played += 1;
    }
    return { cursor: nextCursor, played, playbackErrors, gap };
  }

  globalThis.RIFTBOMB_AUTHORITATIVE_AUDIO = Object.freeze({ consume });
})();

/* ONLINE_RESPONSIVENESS_V2 */
(() => {
  function directionFromMask(mask) {
    let dx = Number(Boolean(mask & 8)) - Number(Boolean(mask & 4));
    let dz = Number(Boolean(mask & 2)) - Number(Boolean(mask & 1));
    const length = Math.hypot(dx, dz);
    if (length > 0) {
      dx /= length;
      dz /= length;
    }
    return { dx, dz, moving: length > 0 };
  }

  function createOnlineMovement({
    now = () => performance.now(),
    wallNow = () => Date.now(),
    defaultRoundTripMs = 50,
    remoteDelayMs = 100,
  } = {}) {
    const inputHistory = [{ at: now(), mask: 0 }];
    const remoteTracks = new Map();
    let localError = null;
    let clockOffsetMs = null;
    let lastRoundTripMs = null;
    let lastSnapshotAt = null;
    let lastSnapshotAgeMs = null;
    let snapshotIntervalMs = null;
    let snapshotJitterMs = 0;

    function recordInput(mask, at = now()) {
      const normalized = Number.isInteger(mask) ? Math.max(0, Math.min(15, mask)) : 0;
      const latest = inputHistory.at(-1);
      if (latest?.mask !== normalized) inputHistory.push({ at, mask: normalized });
      const cutoff = at - 500;
      while (inputHistory.length > 2 && inputHistory[1].at < cutoff) inputHistory.shift();
      return normalized;
    }

    function inputAt(at) {
      for (let index = inputHistory.length - 1; index >= 0; index -= 1) {
        if (inputHistory[index].at <= at) return inputHistory[index].mask;
      }
      return 0;
    }

    function predict(match, contestant, mask, dt) {
      if (!contestant?.alive || match.mode !== "playing" || match.roundLocked) return false;
      if (typeof match.canMoveContestant === "function" && !match.canMoveContestant(contestant)) {
        contestant.moving = false;
        return false;
      }
      let { dx, dz, moving } = directionFromMask(mask);
      contestant.moving = moving;
      if (moving) {
        if (contestant.ultChannel > 0) match.cancelKatarinaChannel?.(contestant, "movement");
        contestant.lastDx = dx;
        contestant.lastDz = dz;
        contestant.facing = Math.atan2(dx, dz);
      } else {
        dx = contestant.lastDx;
        dz = contestant.lastDz;
      }
      if (!moving && contestant.dashing <= 0) return false;
      if (typeof match.moveContestantByDirection !== "function") {
        throw new Error("Canonical contestant movement is unavailable");
      }
      match.moveContestantByDirection(contestant, dx, dz, dt, false);
      return true;
    }

    function replay(match, contestant, from, to) {
      let cursor = from;
      let mask = inputAt(from);
      const changes = inputHistory.filter((entry) => entry.at > from && entry.at <= to);
      const advance = (until) => {
        let remaining = Math.max(0, (until - cursor) / 1000);
        while (remaining > 0.000001) {
          const step = Math.min(1 / 60, remaining);
          predict(match, contestant, mask, step);
          remaining -= step;
        }
        cursor = until;
      };
      for (const change of changes) {
        advance(change.at);
        mask = change.mask;
      }
      advance(to);
    }

    function acceptLocalSnapshot(match, authoritative, previous, {
      receivedAt = now(),
      roundTripMs = defaultRoundTripMs,
      unacknowledgedInputAgeMs = null,
    } = {}) {
      localError = null;
      if (!authoritative || !previous) return;
      const pendingAge = Number.isFinite(unacknowledgedInputAgeMs)
        ? Math.max(0, unacknowledgedInputAgeMs)
        : 0;
      const measuredRoundTrip = Number.isFinite(roundTripMs) ? roundTripMs : null;
      const rtt = measuredRoundTrip ?? Math.max(defaultRoundTripMs, pendingAge);
      const localInputLeadsAuthority = inputAt(receivedAt) !== 0 || pendingAge > 0;
      const predictionWindow = localInputLeadsAuthority ? rtt : rtt / 2;
      const snapshotAge = Math.max(0, Math.min(250, Math.max(predictionWindow, pendingAge)));
      if (lastSnapshotAt !== null) {
        const interval = Math.max(0, receivedAt - lastSnapshotAt);
        const jitterSample = Math.abs(interval - 1_000 / 30);
        snapshotIntervalMs = snapshotIntervalMs === null
          ? interval
          : snapshotIntervalMs + (interval - snapshotIntervalMs) * 0.2;
        snapshotJitterMs = snapshotJitterMs === 0
          ? jitterSample
          : snapshotJitterMs + (jitterSample - snapshotJitterMs) * 0.2;
      }
      lastSnapshotAt = receivedAt;
      lastRoundTripMs = measuredRoundTrip;
      lastSnapshotAgeMs = snapshotAge;
      replay(match, authoritative, receivedAt - snapshotAge, receivedAt);
      if (typeof match.canMoveContestant === "function" &&
          !match.canMoveContestant(authoritative)) return;
      const errorX = previous.x - authoritative.x;
      const errorZ = previous.z - authoritative.z;
      if (Math.hypot(errorX, errorZ) >= match.tile) return;
      authoritative.x = previous.x;
      authoritative.z = previous.z;
      localError = { playerId: authoritative.id, x: errorX, z: errorZ };
    }

    function applyLocalCorrection(contestant, dt) {
      if (!localError || contestant?.id !== localError.playerId) return;
      const decay = Math.exp(-10 * dt);
      const nextX = localError.x * decay;
      const nextZ = localError.z * decay;
      contestant.x += nextX - localError.x;
      contestant.z += nextZ - localError.z;
      localError.x = nextX;
      localError.z = nextZ;
      if (Math.hypot(nextX, nextZ) < 0.002) localError = null;
    }

    function stepLocal(match, contestant, mask, dt, at = now()) {
      const normalized = recordInput(mask, at);
      predict(match, contestant, normalized, dt);
      applyLocalCorrection(contestant, dt);
    }

    function acceptRemoteSnapshot(authoritative, previous, {
      receivedWallTime = wallNow(),
      roundTripMs = null,
      serverTime,
      snapDistance = Number.POSITIVE_INFINITY,
    } = {}) {
      if (!authoritative || !Number.isFinite(serverTime)) return;
      const measuredRoundTrip = Number.isFinite(roundTripMs) ? Math.max(0, roundTripMs) : null;
      const offsetSample = receivedWallTime - serverTime - (measuredRoundTrip ?? 0) / 2;
      clockOffsetMs = clockOffsetMs === null
        ? offsetSample
        : Math.min(clockOffsetMs, offsetSample);
      const track = remoteTracks.get(authoritative.id) || [];
      const latest = track.at(-1);
      if (!latest || serverTime > latest.serverTime) {
        track.push({
          serverTime,
          x: authoritative.x,
          z: authoritative.z,
          moving: authoritative.moving,
          lastDx: authoritative.lastDx,
          lastDz: authoritative.lastDz,
        });
        while (track.length > 2 && track[1].serverTime < serverTime - 1_000) track.shift();
        remoteTracks.set(authoritative.id, track);
      }
      const distance = previous
        ? Math.hypot(authoritative.x - previous.x, authoritative.z - previous.z)
        : Number.POSITIVE_INFINITY;
      if (previous && track.length > 1 && distance < snapDistance) {
        authoritative.x = previous.x;
        authoritative.z = previous.z;
        authoritative.moving = previous.moving;
        authoritative.lastDx = previous.lastDx;
        authoritative.lastDz = previous.lastDz;
      } else if (distance >= snapDistance) {
        remoteTracks.set(authoritative.id, track.slice(-1));
      }
    }

    function stepRemote(contestant, currentWallTime = wallNow()) {
      const track = remoteTracks.get(contestant?.id);
      if (!contestant || !track?.length || clockOffsetMs === null) return;
      const renderTime = currentWallTime - clockOffsetMs - remoteDelayMs;
      let before = track[0];
      let after = track.at(-1);
      for (let index = 1; index < track.length; index += 1) {
        if (track[index].serverTime < renderTime) {
          before = track[index];
          continue;
        }
        after = track[index];
        break;
      }
      if (renderTime <= track[0].serverTime) before = after = track[0];
      else if (renderTime >= track.at(-1).serverTime) before = after = track.at(-1);
      const span = after.serverTime - before.serverTime;
      const amount = span > 0
        ? Math.max(0, Math.min(1, (renderTime - before.serverTime) / span))
        : 0;
      contestant.x = before.x + (after.x - before.x) * amount;
      contestant.z = before.z + (after.z - before.z) * amount;
      const pose = amount < 0.5 ? before : after;
      contestant.moving = pose.moving;
      contestant.lastDx = pose.lastDx;
      contestant.lastDz = pose.lastDz;
    }

    function reset(at = now()) {
      inputHistory.splice(0, inputHistory.length, { at, mask: 0 });
      remoteTracks.clear();
      localError = null;
      clockOffsetMs = null;
      lastRoundTripMs = null;
      lastSnapshotAt = null;
      lastSnapshotAgeMs = null;
      snapshotIntervalMs = null;
      snapshotJitterMs = 0;
    }

    function telemetry() {
      return Object.freeze({
        localCorrection: localError ? Math.hypot(localError.x, localError.z) : 0,
        remoteBufferSize: [...remoteTracks.values()].reduce((sum, track) => sum + track.length, 0),
        roundTripMs: lastRoundTripMs,
        snapshotAgeMs: lastSnapshotAgeMs,
        snapshotIntervalMs,
        snapshotJitterMs,
      });
    }

    return Object.freeze({
      acceptLocalSnapshot,
      acceptRemoteSnapshot,
      predict,
      recordInput,
      reset,
      stepLocal,
      stepRemote,
      telemetry,
    });
  }

  globalThis.RIFTBOMB_ONLINE_MOVEMENT = Object.freeze({ create: createOnlineMovement });
})();

(() => {
  if (typeof game === "undefined" || typeof UI === "undefined") return;

  const SIGNALING_URL = "/api/pvp";
  /* RIFTBOMB_BOT_V1_LAZY_V1 */
  const V1_BOT_BUNDLE_URL = "/bot-v1.js";
  let v1BotBundlePromise = null;
  function ensureV1BotBundle() {
    if (typeof RIFTBOMB_BOTS !== "undefined" &&
        typeof RIFTBOMB_BOTS.createV1Policy === "function") {
      return Promise.resolve(true);
    }
    if (v1BotBundlePromise) return v1BotBundlePromise;
    v1BotBundlePromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = V1_BOT_BUNDLE_URL;
      script.async = true;
      script.onload = () => resolve(
        typeof RIFTBOMB_BOTS !== "undefined" &&
        typeof RIFTBOMB_BOTS.createV1Policy === "function",
      );
      script.onerror = () => {
        v1BotBundlePromise = null;
        resolve(false);
      };
      const parent = document.head || document.body;
      if (!parent) {
        v1BotBundlePromise = null;
        resolve(false);
        return;
      }
      try {
        parent.append(script);
      } catch {
        v1BotBundlePromise = null;
        resolve(false);
      }
    });
    return v1BotBundlePromise;
  }

  function defaultAuthoritativeServerUrl() {
    let pageUrl;
    try { pageUrl = new URL(window.parent.location.href); }
    catch { pageUrl = new URL(window.location.href); }
    pageUrl.protocol = pageUrl.protocol === "https:" ? "wss:" : "ws:";
    pageUrl.pathname = "/game-ws";
    pageUrl.search = "";
    pageUrl.hash = "";
    return pageUrl.href;
  }
  const AUTHORITATIVE_SERVER_URL = globalThis.RIFTBOMB_GAME_SERVER_URL ||
    defaultAuthoritativeServerUrl();
  const CHAMPIONS = ["katarina", "zed", "renekton", "vladimir", "gangplank"];
  const CHAMPION_NAMES = {
    katarina: "Katarina", zed: "Zed", renekton: "Renekton",
    vladimir: "Vladimir", gangplank: "Gangplank"
  };
  const ARENAS = ["lattice", "clearing", "labyrinth", "forts", "pit"];
  const ARENA_NAMES = {
    lattice: "Salt Lens Array", clearing: "Nacre Hollow",
    labyrinth: "Cinderfrost Works", forts: "Aeolian Bastions", pit: "Storm-Eye Basin"
  };
  const INVITE_MATCH_TARGET = 10;
  const CLIENT_BRIDGE_VERSION = 1;
  const CLIENT_SOURCE = "riftbomb-client";
  const RUNTIME_SOURCE = "riftbomb-runtime";
  const RESUME_PROTOCOL_VERSION = 1;
  const INPUT_PROTOCOL_VERSION = 1;
  const ACTION_PROTOCOL_VERSION = 1;
  const DELIVERY_REPLAY_INTERVAL_MS = 120;
  const authoritativeAudio = globalThis.RIFTBOMB_AUTHORITATIVE_AUDIO;
  const movementFactory = globalThis.RIFTBOMB_ONLINE_MOVEMENT;
  if (!movementFactory?.create) throw new Error("Published online movement module is unavailable");
  const onlineMovement = movementFactory.create();
  const browserGameplaySfx = game.sfx;
  const authoritativePredictionSink = Object.freeze({
    emitGameEvent() { return false; },
    effect() {},
    explosion() {}
  });
  const SNAPSHOT_ARRAYS = [
    "bombs", "blasts", "ultimates", "pickups", "daggers", "projectiles",
    "skillTrails", "slashes", "zedShadows", "zedMarks", "vladimirMarks",
    "gangplankBarrels", "gangplankBarrages"
  ];
  const SNAPSHOT_SCALARS = [
    "mode", "selectedChampion", "selectedChampion2", "selectedArena", "round", "wave",
    "roundWins", "matchTarget", "roundTime", "roundAge", "roundLocked",
    "roundTransition", "roundDecisionTimer", "elapsed", "bombId", "daggerId",
    "shadowId", "seed", "p2Human"
  ];

  function championNameSafe(value) {
    return CHAMPION_NAMES[value] || "Katarina";
  }

  const state = {
    role: "offline",
    roomCode: "",
    hostToken: "",
    resumeToken: "",
    resuming: false,
    resumePhase: "",
    sessionConfirmed: false,
    connected: false,
    matchmaking: false,
    quickMatch: false,
    rivalConnected: false,
    guestReady: false,
    inviteMode: false,
    inviteUrl: "",
    startInitiated: false,
    inviteAssetsReady: null,
    receivedSequence: 0,
    lastPlayedSoundEventId: 0,
    droppedSoundEventCount: 0,
    localInput: { up: false, down: false, left: false, right: false },
    pendingGuestBombs: [],
    hostChampion: game.selectedChampion,
    guestChampion: "zed",
    arena: game.selectedArena,
    matchTarget: 3,
    guestRound: 0,
    guestMode: "intro"
  };

  const continuityFactory = globalThis.RIFTBOMB_MATCH_CONTINUITY;
  if (!continuityFactory?.create) {
    throw new Error("Published Match continuity module is unavailable");
  }
  const continuity = continuityFactory.create({
    send: sendControl,
    storage: sessionStorage,
    captureSession: () => ({
      role: state.role,
      roomCode: state.roomCode,
      resumeToken: state.resumeToken,
      hostChampion: state.hostChampion,
      guestChampion: state.guestChampion,
      arena: state.arena,
      inviteMode: state.inviteMode,
      quickMatch: state.quickMatch,
      guestReady: state.guestReady,
      matchTarget: state.matchTarget,
      phase: ["lobby", "match"].includes(state.resumePhase)
        ? state.resumePhase
        : clientPhase(),
      confirmed: Boolean(state.sessionConfirmed)
    })
  });
  const { connection: matchConnection, delivery, runtime, session } = continuity;

  function networkTelemetry() {
    return Object.freeze({
      ...onlineMovement.telemetry(),
      pendingInputAgeMs: delivery.inputSnapshot().oldestPendingAgeMs,
    });
  }

  function publishNetworkTelemetry() {
    const metrics = networkTelemetry();
    const root = document.documentElement;
    const publish = (name, value) => {
      if (Number.isFinite(value)) root.dataset[name] = value.toFixed(1);
      else delete root.dataset[name];
    };
    publish("riftbombRttMs", metrics.roundTripMs);
    publish("riftbombSnapshotJitterMs", metrics.snapshotJitterMs);
    publish("riftbombLocalCorrection", metrics.localCorrection);
  }

  globalThis.RIFTBOMB_ONLINE_NETCODE = Object.freeze({ telemetry: networkTelemetry });

  setInterval(() => {
    if (state.connected) delivery.replay();
  }, DELIVERY_REPLAY_INTERVAL_MS);
  // Timers are suspended automatically while a page is in BFCache. Clearing
  // this interval on pagehide would make a restored Match lose replay forever.

  // The modern React shell owns every visible lobby control. This hidden proxy
  // keeps the authoritative networking runtime independent from presentation.
  const panel = document.createElement("div");
  panel.className = "runtime-network-controls";
  panel.dataset.mode = "offline";
  panel.hidden = true;
  panel.setAttribute("aria-hidden", "true");
  panel.innerHTML = `
    <button type="button" id="online-create">Quick match</button>
    <button type="button" id="online-show-invite" aria-expanded="false" aria-controls="online-invite-preset">Challenge</button>
    <button type="button" id="online-show-join" aria-expanded="false" aria-controls="online-join-form">Join</button>
    <button type="button" id="online-offline">Offline</button>
    <form id="online-invite-preset" hidden>
      <select id="online-invite-host" aria-label="Host champion">
        ${CHAMPIONS.map((champion) => `<option value="${champion}">${championNameSafe(champion)}</option>`).join("")}
      </select>
      <select id="online-invite-guest" aria-label="Rival champion">
        ${CHAMPIONS.map((champion) => `<option value="${champion}"${champion === "zed" ? " selected" : ""}>${championNameSafe(champion)}</option>`).join("")}
      </select>
      <select id="online-invite-arena" aria-label="Arena">
        ${ARENAS.map((arena) => `<option value="${arena}">${ARENA_NAMES[arena]}</option>`).join("")}
      </select>
      <span id="online-preset-summary">Katarina vs Zed</span>
      <button type="submit">Create challenge</button>
    </form>
    <form id="online-join-form" hidden>
      <input id="online-code" name="code" maxlength="6" autocomplete="off" inputmode="text" aria-label="Lobby code">
      <button type="submit">Connect</button>
    </form>
    <div id="online-lobby" hidden>
      <span id="online-room-label">Lobby code</span>
      <span id="online-room-code" aria-live="polite">------</span>
      <button type="button" id="online-copy">Copy code</button>
      <input id="online-invite-url" readonly hidden aria-label="Challenge link">
      <strong id="online-host-champion">Katarina</strong>
      <span id="online-host-state">Host</span>
      <strong id="online-guest-champion">Zed</strong>
      <span id="online-guest-state">Waiting</span>
      <span id="online-role-help">Host controls the lobby.</span>
      <button type="button" id="online-ready" hidden>Ready</button>
    </div>
    <p id="online-status" role="status" aria-live="polite"></p>
  `;
  document.body.appendChild(panel);

  const connection = document.createElement("div");
  connection.className = "runtime-network-status";
  connection.hidden = true;
  connection.textContent = "Online link";
  document.body.appendChild(connection);

  const actionAlert = document.createElement("div");
  actionAlert.className = "runtime-action-alert";
  actionAlert.hidden = true;
  actionAlert.setAttribute("role", "alert");
  actionAlert.setAttribute("aria-live", "assertive");
  actionAlert.setAttribute("aria-atomic", "true");
  document.body.appendChild(actionAlert);
  let actionAlertTimer = 0;

  const $p = (selector) => panel.querySelector(selector);
  const createButton = $p("#online-create");
  const showInviteButton = $p("#online-show-invite");
  const showJoinButton = $p("#online-show-join");
  const offlineButton = $p("#online-offline");
  const invitePresetForm = $p("#online-invite-preset");
  const inviteHostSelect = $p("#online-invite-host");
  const inviteGuestSelect = $p("#online-invite-guest");
  const inviteArenaSelect = $p("#online-invite-arena");
  const presetSummary = $p("#online-preset-summary");
  const inviteUrlOutput = $p("#online-invite-url");
  const joinForm = $p("#online-join-form");
  const codeInput = $p("#online-code");
  const lobbyBox = $p("#online-lobby");
  const roomLabel = $p("#online-room-label");
  const roomCode = $p("#online-room-code");
  const copyButton = $p("#online-copy");
  const readyButton = $p("#online-ready");
  const roleHelp = $p("#online-role-help");
  const hostChampionLabel = $p("#online-host-champion");
  const guestChampionLabel = $p("#online-guest-champion");
  const hostStateLabel = $p("#online-host-state");
  const guestStateLabel = $p("#online-guest-state");
  const status = $p("#online-status");

  const validChampion = (value) => typeof value === "string" && CHAMPIONS.includes(value);
  const validArena = (value) => typeof value === "string" && ARENAS.includes(value);
  const championName = championNameSafe;

  function clientPhase() {
    if (state.resuming || runtime.booting()) return "boot";
    if (game.mode === "playing" || game.mode === "matchover") return "match";
    return state.role === "offline" ? "setup" : "lobby";
  }

  function clientStateSnapshot() {
    return {
      phase: clientPhase(),
      role: state.role,
      roomCode: state.roomCode,
      connected: state.connected,
      rivalConnected: state.rivalConnected,
      guestReady: state.guestReady,
      inviteMode: state.inviteMode,
      inviteUrl: state.inviteUrl,
      busy: Boolean(
        createButton.disabled ||
        showInviteButton.disabled ||
        showJoinButton.disabled
      ),
      matchmaking: state.matchmaking,
      quickMatch: state.quickMatch,
      hostChampion: state.hostChampion,
      guestChampion: state.guestChampion,
      arena: state.arena,
      matchTarget: state.matchTarget,
      status: status.textContent || "",
      tone: status.dataset.tone || ""
    };
  }

  function publishClientState(reason = "update") {
    if (window.parent === window) return;
    window.parent.postMessage({
      source: RUNTIME_SOURCE,
      version: CLIENT_BRIDGE_VERSION,
      type: "state",
      reason,
      state: clientStateSnapshot()
    }, window.location.origin);
    // During iframe boot the saved session is the only source for the automatic
    // F5 resume scheduled below. Do not erase it while the runtime still has its
    // initial offline role; explicit offline/leave flows already clear it.
    if (reason !== "ready") saveSession();
  }

  function clearSession() {
    session.clear();
  }

  function clearSavedSession() {
    session.clearSaved();
  }

  function clearPendingResume() {
    session.clearPending();
  }

  function saveSession() {
    return session.save();
  }

  function readSession() {
    return session.load();
  }

  function sessionMatchesRoom(saved, room) {
    return session.matchesRoom(saved, room);
  }

  function savePendingResume() {
    return session.savePending(state);
  }

  function readPendingResume() {
    return session.loadPending();
  }

  function ensureResumeToken() {
    state.resumeToken = session.ensureToken(state.resumeToken);
    if (state.roomCode) saveSession();
    else savePendingResume();
    return state.resumeToken;
  }

  function returnToSetupState() {
    try {
      game.mode = "intro";
      game.p2Human = false;
      game.matchTarget = 3;
      game.presentation.matchTarget = 3;
      game.resetPlayers?.();
      if (UI.end) UI.end.hidden = true;
      if (UI.chrome) {
        UI.chrome.classList.add("is-hidden");
        UI.chrome.setAttribute("aria-hidden", "true");
        UI.chrome.setAttribute("inert", "");
      }
      UI.start.disabled = false;
      UI.start.textContent = "Match ready";
    } catch (error) {
      console.warn("Could not fully reset setup state", error);
    }
  }

  function leaveOnlineSession({ fromMatch = false } = {}) {
    const wasPlaying = game.mode === "playing" || game.mode === "matchover";
    releaseCurrentSeat();
    resetConnection();
    setOnlineRole("offline");
    setBusy(false);
    clearSession();
    closeSetupPanels();
    connection.hidden = true;
    connection.textContent = "";
    game.selectedChampion2 = "zed";
    game.matchTarget = 3;
    game.presentation.matchTarget = 3;
    game.p2Human = false;
    if (wasPlaying || fromMatch) returnToSetupState();
    else if (game.mode === "intro") game.resetPlayers?.();
    UI.start.disabled = false;
    UI.start.textContent = "Match ready";
    setStatus(
      fromMatch
        ? "You left the match. Create or join a lobby to play again."
        : "Left the online lobby.",
      "ok"
    );
    publishClientState(fromMatch ? "left-match" : "left-lobby");
  }

  function cancelQuickMatch() {
    matchConnection.cancelPending();
    state.matchmaking = false;
    state.quickMatch = false;
    clearSession();
    matchConnection.send({ type: "cancel-quick-match" });
    matchConnection.close();
    setOnlineRole("offline");
    setBusy(false);
    setStatus("Quick Match cancelado.", "ok");
    connection.hidden = true;
    publishClientState("quick-cancelled");
  }

  function setStatus(message, tone = "") {
    status.textContent = message;
    status.dataset.tone = tone;
    UI.live.textContent = message;
    publishClientState("status");
  }

  function showActionDeliveryError(message) {
    clearTimeout(actionAlertTimer);
    actionAlert.textContent = message;
    actionAlert.hidden = false;
    actionAlertTimer = setTimeout(() => {
      actionAlert.hidden = true;
      actionAlert.textContent = "";
    }, 8000);
  }

  function clearActionDeliveryError() {
    clearTimeout(actionAlertTimer);
    actionAlert.hidden = true;
    actionAlert.textContent = "";
  }

  function updateConnection(kind, message) {
    // Never cover match touch controls with the online banner.
    const matchLive = document.documentElement.classList.contains("is-match-active")
      || game?.mode === "playing"
      || game?.mode === "matchover";
    if (matchLive) {
      connection.hidden = true;
      return;
    }
    connection.hidden = false;
    connection.dataset.state = kind;
    connection.textContent = message;
    publishClientState("connection");
  }

  function setBusy(busy) {
    createButton.disabled = busy;
    showInviteButton.disabled = busy;
    showJoinButton.disabled = busy;
    offlineButton.disabled = busy;
    codeInput.disabled = busy;
    joinForm.querySelector("button").disabled = busy;
    invitePresetForm.querySelector("button").disabled = busy;
    publishClientState("busy");
  }

  function updateLobbyDisplay() {
    hostChampionLabel.textContent = championName(state.hostChampion);
    guestChampionLabel.textContent = championName(state.guestChampion);
    hostStateLabel.textContent = state.inviteMode
      ? state.connected && state.guestReady ? "AUTO START" : "PRESET LOCKED"
      : state.role === "host" && state.connected && state.guestReady ? "READY TO START" : "ADMIN";
    guestStateLabel.textContent = !state.rivalConnected ? "WAITING" : state.guestReady ? "READY" : "CHOOSING";
    guestStateLabel.dataset.ready = String(state.guestReady);
    readyButton.textContent = state.guestReady ? "READY ✓" : "I'M READY";
    readyButton.dataset.ready = String(state.guestReady);
    copyButton.textContent = state.inviteMode ? "COPY INVITE LINK" : "COPY CODE";
    // Only share after the host WebSocket has registered the room (avoids room_not_found).
    const shareReady = Boolean(state.connected && state.roomCode);
    copyButton.disabled = !shareReady || (state.inviteMode && !state.inviteUrl);
    inviteUrlOutput.hidden = !state.inviteMode || state.role !== "host" || !shareReady || !state.inviteUrl;
    inviteUrlOutput.value = shareReady ? state.inviteUrl : "";
    lobbyBox.dataset.stage = state.guestReady ? "ready" : state.rivalConnected ? "connected" : "created";
    if (state.role === "host") {
      UI.start.disabled = !state.connected || !state.guestReady;
      UI.start.textContent = !state.connected
        ? "CONNECTING TO SÃO PAULO SERVER…"
        : !state.rivalConnected
        ? "WAITING FOR PLAYER 2…"
        : state.inviteMode
          ? "STARTING CHALLENGE AUTOMATICALLY…"
        : state.guestReady
          ? `>>> START ONLINE MATCH · ${state.roomCode}`
          : "WAITING FOR PLAYER 2 READY…";
    }
    publishClientState("lobby");
  }

  function setOnlineRole(role) {
    if (state.role !== role) onlineMovement.reset();
    state.role = role;
    game.sfx = role === "offline" ? browserGameplaySfx : authoritativePredictionSink;
    panel.dataset.mode = role;
    document.body.classList.toggle("is-online-match", role !== "offline");
    lobbyBox.hidden = role === "offline";
    readyButton.hidden = role !== "guest" || state.inviteMode;
    roleHelp.textContent = state.inviteMode
      ? `Challenge preset locked · first to ${INVITE_MATCH_TARGET} eliminations.`
      : role === "guest"
      ? "Choose your champion, then confirm READY."
      : "Admin chooses their champion and the arena.";
    game.localPlayerId = role === "guest" ? 2 : 1;
    if (role === "offline") {
      globalThis.configurePlayerView?.(1, { shared: true, localMultiplayer: Boolean(game.p2Human) });
    } else {
      bindLocalOnlineView();
    }
    publishClientState("role");
  }

  function applyMatchConfig() {
    game.selectedChampion = state.hostChampion;
    game.selectedChampion2 = state.guestChampion;
    game.matchTarget = state.matchTarget;
    if (game.mode === "intro") {
      game.selectArena(state.arena);
      game.resetPlayers();
    }
  }

  async function beginConfiguredGame() {
    applyMatchConfig();
    // Mark both seats human before beginGame so shared local-P2 paths stay off.
    game.p2Human = true;
    await originalBeginGame();
    game.p2Human = true;
    bindLocalOnlineView();
  }

  async function signaling(method, data, query = "") {
    const response = await fetch(`${SIGNALING_URL}${query}`, {
      method,
      headers: method === "POST" ? { "content-type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify(data) : undefined,
      cache: "no-store"
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || "signaling_failed");
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function connectAuthoritative(role, {
    quickMatch = false,
    resume = false,
    resumePhase = ""
  } = {}) {
    const resumeToken = ensureResumeToken();
    const hello = quickMatch
      ? {
          type: "quick-match",
          inputProtocol: INPUT_PROTOCOL_VERSION,
          actionProtocol: ACTION_PROTOCOL_VERSION,
          resumeProtocol: RESUME_PROTOCOL_VERSION,
          resumeToken,
          preset: lobbyPayload()
        }
      : {
          type: "hello",
          inputProtocol: INPUT_PROTOCOL_VERSION,
          actionProtocol: ACTION_PROTOCOL_VERSION,
          resumeProtocol: RESUME_PROTOCOL_VERSION,
          resumeToken,
          resumeOnly: resume && (resumePhase === "match" || state.sessionConfirmed),
          room: state.roomCode,
          role,
          ready: role === "guest" && state.guestReady,
          preset: lobbyPayload()
        };
    const promise = matchConnection.connect({
      url: AUTHORITATIVE_SERVER_URL,
      hello,
      resume,
      resumePhase,
      handlers: {
        queued() {
          state.matchmaking = true;
          state.quickMatch = true;
          setBusy(true);
          setStatus("Buscando outro jogador no Quick Match…", "ok");
          updateConnection("waiting", "QUICK MATCH · BUSCANDO OPONENTE");
          publishClientState("quick-queued");
        },
        connected(message) {
          state.sessionConfirmed = true;
          if (message.quickMatch) {
            state.matchmaking = false;
            state.quickMatch = true;
            state.roomCode = message.room;
            state.guestReady = true;
            state.rivalConnected = true;
            setOnlineRole(message.role);
            saveSession();
            clearPendingResume();
          }
          if (Number.isSafeInteger(message.soundCursor) && message.soundCursor >= 0) {
            state.lastPlayedSoundEventId = Math.max(
              state.lastPlayedSoundEventId,
              message.soundCursor
            );
          }
          void onConnected({ resuming: resume });
        },
        snapshot(data) {
          try { receiveSnapshot(data); }
          catch (error) { console.warn("Ignored invalid authoritative snapshot", error); }
        },
        presence(message) {
          if (message.playerId === localOnlinePlayerId()) return;
          state.rivalConnected = message.connected === true;
          if (state.rivalConnected) {
            setStatus(`Player ${message.playerId} reconnected. Match continues.`, "ok");
            updateConnection(
              "connected",
              `ONLINE · LOBBY ${state.roomCode} · PLAYER ${message.playerId} RECONNECTED`
            );
          } else {
            setStatus(
              `Player ${message.playerId} disconnected. Waiting briefly for reconnection.`,
              "error"
            );
            updateConnection(
              "waiting",
              `ONLINE · LOBBY ${state.roomCode} · RECONNECTING PLAYER ${message.playerId}`
            );
          }
          updateLobbyDisplay();
        },
        control: handleControl,
        disconnected: handleDisconnect
      }
    });
    return promise;
  }

  async function onConnected({ resuming = false } = {}) {
    if (state.connected || !matchConnection.isOpen()) return;
    state.connected = true;
    if (resuming) {
      setBusy(true);
      setStatus(`Restoring ${state.resumePhase === "match" ? "match" : "lobby"} ${state.roomCode}…`, "ok");
      updateConnection("waiting", `ONLINE · LOBBY ${state.roomCode} · RESTORING SESSION`);
      return;
    }
    if (state.quickMatch) {
      state.rivalConnected = true;
      state.guestReady = true;
      setBusy(false);
      setStatus("Oponente encontrado. Preparando a partida…", "ok");
      updateConnection("connected", `QUICK MATCH · ${state.roomCode} · OPONENTE ENCONTRADO`);
      updateLobbyDisplay();
      return;
    }
    if (state.role === "guest") state.rivalConnected = true;
    setBusy(false);
    if (state.role === "host") {
      state.hostChampion = game.selectedChampion;
      setStatus(state.inviteMode
        ? "Server connected. Share the challenge link with Player 2."
        : "Server connected. Waiting for Player 2 to join.", "ok");
      updateConnection("connected", `ONLINE · LOBBY ${state.roomCode} · SÃO PAULO SERVER`);
      sendLobby();
    } else {
      if (state.inviteMode) {
        setStatus("Challenge connected. Loading preset champions…", "ok");
        await state.inviteAssetsReady;
        if (!state.connected) return;
        state.guestReady = true;
      }
      setStatus(state.inviteMode
        ? "Preset ready. Match will start automatically."
        : "Connected. Choose your champion and press READY.", "ok");
      updateConnection("connected", `ONLINE · LOBBY ${state.roomCode} · YOU ARE PLAYER 2`);
      sendGuestConfig();
    }
    updateLobbyDisplay();
  }

  function handleDisconnect() {
    if (state.role === "offline" || !state.connected) return;
    state.connected = false;
    state.rivalConnected = false;
    updateConnection("disconnected", "ONLINE CONNECTION LOST · RELOAD TO REJOIN");
    if (state.role === "host") {
      game.p2Human = false;
      setStatus("Player 2 disconnected. The match keeps running and CPU takes over.", "error");
    } else {
      setStatus("Connection lost. The online match cannot be paused; rejoin with a new lobby.", "error");
    }
    updateLobbyDisplay();
  }

  function handleControl(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "room-closed") {
      const wasPlaying = game.mode === "playing" || game.mode === "matchover";
      resetConnection();
      clearSession();
      setBusy(false);
      setOnlineRole("offline");
      if (wasPlaying) returnToSetupState();
      setStatus("The host closed this lobby. Create or join another one.", "error");
      return;
    }
    if (message.type === "start" || message.type === "rematch" || message.type === "resume") {
      const seatIndex = localOnlinePlayerId() - 1;
      delivery.beginMatch(message, seatIndex);
      void startOnlineMatch(message);
      return;
    }
    if (message.type === "lobby") {
      applyLobby(message);
      return;
    }
  }

  function updatePresetSummary() {
    presetSummary.textContent = `${championName(inviteHostSelect.value).toUpperCase()} VS ${championName(inviteGuestSelect.value).toUpperCase()} · ${ARENA_NAMES[inviteArenaSelect.value].toUpperCase()} · FIRST TO ${INVITE_MATCH_TARGET}`;
  }

  function closeSetupPanels(except = "") {
    const showInvite = except === "invite";
    const showJoin = except === "join";
    invitePresetForm.hidden = !showInvite;
    joinForm.hidden = !showJoin;
    showInviteButton.setAttribute("aria-expanded", String(showInvite));
    showJoinButton.setAttribute("aria-expanded", String(showJoin));
  }

  function sendControl(message) {
    return matchConnection.send(message);
  }

  function lobbyPayload(type = "lobby") {
    return {
      type,
      hostChampion: state.hostChampion,
      guestChampion: state.guestChampion,
      arena: state.arena,
      guestReady: state.guestReady,
      inviteMode: state.inviteMode,
      matchTarget: state.matchTarget
    };
  }

  const sendLobby = () => sendControl(lobbyPayload());
  const sendGuestConfig = () => sendControl({
    type: "guest-config", champion: state.guestChampion, ready: state.guestReady
  });

  function applyLobby(message) {
    if (validChampion(message.hostChampion)) state.hostChampion = message.hostChampion;
    if (validChampion(message.guestChampion)) state.guestChampion = message.guestChampion;
    if (validArena(message.arena)) state.arena = message.arena;
    state.inviteMode = Boolean(message.inviteMode);
    state.matchTarget = message.matchTarget === INVITE_MATCH_TARGET ? INVITE_MATCH_TARGET : 3;
    state.guestReady = Boolean(message.guestReady);
    state.rivalConnected = state.role === "guest"
      ? Object.prototype.hasOwnProperty.call(message, "hostConnected")
        ? Boolean(message.hostConnected)
        : true
      : Boolean(message.guestConnected);
    void renderer.ensureChampionModels([state.hostChampion, state.guestChampion]);
    if (game.mode === "intro") {
      game.selectedChampion = state.hostChampion;
      game.selectedChampion2 = state.guestChampion;
      game.matchTarget = state.matchTarget;
      game.selectArena(state.arena);
      game.resetPlayers();
    }
    updateLobbyDisplay();
  }

  async function startOnlineMatch(message) {
    const isResume = message.type === "resume";
    const activeMatch = !isResume || message.activeMatch === true;
    if (activeMatch) state.resuming = true;
    applyLobby(message);
    if (isResume && message.activeMatch !== true) {
      state.resuming = false;
      state.resumePhase = "lobby";
      setBusy(false);
      setStatus(`Lobby ${state.roomCode} restored.`, "ok");
      updateConnection(
        state.rivalConnected ? "connected" : "waiting",
        `ONLINE · LOBBY ${state.roomCode} · ${state.rivalConnected ? "SESSION RESTORED" : "WAITING FOR RIVAL"}`
      );
      updateLobbyDisplay();
      return;
    }

    const generation = runtime.generation();
    const isRematch = message.type === "rematch";
    if (isRematch) {
      if (state.role === "guest") {
        state.localInput = { up: false, down: false, left: false, right: false };
      }
      UI.end.hidden = true;
      UI.chrome.classList.remove("is-hidden");
      UI.chrome.setAttribute("aria-hidden", "false");
      UI.chrome.removeAttribute("inert");
      state.startInitiated = false;
    }
    if (isResume && state.role === "guest") {
      state.localInput = { up: false, down: false, left: false, right: false };
    }
    // A start/resume may be repeated while champion assets are still loading.
    // Serialize boot and make it idempotent for the authoritative input epoch.
    state.startInitiated = true;
    try {
      if (!await runtime.ensure({
        message,
        currentMode: () => game.mode,
        active: () => state.role !== "offline",
        begin: beginConfiguredGame,
        rollback: returnToSetupState
      })) return;
    } catch (error) {
      if (generation !== runtime.generation()) return;
      console.warn("Could not initialize authoritative match runtime", error);
      state.resuming = false;
      setBusy(false);
      setStatus("Could not restore the online match runtime.", "error");
      return;
    }
    game.p2Human = true;
    // Always re-bind seat/camera after start — beginGame may reset presentation to P1.
    bindLocalOnlineView();
    const bufferedSnapshot = runtime.takeSnapshot();
    if (bufferedSnapshot) applySnapshot(bufferedSnapshot);
    state.resuming = false;
    state.resumePhase = "match";
    setBusy(false);
    UI.start.disabled = true;
    UI.start.textContent = "ONLINE MATCH IN PROGRESS";
    const side = state.role === "host"
      ? `BLUE ${championName(state.hostChampion).toUpperCase()}`
      : `RED ${championName(state.guestChampion).toUpperCase()}`;
    updateConnection("connected",
      `ONLINE · LOBBY ${state.roomCode} · YOU ARE ${side} · FIRST TO ${state.matchTarget}`);
    setStatus(
      isResume
        ? "Online match restored from the São Paulo server."
        : isRematch
          ? "Rematch started on the São Paulo server."
          : "Match started on the São Paulo server.",
      "ok"
    );
  }

  function releaseCurrentSeat() {
    if (state.role === "offline") return false;
    return sendControl({ type: "leave" });
  }

  function receiveSnapshot(data) {
    const seatIndex = localOnlinePlayerId() - 1;
    const defer = state.resuming || runtime.booting() ||
      (state.role !== "offline" && game.mode === "intro" && delivery.inputEpoch() > 0);
    const received = runtime.receiveSnapshot(data, {
      seatIndex,
      lastSequence: state.receivedSequence,
      defer
    });
    if (received.status === "ready") applySnapshot(received.snapshot);
  }

  function applySnapshot(data) {
    if (!data || ![2, 3].includes(data.v) || !Array.isArray(data.players)) return;
    if (Number.isFinite(data.s) && data.s <= state.receivedSequence) return;
    const seatIndex = localOnlinePlayerId() - 1;
    delivery.synchronize(data, seatIndex);
    state.receivedSequence = Number(data.s) || state.receivedSequence + 1;
    const previousRound = state.guestRound;
    const previousMode = state.guestMode;
    const localPlayerId = localOnlinePlayerId();
    const remotePlayerId = localPlayerId === 1 ? 2 : 1;
    const previousLocal = game.players?.find((player) => player.id === localPlayerId);
    const previousRemote = game.players?.find((player) => player.id === remotePlayerId);
    for (const key of SNAPSHOT_SCALARS) {
      if (Object.prototype.hasOwnProperty.call(data, key)) game[key] = data[key];
    }
    for (const key of SNAPSHOT_ARRAYS) if (Array.isArray(data[key])) game[key] = data[key];
    game.bombs = game.bombs.map((bomb) => ({ ...bomb, passOwners: new Set(bomb.passOwners || []) }));
    const predictionNow = performance.now();
    const inputDelivery = delivery.inputSnapshot();
    state.pendingGuestBombs = state.pendingGuestBombs.filter((prediction) => {
      if (prediction.round !== game.round) return false;
      const confirmed = game.bombs.some((bomb) =>
        bomb.ownerId === prediction.bomb.ownerId &&
        bomb.r === prediction.bomb.r && bomb.c === prediction.bomb.c
      );
      if (confirmed) return false;
      const predictionAge = predictionNow - prediction.createdAt;
      if (predictionAge > 500) return false;
      game.bombs.push({
        ...prediction.bomb,
        age: prediction.bomb.age + predictionAge / 1000,
        passOwners: new Set(prediction.bomb.passOwners)
      });
      return true;
    });
    // Prefer id-stable seats even if the array order ever changes.
    game.players = [...data.players].sort((a, b) => (a?.id || 0) - (b?.id || 0));
    const authoritativeLocal = game.players.find((player) => player.id === localPlayerId);
    const authoritativeRemote = game.players.find((player) => player.id === remotePlayerId);
    if (previousLocal && authoritativeLocal && data.round === previousRound) {
      onlineMovement.recordInput(inputMask(), predictionNow);
      onlineMovement.acceptLocalSnapshot(game, authoritativeLocal, previousLocal, {
        receivedAt: predictionNow,
        roundTripMs: inputDelivery.roundTripMs,
        unacknowledgedInputAgeMs: inputDelivery.oldestPendingAgeMs,
      });
    }
    if (previousRemote && authoritativeRemote && data.round === previousRound) {
      onlineMovement.acceptRemoteSnapshot(authoritativeRemote, previousRemote, {
        receivedWallTime: Date.now(),
        roundTripMs: inputDelivery.roundTripMs,
        serverTime: data.serverTime,
        snapDistance: game.tile * 1.75,
      });
    }
    if (data.round !== previousRound) onlineMovement.reset(predictionNow);
    publishNetworkTelemetry();
    // Keep local seat identity after every snapshot — never pin to blue/P1 by default.
    game.localPlayerId = localPlayerId;
    game.player = authoritativeLocal || game.players[0];
    game.p2Human = true;
    if (data.sound?.v === 1 && authoritativeAudio?.consume) {
      const result = authoritativeAudio.consume({
        events: data.sound.events,
        cursor: state.lastPlayedSoundEventId,
        play(event) {
          const x = event.x ?? 0;
          const z = event.z ?? 0;
          const options = {
            sourceId: `remote:${event.id}`,
            pan: game.audioPanAt(x, z)
          };
          if (Number.isInteger(event.chainDepth)) options.chainDepth = event.chainDepth;
          browserGameplaySfx.effect(event.cue, event.strength, options);
        }
      });
      state.lastPlayedSoundEventId = result.cursor;
      if (result.gap) {
        state.droppedSoundEventCount += result.gap.count;
        console.warn("Authoritative audio gap", {
          ...result.gap,
          snapshotSequence: data.s,
          droppedTotal: state.droppedSoundEventCount
        });
      }
    }
    if (Array.isArray(data.grid)) game.grid = data.grid;
    game.particles = Array.isArray(data.particles) ? data.particles : [];
    game.pendingMatchWinner = game.players.find((player) => player.id === data.pendingWinnerId) || null;
    if (game.round !== previousRound && game.mode === "playing") {
      game.presentation.prepareRound();
      bindLocalOnlineView();
    }
    game.presentation.update(game);
    if (game.mode === "matchover" && previousMode !== "matchover") {
      const winner = game.players[game.roundWins[1] > game.roundWins[0] ? 1 : 0];
      game.presentation.finish(winner, game.roundWins, game.elapsed);
    }
    state.guestRound = game.round;
    state.guestMode = game.mode;
  }

  function predictLocalMovement(dt) {
    const player = localOnlinePlayer();
    const input = state.role === "guest" ? state.localInput : hostLocalInput();
    onlineMovement.stepLocal(game, player, inputMaskFrom(input), dt);
  }

  function smoothRemoteMovement() {
    if (game.mode !== "playing") return;
    const remotePlayerId = localOnlinePlayerId() === 1 ? 2 : 1;
    const remote = game.players.find((player) => player.id === remotePlayerId);
    onlineMovement.stepRemote(remote);
  }

  function hostLocalInput() {
    const stick = game.touchStick || { x: 0, z: 0 };
    return {
      up: game.keys.has("KeyW") || stick.z < -0.28,
      down: game.keys.has("KeyS") || stick.z > 0.28,
      left: game.keys.has("KeyA") || stick.x < -0.28,
      right: game.keys.has("KeyD") || stick.x > 0.28
    };
  }

  function sendCurrentInput() {
    if (state.role === "host") state.localInput = hostLocalInput();
    delivery.sendMovement(inputMask());
  }

  const originalUpdate = game.update.bind(game);
  game.update = (dt) => {
    if (state.role !== "offline" && state.connected && matchConnection.isOpen()) {
      if (state.role === "guest") syncGuestStickInput();
      sendCurrentInput();
      predictLocalMovement(dt);
      smoothRemoteMovement();
      game.updateParticles(dt * 0.25);
      return;
    }
    originalUpdate(dt);
  };

  const originalBeginGame = beginGame;
  UI.start.removeEventListener("click", beginGame);
  async function startHostOnlineMatch(automatic = false) {
    if (state.role !== "host") return;
    if (game.mode === "playing") return;
    if (!state.connected) return setStatus("Wait for Player 2 to connect.", "error");
    if (!state.guestReady) return setStatus("Player 2 must be ready.", "error");
    state.hostChampion = game.selectedChampion;
    state.arena = game.selectedArena;
    applyMatchConfig();
    // Nudge the server; match begins only when we receive type "start".
    sendControl(lobbyPayload("start"));
    setStatus(
      automatic
        ? "Both players ready. Waiting for the São Paulo server to start…"
        : "Starting match on the São Paulo server…",
      "ok"
    );
    updateConnection("waiting", `ONLINE · LOBBY ${state.roomCode} · STARTING…`);
  }

  UI.start.addEventListener("click", async () => {
    if (state.role === "guest") return setStatus("The admin starts after you confirm READY.", "ok");
    if (state.role === "host") {
      return startHostOnlineMatch(false);
    }
    await originalBeginGame();
  });

  function challengeUrl(code) {
    let url;
    try { url = new URL(window.parent.location.href); }
    catch { url = new URL(window.location.href); }
    url.hash = "";
    url.search = "";
    url.searchParams.set("room", code);
    url.searchParams.set("invite", "1");
    url.searchParams.set("p1", state.hostChampion);
    url.searchParams.set("p2", state.guestChampion);
    url.searchParams.set("arena", state.arena);
    url.searchParams.set("target", String(INVITE_MATCH_TARGET));
    return url.href;
  }

  function applyInvitePreset(preset = {}) {
    state.inviteMode = true;
    state.hostChampion = validChampion(preset.hostChampion) ? preset.hostChampion : "katarina";
    state.guestChampion = validChampion(preset.guestChampion) ? preset.guestChampion : "zed";
    state.arena = validArena(preset.arena) ? preset.arena : ARENAS[0];
    state.matchTarget = INVITE_MATCH_TARGET;
    game.selectedChampion = state.hostChampion;
    game.selectedChampion2 = state.guestChampion;
    game.matchTarget = state.matchTarget;
    if (game.mode === "intro") {
      game.selectArena(state.arena);
      game.resetPlayers();
    }
    game.presentation.matchTarget = state.matchTarget;
    state.inviteAssetsReady = renderer.ensureChampionModels([state.hostChampion, state.guestChampion]);
  }

  async function startQuickMatch(options = {}) {
    const pendingToken = session.validToken(options.resumeToken) ? options.resumeToken : "";
    releaseCurrentSeat();
    resetConnection();
    // A new Quick Match is an explicit replacement for any older saved room.
    // Keep the pending key separate so a stale session can never win on reload.
    clearSavedSession();
    clearPendingResume();
    state.resumeToken = pendingToken;
    state.hostChampion = validChampion(options.champion) ? options.champion : "katarina";
    state.guestChampion = "zed";
    state.arena = validArena(options.arena) ? options.arena : ARENAS[0];
    state.matchTarget = 3;
    state.matchmaking = true;
    state.quickMatch = true;
    game.selectChampion(state.hostChampion);
    game.selectArena(state.arena);
    setBusy(true);
    setStatus("Entrando na fila do Quick Match…", "ok");
    updateConnection("waiting", "QUICK MATCH · CONECTANDO À FILA");
    try {
      await connectAuthoritative("", { quickMatch: true });
    } catch (error) {
      if (state.matchmaking) failConnection(error);
    }
  }

  async function createRoom(options = {}) {
    releaseCurrentSeat();
    resetConnection();
    clearPendingResume();
    if (options.inviteMode) applyInvitePreset(options);
    setOnlineRole("host");
    if (!state.inviteMode) {
      state.hostChampion = game.selectedChampion;
      state.guestChampion = "zed";
      state.arena = game.selectedArena;
      state.matchTarget = 3;
    }
    setBusy(true);
    roomLabel.textContent = state.inviteMode ? "CHALLENGE LINK · FIRST TO 10" : "LOBBY CODE · SEND TO PLAYER 2";
    roomCode.textContent = "------";
    setStatus("Creating your lightweight lobby…");
    updateLobbyDisplay();
    try {
      const room = await signaling("POST", { action: "create" });
      state.roomCode = room.code;
      state.hostToken = room.hostToken;
      // Keep share UI locked until the host WebSocket has registered the room.
      state.inviteUrl = "";
      roomCode.textContent = "------";
      setBusy(false);
      setStatus(state.inviteMode
        ? "Lobby reserved. Connecting to the São Paulo server before sharing…"
        : "Lobby reserved. Connecting to the São Paulo server…", "ok");
      updateConnection("waiting", `ONLINE · LOBBY ${room.code} · CONNECTING TO SERVER`);
      updateLobbyDisplay();
      await connectAuthoritative("host");
      if (state.inviteMode) state.inviteUrl = challengeUrl(state.roomCode);
      roomCode.textContent = state.roomCode;
      setStatus(state.inviteMode
        ? "Server ready. Copy the challenge link for Player 2."
        : "Lobby created. Share the code once Player 2 can join.", "ok");
      updateConnection("waiting", `ONLINE · LOBBY ${room.code} · WAITING FOR PLAYER 2`);
      updateLobbyDisplay();
    } catch (error) { failConnection(error); }
  }

  async function joinRoom(code, options = {}) {
    releaseCurrentSeat();
    resetConnection();
    clearPendingResume();
    if (options.inviteMode) applyInvitePreset(options);
    setOnlineRole("guest");
    state.roomCode = code;
    if (!state.inviteMode) {
      state.guestChampion = validChampion(options.guestChampion)
        ? options.guestChampion
        : "zed";
    }
    state.guestReady = state.inviteMode;
    roomLabel.textContent = state.inviteMode ? "DIRECT CHALLENGE" : "JOINED LOBBY";
    roomCode.textContent = code;
    setBusy(true);
    setStatus(state.inviteMode ? `Activating challenge ${code}…` : `Joining lobby ${code}…`);
    updateLobbyDisplay();
    try {
      // The authoritative WebSocket owns room existence and seat arbitration.
      // Avoid a sequential D1 preflight; its hello response carries the same
      // room_not_found/role_taken failure path after one transport round-trip.
      await connectAuthoritative("guest");
      updateConnection("connected", `ONLINE · LOBBY ${code} · SÃO PAULO SERVER`);
      setStatus("Lobby found. Connected to the authoritative server.", "ok");
    } catch (error) { failConnection(error); }
  }

  function failConnection(error) {
    console.warn("Online PvP connection failed", error);
    // A timeout can happen after the server protected the seat but before this
    // browser received `connected`. Keep the pre-persisted bearer unless the
    // server definitively rejected the claim.
    if (session.definitiveInitialFailure(error)) clearSession();
    setBusy(false);
    setOnlineRole("offline");
    const message = error?.message === "room_not_found"
      ? "Lobby not found or expired. Check the code."
      : ["room_full", "role_taken"].includes(error?.message)
        ? "That lobby already has two players."
        : "Could not create the online lobby. Try again.";
    setStatus(message, "error");
    // Keep the error in the lobby status only — do not pin a fixed banner over the arena.
    connection.hidden = true;
    connection.dataset.state = "disconnected";
    connection.textContent = "";
    UI.start.disabled = false;
  }

  function resetConnection() {
    continuity.reset();
    Object.assign(state, {
      connected: false, rivalConnected: false, guestReady: false, hostToken: "", resumeToken: "",
      resuming: false, resumePhase: "", sessionConfirmed: false, roomCode: "",
      matchmaking: false, quickMatch: false,
      inviteMode: false, inviteUrl: "", startInitiated: false, inviteAssetsReady: null, matchTarget: 3,
      receivedSequence: 0,
      lastPlayedSoundEventId: 0,
      droppedSoundEventCount: 0,
      localInput: { up: false, down: false, left: false, right: false },
      pendingGuestBombs: []
    });
  }

  function chooseOffline() {
    releaseCurrentSeat();
    resetConnection();
    setOnlineRole("offline");
    setBusy(false);
    clearSession();
    closeSetupPanels();
    connection.hidden = true;
    connection.textContent = "";
    game.selectedChampion2 = "zed";
    game.matchTarget = 3;
    game.presentation.matchTarget = 3;
    game.p2Human = false;
    if (game.mode === "playing" || game.mode === "matchover") returnToSetupState();
    else if (game.mode === "intro") game.resetPlayers();
    UI.start.disabled = false;
    UI.start.textContent = "Match ready";
    setStatus("Solo/local selected. Online lobby controls are disabled.", "ok");
    publishClientState("offline");
  }

  async function tryResumeSession() {
    const saved = readSession();
    if (state.role !== "offline") return false;
    if (!saved) {
      const pending = readPendingResume();
      if (!pending) return false;
      await startQuickMatch({
        champion: validChampion(pending.hostChampion) ? pending.hostChampion : "katarina",
        arena: validArena(pending.arena) ? pending.arena : ARENAS[0],
        resumeToken: pending.resumeToken
      });
      return true;
    }

    resetConnection();
    state.roomCode = saved.roomCode;
    state.resumeToken = session.validToken(saved.resumeToken) ? saved.resumeToken : session.ensureToken("");
    state.resuming = true;
    state.resumePhase = saved.phase === "match" ? "match" : "lobby";
    state.sessionConfirmed = saved.confirmed === true;
    state.hostChampion = validChampion(saved.hostChampion) ? saved.hostChampion : "katarina";
    state.guestChampion = validChampion(saved.guestChampion) ? saved.guestChampion : "zed";
    state.arena = validArena(saved.arena) ? saved.arena : ARENAS[0];
    state.inviteMode = Boolean(saved.inviteMode);
    state.quickMatch = Boolean(saved.quickMatch);
    state.guestReady = Boolean(saved.guestReady) || state.quickMatch;
    state.matchTarget = saved.matchTarget === INVITE_MATCH_TARGET ? INVITE_MATCH_TARGET : 3;
    game.selectedChampion = state.hostChampion;
    game.selectedChampion2 = state.guestChampion;
    game.matchTarget = state.matchTarget;
    if (game.mode === "intro") {
      game.selectArena(state.arena);
      game.resetPlayers();
    }
    delivery.hydrateAction(saved.actionDelivery);
    setOnlineRole(saved.role);
    roomLabel.textContent = state.inviteMode ? "CHALLENGE LINK · RESUME" : "LOBBY CODE · RESUME";
    roomCode.textContent = state.roomCode;
    if (saved.role === "host" && state.inviteMode) state.inviteUrl = challengeUrl(state.roomCode);
    setBusy(true);
    setStatus(`Reconnecting to ${state.resumePhase} ${saved.roomCode}…`, "ok");
    updateLobbyDisplay();
    saveSession();
    const resumeGeneration = runtime.generation();
    try {
      await session.retryResume(() => connectAuthoritative(saved.role, {
        resume: true,
        resumePhase: state.resumePhase
      }), {
        active: () => runtime.generation() === resumeGeneration &&
          state.resuming && state.role === saved.role
      });
      return true;
    } catch (error) {
      if (error?.message === "resume_cancelled" || runtime.generation() !== resumeGeneration) {
        return false;
      }
      console.warn("Session resume failed", error);
      const credentialRejected = session.definitiveResumeFailure(error);
      resetConnection();
      if (credentialRejected) clearSession();
      setBusy(false);
      setOnlineRole("offline");
      setStatus(
        credentialRejected
          ? "The previous lobby no longer accepts this session. Create or join again."
          : "The server is temporarily unavailable. Your session was kept for another retry.",
        "error"
      );
      return false;
    }
  }

  function inputMaskFrom(input) {
    return Number(input.up) |
      (Number(input.down) << 1) |
      (Number(input.left) << 2) |
      (Number(input.right) << 3);
  }

  function inputMask() {
    return inputMaskFrom(state.localInput);
  }

  function sendInput() {
    delivery.sendMovement(inputMask());
  }

  function setGuestDirection(direction, active) {
    if (state.role !== "guest" || !state.connected || state.localInput[direction] === active) return;
    state.localInput[direction] = active;
    sendInput();
  }

  const offlinePlaceBomb = game.placeBomb.bind(game);
  const offlineCastAbility = game.castAbility.bind(game);
  const offlineRequestDash = game.requestDash?.bind(game);

  /** Local seat for this browser: host=1 (blue), guest=2 (red). Never trust game.player alone. */
  function localOnlinePlayerId() {
    return state.role === "guest" ? 2 : 1;
  }

  function localOnlinePlayer() {
    const id = localOnlinePlayerId();
    return game.players?.find((player) => player.id === id)
      || game.players?.[id - 1]
      || null;
  }

  function bindLocalOnlineView() {
    if (state.role === "offline") return;
    const id = localOnlinePlayerId();
    game.localPlayerId = id;
    game.player = localOnlinePlayer() || game.players?.[0] || game.player;
    globalThis.configurePlayerView?.(id, { shared: false, localMultiplayer: false });
  }

  function sendOnlineAction(kind, slot, aim = null) {
    const sent = delivery.sendAction(kind, slot, game.round, aim);
    if (!sent && delivery.actionFailure() === "storage") {
      const message = "Action blocked: browser storage is unavailable. Reload after enabling site data.";
      setStatus(message, "error");
      showActionDeliveryError(message);
    }
    if (sent) clearActionDeliveryError();
    return sent;
  }

  game.placeBomb = (player) => {
    if (state.role === "offline" || !state.connected || !matchConnection.isOpen()) {
      return offlinePlaceBomb(player || game.player);
    }
    const local = localOnlinePlayer();
    const actor = player?.id === local?.id ? player : local;
    if (!actor) return false;
    // Always tell the server; optimistic predict may fail client-side.
    if (!sendOnlineAction("bomb")) return false;
    const bombIds = new Set(game.bombs.map((bomb) => bomb.id));
    const placed = offlinePlaceBomb(actor);
    if (!placed) return false;
    const predictedBomb = game.bombs.find((bomb) =>
      bomb.ownerId === actor.id && !bombIds.has(bomb.id)
    );
    if (predictedBomb) {
      state.pendingGuestBombs.push({
        createdAt: performance.now(), round: game.round,
        bomb: { ...predictedBomb, passOwners: [...(predictedBomb.passOwners || [])] }
      });
    }
    return true;
  };

  game.castAbility = (slot, player, options = {}) => {
    if (state.role === "offline" || !state.connected || !matchConnection.isOpen()) {
      return offlineCastAbility(slot, player || game.player, options);
    }
    if (!Number.isInteger(slot)) return false;
    const local = localOnlinePlayer();
    const actor = player?.id === local?.id ? player : local;
    if (!actor) return false;
    const aim = Number.isFinite(options.aim?.x) && Number.isFinite(options.aim?.z)
      ? { x: options.aim.x, z: options.aim.z }
      : null;
    if (!sendOnlineAction("ability", slot, aim)) return false;
    // The server owns postponed-spell buffering. Keep immediate local
    // prediction for legal casts, but never leave a client-only buffered cast
    // that could survive a snapshot or execute twice.
    return offlineCastAbility(slot, actor, { buffer: false, ...(aim ? { aim } : {}) });
  };

  if (typeof offlineRequestDash === "function") {
    game.requestDash = (player) => {
      if (state.role === "offline" || !state.connected || !matchConnection.isOpen()) {
        return offlineRequestDash(player || game.player);
      }
      const local = localOnlinePlayer();
      const actor = player?.id === local?.id ? player : local;
      if (!actor) return false;
      // Dash is ability slot 1 for several kits; keep local predict only.
      return offlineRequestDash(actor);
    };
  }

  function guestAction(kind, slot = null) {
    if (state.role !== "guest" || !state.connected || game.mode !== "playing") return;
    const guest = localOnlinePlayer();
    if (!guest) return;
    if (kind === "bomb") game.placeBomb(guest);
    if (kind === "ability" && Number.isInteger(slot)) {
      game.castAbility(slot, guest, game.pointerAim ? { aim: game.pointerAim } : {});
    }
  }

  const keyDirections = {
    KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down",
    KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right"
  };
  const abilityKeys = { KeyQ: 0, KeyF: 1, KeyE: 2, KeyR: 3 };

  addEventListener("keydown", (event) => {
    if (state.role === "offline") return;
    if (event.code === "KeyP") {
      event.preventDefault();
      event.stopImmediatePropagation();
      setStatus("Online matches cannot be paused.", "error");
      return;
    }
    if (game.mode !== "playing") return;
    if (state.role === "guest") {
      const direction = keyDirections[event.code];
      const isAction = event.code === "Space" || event.code === "Enter" ||
        Object.prototype.hasOwnProperty.call(abilityKeys, event.code);
      if (!direction && !isAction) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (direction) setGuestDirection(direction, true);
      if (!event.repeat && ["Space", "Enter"].includes(event.code)) guestAction("bomb");
      if (!event.repeat && Object.prototype.hasOwnProperty.call(abilityKeys, event.code)) {
        guestAction("ability", abilityKeys[event.code]);
      }
      return;
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Numpad0", "ShiftRight"].includes(event.code)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  addEventListener("keyup", (event) => {
    if (state.role !== "guest") return;
    const direction = keyDirections[event.code];
    if (!direction) return;
    const wasActive = state.localInput[direction];
    state.localInput[direction] = false;
    if (game.mode !== "playing" || !state.connected || !wasActive) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    sendInput();
  }, true);

  addEventListener("blur", () => {
    if (state.role !== "guest") return;
    state.localInput = { up: false, down: false, left: false, right: false };
    sendInput();
  }, true);

  // Analog stick → discrete guest directions for the existing input mask protocol.
  let stickDriving = false;
  function syncGuestStickInput() {
    if (state.role !== "guest" || !state.connected || game.mode !== "playing") return;
    const stick = game.touchStick || { x: 0, z: 0 };
    const magnitude = Math.hypot(stick.x, stick.z);
    if (magnitude <= 0.18) {
      if (!stickDriving) return;
      stickDriving = false;
      state.localInput = { up: false, down: false, left: false, right: false };
      sendInput();
      return;
    }
    stickDriving = true;
    const next = {
      up: stick.z < -0.28,
      down: stick.z > 0.28,
      left: stick.x < -0.28,
      right: stick.x > 0.28
    };
    let changed = false;
    for (const direction of ["up", "down", "left", "right"]) {
      if (state.localInput[direction] !== next[direction]) {
        state.localInput[direction] = next[direction];
        changed = true;
      }
    }
    if (changed) sendInput();
  }

  for (const [button, kind, slot] of [
    [UI.touchBomb, "bomb", null], [UI.touchQ, "ability", 0],
    [UI.touchDash, "ability", 1], [UI.touchMine, "ability", 2], [UI.touchUlt, "ability", 3]
  ]) {
    button?.addEventListener("pointerdown", (event) => {
      if (state.role !== "guest") return;
      event.preventDefault(); event.stopImmediatePropagation();
      guestAction(kind, slot);
    }, true);
  }

  UI.restart.addEventListener("click", (event) => {
    if (state.role === "guest") {
      event.preventDefault(); event.stopImmediatePropagation();
      return setStatus("The admin controls the online rematch.", "ok");
    }
    if (state.role === "host" && state.connected) {
      event.preventDefault();
      event.stopImmediatePropagation();
      state.hostChampion = game.selectedChampion;
      state.arena = game.selectedArena;
      state.startInitiated = false;
      // Server rebuilds the duel and broadcasts type "rematch".
      sendControl({
        type: "rematch",
        inputEpoch: delivery.inputSnapshot().epoch,
        hostChampion: state.hostChampion,
        guestChampion: state.guestChampion,
        arena: state.arena,
        matchTarget: state.matchTarget,
        guestReady: true,
        inviteMode: state.inviteMode
      });
      setStatus("Requesting rematch on the São Paulo server…", "ok");
    }
  }, true);

  readyButton.addEventListener("click", () => {
    if (state.role !== "guest" || !state.connected) return;
    state.guestReady = !state.guestReady;
    sendGuestConfig();
    updateLobbyDisplay();
    setStatus(state.guestReady
      ? `${championName(state.guestChampion)} locked in. Waiting for the admin.`
      : "READY cancelled. You can change your champion.", state.guestReady ? "ok" : "");
  });

  createButton.addEventListener("click", () => {
    closeSetupPanels();
    startQuickMatch({ champion: game.selectedChampion, arena: game.selectedArena });
  });
  showInviteButton.addEventListener("click", () => {
    const opening = invitePresetForm.hidden;
    if (opening) {
      inviteHostSelect.value = validChampion(game.selectedChampion) ? game.selectedChampion : CHAMPIONS[0];
      inviteArenaSelect.value = validArena(game.selectedArena) ? game.selectedArena : ARENAS[0];
      updatePresetSummary();
    }
    closeSetupPanels(opening ? "invite" : "");
    setStatus(opening ? "Set both fighters and the arena, then create the share link." : "Choose a match format.");
    if (opening) inviteHostSelect.focus();
  });
  [inviteHostSelect, inviteGuestSelect, inviteArenaSelect].forEach((select) =>
    select.addEventListener("change", updatePresetSummary)
  );
  invitePresetForm.addEventListener("submit", (event) => {
    event.preventDefault();
    createRoom({
      inviteMode: true,
      hostChampion: inviteHostSelect.value,
      guestChampion: inviteGuestSelect.value,
      arena: inviteArenaSelect.value
    });
  });
  showJoinButton.addEventListener("click", () => {
    const opening = joinForm.hidden;
    closeSetupPanels(opening ? "join" : "");
    setStatus(opening ? "Enter the six-character code shared by the lobby host." : "Choose a match format.");
    if (opening) codeInput.focus();
  });
  offlineButton.addEventListener("click", chooseOffline);
  joinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const code = codeInput.value.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
      setStatus("Enter the six-character lobby code.", "error");
      return codeInput.focus();
    }
    joinRoom(code);
  });
  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6);
  });
  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.inviteMode ? state.inviteUrl : state.roomCode);
      copyButton.textContent = "COPIED";
      setTimeout(() => {
        copyButton.textContent = state.inviteMode ? "COPY INVITE LINK" : "COPY CODE";
      }, 1500);
    } catch {
      if (state.inviteMode) {
        inviteUrlOutput.hidden = false;
        inviteUrlOutput.select();
      } else {
        codeInput.value = state.roomCode;
        joinForm.hidden = false;
        codeInput.select();
      }
    }
  });

  function selectChampionFromClient(champion) {
    if (!validChampion(champion)) return;
    if (state.inviteMode && state.role !== "offline") {
      setStatus("This challenge link has locked champions.", "ok");
      return;
    }
    if (state.role === "guest") {
      state.guestChampion = champion;
      state.guestReady = false;
      void renderer.ensureChampionModel(champion);
      sendGuestConfig();
      updateLobbyDisplay();
      setStatus(`${championName(champion)} selected. Press READY when finished.`, "ok");
      return;
    }
    game.selectChampion(champion);
    state.hostChampion = champion;
    if (state.role === "host") {
      state.guestReady = false;
      sendLobby();
      updateLobbyDisplay();
    }
    publishClientState("champion");
  }

  function selectRivalChampionFromClient(champion) {
    if (!validChampion(champion)) return;
    if (state.inviteMode && state.role !== "offline") {
      setStatus("This challenge link has locked champions.", "ok");
      return;
    }
    if (state.role !== "offline") return;
    game.selectChampion2(champion);
    state.guestChampion = champion;
    publishClientState("rival-champion");
  }

  function selectArenaFromClient(arena) {
    if (!validArena(arena)) return;
    if (state.role === "guest") {
      setStatus("Only the lobby admin chooses the arena.", "error");
      return;
    }
    if (state.inviteMode && state.role !== "offline") {
      setStatus("This challenge link has a locked arena.", "ok");
      return;
    }
    game.selectArena(arena);
    state.arena = arena;
    if (state.role === "host") {
      state.guestReady = false;
      sendLobby();
      updateLobbyDisplay();
    }
    publishClientState("arena");
  }

  async function startOfflineFromClient(payload = {}) {
    // TRAINING_LOCAL_V1: solo/treino must never depend on São Paulo / WebSocket.
    // Always hard-reset to intro first so a sticky online resume/error cannot
    // leave the match engine in a mode that rejects champion/bot selection.
    chooseOffline();
    returnToSetupState();
    clearSession();
    setBusy(false);
    setStatus("Preparando treino local…", "ok");

    const champion = validChampion(payload.champion) ? payload.champion : "katarina";
    const guestChampion = validChampion(payload.guestChampion) ? payload.guestChampion : "zed";
    const arena = validArena(payload.arena) ? payload.arena : ARENAS[0];
    const botId = typeof payload.bot === "string" ? payload.bot : "";

    game.mode = "intro";
    game.p2Human = false;
    game.matchTarget = 3;
    if (game.presentation) game.presentation.matchTarget = 3;

    game.selectChampion(champion);
    if (payload.mode === "local") {
      game.selectChampion2(guestChampion);
      game.activatePlayerTwo();
    } else {
      await ensureV1BotBundle();
      // Prefer the trained V1 profile; fall back to champion + baseline/V1 policy.
      let selected = false;
      try {
        game.activateBotOpponent();
        selected = Boolean(botId && game.selectBotOpponent(payload.bot));
      } catch (error) {
        console.warn("Bot opponent setup failed; falling back to champion CPU", error);
      }
      if (!selected) {
        game.p2Human = false;
        game.selectChampion2(guestChampion);
      }
    }

    game.selectArena(arena);
    state.hostChampion = champion;
    state.guestChampion = game.selectedChampion2 || guestChampion;
    state.arena = arena;
    state.matchTarget = 3;
    state.role = "offline";
    state.connected = false;
    state.rivalConnected = false;
    state.guestReady = false;
    state.inviteMode = false;
    state.inviteUrl = "";
    state.matchmaking = false;
    state.quickMatch = false;

    // beginGame toggles UI.start; guard so a missing control cannot abort solo.
    if (UI.start) {
      UI.start.disabled = true;
      UI.start.textContent = "Loading selected arena…";
    }
    try {
      await originalBeginGame();
    } catch (error) {
      console.warn("Offline beginGame failed", error);
      returnToSetupState();
      setStatus(
        "Não foi possível iniciar o treino local. Recarregue a página e tente de novo.",
        "error"
      );
      throw error;
    }
    if (UI.start) {
      UI.start.disabled = false;
      UI.start.textContent = "Match ready";
    }
    setStatus("Treino local em andamento.", "ok");
    publishClientState("match");
  }

  async function handleClientCommand(action, payload = {}) {
    if (action === "sync") {
      publishClientState("sync");
      return;
    }
    if (action === "select-champion") {
      selectChampionFromClient(payload.champion);
      return;
    }
    if (action === "select-rival-champion") {
      selectRivalChampionFromClient(payload.champion);
      return;
    }
    if (action === "select-arena") {
      selectArenaFromClient(payload.arena);
      return;
    }
    if (action === "create-room") {
      chooseOffline();
      selectChampionFromClient(payload.champion);
      selectArenaFromClient(payload.arena);
      await createRoom();
      return;
    }
    if (action === "quick-match") {
      await startQuickMatch({ champion: payload.champion, arena: payload.arena });
      return;
    }
    if (action === "cancel-quick-match") {
      cancelQuickMatch();
      return;
    }
    if (action === "create-challenge") {
      await createRoom({
        inviteMode: true,
        hostChampion: payload.hostChampion,
        guestChampion: payload.guestChampion,
        arena: payload.arena
      });
      return;
    }
    if (action === "join-room") {
      const code = String(payload.code || "").trim().toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
        setStatus("Enter the six-character lobby code.", "error");
        return;
      }
      await joinRoom(code, { guestChampion: payload.champion });
      return;
    }
    if (action === "toggle-ready") {
      readyButton.click();
      return;
    }
    if (action === "start-online") {
      await startHostOnlineMatch(false);
      return;
    }
    if (action === "start-offline") {
      await startOfflineFromClient(payload);
      return;
    }
    if (action === "choose-offline" || action === "clear-connection-error") {
      // War Table "Treinamento" selection: drop sticky online resume errors.
      chooseOffline();
      return;
    }
    if (action === "leave-lobby") {
      leaveOnlineSession({ fromMatch: false });
      return;
    }
    if (action === "leave-match") {
      leaveOnlineSession({ fromMatch: true });
      return;
    }
    if (action === "resume-session") {
      await tryResumeSession();
    }
  }

  addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== window.location.origin) return;
    const message = event.data;
    if (
      !message ||
      message.source !== CLIENT_SOURCE ||
      message.version !== CLIENT_BRIDGE_VERSION ||
      message.type !== "command" ||
      typeof message.action !== "string"
    ) {
      return;
    }
    const payload = message.payload && typeof message.payload === "object"
      ? message.payload
      : {};
    void handleClientCommand(message.action, payload).catch((error) => {
      console.warn("Riftbomb client command failed", error);
      const offlineAction = message.action === "start-offline" ||
        message.action === "choose-offline";
      setStatus(
        offlineAction
          ? "Não foi possível iniciar o treino local. Recarregue e tente de novo."
          : "Could not complete that client action. Try again.",
        "error"
      );
    });
  });

  let parentParams = new URLSearchParams();
  try { parentParams = new URLSearchParams(window.parent.location.search); } catch {}
  const parentRoom = parentParams.get("room");
  const directInvite = parentParams.get("invite") === "1" &&
    validChampion(parentParams.get("p1")) && validChampion(parentParams.get("p2")) &&
    validArena(parentParams.get("arena")) && Number(parentParams.get("target")) === INVITE_MATCH_TARGET;
  const startupSession = readSession();
  const resumeParentSession = sessionMatchesRoom(startupSession, parentRoom);
  if (parentRoom && /^[A-HJ-NP-Z2-9]{6}$/i.test(parentRoom)) {
    codeInput.value = parentRoom.toUpperCase();
    if (resumeParentSession) {
      setStatus("Previous session detected. Restoring this lobby…", "ok");
    } else if (directInvite) {
      setStatus("Direct challenge detected. Connecting automatically…", "ok");
      setTimeout(() => joinRoom(parentRoom.toUpperCase(), {
        inviteMode: true,
        hostChampion: parentParams.get("p1"),
        guestChampion: parentParams.get("p2"),
        arena: parentParams.get("arena")
      }));
    } else {
      joinForm.hidden = false;
      setStatus("Lobby code filled in. Click JOIN LOBBY.");
    }
  }

  setTimeout(() => {
    void renderer.ensureChampionModels([state.hostChampion, state.guestChampion]);
  });
  publishClientState("ready");
  // F5 / reload: try to reattach to the last live lobby on this browser tab.
  setTimeout(() => {
    if (parentRoom && !resumeParentSession) return;
    void tryResumeSession().catch((error) => {
      console.warn("Auto resume failed", error);
    });
  }, 120);
})();

// training-local-v1 2026-08-01T11:49:31.4238391-03:00
