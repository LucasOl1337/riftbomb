"use strict";

document.title = "RIFTBOMB // ONLINE";

const CHAMPIONS = [
  { id: "katarina", name: "Katarina", glyph: "⚔" },
  { id: "zed", name: "Zed", glyph: "◈" },
  { id: "renekton", name: "Renekton", glyph: "☀" },
  { id: "vladimir", name: "Vladimir", glyph: "◆" },
  { id: "gangplank", name: "Gangplank", glyph: "⚓" },
  { id: "ziggs", name: "Ziggs", glyph: "✦" }
];

const MOVEMENT_MAP = {
  KeyW: "KeyW", ArrowUp: "KeyW",
  KeyA: "KeyA", ArrowLeft: "KeyA",
  KeyS: "KeyS", ArrowDown: "KeyS",
  KeyD: "KeyD", ArrowRight: "KeyD"
};

let onlineMusic;
let onlineRenderer;
let onlinePresentation = null;
let remoteGame = null;
let predictedGame = null;
let playerId = null;
let ws = null;
let playing = false;
let onlineLastFrame = performance.now();
let lobbyHost = null;
const pendingMovement = new Set();
let selectedChampion = null;
let remoteChampion = null;
let inputSeq = 0;
const inputHistory = [];

const onlineFormatTime = (seconds) => {
  seconds = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

function onlineFormatBeat() {
  if (!onlineMusic) return;
  const position = onlineMusic.position();
  const progress = position / onlineMusic.duration;
  const beat = onlineMusic.stepIndex % 4;
  if (UI.trackTime) UI.trackTime.textContent = onlineFormatTime(position);
  if (UI.playhead) UI.playhead.style.setProperty("--progress", progress.toFixed(5));
  if (UI.beatDots) {
    UI.beatDots.forEach((dot, i) => dot.classList.toggle("is-on", i === beat));
  }
  if (UI.musicSection) {
    const bar = Math.floor(onlineMusic.stepIndex / 16) % onlineMusic.totalBars;
    const section = onlineMusic.sectionForBar(bar);
    UI.musicSection.textContent = section?.name ?? "-";
  }
}

function buildChampionButton(champion) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "champion-choice";
  button.dataset.champion = champion.id;
  button.innerHTML = `<span class="champion-glyph" aria-hidden="true">${champion.glyph}</span><strong>${champion.name}</strong>`;
  return button;
}

function setupLobby() {
  const existing = document.getElementById("online-lobby");
  if (existing) existing.remove();

  const lobby = document.createElement("div");
  lobby.id = "online-lobby";
  lobby.setAttribute("role", "dialog");
  lobby.setAttribute("aria-modal", "true");
  lobby.innerHTML = `
    <div class="online-lobby-card">
      <div class="micro">[ ONLINE ]</div>
      <h2>Quick Duel Lobby</h2>
      <p id="online-lobby-status">Connecting...</p>
      <div class="online-lobby-count" id="online-lobby-count">Players 0 / 2</div>
      <div class="online-champion-select" id="online-champion-select" role="group" aria-label="Choose your champion"></div>
      <div class="online-rival-choice micro" id="online-rival-choice"></div>
      <button class="primary" id="online-lobby-ready" disabled>Choose a champion</button>
    </div>
  `;
  document.body.appendChild(lobby);

  const style = document.createElement("style");
  style.textContent = `
    #online-lobby { position: fixed; inset: 0; display: grid; place-items: center; z-index: 100; background: rgba(10,10,10,0.92); }
    #online-lobby[hidden] { display: none !important; }
    .online-lobby-card { text-align: center; max-width: 420px; padding: 2rem; border: 1px solid #2a3a2a; background: #0e1612; }
    .online-lobby-card h2 { margin: 0.5rem 0; color: #e2bf72; }
    .online-lobby-count { font-size: 1.5rem; margin: 1rem 0; color: #9ebf9e; }
    .online-champion-select { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin: 1rem 0; }
    .online-champion-select button { padding: 0.75rem; background: #1a2420; border: 1px solid #2a3a2a; color: #c9d8c9; cursor: pointer; }
    .online-champion-select button:disabled { opacity: 0.4; cursor: not-allowed; }
    .online-champion-select button.selected { border-color: #e2bf72; background: #2a3020; }
    .online-rival-choice { margin: 0.5rem 0; color: #9ebf9e; min-height: 1.2em; }
  `;
  document.head.appendChild(style);

  const selectHost = document.getElementById("online-champion-select");
  for (const champion of CHAMPIONS) {
    const button = buildChampionButton(champion);
    button.addEventListener("click", () => chooseChampion(champion.id));
    selectHost.appendChild(button);
  }

  lobbyHost = lobby;
  connect();
}

