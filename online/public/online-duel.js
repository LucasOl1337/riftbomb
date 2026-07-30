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
  const SESSION_MAX_AGE_MS = 25 * 60_000;
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

  const state = {
    role: "offline",
    roomCode: "",
    hostToken: "",
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
    lastSentInput: -1
  };

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
    saveSession();
  }

  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  }

  function saveSession() {
    try {
      if (state.role === "offline" || !state.roomCode) {
        clearSession();
        return;
      }
      // Persist even while briefly disconnected so F5 can reattach.
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        role: state.role,
        roomCode: state.roomCode,
        hostChampion: state.hostChampion,
        guestChampion: state.guestChampion,
        arena: state.arena,
        inviteMode: state.inviteMode,
        quickMatch: state.quickMatch,
        guestReady: state.guestReady,
        matchTarget: state.matchTarget,
        phase: clientPhase(),
        savedAt: Date.now()
      }));
    } catch {}
  }

  function readSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.roomCode || !data?.role) return null;
      if (Date.now() - Number(data.savedAt || 0) > SESSION_MAX_AGE_MS) {
        clearSession();
        return null;
      }
      if (!/^[A-HJ-NP-Z2-9]{6}$/.test(String(data.roomCode))) return null;
      if (data.role !== "host" && data.role !== "guest") return null;
      return data;
    } catch {
      return null;
    }
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
    const socket = state.socket;
    state.socket = null;
    state.matchmaking = false;
    state.quickMatch = false;
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

  function connectAuthoritative(role, { quickMatch = false } = {}) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(AUTHORITATIVE_SERVER_URL);
      state.socket = socket;
      let settled = false;
      const timeout = setTimeout(() => {
        if (state.socket !== socket) return;
        if (!settled) reject(new Error("authoritative_server_timeout"));
        socket.close();
      }, 12_000);
      socket.addEventListener("open", () => {
        if (state.socket !== socket) return;
        socket.send(JSON.stringify(quickMatch
          ? { type: "quick-match", preset: lobbyPayload() }
          : {
              type: "hello",
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
          if (!settled) reject(new Error(message.error));
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
          if (message.quickMatch) {
            state.matchmaking = false;
            state.quickMatch = true;
            state.roomCode = message.room;
            state.guestReady = true;
            state.rivalConnected = true;
            setOnlineRole(message.role);
          }
          settled = true;
          if (Number.isSafeInteger(message.soundCursor) && message.soundCursor >= 0) {
            state.lastPlayedSoundEventId = Math.max(
              state.lastPlayedSoundEventId,
              message.soundCursor
            );
          }
          clearTimeout(timeout);
          void onConnected();
          resolve();
          return;
        }
        if (message.type === "snapshot") {
          try { applySnapshot(message.data); }
          catch (error) { console.warn("Ignored invalid authoritative snapshot", error); }
          return;
        }
        if (message.type === "ping") {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "pong", clientTime: Date.now() }));
          }
          return;
        }
        if (message.type === "presence" && message.connected === false) {
          state.rivalConnected = false;
          setStatus(`Player ${message.playerId} disconnected. Waiting briefly for reconnection.`, "error");
          updateConnection("waiting", `ONLINE · LOBBY ${state.roomCode} · RECONNECTING PLAYER ${message.playerId}`);
          updateLobbyDisplay();
          return;
        }
        handleControl(message);
      });
      socket.addEventListener("close", () => {
        clearTimeout(timeout);
        if (state.socket !== socket) return;
        if (!settled) reject(new Error("authoritative_server_unavailable"));
        else handleDisconnect();
      });
      socket.addEventListener("error", () => {
        if (state.socket !== socket) return;
        if (!settled) reject(new Error("authoritative_server_unavailable"));
      });
    });
  }

  async function onConnected() {
    const transportOpen = state.socket?.readyState === WebSocket.OPEN;
    if (state.connected || !transportOpen) return;
    state.connected = true;
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
    if (message.type === "start" || message.type === "rematch") {
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
    if (state.socket?.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify(message));
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
    state.rivalConnected = state.role === "guest" || Boolean(message.guestConnected);
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
    applyLobby(message);
    const isRematch = message.type === "rematch" || game.mode === "matchover";
    if (isRematch) {
      UI.end.hidden = true;
      UI.chrome.classList.remove("is-hidden");
      UI.chrome.setAttribute("aria-hidden", "false");
      UI.chrome.removeAttribute("inert");
      state.startInitiated = false;
    }
    // Authoritative matches begin only on server start/rematch — never local-only.
    if (game.mode !== "playing" || isRematch) {
      state.startInitiated = true;
      await beginConfiguredGame();
    }
    game.p2Human = true;
    // Always re-bind seat/camera after start — beginGame may reset presentation to P1.
    bindLocalOnlineView();
    UI.start.disabled = true;
    UI.start.textContent = "ONLINE MATCH IN PROGRESS";
    const side = state.role === "host"
      ? `BLUE ${championName(state.hostChampion).toUpperCase()}`
      : `RED ${championName(state.guestChampion).toUpperCase()}`;
    updateConnection("connected",
      `ONLINE · LOBBY ${state.roomCode} · YOU ARE ${side} · FIRST TO ${state.matchTarget}`);
    setStatus(
      isRematch ? "Rematch started on the São Paulo server." : "Match started on the São Paulo server.",
      "ok"
    );
  }

  function applySnapshot(data) {
    if (!data || ![2, 3].includes(data.v) || !Array.isArray(data.players)) return;
    if (Number.isFinite(data.s) && data.s <= state.receivedSequence) return;
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

  function sendCurrentInput() {
    if (state.role === "host") state.localInput = hostLocalInput();
    const mask = inputMask();
    if (mask === state.lastSentInput) return;
    state.lastSentInput = mask;
    sendControl({ type: "input", mask });
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
    resetConnection();
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
    resetConnection();
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
    resetConnection();
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
    try { state.socket?.close(); } catch {}
    Object.assign(state, {
      socket: null,
      connected: false, rivalConnected: false, guestReady: false, hostToken: "", roomCode: "",
      matchmaking: false, quickMatch: false,
      inviteMode: false, inviteUrl: "", startInitiated: false, inviteAssetsReady: null, matchTarget: 3,
      receivedSequence: 0,
      lastPlayedSoundEventId: 0,
      droppedSoundEventCount: 0,
      localInput: { up: false, down: false, left: false, right: false },
      remoteHostTarget: null, localPlayerTarget: null,
      pendingGuestBombs: [], lastSentInput: -1
    });
  }

  function chooseOffline() {
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
    if (!saved || state.role !== "offline") return false;
    setStatus(`Reconnecting to lobby ${saved.roomCode}…`, "ok");
    try {
      if (saved.role === "host") {
        resetConnection();
        setOnlineRole("host");
        state.roomCode = saved.roomCode;
        state.hostChampion = validChampion(saved.hostChampion) ? saved.hostChampion : "katarina";
        state.guestChampion = validChampion(saved.guestChampion) ? saved.guestChampion : "zed";
        state.arena = validArena(saved.arena) ? saved.arena : ARENAS[0];
        state.inviteMode = Boolean(saved.inviteMode);
        state.quickMatch = Boolean(saved.quickMatch);
        state.matchTarget = saved.matchTarget === INVITE_MATCH_TARGET ? INVITE_MATCH_TARGET : 3;
        game.selectedChampion = state.hostChampion;
        game.selectedChampion2 = state.guestChampion;
        game.matchTarget = state.matchTarget;
        if (game.mode === "intro") {
          game.selectArena(state.arena);
          game.resetPlayers();
        }
        setChampionButtons(state.hostChampion);
        setArenaButtons(state.arena);
        roomLabel.textContent = state.inviteMode ? "CHALLENGE LINK · RESUME" : "LOBBY CODE · RESUME";
        roomCode.textContent = state.roomCode;
        setBusy(true);
        updateLobbyDisplay();
        await connectAuthoritative("host");
        roomCode.textContent = state.roomCode;
        if (state.inviteMode) state.inviteUrl = challengeUrl(state.roomCode);
        setStatus(`Reconnected as host to lobby ${state.roomCode}.`, "ok");
        updateConnection("connected", `ONLINE · LOBBY ${state.roomCode} · RECONNECTED`);
        updateLobbyDisplay();
        saveSession();
        return true;
      }
      if (saved.quickMatch) {
        resetConnection();
        setOnlineRole("guest");
        state.roomCode = saved.roomCode;
        state.hostChampion = validChampion(saved.hostChampion) ? saved.hostChampion : "katarina";
        state.guestChampion = validChampion(saved.guestChampion) ? saved.guestChampion : "zed";
        state.arena = validArena(saved.arena) ? saved.arena : ARENAS[0];
        state.matchTarget = 3;
        state.quickMatch = true;
        state.guestReady = true;
        setBusy(true);
        await connectAuthoritative("guest");
        saveSession();
        return true;
      }
      await joinRoom(saved.roomCode, {
        guestChampion: validChampion(saved.guestChampion) ? saved.guestChampion : "zed",
        inviteMode: Boolean(saved.inviteMode)
      });
      if (saved.guestReady && !state.inviteMode) {
        state.guestReady = true;
        sendGuestConfig();
      }
      saveSession();
      return true;
    } catch (error) {
      console.warn("Session resume failed", error);
      clearSession();
      setBusy(false);
      setOnlineRole("offline");
      setStatus("Could not resume the previous lobby. Create or join again.", "error");
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
    const mask = inputMask();
    sendControl({ type: "input", mask });
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

  game.placeBomb = (player) => {
    if (state.role === "offline" || !state.connected || !state.socket) {
      return offlinePlaceBomb(player || game.player);
    }
    const local = localOnlinePlayer();
    const actor = player?.id === local?.id ? player : local;
    if (!actor) return false;
    // Always tell the server; optimistic predict may fail client-side.
    sendControl({ type: "action", kind: "bomb" });
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
    sendControl({ type: "action", kind: "ability", slot });
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
    if (state.role !== "guest" || game.mode !== "playing") return;
    const direction = keyDirections[event.code];
    if (!direction) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setGuestDirection(direction, false);
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
  if (parentRoom && /^[A-HJ-NP-Z2-9]{6}$/i.test(parentRoom)) {
    codeInput.value = parentRoom.toUpperCase();
    if (directInvite) {
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
    if (parentRoom) return;
    void tryResumeSession().catch((error) => {
      console.warn("Auto resume failed", error);
    });
  }, 120);
})();
