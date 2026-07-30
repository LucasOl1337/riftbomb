"use strict";

(() => {
  if (typeof game === "undefined" || typeof UI === "undefined") return;

  const SIGNALING_URL = "/api/pvp";
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
  const SESSION_KEY = "riftbomb-online-session-v1";
  const PENDING_RESUME_KEY = "riftbomb-online-resume-pending-v1";
  const RESUME_PROTOCOL_VERSION = 1;
  const RESUME_TOKEN_BYTES = 32;
  // Covers the legacy server's worst-case 45 s dead-socket heartbeat during a
  // rolling deploy. Authenticated v1 replacement still completes immediately.
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
  const authoritativeAudio = globalThis.RIFTBOMB_AUTHORITATIVE_AUDIO;
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

  function createResumeToken(fillRandom = (bytes) => globalThis.crypto.getRandomValues(bytes)) {
    const bytes = new Uint8Array(RESUME_TOKEN_BYTES);
    fillRandom(bytes);
    return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  }

  function validResumeToken(value) {
    return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  }

  function definitiveResumeFailure(error) {
    return new Set([
      "resume_denied", "resume_expired", "room_not_found", "invalid_resume", "invalid_hello"
    ]).has(error?.message);
  }

  function definitiveInitialConnectionFailure(error) {
    return definitiveResumeFailure(error) ||
      ["role_taken", "room_full"].includes(error?.message);
  }

  async function retryRoleTaken(
    connect,
    {
      delays = RESUME_ROLE_RETRY_DELAYS_MS,
      wait = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
      active = () => true
    } = {}
  ) {
    for (let attempt = 0; ; attempt += 1) {
      if (!active()) throw new Error("resume_cancelled");
      try {
        return await connect();
      } catch (error) {
        if (error?.message !== "role_taken" || attempt >= delays.length || !active()) throw error;
        await wait(delays[attempt]);
      }
    }
  }

  function createLatestSnapshotBuffer() {
    let latest = null;
    const push = (snapshot) => {
      if (!snapshot || !Number.isFinite(snapshot.s) || snapshot.s <= 0 ||
          (latest && snapshot.s <= latest.s)) return false;
      // The server deliberately sends a full grid first after reattach. Preserve
      // it while coalescing later state-only snapshots during asynchronous boot.
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
    const reset = () => { latest = null; };
    const peek = () => latest;
    return Object.freeze({ peek, push, reset, take });
  }

  function createReliableInputStream({
    send,
    now = () => performance.now(),
    retryMs = INPUT_RETRY_MS,
    outboxLimit = INPUT_OUTBOX_LIMIT
  } = {}) {
    if (typeof send !== "function") throw new TypeError("reliable input requires send");
    let epoch = 0;
    let nextSequence = 1;
    let acceptedSequence = 0;
    let acknowledgedSequence = 0;
    let lastMask = -1;
    let replayCount = 0;
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
      if (!cursor) return false;
      if (cursor.epoch < epoch) return false;
      if (cursor.epoch > epoch) {
        epoch = cursor.epoch;
        nextSequence = Math.min(MAX_INPUT_SEQUENCE + 1, cursor.accepted + 1);
        acceptedSequence = cursor.accepted;
        acknowledgedSequence = cursor.ack;
        lastMask = -1;
        outbox = [];
        return true;
      }
      if (cursor.accepted < acceptedSequence || cursor.ack < acknowledgedSequence ||
          cursor.accepted >= nextSequence) return false;
      acceptedSequence = cursor.accepted;
      acknowledgedSequence = cursor.ack;
      nextSequence = Math.max(nextSequence, Math.min(MAX_INPUT_SEQUENCE + 1, cursor.accepted + 1));
      outbox = outbox.filter(({ message }) => message.inputSeq > acknowledgedSequence);
      return true;
    };

    const queue = (mask) => {
      if (!Number.isInteger(mask) || mask < 0 || mask > 15 || epoch <= 0 ||
          mask === lastMask || outbox.length >= outboxLimit ||
          nextSequence > MAX_INPUT_SEQUENCE) return false;
      const message = {
        type: "input",
        mask,
        inputEpoch: epoch,
        inputSeq: nextSequence++
      };
      const entry = { message, sentAt: Number.NEGATIVE_INFINITY };
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

    const reset = () => {
      epoch = 0;
      nextSequence = 1;
      acceptedSequence = 0;
      acknowledgedSequence = 0;
      lastMask = -1;
      replayCount = 0;
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
      replayCount
    });
    const currentEpoch = () => epoch;

    return Object.freeze({ currentEpoch, queue, replay, reset, snapshot, synchronize });
  }

  function createReliableActionStream({
    send,
    persist = () => {},
    now = () => performance.now(),
    retryMs = ACTION_RETRY_MS,
    outboxLimit = ACTION_OUTBOX_LIMIT
  } = {}) {
    if (typeof send !== "function") throw new TypeError("reliable action requires send");
    if (typeof persist !== "function") throw new TypeError("reliable action requires persistence");
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
      try { return persist(persistedState()) !== false; } catch { return false; }
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
        cursor.ack >= nextSequence ||
        outbox.some(({ message }) => message.actionSeq <= cursor.ack);
      const previousHead = outbox[0];
      mode = "reliable";
      acknowledgedSequence = cursor.ack;
      nextSequence = Math.max(
        nextSequence,
        Math.min(MAX_ACTION_SEQUENCE + 1, cursor.ack + 1)
      );
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
          saved.acknowledgedSequence < 0 ||
          saved.acknowledgedSequence >= saved.nextSequence ||
          !Array.isArray(saved.outbox) || saved.outbox.length > outboxLimit ||
          saved.nextSequence !== saved.acknowledgedSequence + saved.outbox.length + 1) return false;
      const restored = [];
      for (let index = 0; index < saved.outbox.length; index += 1) {
        const message = saved.outbox[index];
        const expectedSequence = saved.acknowledgedSequence + index + 1;
        if (!message || message.type !== "action" ||
            !validAction(message.kind, message.slot) || !validRound(message.actionRound) ||
            message.actionEpoch !== saved.epoch ||
            message.actionSeq !== expectedSequence) return false;
        const restoredMessage = {
          type: "action",
          kind: message.kind,
          actionEpoch: message.actionEpoch,
          actionSeq: message.actionSeq,
          actionRound: message.actionRound
        };
        if (message.kind === "ability") restoredMessage.slot = message.slot;
        restored.push({ message: restoredMessage, sentAt: Number.NEGATIVE_INFINITY });
      }
      epoch = saved.epoch;
      nextSequence = saved.nextSequence;
      acknowledgedSequence = saved.acknowledgedSequence;
      outbox = restored;
      return true;
    };

    const queue = (kind, slot, round) => {
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
      if (kind === "ability") message.slot = slot;
      const entry = { message, sentAt: Number.NEGATIVE_INFINITY };
      outbox.push(entry);
      // The durable tab session must contain the envelope before its first
      // transmission so an F5 between send and ACK can replay the same action.
      if (!persistNow()) {
        outbox.pop();
        nextSequence -= 1;
        failure = "storage";
        return false;
      }
      if (outbox.length === 1) transmit(entry);
      return true;
    };

    const replay = () => {
      if (mode !== "reliable" || !outbox.length ||
          now() - outbox[0].sentAt < retryMs) return false;
      transmit(outbox[0], true);
      return true;
    };
    const reset = () => clear();
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
    const currentMode = () => mode;
    const currentFailure = () => failure;

    return Object.freeze({
      currentFailure, currentMode, hydrate, negotiate, persistedState, queue, replay, reset,
      snapshot, synchronize
    });
  }

  const state = {
    role: "offline",
    roomCode: "",
    hostToken: "",
    resumeToken: "",
    resuming: false,
    resumePhase: "",
    sessionConfirmed: false,
    socket: null,
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
    remoteHostTarget: null,
    localPlayerTarget: null,
    pendingGuestBombs: [],
    hostChampion: game.selectedChampion,
    guestChampion: "zed",
    arena: game.selectedArena,
    matchTarget: 3,
    guestRound: 0,
    guestMode: "intro",
    lastLegacyInput: -1
  };

  const bufferedSnapshots = createLatestSnapshotBuffer();
  let lifecycleGeneration = 0;
  let matchRuntimeEpoch = 0;
  let runtimeBootRecord = null;
  let runtimeBootTail = Promise.resolve();
  let pendingConnectCancel = null;

  const reliableInput = createReliableInputStream({ send: sendControl });
  const reliableAction = createReliableActionStream({
    send: sendControl,
    persist: () => saveSession()
  });
  setInterval(() => {
    if (!state.connected) return;
    reliableInput.replay();
    reliableAction.replay();
  }, INPUT_RETRY_MS);
  // Timers are suspended automatically while a page is in BFCache. Clearing
  // this interval on pagehide would make a restored match lose replay forever.

  const panel = document.createElement("section");
  panel.className = "online-panel";
  panel.dataset.mode = "offline";
  panel.setAttribute("aria-label", "Online PvP lobby");
  panel.innerHTML = `
    <div class="online-panel__head">
      <div>
        <span class="online-kicker">ONLINE PVP</span>
        <strong>CREATE YOUR DUEL</strong>
        <span class="online-panel__lede">Pick a format. The match runs on our São Paulo server.</span>
      </div>
      <span class="online-server"><i aria-hidden="true"></i> SÃO PAULO · ONLINE</span>
    </div>
    <div class="online-panel__actions">
      <button type="button" class="online-action online-action--primary" id="online-create">
        <span class="online-action__index">01</span>
        <span><strong>QUICK MATCH</strong><small>Automatic opponent · current champion + arena · first to 3</small></span>
        <b aria-hidden="true">→</b>
      </button>
      <button type="button" class="online-action" id="online-show-invite" aria-expanded="false" aria-controls="online-invite-preset">
        <span class="online-action__index">02</span>
        <span><strong>CHALLENGE LINK</strong><small>Preset both fighters + arena · first to 10</small></span>
        <b aria-hidden="true">+</b>
      </button>
      <button type="button" class="online-action" id="online-show-join" aria-expanded="false" aria-controls="online-join-form">
        <span class="online-action__index">03</span>
        <span><strong>JOIN A LOBBY</strong><small>Enter a six-character room code</small></span>
        <b aria-hidden="true">→</b>
      </button>
      <button type="button" class="online-action online-action--quiet" id="online-offline">
        <span><strong>SOLO / LOCAL</strong><small>Play on this device</small></span>
        <b aria-hidden="true">↗</b>
      </button>
    </div>
    <form class="online-invite-preset" id="online-invite-preset" hidden>
      <div class="online-form__head">
        <span class="online-kicker">CHALLENGE SETUP</span>
        <strong>Lock the match before sharing</strong>
        <small>Your opponent opens the link and joins with this exact preset.</small>
      </div>
      <div class="online-form__fields">
        <label><span>YOUR CHAMPION</span><select id="online-invite-host">
          ${CHAMPIONS.map((champion) => `<option value="${champion}">${championNameSafe(champion)}</option>`).join("")}
        </select></label>
        <label><span>RIVAL CHAMPION</span><select id="online-invite-guest">
          ${CHAMPIONS.map((champion) => `<option value="${champion}"${champion === "zed" ? " selected" : ""}>${championNameSafe(champion)}</option>`).join("")}
        </select></label>
        <label><span>ARENA</span><select id="online-invite-arena">
          ${ARENAS.map((arena) => `<option value="${arena}">${ARENA_NAMES[arena]}</option>`).join("")}
        </select></label>
      </div>
      <div class="online-form__submit">
        <span class="micro" id="online-preset-summary">KATARINA VS ZED · FIRST TO 10</span>
        <button type="submit">CREATE CHALLENGE LINK <b aria-hidden="true">→</b></button>
      </div>
    </form>
    <form class="online-panel__join" id="online-join-form" hidden>
      <div class="online-form__head">
        <span class="online-kicker">JOIN LOBBY</span>
        <strong>Enter the room code</strong>
        <small>Ask the host for the six characters shown in their lobby.</small>
      </div>
      <div class="online-join-code">
        <label class="sr-only" for="online-code">Lobby code</label>
        <input id="online-code" name="code" maxlength="6" autocomplete="off"
          inputmode="text" placeholder="------" aria-label="Six character lobby code">
        <button type="submit">CONNECT <b aria-hidden="true">→</b></button>
      </div>
    </form>
    <div class="online-panel__lobby" id="online-lobby" hidden>
      <ol class="online-lobby-progress" aria-label="Lobby progress">
        <li data-progress="created"><i>1</i><span>ROOM CREATED</span></li>
        <li data-progress="connected"><i>2</i><span>RIVAL CONNECTED</span></li>
        <li data-progress="ready"><i>3</i><span>READY TO FIGHT</span></li>
      </ol>
      <div class="online-panel__room">
        <div class="online-room-identity"><span class="micro" id="online-room-label">LOBBY CODE</span>
          <div class="online-room-code" id="online-room-code" aria-live="polite">------</div></div>
        <button type="button" id="online-copy">COPY CODE</button>
      </div>
      <input class="online-invite-url" id="online-invite-url" readonly hidden
        aria-label="Direct challenge invite link">
      <div class="online-players">
        <article class="online-player" data-player="host">
          <span class="online-player__badge">P1</span>
          <span class="online-player__info"><span class="online-player__side">HOST · BLUE</span><strong id="online-host-champion">Katarina</strong></span>
          <span class="online-player__state" id="online-host-state">HOST</span>
        </article>
        <article class="online-player" data-player="guest">
          <span class="online-player__badge">P2</span>
          <span class="online-player__info"><span class="online-player__side">RIVAL · RED</span><strong id="online-guest-champion">Zed</strong></span>
          <span class="online-player__state" id="online-guest-state">WAITING</span>
        </article>
      </div>
      <div class="online-ready-row">
        <span class="micro" id="online-role-help">Admin chooses the arena.</span>
        <button type="button" id="online-ready" hidden>I'M READY</button>
      </div>
    </div>
    <p class="online-status micro" id="online-status" role="status" aria-live="polite">
      Choose Quick Lobby, create a preset challenge, or join a friend.
    </p>
  `;
  document.querySelector(".intro-actions")?.before(panel);

  const connection = document.createElement("div");
  connection.className = "online-connection";
  connection.hidden = true;
  connection.textContent = "Online link";
  document.body.appendChild(connection);

  const actionAlert = document.createElement("div");
  actionAlert.className = "online-action-alert";
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
    if (state.resuming || runtimeBootRecord) return "boot";
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
      inputDelivery: reliableInput.snapshot(),
      actionDelivery: reliableAction.snapshot(),
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
    clearSavedSession();
    clearPendingResume();
  }

  function clearSavedSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  }

  function clearPendingResume() {
    try { sessionStorage.removeItem(PENDING_RESUME_KEY); } catch {}
  }

  function saveSession() {
    try {
      if (state.role === "offline" || !state.roomCode) {
        // Startup status publications happen before auto-resume while the
        // iframe still reports its initial offline role. Only explicit
        // cancel/leave/failure flows are allowed to erase a saved credential.
        return false;
      }
      // Persist even while briefly disconnected so F5 can reattach.
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
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
        confirmed: Boolean(state.sessionConfirmed),
        actionDelivery: reliableAction.persistedState(),
        savedAt: Date.now()
      }));
      return true;
    } catch {
      return false;
    }
  }

  function readSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.roomCode || !data?.role) return null;
      if (!/^[A-HJ-NP-Z2-9]{6}$/.test(String(data.roomCode))) return null;
      if (data.role !== "host" && data.role !== "guest") return null;
      if (data.resumeToken !== undefined && data.resumeToken !== "" &&
          !validResumeToken(data.resumeToken)) return null;
      return data;
    } catch {
      return null;
    }
  }

  function sessionMatchesRoom(session, room) {
    return Boolean(session && typeof room === "string" &&
      session.roomCode === room.toUpperCase());
  }

  function savePendingResume() {
    if (!validResumeToken(state.resumeToken) || !state.quickMatch || state.roomCode) return;
    try {
      sessionStorage.setItem(PENDING_RESUME_KEY, JSON.stringify({
        resumeToken: state.resumeToken,
        quickMatch: true,
        hostChampion: state.hostChampion,
        arena: state.arena,
        savedAt: Date.now()
      }));
    } catch {}
  }

  function readPendingResume() {
    try {
      const data = JSON.parse(sessionStorage.getItem(PENDING_RESUME_KEY) || "null");
      if (!data?.quickMatch || !validResumeToken(data.resumeToken)) {
        clearPendingResume();
        return null;
      }
      return data;
    } catch {
      clearPendingResume();
      return null;
    }
  }

  function ensureResumeToken() {
    if (!validResumeToken(state.resumeToken)) {
      state.resumeToken = readPendingResume()?.resumeToken || createResumeToken();
    }
    // Persist before opening the socket. A lost `connected` frame must not lock
    // this browser out of the seat it just protected.
    if (state.roomCode) saveSession();
    else savePendingResume();
    return state.resumeToken;
  }

  function returnToIntroUi() {
    try {
      game.mode = "intro";
      game.p2Human = false;
      game.matchTarget = 3;
      game.presentation.matchTarget = 3;
      game.resetPlayers?.();
      if (UI.end) UI.end.hidden = true;
      if (UI.intro) UI.intro.classList.remove("is-gone");
      if (UI.chrome) {
        UI.chrome.classList.add("is-hidden");
        UI.chrome.setAttribute("aria-hidden", "true");
        UI.chrome.setAttribute("inert", "");
      }
      UI.start.disabled = false;
      UI.start.textContent = `>>> DEPLOY ${game.player?.name?.toUpperCase?.() || "KATARINA"}`;
    } catch (error) {
      console.warn("Could not fully reset intro UI", error);
    }
  }

  function leaveOnlineSession({ fromMatch = false } = {}) {
    const wasPlaying = game.mode === "playing" || game.mode === "matchover";
    releaseCurrentSeat();
    try { state.socket?.close(); } catch {}
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
    if (wasPlaying || fromMatch) returnToIntroUi();
    else if (game.mode === "intro") game.resetPlayers?.();
    UI.start.disabled = false;
    UI.start.textContent = `>>> DEPLOY ${game.player?.name?.toUpperCase?.() || "KATARINA"}`;
    setStatus(
      fromMatch
        ? "You left the match. Create or join a lobby to play again."
        : "Left the online lobby.",
      "ok"
    );
    publishClientState(fromMatch ? "left-match" : "left-lobby");
  }

  function cancelQuickMatch() {
    pendingConnectCancel?.();
    pendingConnectCancel = null;
    const socket = state.socket;
    state.socket = null;
    state.matchmaking = false;
    state.quickMatch = false;
    clearSession();
    try {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "cancel-quick-match" }));
      }
      socket?.close();
    } catch {}
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

  function setChampionButtons(champion) {
    UI.championChoices.forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.champion === champion))
    );
  }

  function setArenaButtons(arena) {
    UI.arenaChoices.forEach((button) =>
      button.setAttribute("aria-checked", String(button.dataset.arena === arena))
    );
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
    state.role = role;
    game.sfx = role === "offline" ? browserGameplaySfx : authoritativePredictionSink;
    panel.dataset.mode = role;
    document.body.classList.toggle("is-online-match", role !== "offline");
    lobbyBox.hidden = role === "offline";
    panel.querySelector(".online-panel__head strong").textContent = role === "offline" ? "CREATE YOUR DUEL" : "MATCH LOBBY";
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

  function messageInputEpoch(message) {
    const epoch = message?.input?.epoch;
    if (Number.isSafeInteger(epoch) && epoch > 0) return epoch;
    if (message?.type === "rematch") {
      if (game.mode !== "matchover" && matchRuntimeEpoch > 0) return matchRuntimeEpoch;
      return Math.max(1, matchRuntimeEpoch + 1);
    }
    return Math.max(1, matchRuntimeEpoch);
  }

  async function ensureOnlineMatchRuntime(message, generation) {
    const epoch = messageInputEpoch(message);
    if (matchRuntimeEpoch === epoch && game.mode !== "intro") return true;
    if (runtimeBootRecord?.generation === generation && runtimeBootRecord.epoch === epoch) {
      return runtimeBootRecord.promise;
    }

    const promise = runtimeBootTail.catch(() => undefined).then(async () => {
      if (generation !== lifecycleGeneration || state.role === "offline") return false;
      await beginConfiguredGame();
      if (generation !== lifecycleGeneration || state.role === "offline") {
        returnToIntroUi();
        return false;
      }
      matchRuntimeEpoch = epoch;
      return true;
    });
    runtimeBootRecord = { epoch, generation, promise };
    runtimeBootTail = promise.catch(() => undefined);
    try {
      return await promise;
    } finally {
      if (runtimeBootRecord?.promise === promise) runtimeBootRecord = null;
    }
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
    pendingConnectCancel?.();
    pendingConnectCancel = null;
    const resumeToken = ensureResumeToken();
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(AUTHORITATIVE_SERVER_URL);
      state.socket = socket;
      let settled = false;
      let connectedReceived = false;
      let timeout = 0;
      let cancelPending = null;
      const clearPendingCancel = () => {
        if (pendingConnectCancel === cancelPending) pendingConnectCancel = null;
      };
      const failBeforeSettled = (reason) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearPendingCancel();
        if (connectedReceived) state.connected = false;
        try { socket.close(); } catch {}
        reject(new Error(reason));
      };
      const succeed = (message) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearPendingCancel();
        resolve(message);
      };
      cancelPending = () => failBeforeSettled("resume_cancelled");
      pendingConnectCancel = cancelPending;
      timeout = setTimeout(() => {
        if (state.socket !== socket) return;
        failBeforeSettled("authoritative_server_timeout");
      }, 12_000);
      socket.addEventListener("open", () => {
        if (state.socket !== socket) return;
        socket.send(JSON.stringify(quickMatch
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
              resumeOnly: resume && (
                resumePhase === "match" || state.sessionConfirmed
              ),
              room: state.roomCode,
              role,
              ready: role === "guest" && state.guestReady,
              preset: lobbyPayload()
            }));
      });
      socket.addEventListener("message", (event) => {
        if (state.socket !== socket) return;
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === "error") {
          failBeforeSettled(message.error || "authoritative_server_error");
          return;
        }
        if (message.type === "quick-queued") {
          clearTimeout(timeout);
          settled = true;
          state.matchmaking = true;
          state.quickMatch = true;
          setBusy(true);
          setStatus("Buscando outro jogador no Quick Match…", "ok");
          updateConnection("waiting", "QUICK MATCH · BUSCANDO OPONENTE");
          publishClientState("quick-queued");
          resolve();
          return;
        }
        if (message.type === "connected") {
          const wasConfirmed = state.sessionConfirmed;
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
          const seatIndex = localOnlinePlayerId() - 1;
          reliableInput.synchronize(message.input, seatIndex);
          reliableAction.negotiate(message.action, seatIndex);
          connectedReceived = true;
          const freshLobbyClaim = resume && resumePhase === "lobby" && !wasConfirmed &&
            message.resume?.v === RESUME_PROTOCOL_VERSION &&
            message.resume.resumed === false;
          if (resume && message.resume?.v === RESUME_PROTOCOL_VERSION &&
              message.resume.resumed !== true && !freshLobbyClaim) {
            failBeforeSettled("resume_denied");
            return;
          }
          if (Number.isSafeInteger(message.soundCursor) && message.soundCursor >= 0) {
            state.lastPlayedSoundEventId = Math.max(
              state.lastPlayedSoundEventId,
              message.soundCursor
            );
          }
          void onConnected({ resuming: resume });
          if (freshLobbyClaim) {
            // The page may have reloaded after persisting its bearer but before
            // the first hello reached the server. The protected lobby claim is
            // valid even though there was no prior seat to replace.
            handleControl({
              ...lobbyPayload(),
              type: "resume",
              activeMatch: false,
              input: message.input
            });
            succeed(message);
            return;
          }
          if (resume && message.resume?.v !== RESUME_PROTOCOL_VERSION) {
            // Rolling compatibility with an older authoritative server. New
            // servers always follow with an explicit authenticated `resume`.
            handleControl({
              ...lobbyPayload(),
              type: "resume",
              activeMatch: resumePhase === "match",
              input: message.input
            });
          }
          if (!resume || message.resume?.v !== RESUME_PROTOCOL_VERSION) {
            succeed(message);
          }
          return;
        }
        if (message.type === "snapshot") {
          try { receiveSnapshot(message.data); }
          catch (error) { console.warn("Ignored invalid authoritative snapshot", error); }
          return;
        }
        if (message.type === "ping") {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "pong", clientTime: Date.now() }));
          }
          return;
        }
        if (message.type === "presence") {
          if (message.playerId === localOnlinePlayerId()) return;
          state.rivalConnected = message.connected === true;
          if (state.rivalConnected) {
            setStatus(`Player ${message.playerId} reconnected. Match continues.`, "ok");
            updateConnection("connected", `ONLINE · LOBBY ${state.roomCode} · PLAYER ${message.playerId} RECONNECTED`);
          } else {
            setStatus(`Player ${message.playerId} disconnected. Waiting briefly for reconnection.`, "error");
            updateConnection("waiting", `ONLINE · LOBBY ${state.roomCode} · RECONNECTING PLAYER ${message.playerId}`);
          }
          updateLobbyDisplay();
          return;
        }
        handleControl(message);
        if (resume && message.type === "resume" && !settled) {
          succeed(message);
        }
      });
      socket.addEventListener("close", () => {
        clearTimeout(timeout);
        if (state.socket !== socket) return;
        if (!settled) failBeforeSettled("authoritative_server_unavailable");
        else handleDisconnect();
      });
      socket.addEventListener("error", () => {
        if (state.socket !== socket) return;
        if (!settled) failBeforeSettled("authoritative_server_unavailable");
      });
    });
  }

  async function onConnected({ resuming = false } = {}) {
    const transportOpen = state.socket?.readyState === WebSocket.OPEN;
    if (state.connected || !transportOpen) return;
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
      setChampionButtons(state.guestChampion);
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
      if (wasPlaying) returnToIntroUi();
      setStatus("The host closed this lobby. Create or join another one.", "error");
      return;
    }
    if (message.type === "start" || message.type === "rematch" || message.type === "resume") {
      const seatIndex = localOnlinePlayerId() - 1;
      reliableInput.synchronize(message.input, seatIndex);
      reliableAction.synchronize(message.action, seatIndex);
      if (reliableInput.currentEpoch() <= 0) state.lastLegacyInput = -1;
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
    if (state.socket?.readyState !== WebSocket.OPEN) return false;
    try {
      state.socket.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
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
    setChampionButtons(state.role === "guest" ? state.guestChampion : state.hostChampion);
    setArenaButtons(state.arena);
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

    const generation = lifecycleGeneration;
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
      if (!await ensureOnlineMatchRuntime(message, generation)) return;
    } catch (error) {
      if (generation !== lifecycleGeneration) return;
      console.warn("Could not initialize authoritative match runtime", error);
      state.resuming = false;
      setBusy(false);
      setStatus("Could not restore the online match runtime.", "error");
      return;
    }
    game.p2Human = true;
    // Always re-bind seat/camera after start — beginGame may reset presentation to P1.
    bindLocalOnlineView();
    const bufferedSnapshot = bufferedSnapshots.take();
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
    if (!data || ![2, 3].includes(data.v) || !Array.isArray(data.players)) return;
    if (Number.isFinite(data.s) && data.s <= state.receivedSequence) return;
    // ACK/outbox state is current even while rendering waits for model/runtime boot.
    const seatIndex = localOnlinePlayerId() - 1;
    reliableInput.synchronize(data.input, seatIndex);
    reliableAction.synchronize(data.action, seatIndex);
    const runtimeUnavailable = state.resuming || runtimeBootRecord ||
      (state.role !== "offline" && game.mode === "intro" && reliableInput.currentEpoch() > 0);
    if (runtimeUnavailable) {
      bufferedSnapshots.push(data);
      return;
    }
    applySnapshot(data);
  }

  function applySnapshot(data) {
    if (!data || ![2, 3].includes(data.v) || !Array.isArray(data.players)) return;
    if (Number.isFinite(data.s) && data.s <= state.receivedSequence) return;
    const seatIndex = localOnlinePlayerId() - 1;
    reliableInput.synchronize(data.input, seatIndex);
    reliableAction.synchronize(data.action, seatIndex);
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
      const distance = Math.hypot(
        authoritativeLocal.x - previousLocal.x,
        authoritativeLocal.z - previousLocal.z
      );
      if (typeof game.canMoveContestant === "function" &&
          !game.canMoveContestant(authoritativeLocal)) {
        // A commitment snapshot is already the visual authority. Never blend
        // toward a stale pre-cast prediction while Zed vanishes or dashes.
        state.localPlayerTarget = null;
      } else {
        state.localPlayerTarget = {
          playerId: authoritativeLocal.id,
          x: authoritativeLocal.x,
          z: authoritativeLocal.z
        };
        if (distance < game.tile) {
          authoritativeLocal.x = previousLocal.x;
          authoritativeLocal.z = previousLocal.z;
        } else {
          state.localPlayerTarget = null;
        }
      }
    }
    if (previousRemote && authoritativeRemote && data.round === previousRound) {
      const distance = Math.hypot(
        authoritativeRemote.x - previousRemote.x,
        authoritativeRemote.z - previousRemote.z
      );
      state.remoteHostTarget = {
        playerId: authoritativeRemote.id,
        x: authoritativeRemote.x, z: authoritativeRemote.z,
        moving: authoritativeRemote.moving,
        lastDx: authoritativeRemote.lastDx, lastDz: authoritativeRemote.lastDz
      };
      if (distance < game.tile * 1.75) {
        authoritativeRemote.x = previousRemote.x;
        authoritativeRemote.z = previousRemote.z;
      } else {
        state.remoteHostTarget = null;
      }
    }
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
    if (!player?.alive || game.mode !== "playing" || game.roundLocked) return;
    if (typeof game.canMoveContestant === "function" && !game.canMoveContestant(player)) {
      player.moving = false;
      return;
    }
    const input = state.role === "guest" ? state.localInput : hostLocalInput();
    let dx = Number(input.right) - Number(input.left);
    let dz = Number(input.down) - Number(input.up);
    const length = Math.hypot(dx, dz);
    if (length > 0) {
      if (player.ultChannel > 0) game.cancelKatarinaChannel?.(player, "movement");
      dx /= length; dz /= length;
      player.lastDx = dx; player.lastDz = dz; player.moving = true;
      game.moveEntity(player, dx, dz, player.speed, dt, 0.3);
    } else player.moving = false;
  }

  function interpolateRemoteHost(dt) {
    const target = state.remoteHostTarget;
    const remote = game.players.find((player) => player.id === target?.playerId);
    if (!remote || !target || game.mode !== "playing") return;
    const blend = 1 - Math.exp(-24 * dt);
    remote.x += (target.x - remote.x) * blend;
    remote.z += (target.z - remote.z) * blend;
    remote.moving = target.moving;
    remote.lastDx = target.lastDx;
    remote.lastDz = target.lastDz;
    if (Math.hypot(target.x - remote.x, target.z - remote.z) < 0.008) {
      remote.x = target.x;
      remote.z = target.z;
    }
  }

  function reconcileLocalPlayer(dt) {
    const target = state.localPlayerTarget;
    const local = game.players.find((player) => player.id === target?.playerId);
    if (!local || !target || game.mode !== "playing") return;
    if (typeof game.canMoveContestant === "function" && !game.canMoveContestant(local)) {
      state.localPlayerTarget = null;
      return;
    }
    const blend = 1 - Math.exp(-10 * dt);
    local.x += (target.x - local.x) * blend;
    local.z += (target.z - local.z) * blend;
    if (Math.hypot(target.x - local.x, target.z - local.z) < 0.006) {
      local.x = target.x;
      local.z = target.z;
      state.localPlayerTarget = null;
    }
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

  function sendMovementInput(mask) {
    if (reliableInput.currentEpoch() <= 0) {
      if (mask === state.lastLegacyInput) return false;
      const sent = sendControl({ type: "input", mask });
      if (sent) state.lastLegacyInput = mask;
      return sent;
    }
    state.lastLegacyInput = -1;
    if (!reliableInput.queue(mask)) reliableInput.replay();
    return true;
  }

  function sendCurrentInput() {
    if (state.role === "host") state.localInput = hostLocalInput();
    sendMovementInput(inputMask());
  }

  const originalUpdate = game.update.bind(game);
  game.update = (dt) => {
    if (state.role !== "offline" && state.connected && state.socket) {
      if (state.role === "guest") syncGuestStickInput();
      sendCurrentInput();
      reconcileLocalPlayer(dt);
      predictLocalMovement(dt);
      interpolateRemoteHost(dt);
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
    setChampionButtons(state.role === "guest" ? state.guestChampion : state.hostChampion);
    setArenaButtons(state.arena);
  }

  async function startQuickMatch(options = {}) {
    const pendingToken = validResumeToken(options.resumeToken) ? options.resumeToken : "";
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
    setChampionButtons(state.hostChampion);
    setArenaButtons(state.arena);
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
    setChampionButtons(state.guestChampion);
    setBusy(true);
    setStatus(state.inviteMode ? `Activating challenge ${code}…` : `Joining lobby ${code}…`);
    updateLobbyDisplay();
    try {
      await signaling("GET", null, `?code=${encodeURIComponent(code)}`);
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
    if (definitiveInitialConnectionFailure(error)) clearSession();
    setBusy(false);
    setOnlineRole("offline");
    const message = error?.message === "room_not_found"
      ? "Lobby not found or expired. Check the code."
      : error?.message === "room_full"
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
    pendingConnectCancel?.();
    pendingConnectCancel = null;
    try { state.socket?.close(); } catch {}
    lifecycleGeneration += 1;
    matchRuntimeEpoch = 0;
    runtimeBootRecord = null;
    bufferedSnapshots.reset();
    Object.assign(state, {
      socket: null,
      connected: false, rivalConnected: false, guestReady: false, hostToken: "", resumeToken: "",
      resuming: false, resumePhase: "", sessionConfirmed: false, roomCode: "",
      matchmaking: false, quickMatch: false,
      inviteMode: false, inviteUrl: "", startInitiated: false, inviteAssetsReady: null, matchTarget: 3,
      receivedSequence: 0,
      lastPlayedSoundEventId: 0,
      droppedSoundEventCount: 0,
      localInput: { up: false, down: false, left: false, right: false },
      remoteHostTarget: null, localPlayerTarget: null,
      pendingGuestBombs: [], lastLegacyInput: -1
    });
    reliableInput.reset();
    reliableAction.reset();
  }

  function chooseOffline() {
    releaseCurrentSeat();
    try { state.socket?.close(); } catch {}
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
    if (game.mode === "playing" || game.mode === "matchover") returnToIntroUi();
    else if (game.mode === "intro") game.resetPlayers();
    UI.start.disabled = false;
    UI.start.textContent = `>>> DEPLOY ${game.player.name.toUpperCase()}`;
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
    state.resumeToken = validResumeToken(saved.resumeToken) ? saved.resumeToken : createResumeToken();
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
    reliableAction.hydrate(saved.actionDelivery);
    setOnlineRole(saved.role);
    setChampionButtons(saved.role === "guest" ? state.guestChampion : state.hostChampion);
    setArenaButtons(state.arena);
    roomLabel.textContent = state.inviteMode ? "CHALLENGE LINK · RESUME" : "LOBBY CODE · RESUME";
    roomCode.textContent = state.roomCode;
    if (saved.role === "host" && state.inviteMode) state.inviteUrl = challengeUrl(state.roomCode);
    setBusy(true);
    setStatus(`Reconnecting to ${state.resumePhase} ${saved.roomCode}…`, "ok");
    updateLobbyDisplay();
    saveSession();
    const resumeGeneration = lifecycleGeneration;
    try {
      await retryRoleTaken(() => connectAuthoritative(saved.role, {
        resume: true,
        resumePhase: state.resumePhase
      }), {
        active: () => lifecycleGeneration === resumeGeneration &&
          state.resuming && state.role === saved.role
      });
      return true;
    } catch (error) {
      if (error?.message === "resume_cancelled" || lifecycleGeneration !== resumeGeneration) {
        return false;
      }
      console.warn("Session resume failed", error);
      const credentialRejected = definitiveResumeFailure(error);
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

  function inputMask() {
    return Number(state.localInput.up) |
      (Number(state.localInput.down) << 1) |
      (Number(state.localInput.left) << 2) |
      (Number(state.localInput.right) << 3);
  }

  function sendInput() {
    sendMovementInput(inputMask());
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

  function sendOnlineAction(kind, slot) {
    if (reliableAction.currentMode() === "reliable") {
      const queued = reliableAction.queue(kind, slot, game.round);
      if (!queued && reliableAction.currentFailure() === "storage") {
        const message = "Action blocked: browser storage is unavailable. Reload after enabling site data.";
        setStatus(message, "error");
        showActionDeliveryError(message);
      }
      if (queued) clearActionDeliveryError();
      return queued;
    }
    if (reliableAction.currentMode() !== "legacy") return false;
    const message = { type: "action", kind };
    if (kind === "ability") message.slot = slot;
    return sendControl(message);
  }

  game.placeBomb = (player) => {
    if (state.role === "offline" || !state.connected || !state.socket) {
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

  game.castAbility = (slot, player) => {
    if (state.role === "offline" || !state.connected || !state.socket) {
      return offlineCastAbility(slot, player || game.player);
    }
    if (!Number.isInteger(slot)) return false;
    const local = localOnlinePlayer();
    const actor = player?.id === local?.id ? player : local;
    if (!actor) return false;
    if (!sendOnlineAction("ability", slot)) return false;
    // The server owns postponed-spell buffering. Keep immediate local
    // prediction for legal casts, but never leave a client-only buffered cast
    // that could survive a snapshot or execute twice.
    return offlineCastAbility(slot, actor, { buffer: false });
  };

  if (typeof offlineRequestDash === "function") {
    game.requestDash = (player) => {
      if (state.role === "offline" || !state.connected || !state.socket) {
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
    if (kind === "ability" && Number.isInteger(slot)) game.castAbility(slot, guest);
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
        inputEpoch: reliableInput.snapshot().epoch,
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

  UI.championChoices.forEach((button) => {
    button.addEventListener("click", (event) => {
      if (!state.inviteMode || state.role === "offline") return;
      event.preventDefault(); event.stopImmediatePropagation();
      setStatus("This challenge link has locked champions.", "ok");
    }, true);
    button.addEventListener("click", (event) => {
      if (state.role !== "guest") return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!validChampion(button.dataset.champion)) return;
      state.guestChampion = button.dataset.champion;
      void renderer.ensureChampionModel(state.guestChampion);
      state.guestReady = false;
      setChampionButtons(state.guestChampion);
      sendGuestConfig();
      updateLobbyDisplay();
      setStatus(`${championName(state.guestChampion)} selected. Press READY when finished.`, "ok");
    }, true);
    button.addEventListener("click", () => {
      if (state.role !== "host") return;
      state.hostChampion = game.selectedChampion;
      state.guestReady = false;
      updateLobbyDisplay();
      sendLobby();
    });
  });

  UI.arenaChoices.forEach((button) => {
    button.addEventListener("click", (event) => {
      if (!state.inviteMode || state.role === "offline") return;
      event.preventDefault(); event.stopImmediatePropagation();
      setStatus("This challenge link has a locked arena.", "ok");
    }, true);
    button.addEventListener("click", (event) => {
      if (state.role !== "guest") return;
      event.preventDefault(); event.stopImmediatePropagation();
      setStatus("Only the lobby admin chooses the arena.", "error");
    }, true);
    button.addEventListener("click", () => {
      if (state.role !== "host") return;
      state.arena = game.selectedArena;
      state.guestReady = false;
      updateLobbyDisplay();
      sendLobby();
    });
  });

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
      setChampionButtons(champion);
      sendGuestConfig();
      updateLobbyDisplay();
      setStatus(`${championName(champion)} selected. Press READY when finished.`, "ok");
      return;
    }
    game.selectChampion(champion);
    state.hostChampion = champion;
    setChampionButtons(champion);
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
    setArenaButtons(arena);
    if (state.role === "host") {
      state.guestReady = false;
      sendLobby();
      updateLobbyDisplay();
    }
    publishClientState("arena");
  }

  async function startOfflineFromClient(payload = {}) {
    chooseOffline();
    const champion = validChampion(payload.champion) ? payload.champion : "katarina";
    const guestChampion = validChampion(payload.guestChampion) ? payload.guestChampion : "zed";
    const arena = validArena(payload.arena) ? payload.arena : ARENAS[0];
    game.p2Human = payload.mode === "local";
    game.selectChampion(champion);
    game.selectChampion2(guestChampion);
    game.selectArena(arena);
    state.hostChampion = champion;
    state.guestChampion = guestChampion;
    state.arena = arena;
    state.matchTarget = 3;
    await originalBeginGame();
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
      setStatus("Could not complete that client action. Try again.", "error");
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

  document.querySelector(".intro-lede").textContent =
    "Create a lightweight lobby, choose champion and arena, then duel online without pause.";
  const feature = [...document.querySelectorAll(".intro-notes span")]
    .find((item) => item.textContent.includes("Local PvP") || item.textContent.includes("Online PvP"));
  if (feature) feature.textContent = "Online PvP · independent controls";
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