function setLobbyStatus(text, ready = false, players = null, choices = null) {
  const status = document.getElementById("online-lobby-status");
  const count = document.getElementById("online-lobby-count");
  const button = document.getElementById("online-lobby-ready");
  const rival = document.getElementById("online-rival-choice");
  const room = players ?? (ws && ws.readyState === 1 ? 1 : 0);
  if (status) status.textContent = text;
  if (count) count.textContent = `Players ${room} / 2`;
  if (button) {
    button.disabled = !ready;
    button.textContent = ready ? "Waiting for rival" : (selectedChampion ? "Waiting for rival" : "Choose a champion");
  }
  if (rival && choices) {
    const other = choices.find((c) => c.playerId !== playerId);
    if (other && other.champion) {
      const name = CHAMPIONS.find((c) => c.id === other.champion)?.name || other.champion;
      rival.textContent = `Rival picked ${name}`;
    } else {
      rival.textContent = "Rival choosing...";
    }
  }
}

function chooseChampion(champion) {
  if (selectedChampion) return;
  selectedChampion = champion;
  sendInput({ type: "champion", champion });
  document.querySelectorAll(".online-champion-select button").forEach((button) => {
    button.disabled = true;
    button.classList.toggle("selected", button.dataset.champion === champion);
  });
  setLobbyStatus("Champion locked · waiting for rival", false, null, null);
}

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${location.host}/ws`;
  setLobbyStatus(`Connecting to ${location.host}...`);

  try {
    ws = new WebSocket(url);
  } catch (error) {
    setLobbyStatus("WebSocket not supported");
    return;
  }

  ws.onopen = () => setLobbyStatus("Connected · waiting for rival");

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleServerMessage(message);
    } catch {
      // ignore
    }
  };

  ws.onclose = () => {
    playing = false;
    selectedChampion = null;
    remoteChampion = null;
    if (lobbyHost) lobbyHost.hidden = false;
    if (UI.live) UI.live.textContent = "Online mode";
    setLobbyStatus("Disconnected");
  };

  ws.onerror = () => setLobbyStatus("Connection error");
}

function handleServerMessage(message) {
  if (message.type === "welcome") {
    playerId = message.playerId;
  } else if (message.type === "lobby") {
    if (message.choices) {
      const mine = message.choices.find((c) => c.playerId === playerId);
      const rival = message.choices.find((c) => c.playerId !== playerId);
      if (!selectedChampion && mine?.champion) selectedChampion = mine.champion;
      remoteChampion = rival?.champion || null;
    }
    const readyCount = message.choices?.filter((c) => c.ready).length ?? message.players;
    const status = readyCount === 2 ? "Rival found · starting" : `Players ${message.players} / ${message.max}`;
    if (readyCount < 2 && playing) {
      playing = false;
      if (lobbyHost) lobbyHost.hidden = false;
      if (UI.live) UI.live.textContent = "Online mode";
    }
    setLobbyStatus(status, readyCount === 2, message.players, message.choices);
  } else if (message.type === "start") {
    playerId = message.playerId;
    remoteGame = Object.create(Game.prototype);
    Object.assign(remoteGame, message.snapshot);
    predictedGame = null;
    inputHistory.length = 0;
    startOnlineMatch();
  } else if (message.type === "snapshot") {
    if (!remoteGame) {
      remoteGame = Object.create(Game.prototype);
      predictedGame = null;
    }
    Object.assign(remoteGame, message.snapshot);
    predictedGame = null;
  } else if (message.type === "finish") {
    playing = false;
    if (lobbyHost) lobbyHost.hidden = false;
    setLobbyStatus("Match over · waiting for rematch");
  }
}

function startOnlineMatch() {
  if (lobbyHost) lobbyHost.hidden = true;
  UI.intro.classList.add("is-gone");
  UI.chrome.classList.remove("is-hidden");
  UI.chrome.setAttribute("aria-hidden", "false");
  UI.chrome.removeAttribute("inert");
  if (onlinePresentation) {
    const localChampion = remoteGame?.players?.[playerId - 1]?.champion;
    if (localChampion) onlinePresentation.selectChampion(localChampion);
    onlinePresentation.prepareRound();
    onlinePresentation.announce("Online match connected");
  } else if (UI.live) {
    UI.live.textContent = "Online match connected";
  }
  onlineMusic.start().catch(() => {});
  playing = true;
}

function sendInput(message) {
  if (ws && ws.readyState === 1) {
    if (message.seq === undefined) message.seq = ++inputSeq;
    else inputSeq = Math.max(inputSeq, message.seq);
    ws.send(JSON.stringify(message));
    if (message.type === "input" && message.dx !== undefined) {
      inputHistory.push(message);
    }
  }
}

function setupOnlineInput() {
  const abilitySlots = {
    KeyQ: 0,
    KeyF: 1,
    KeyE: 2,
    KeyR: 3,
    ShiftLeft: 1,
    ShiftRight: 1
  };

  addEventListener("keydown", (event) => {
    if (onlineMusic?.ctx?.state === "suspended") onlineMusic.ctx.resume().catch(() => {});
    if (!playing || !playerId) return;
    const code = event.code;

    const moveKey = MOVEMENT_MAP[code];
    if (moveKey) {
      event.preventDefault();
      if (!pendingMovement.has(moveKey)) {
        pendingMovement.add(moveKey);
        sendInput({ type: "keydown", key: moveKey });
      }
      return;
    }

    if (event.repeat) return;

    if (code === "Space") {
      event.preventDefault();
      sendInput({ type: "action", action: "bomb" });
    } else if (abilitySlots[code] !== undefined) {
      event.preventDefault();
      sendInput({ type: "action", action: "ability", slot: abilitySlots[code] });
    }
  });

  addEventListener("keyup", (event) => {
    if (!playing || !playerId) return;
    const code = event.code;
    const moveKey = MOVEMENT_MAP[code];
    if (moveKey && pendingMovement.has(moveKey)) {
      pendingMovement.delete(moveKey);
      sendInput({ type: "keyup", key: moveKey });
    }
  });

  addEventListener("blur", () => {
    for (const key of pendingMovement) sendInput({ type: "keyup", key });
    pendingMovement.clear();
  });
}

function predictMovement(game, player, dt) {
  if (!player || !player.alive) return;
  let dx = 0;
  let dz = 0;
  if (pendingMovement.has("KeyA")) dx -= 1;
  if (pendingMovement.has("KeyD")) dx += 1;
  if (pendingMovement.has("KeyW")) dz -= 1;
  if (pendingMovement.has("KeyS")) dz += 1;
  if (dx === 0 && dz === 0) return;
  const passableBombs = (game.bombs || []).filter(
    (bomb) => !bomb.exploded && Array.isArray(bomb.passOwners) && bomb.passOwners.includes(player.id)
  );
  const preparation = player.speedBoost > 0 ? 1.3 : 1;
  const speed = player.speed * preparation * (player.dashing > 0 ? 2.7 : 1);
  game.moveEntity(player, dx, dz, speed, dt, 0.3, passableBombs);
}

function onlineFrame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - onlineLastFrame) / 1000));
  onlineLastFrame = now;

  if (playing && remoteGame) {
    onlineMusic.syncFromGame(remoteGame, dt);
    onlineMusic.updateEnergy();

    let renderGame = remoteGame;
    if (playerId) {
      const localIndex = playerId - 1;
      const localPlayer = remoteGame.players[localIndex];
      if (localPlayer && localPlayer.alive) {
        if (!predictedGame) {
          predictedGame = Object.create(Game.prototype);
          Object.assign(predictedGame, remoteGame);
          predictedGame.players = remoteGame.players.map((p) => ({ ...p }));
        }
        predictMovement(predictedGame, predictedGame.players[localIndex], dt);
        renderGame = predictedGame;
      }
    }

    onlineRenderer.render(renderGame, onlineMusic, dt, now);

    if (onlinePresentation) {
      const otherId = playerId === 1 ? 2 : 1;
      const localMatch = Object.create(renderGame);
      localMatch.players = [renderGame.players[playerId - 1], renderGame.players[otherId - 1]];
      localMatch.p2Human = true;
      onlinePresentation.update(localMatch);
    }

    onlineFormatBeat();
  }

  requestAnimationFrame(onlineFrame);
}

function bootOnline() {
  try {
    if (typeof UI === "undefined") {
      document.body.innerHTML = "<h1 style='color:white'>UI not loaded</h1>";
      return;
    }
    UI.live.textContent = "Online mode booting...";
    onlineMusic = new MusicEngine();
    onlineRenderer = new Renderer(UI.canvas);
    if (typeof BrowserMatchPresentation !== "undefined") onlinePresentation = new BrowserMatchPresentation();
    UI.gpuLabel.textContent = `WebGL2 · ${onlineRenderer.ext ? "HDR" : "adaptive"}`;
    setupLobby();
    setupOnlineInput();
    requestAnimationFrame(onlineFrame);
  } catch (error) {
    console.error(error);
    UI.live.textContent = "Online boot error: " + error.message;
    const status = document.getElementById("online-lobby-status");
    if (status) status.textContent = "WebGL2 is required";
  }
}

bootOnline();
