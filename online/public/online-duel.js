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
    guestReady: false,
    inviteMode: false,
    inviteUrl: "",
    startInitiated: false,
    inviteAssetsReady: null,
    receivedSequence: 0,
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
        <span><strong>QUICK LOBBY</strong><small>Current champion + arena · first to 3</small></span>
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

  function setStatus(message, tone = "") {
    status.textContent = message;
    status.dataset.tone = tone;
    UI.live.textContent = message;
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
  }

  function setBusy(busy) {
    createButton.disabled = busy;
    showInviteButton.disabled = busy;
    showJoinButton.disabled = busy;
    offlineButton.disabled = busy;
    codeInput.disabled = busy;
    joinForm.querySelector("button").disabled = busy;
    invitePresetForm.querySelector("button").disabled = busy;
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
    guestStateLabel.textContent = !state.connected ? "WAITING" : state.guestReady ? "READY" : "CHOOSING";
    guestStateLabel.dataset.ready = String(state.guestReady);
    readyButton.textContent = state.guestReady ? "READY ✓" : "I'M READY";
    readyButton.dataset.ready = String(state.guestReady);
    copyButton.textContent = state.inviteMode ? "COPY INVITE LINK" : "COPY CODE";
    // Only share after the host WebSocket has registered the room (avoids room_not_found).
    const shareReady = Boolean(state.connected && state.roomCode);
    copyButton.disabled = !shareReady || (state.inviteMode && !state.inviteUrl);
    inviteUrlOutput.hidden = !state.inviteMode || state.role !== "host" || !shareReady || !state.inviteUrl;
    inviteUrlOutput.value = shareReady ? state.inviteUrl : "";
    lobbyBox.dataset.stage = state.guestReady ? "ready" : state.connected ? "connected" : "created";
    if (state.role === "host") {
      UI.start.disabled = !state.connected || !state.guestReady;
      UI.start.textContent = !state.connected
        ? "WAITING FOR PLAYER 2…"
        : state.inviteMode
          ? "STARTING CHALLENGE AUTOMATICALLY…"
        : state.guestReady
          ? `>>> START ONLINE MATCH · ${state.roomCode}`
          : "WAITING FOR PLAYER 2 READY…";
    }
  }

  function setOnlineRole(role) {
    state.role = role;
    panel.dataset.mode = role;
    document.body.classList.toggle("is-online-match", role !== "offline");
    UI.pause.disabled = role !== "offline";
    UI.pause.setAttribute("aria-hidden", String(role !== "offline"));
    lobbyBox.hidden = role === "offline";
    panel.querySelector(".online-panel__head strong").textContent = role === "offline" ? "CREATE YOUR DUEL" : "MATCH LOBBY";
    readyButton.hidden = role !== "guest" || state.inviteMode;
    roleHelp.textContent = state.inviteMode
      ? `Challenge preset locked · first to ${INVITE_MATCH_TARGET} eliminations.`
      : role === "guest"
      ? "Choose your champion, then confirm READY."
      : "Admin chooses their champion and the arena.";
    game.localPlayerId = role === "guest" ? 2 : 1;
    globalThis.configurePlayerView?.(game.localPlayerId, { shared: role === "offline" });
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
    await originalBeginGame();
    game.paused = false;
    game.p2Human = true;
    globalThis.configurePlayerView?.(state.role === "guest" ? 2 : 1);
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

  function connectAuthoritative(role) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(AUTHORITATIVE_SERVER_URL);
      state.socket = socket;
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) reject(new Error("authoritative_server_timeout"));
        socket.close();
      }, 12_000);
      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({
          type: "hello",
          room: state.roomCode,
          role,
          ready: role === "guest" && state.guestReady,
          preset: lobbyPayload()
        }));
      });
      socket.addEventListener("message", (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === "error") {
          if (!settled) reject(new Error(message.error));
          return;
        }
        if (message.type === "connected") {
          settled = true;
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
          setStatus(`Player ${message.playerId} disconnected. Waiting briefly for reconnection.`, "error");
          updateConnection("waiting", `ONLINE · LOBBY ${state.roomCode} · RECONNECTING PLAYER ${message.playerId}`);
          return;
        }
        handleControl(message);
      });
      socket.addEventListener("close", () => {
        clearTimeout(timeout);
        if (!settled) reject(new Error("authoritative_server_unavailable"));
        else handleDisconnect();
      });
      socket.addEventListener("error", () => {
        if (!settled) reject(new Error("authoritative_server_unavailable"));
      });
    });
  }

  async function onConnected() {
    const transportOpen = state.socket?.readyState === WebSocket.OPEN;
    if (state.connected || !transportOpen) return;
    state.connected = true;
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
    game.paused = false;
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
    game.paused = false;
    game.p2Human = true;
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
    const localIndex = state.role === "guest" ? 1 : 0;
    const remoteIndex = localIndex === 0 ? 1 : 0;
    const previousLocal = game.players?.[localIndex];
    const previousRemote = game.players?.[remoteIndex];
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
    game.players = data.players;
    if (previousLocal && game.players[localIndex] && data.round === previousRound) {
      const authoritativeLocal = game.players[localIndex];
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
    if (previousRemote && game.players[remoteIndex] && data.round === previousRound) {
      const authoritativeRemote = game.players[remoteIndex];
      const distance = Math.hypot(authoritativeRemote.x - previousRemote.x, authoritativeRemote.z - previousRemote.z);
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
    game.player = game.players[0];
    if (Array.isArray(data.grid)) game.grid = data.grid;
    game.particles = Array.isArray(data.particles) ? data.particles : [];
    game.pendingMatchWinner = game.players.find((player) => player.id === data.pendingWinnerId) || null;
    game.paused = false;
    if (game.round !== previousRound && game.mode === "playing") game.presentation.prepareRound();
    game.presentation.update(game);
    if (game.mode === "matchover" && previousMode !== "matchover") {
      const winner = game.players[game.roundWins[1] > game.roundWins[0] ? 1 : 0];
      game.presentation.finish(winner, game.roundWins, game.elapsed);
    }
    state.guestRound = game.round;
    state.guestMode = game.mode;
  }

  function predictLocalMovement(dt) {
    const player = game.players[state.role === "guest" ? 1 : 0];
    if (!player?.alive || game.mode !== "playing" || game.roundLocked) return;
    const input = state.role === "guest" ? state.localInput : hostLocalInput();
    let dx = Number(input.right) - Number(input.left);
    let dz = Number(input.down) - Number(input.up);
    const length = Math.hypot(dx, dz);
    if (length > 0) {
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
      game.paused = false;
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

  const offlineTogglePause = game.togglePause.bind(game);
  game.togglePause = (force) => {
    if (state.role !== "offline" && game.mode === "playing") {
      if (game.paused) {
        game.paused = false;
        game.presentation.setPaused(false);
        sfx.togglePause(false);
      }
      game.presentation.announce("Online matches cannot be paused");
      return false;
    }
    return offlineTogglePause(force);
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
    if (!state.inviteMode) state.guestChampion = "zed";
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
      connected: false, guestReady: false, hostToken: "", roomCode: "",
      inviteMode: false, inviteUrl: "", startInitiated: false, inviteAssetsReady: null, matchTarget: 3,
      receivedSequence: 0,
      localInput: { up: false, down: false, left: false, right: false },
      remoteHostTarget: null, localPlayerTarget: null,
      pendingGuestBombs: [], lastSentInput: -1
    });
  }

  function chooseOffline() {
    resetConnection();
    setOnlineRole("offline");
    setBusy(false);
    closeSetupPanels();
    connection.hidden = true;
    connection.textContent = "";
    game.selectedChampion2 = "zed";
    game.matchTarget = 3;
    game.presentation.matchTarget = 3;
    if (game.mode === "intro") game.resetPlayers();
    UI.start.disabled = false;
    UI.start.textContent = `>>> DEPLOY ${game.player.name.toUpperCase()}`;
    setStatus("Solo/local selected. Online lobby controls are disabled.", "ok");
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

  game.placeBomb = (player = game.player) => {
    if (state.role === "offline" || !state.connected || !state.socket) {
      return offlinePlaceBomb(player);
    }
    const localPlayerId = state.role === "guest" ? 2 : 1;
    if (player?.id !== localPlayerId) return false;
    const bombIds = new Set(game.bombs.map((bomb) => bomb.id));
    const placed = offlinePlaceBomb(player);
    if (!placed) return false;
    const predictedBomb = game.bombs.find((bomb) =>
      bomb.ownerId === localPlayerId && !bombIds.has(bomb.id)
    );
    if (predictedBomb) {
      state.pendingGuestBombs.push({
        createdAt: performance.now(), round: game.round,
        bomb: { ...predictedBomb, passOwners: [...(predictedBomb.passOwners || [])] }
      });
    }
    sendControl({ type: "action", kind: "bomb" });
    return true;
  };

  game.castAbility = (slot, player = game.player) => {
    if (state.role === "offline" || !state.connected || !state.socket) {
      return offlineCastAbility(slot, player);
    }
    const localPlayerId = state.role === "guest" ? 2 : 1;
    if (player?.id !== localPlayerId || !Number.isInteger(slot)) return false;
    const cast = offlineCastAbility(slot, player);
    if (cast !== false) sendControl({ type: "action", kind: "ability", slot });
    return cast;
  };

  function guestAction(kind, slot = null) {
    if (state.role === "guest" && state.connected && game.mode === "playing") {
      const guest = game.players[1];
      if (kind === "bomb") game.placeBomb(guest);
      if (kind === "ability" && Number.isInteger(slot)) game.castAbility(slot, guest);
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
    createRoom();
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
})();
