"use strict";

(() => {
  if (typeof game === "undefined" || typeof UI === "undefined" || typeof music === "undefined") return;

  const SIGNALING_URL = "/api/pvp";
  const ICE_SERVERS = [
    { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }
  ];
  const ICE_CANDIDATE_GRACE_MS = 250;
  const ICE_GATHER_TIMEOUT_MS = 8000;
  const CHAMPIONS = ["katarina", "zed", "renekton", "vladimir", "gangplank", "ziggs"];
  const CHAMPION_NAMES = {
    katarina: "Katarina", zed: "Zed", renekton: "Renekton",
    vladimir: "Vladimir", gangplank: "Gangplank", ziggs: "Ziggs"
  };
  const SNAPSHOT_INTERVAL = 1000 / 20;
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

  const state = {
    role: "offline",
    roomCode: "",
    hostToken: "",
    peer: null,
    control: null,
    inputChannel: null,
    snapshots: null,
    connected: false,
    guestReady: false,
    pollTimer: 0,
    connectionTimer: 0,
    lastSnapshotAt: 0,
    lastGridSignature: "",
    snapshotSequence: 0,
    receivedSequence: 0,
    remoteInput: { up: false, down: false, left: false, right: false },
    localInput: { up: false, down: false, left: false, right: false },
    hostChampion: game.selectedChampion,
    guestChampion: "ziggs",
    arena: game.selectedArena,
    musicStyle: music.styleId || "gravesong",
    musicEnabled: true,
    guestRound: 0,
    guestMode: "intro"
  };

  const panel = document.createElement("section");
  panel.className = "online-panel";
  panel.dataset.mode = "offline";
  panel.setAttribute("aria-label", "Online PvP lobby");
  panel.innerHTML = `
    <div class="online-panel__head">
      <div><span class="online-kicker">ONLINE PVP</span><strong>LIGHTWEIGHT 1V1 LOBBY</strong></div>
      <span class="micro">direct low-latency connection</span>
    </div>
    <div class="online-panel__actions">
      <button type="button" id="online-create">CREATE LOBBY</button>
      <button type="button" id="online-show-join">JOIN WITH CODE</button>
      <button type="button" id="online-offline">SOLO / LOCAL</button>
    </div>
    <form class="online-panel__join" id="online-join-form" hidden>
      <label class="sr-only" for="online-code">Lobby code</label>
      <input id="online-code" name="code" maxlength="6" autocomplete="off"
        inputmode="text" placeholder="LOBBY CODE" aria-label="Six character lobby code">
      <button type="submit">JOIN LOBBY</button>
    </form>
    <div class="online-panel__lobby" id="online-lobby" hidden>
      <div class="online-panel__room">
        <div><span class="micro" id="online-room-label">LOBBY CODE</span>
          <div class="online-room-code" id="online-room-code">------</div></div>
        <button type="button" id="online-copy">COPY CODE</button>
      </div>
      <div class="online-players">
        <article class="online-player" data-player="host">
          <span class="online-player__side">P1 · ADMIN</span>
          <strong id="online-host-champion">Katarina</strong>
          <span class="online-player__state" id="online-host-state">ADMIN</span>
        </article>
        <article class="online-player" data-player="guest">
          <span class="online-player__side">P2 · GUEST</span>
          <strong id="online-guest-champion">Ziggs</strong>
          <span class="online-player__state" id="online-guest-state">WAITING</span>
        </article>
      </div>
      <div class="online-ready-row">
        <span class="micro" id="online-role-help">Admin chooses arena and soundtrack.</span>
        <button type="button" id="online-ready" hidden>I'M READY</button>
      </div>
    </div>
    <p class="online-status micro" id="online-status">
      Create a lobby or enter a code. Each player chooses their own champion.
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
  const showJoinButton = $p("#online-show-join");
  const offlineButton = $p("#online-offline");
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
  const championName = (value) => CHAMPION_NAMES[value] || "Ziggs";

  function setStatus(message, tone = "") {
    status.textContent = message;
    status.dataset.tone = tone;
    UI.live.textContent = message;
  }

  function updateConnection(kind, message) {
    connection.hidden = false;
    connection.dataset.state = kind;
    connection.textContent = message;
  }

  function setBusy(busy) {
    createButton.disabled = busy;
    showJoinButton.disabled = busy;
    offlineButton.disabled = busy;
    codeInput.disabled = busy;
    joinForm.querySelector("button").disabled = busy;
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

  function setSoundtrackButtons(style, enabled) {
    UI.soundtrackChoices.forEach((button) => {
      const selected = enabled && button.dataset.style === style;
      button.setAttribute("aria-checked", String(selected));
      button.classList.toggle("is-previewing", selected);
      button.classList.remove("is-loading");
    });
    document.querySelector(".soundtrack-choice[data-style='none']")
      ?.setAttribute("aria-checked", String(!enabled));
  }

  function updateLobbyDisplay() {
    hostChampionLabel.textContent = championName(state.hostChampion);
    guestChampionLabel.textContent = championName(state.guestChampion);
    hostStateLabel.textContent = state.role === "host" && state.connected && state.guestReady
      ? "READY TO START" : "ADMIN";
    guestStateLabel.textContent = !state.connected ? "WAITING" : state.guestReady ? "READY" : "CHOOSING";
    guestStateLabel.dataset.ready = String(state.guestReady);
    readyButton.textContent = state.guestReady ? "READY ✓" : "I'M READY";
    readyButton.dataset.ready = String(state.guestReady);
    if (state.role === "host") {
      UI.start.disabled = !state.connected || !state.guestReady;
      UI.start.textContent = !state.connected
        ? "WAITING FOR PLAYER 2…"
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
    readyButton.hidden = role !== "guest";
    roleHelp.textContent = role === "guest"
      ? "Choose your champion, then confirm READY."
      : "Admin chooses champion, arena and soundtrack.";
  }

  function applyMusicState() {
    if (state.musicEnabled) {
      music.setStyle(state.musicStyle);
      if (music.musicBus && music.ctx) {
        music.musicBus.gain.cancelScheduledValues(music.ctx.currentTime);
        music.musicBus.gain.setTargetAtTime(music.musicLevel, music.ctx.currentTime, 0.04);
      }
    } else {
      music.cutMusicVoices?.();
      if (music.musicBus && music.ctx) {
        music.musicBus.gain.cancelScheduledValues(music.ctx.currentTime);
        music.musicBus.gain.setTargetAtTime(0, music.ctx.currentTime, 0.025);
      }
    }
    setSoundtrackButtons(state.musicStyle, state.musicEnabled);
  }

  function applyMatchConfig() {
    game.selectedChampion = state.hostChampion;
    game.selectedChampion2 = state.guestChampion;
    if (game.mode === "intro") {
      game.selectArena(state.arena);
      game.resetPlayers();
    }
    applyMusicState();
  }

  async function beginConfiguredGame() {
    applyMatchConfig();
    const musicStart = music.start;
    if (!state.musicEnabled && !music.ctx) music.start = async () => {};
    try {
      await originalBeginGame();
    } finally {
      music.start = musicStart;
    }
    game.paused = false;
    game.p2Human = true;
    applyMusicState();
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

  function createPeer() {
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    state.peer = peer;
    peer.addEventListener("connectionstatechange", () => {
      if (["failed", "closed", "disconnected"].includes(peer.connectionState)) handleDisconnect();
    });
    return peer;
  }

  function waitForIce(peer) {
    if (peer.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      let candidateGrace = 0;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearTimeout(candidateGrace);
        peer.removeEventListener("icecandidate", onCandidate);
        peer.removeEventListener("icegatheringstatechange", onChange);
        resolve();
      };
      const onCandidate = (event) => {
        if (!event.candidate || !["srflx", "relay"].includes(event.candidate.type)) return;
        // A second STUN server can keep Chrome in "gathering" after a public
        // candidate is already usable. Keep a short quiet window for siblings,
        // then publish the SDP instead of idling until the hard timeout.
        clearTimeout(candidateGrace);
        candidateGrace = setTimeout(finish, ICE_CANDIDATE_GRACE_MS);
      };
      const onChange = () => {
        if (peer.iceGatheringState !== "complete") return;
        finish();
      };
      const timeout = setTimeout(finish, ICE_GATHER_TIMEOUT_MS);
      peer.addEventListener("icecandidate", onCandidate);
      peer.addEventListener("icegatheringstatechange", onChange);
    });
  }

  function wireControl(channel) {
    state.control = channel;
    channel.addEventListener("open", onConnected);
    channel.addEventListener("close", handleDisconnect);
    channel.addEventListener("message", (event) => {
      try { handleControl(JSON.parse(event.data)); } catch {}
    });
  }

  function setRemoteInputMask(mask) {
    const value = Number(mask) || 0;
    state.remoteInput = {
      up: Boolean(value & 1), down: Boolean(value & 2),
      left: Boolean(value & 4), right: Boolean(value & 8)
    };
  }

  function wireInput(channel) {
    state.inputChannel = channel;
    if (state.role === "host") {
      channel.addEventListener("message", (event) => setRemoteInputMask(event.data));
    }
  }

  function wireSnapshots(channel) {
    state.snapshots = channel;
    if (state.role === "guest") {
      channel.addEventListener("message", (event) => {
        try { applySnapshot(JSON.parse(event.data)); }
        catch (error) { console.warn("Ignored invalid PvP snapshot", error); }
      });
    }
  }

  function onConnected() {
    if (state.connected || state.control?.readyState !== "open") return;
    state.connected = true;
    clearTimeout(state.connectionTimer);
    setBusy(false);
    if (state.role === "host") {
      state.hostChampion = game.selectedChampion;
      setStatus("Player 2 connected. Waiting for their champion and READY.", "ok");
      updateConnection("connected", `ONLINE · LOBBY ${state.roomCode} · PLAYER 2 CONNECTED`);
      sendLobby();
    } else {
      setChampionButtons(state.guestChampion);
      setStatus("Connected. Choose your champion and press READY.", "ok");
      updateConnection("connected", `ONLINE · LOBBY ${state.roomCode} · YOU ARE PLAYER 2`);
      sendGuestConfig();
    }
    updateLobbyDisplay();
  }

  function handleDisconnect() {
    if (state.role === "offline" || !state.connected) return;
    state.connected = false;
    clearInterval(state.pollTimer);
    clearTimeout(state.connectionTimer);
    state.remoteInput = { up: false, down: false, left: false, right: false };
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
    if (state.role === "host") {
      if (message.type === "input") {
        setRemoteInputMask(message.mask);
      } else if (message.type === "action" && game.mode === "playing") {
        const red = game.players[1];
        if (!red) return;
        if (message.kind === "bomb") game.placeBomb(red);
        if (message.kind === "ability" && Number.isInteger(message.slot)) {
          game.castAbility(message.slot, red);
        }
      } else if (message.type === "guest-config") {
        if (validChampion(message.champion)) {
          state.guestChampion = message.champion;
          if (game.mode === "intro") game.selectChampion2(message.champion);
        }
        state.guestReady = Boolean(message.ready);
        updateLobbyDisplay();
        sendLobby();
      }
      return;
    }
    if (message.type === "lobby") applyLobby(message);
    if (message.type === "start" || message.type === "rematch") startGuestMatch(message);
  }

  function sendControl(message) {
    if (state.control?.readyState === "open") state.control.send(JSON.stringify(message));
  }

  function lobbyPayload(type = "lobby") {
    return {
      type,
      hostChampion: state.hostChampion,
      guestChampion: state.guestChampion,
      arena: state.arena,
      musicStyle: state.musicStyle,
      musicEnabled: state.musicEnabled,
      guestReady: state.guestReady
    };
  }

  const sendLobby = () => sendControl(lobbyPayload());
  const sendGuestConfig = () => sendControl({
    type: "guest-config", champion: state.guestChampion, ready: state.guestReady
  });

  function applyLobby(message) {
    if (validChampion(message.hostChampion)) state.hostChampion = message.hostChampion;
    if (validChampion(message.guestChampion)) state.guestChampion = message.guestChampion;
    if (typeof message.arena === "string") state.arena = message.arena;
    if (typeof message.musicStyle === "string") state.musicStyle = message.musicStyle;
    state.musicEnabled = message.musicEnabled !== false;
    state.guestReady = Boolean(message.guestReady);
    if (game.mode === "intro") {
      game.selectedChampion = state.hostChampion;
      game.selectedChampion2 = state.guestChampion;
      game.selectArena(state.arena);
      game.resetPlayers();
    }
    setChampionButtons(state.role === "guest" ? state.guestChampion : state.hostChampion);
    setArenaButtons(state.arena);
    setSoundtrackButtons(state.musicStyle, state.musicEnabled);
    updateLobbyDisplay();
  }

  async function startGuestMatch(message) {
    applyLobby(message);
    if (game.mode !== "playing") await beginConfiguredGame();
    game.paused = false;
    game.p2Human = true;
    UI.start.disabled = true;
    UI.start.textContent = "ONLINE MATCH IN PROGRESS";
    updateConnection("connected",
      `ONLINE · LOBBY ${state.roomCode} · YOU ARE RED ${championName(state.guestChampion).toUpperCase()}`);
  }

  function snapshot() {
    const data = { v: 2, s: ++state.snapshotSequence, players: game.players };
    for (const key of SNAPSHOT_SCALARS) data[key] = game[key];
    for (const key of SNAPSHOT_ARRAYS) {
      data[key] = key === "bombs"
        ? game.bombs.map((bomb) => ({ ...bomb, passOwners: [...(bomb.passOwners || [])] }))
        : game[key];
    }
    const gridSignature = JSON.stringify(game.grid);
    if (gridSignature !== state.lastGridSignature || data.s % 40 === 0) {
      data.grid = game.grid;
      state.lastGridSignature = gridSignature;
    }
    data.particles = game.particles.slice(-72);
    data.pendingWinnerId = game.pendingMatchWinner?.id || 0;
    return data;
  }

  function applySnapshot(data) {
    if (!data || data.v !== 2 || !Array.isArray(data.players)) return;
    if (Number.isFinite(data.s) && data.s <= state.receivedSequence) return;
    state.receivedSequence = Number(data.s) || state.receivedSequence + 1;
    const previousRound = state.guestRound;
    const previousMode = state.guestMode;
    for (const key of SNAPSHOT_SCALARS) {
      if (Object.prototype.hasOwnProperty.call(data, key)) game[key] = data[key];
    }
    for (const key of SNAPSHOT_ARRAYS) if (Array.isArray(data[key])) game[key] = data[key];
    game.bombs = game.bombs.map((bomb) => ({ ...bomb, passOwners: new Set(bomb.passOwners || []) }));
    game.players = data.players;
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

  function applyRemoteInput() {
    const mapping = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };
    for (const [direction, code] of Object.entries(mapping)) {
      if (state.remoteInput[direction]) game.keys.add(code);
      else game.keys.delete(code);
    }
  }

  function predictGuestMovement(dt) {
    const player = game.players[1];
    if (!player?.alive || game.mode !== "playing" || game.roundLocked) return;
    let dx = Number(state.localInput.right) - Number(state.localInput.left);
    let dz = Number(state.localInput.down) - Number(state.localInput.up);
    const length = Math.hypot(dx, dz);
    if (length > 0) {
      dx /= length; dz /= length;
      player.lastDx = dx; player.lastDz = dz; player.moving = true;
      game.moveEntity(player, dx, dz, player.speed, dt, 0.3);
    } else player.moving = false;
  }

  const originalUpdate = game.update.bind(game);
  game.update = (dt) => {
    if (state.role === "guest" && state.connected) {
      game.paused = false;
      predictGuestMovement(dt);
      game.updateParticles(dt * 0.25);
      return;
    }
    if (state.role === "host" && state.connected) {
      game.paused = false;
      game.p2Human = true;
      applyRemoteInput();
    }
    originalUpdate(dt);
    if (state.role === "host" && state.connected &&
        state.snapshots?.readyState === "open" &&
        performance.now() - state.lastSnapshotAt >= SNAPSHOT_INTERVAL &&
        state.snapshots.bufferedAmount < 96_000) {
      state.lastSnapshotAt = performance.now();
      state.snapshots.send(JSON.stringify(snapshot()));
    }
  };

  const offlineTogglePause = game.togglePause.bind(game);
  game.togglePause = (force) => {
    if (state.role !== "offline" && game.mode === "playing") {
      if (game.paused) {
        game.paused = false;
        game.presentation.setPaused(false);
        music.togglePause(false);
      }
      game.presentation.announce("Online matches cannot be paused");
      return false;
    }
    return offlineTogglePause(force);
  };

  const originalBeginGame = beginGame;
  UI.start.removeEventListener("click", beginGame);
  UI.start.addEventListener("click", async () => {
    if (state.role === "guest") return setStatus("The admin starts after you confirm READY.", "ok");
    if (state.role === "host") {
      if (!state.connected) return setStatus("Wait for Player 2 to connect.", "error");
      if (!state.guestReady) return setStatus("Player 2 must choose a champion and press READY.", "error");
      state.hostChampion = game.selectedChampion;
      state.arena = game.selectedArena;
      sendControl(lobbyPayload("start"));
      await beginConfiguredGame();
      updateConnection("connected",
        `ONLINE · LOBBY ${state.roomCode} · BLUE ${championName(state.hostChampion).toUpperCase()}`);
      return;
    }
    await originalBeginGame();
  });

  function connectionTimeout() {
    clearTimeout(state.connectionTimer);
    state.connectionTimer = setTimeout(() => {
      if (state.connected) return;
      setBusy(false);
      setStatus("Direct connection timed out. Try again with current Chrome or Edge.", "error");
      updateConnection("disconnected", "ONLINE CONNECTION COULD NOT BE ESTABLISHED");
    }, 24000);
  }

  async function createRoom() {
    resetConnection();
    setOnlineRole("host");
    state.hostChampion = game.selectedChampion;
    state.guestChampion = "ziggs";
    state.arena = game.selectedArena;
    state.musicStyle = music.styleId || "gravesong";
    state.musicEnabled = true;
    setBusy(true);
    roomLabel.textContent = "LOBBY CODE · SEND TO PLAYER 2";
    roomCode.textContent = "------";
    setStatus("Creating your lightweight lobby…");
    updateLobbyDisplay();
    try {
      const peer = createPeer();
      wireControl(peer.createDataChannel("control", { ordered: true }));
      wireInput(peer.createDataChannel("input", { ordered: false, maxRetransmits: 0 }));
      wireSnapshots(peer.createDataChannel("state", { ordered: false, maxRetransmits: 0 }));
      await peer.setLocalDescription(await peer.createOffer());
      await waitForIce(peer);
      const room = await signaling("POST", {
        action: "create", offer: peer.localDescription.toJSON()
      });
      state.roomCode = room.code;
      state.hostToken = room.hostToken;
      roomCode.textContent = room.code;
      setStatus("Lobby created. Choose champion, arena and music while Player 2 joins.", "ok");
      updateConnection("waiting", `ONLINE · LOBBY ${room.code} · WAITING FOR PLAYER 2`);
      updateLobbyDisplay();
      pollForAnswer();
      connectionTimeout();
    } catch (error) { failConnection(error); }
  }

  async function pollForAnswer() {
    clearInterval(state.pollTimer);
    let polling = false;
    state.pollTimer = setInterval(async () => {
      if (polling || state.connected || !state.roomCode) return;
      polling = true;
      try {
        const result = await signaling("GET", null,
          `?code=${encodeURIComponent(state.roomCode)}&hostToken=${encodeURIComponent(state.hostToken)}`);
        if (result.answer) {
          clearInterval(state.pollTimer);
          await state.peer.setRemoteDescription(result.answer);
        }
      } catch (error) {
        if (error.status === 404) {
          clearInterval(state.pollTimer);
          setStatus("The lobby expired. Create a new one.", "error");
        }
      } finally { polling = false; }
    }, 850);
  }

  async function joinRoom(code) {
    resetConnection();
    setOnlineRole("guest");
    state.roomCode = code;
    state.guestChampion = "ziggs";
    roomLabel.textContent = "JOINED LOBBY";
    roomCode.textContent = code;
    setChampionButtons(state.guestChampion);
    setBusy(true);
    setStatus(`Joining lobby ${code}…`);
    updateLobbyDisplay();
    try {
      const room = await signaling("GET", null, `?code=${encodeURIComponent(code)}`);
      const peer = createPeer();
      peer.addEventListener("datachannel", (event) => {
        if (event.channel.label === "control") wireControl(event.channel);
        if (event.channel.label === "input") wireInput(event.channel);
        if (event.channel.label === "state") wireSnapshots(event.channel);
      });
      await peer.setRemoteDescription(room.offer);
      await peer.setLocalDescription(await peer.createAnswer());
      await waitForIce(peer);
      await signaling("POST", {
        action: "answer", code, answer: peer.localDescription.toJSON()
      });
      updateConnection("waiting", `ONLINE · LOBBY ${code} · CONNECTING TO ADMIN`);
      setStatus("Lobby found. Establishing the direct connection…");
      connectionTimeout();
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
    updateConnection("disconnected", "ONLINE SERVICE UNAVAILABLE");
    UI.start.disabled = false;
  }

  function resetConnection() {
    clearInterval(state.pollTimer);
    clearTimeout(state.connectionTimer);
    try { state.peer?.close(); } catch {}
    Object.assign(state, {
      peer: null, control: null, inputChannel: null, snapshots: null,
      connected: false, guestReady: false, hostToken: "", roomCode: "",
      lastGridSignature: "", snapshotSequence: 0, receivedSequence: 0,
      remoteInput: { up: false, down: false, left: false, right: false },
      localInput: { up: false, down: false, left: false, right: false }
    });
  }

  function chooseOffline() {
    resetConnection();
    setOnlineRole("offline");
    setBusy(false);
    joinForm.hidden = true;
    connection.hidden = true;
    game.selectedChampion2 = "ziggs";
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
    if (state.inputChannel?.readyState === "open") state.inputChannel.send(String(mask));
    else sendControl({ type: "input", mask });
  }

  function setGuestDirection(direction, active) {
    if (state.role !== "guest" || !state.connected || state.localInput[direction] === active) return;
    state.localInput[direction] = active;
    sendInput();
  }

  function guestAction(kind, slot = null) {
    if (state.role === "guest" && state.connected && game.mode === "playing") {
      sendControl({ type: "action", kind, slot });
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

  document.querySelectorAll(".touch-key[data-dir]").forEach((button) => {
    const direction = button.dataset.dir;
    button.addEventListener("pointerdown", (event) => {
      if (state.role !== "guest") return;
      event.preventDefault(); event.stopImmediatePropagation();
      setGuestDirection(direction, true);
    }, true);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      button.addEventListener(type, (event) => {
        if (state.role !== "guest") return;
        event.preventDefault(); event.stopImmediatePropagation();
        setGuestDirection(direction, false);
      }, true);
    }
  });

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
      state.hostChampion = game.selectedChampion;
      state.arena = game.selectedArena;
      sendControl(lobbyPayload("rematch"));
    }
  }, true);

  UI.championChoices.forEach((button) => {
    button.addEventListener("click", (event) => {
      if (state.role !== "guest") return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!validChampion(button.dataset.champion)) return;
      state.guestChampion = button.dataset.champion;
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

  function ensureNoMusicChoice() {
    const host = document.getElementById("soundtrack-select") || document.querySelector(".soundtrack-select");
    if (!host || host.querySelector("[data-style='none']")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "soundtrack-choice soundtrack-choice--silent";
    button.dataset.style = "none";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", "false");
    button.innerHTML = "<strong>NO MUSIC</strong><small>Soundtrack disabled · fastest load</small>";
    host.appendChild(button);
    UI.soundtrackChoices = [...host.querySelectorAll(".soundtrack-choice")];
    button.addEventListener("click", (event) => {
      if (state.role === "guest") {
        event.preventDefault(); event.stopImmediatePropagation();
        return setStatus("Only the lobby admin chooses the soundtrack.", "error");
      }
      state.musicEnabled = false;
      state.guestReady = false;
      applyMusicState();
      updateLobbyDisplay();
      if (state.role === "host") sendLobby();
      setStatus("No music selected. The match will load faster.", "ok");
    }, true);
  }

  ensureNoMusicChoice();
  UI.soundtrackChoices.forEach((button) => {
    if (button.dataset.style === "none") return;
    button.addEventListener("click", (event) => {
      if (state.role !== "guest") return;
      event.preventDefault(); event.stopImmediatePropagation();
      setStatus("Only the lobby admin chooses the soundtrack.", "error");
    }, true);
    button.addEventListener("click", () => {
      if (state.role !== "host") return;
      state.musicStyle = button.dataset.style;
      state.musicEnabled = true;
      state.guestReady = false;
      setTimeout(() => { applyMusicState(); updateLobbyDisplay(); sendLobby(); });
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

  createButton.addEventListener("click", createRoom);
  showJoinButton.addEventListener("click", () => {
    joinForm.hidden = !joinForm.hidden;
    if (!joinForm.hidden) codeInput.focus();
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
      await navigator.clipboard.writeText(state.roomCode);
      copyButton.textContent = "COPIED";
      setTimeout(() => { copyButton.textContent = "COPY CODE"; }, 1500);
    } catch {
      codeInput.value = state.roomCode;
      joinForm.hidden = false;
      codeInput.select();
    }
  });

  let parentRoom = null;
  try { parentRoom = new URLSearchParams(window.parent.location.search).get("room"); } catch {}
  if (parentRoom && /^[A-HJ-NP-Z2-9]{6}$/i.test(parentRoom)) {
    codeInput.value = parentRoom.toUpperCase();
    joinForm.hidden = false;
    setStatus("Lobby code filled in. Click JOIN LOBBY.");
  }

  document.querySelector(".intro-lede").textContent =
    "Create a lightweight lobby, choose champion, arena and soundtrack, then duel online without pause.";
  const feature = [...document.querySelectorAll(".intro-notes span")]
    .find((item) => item.textContent.includes("Local PvP") || item.textContent.includes("Online PvP"));
  if (feature) feature.textContent = "Online PvP · independent controls";
})();
