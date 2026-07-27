"use strict";

document.title = "RIFTBOMB // ONLINE LOADING";

let onlineMusic;
let onlineRenderer;
let onlinePresentation = null;
let remoteGame = null;
let playerId = null;
let ws = null;
let playing = false;
let onlineLastFrame = performance.now();
let lobbyHost = null;
let predictedGame = null;
const pendingMovement = new Set();

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
      <button class="primary" id="online-lobby-ready" disabled>Waiting for rival</button>
    </div>
  `;
  document.body.appendChild(lobby);

  const style = document.createElement("style");
  style.textContent = `
    #online-lobby { position: fixed; inset: 0; display: grid; place-items: center; z-index: 100; background: rgba(10,10,10,0.92); }
    #online-lobby[hidden] { display: none !important; }
    .online-lobby-card { text-align: center; max-width: 360px; padding: 2rem; border: 1px solid #2a3a2a; background: #0e1612; }
    .online-lobby-card h2 { margin: 0.5rem 0; color: #e2bf72; }
    .online-lobby-count { font-size: 1.5rem; margin: 1rem 0; color: #9ebf9e; }
  `;
  document.head.appendChild(style);

  lobbyHost = lobby;
  connect();
}

function setLobbyStatus(text, ready = false, players = null) {
  const status = document.getElementById("online-lobby-status");
  const count = document.getElementById("online-lobby-count");
  const button = document.getElementById("online-lobby-ready");
  const room = players ?? (ws && ws.readyState === 1 ? 1 : 0);
  if (status) status.textContent = text;
  if (count) count.textContent = `Players ${room} / 2`;
  if (button) {
    button.disabled = !ready;
    button.textContent = ready ? "Match running" : (room < 2 ? "Waiting for rival" : "Match running");
  }
}

function clientsInRoom() {
  return ws && ws.readyState === 1 ? 1 : 0;
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
    if (lobbyHost) lobbyHost.hidden = false;
    if (UI.live) UI.live.textContent = "Online mode";
    setLobbyStatus("Disconnected");
  };

  ws.onerror = () => setLobbyStatus("Connection error");
}

function handleServerMessage(message) {
  if (message.type === "lobby") {
    const ready = message.players === 2;
    const status = ready ? "Rival found · starting" : `Players ${message.players} / ${message.max}`;
    if (!ready && playing) {
      playing = false;
      if (lobbyHost) lobbyHost.hidden = false;
      if (UI.live) UI.live.textContent = "Online mode";
    }
    setLobbyStatus(status, ready, message.players);
  } else if (message.type === "start") {
    playerId = message.playerId;
    remoteGame = Object.create(Game.prototype);
    Object.assign(remoteGame, message.snapshot);
    if (onlinePresentation && remoteGame.players[0]) onlinePresentation.selectChampion(remoteGame.players[0].champion);
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
    ws.send(JSON.stringify(message));
  }
}

function setupOnlineInput() {
  const actionKeys = new Set(["Space", "Enter", "Numpad0", "ShiftLeft", "ShiftRight", "KeyQ", "KeyF", "KeyE", "KeyR"]);

  addEventListener("keydown", (event) => {
    if (onlineMusic?.ctx?.state === "suspended") onlineMusic.ctx.resume().catch(() => {});
    if (!playing || !playerId) return;
    const code = event.code;
    if (actionKeys.has(code)) {
      event.preventDefault();
      if (event.repeat) return;
      if (code === "Space") sendInput({ type: "action", action: "bomb" });
      else if (code === "Enter" || code === "Numpad0") sendInput({ type: "action", action: "bomb" });
      else if (code === "ShiftRight") sendInput({ type: "action", action: "satchel" });
      else if (code === "ShiftLeft") sendInput({ type: "action", action: "ability", slot: 1 });
      else if (code === "KeyQ") sendInput({ type: "action", action: "ability", slot: 0 });
      else if (code === "KeyF") sendInput({ type: "action", action: "ability", slot: 1 });
      else if (code === "KeyE") sendInput({ type: "action", action: "ability", slot: 2 });
      else if (code === "KeyR") sendInput({ type: "action", action: "ability", slot: 3 });
    }
    if (isMovement(code)) {
      event.preventDefault();
      if (!pendingMovement.has(code)) {
        pendingMovement.add(code);
        sendInput({ type: "keydown", key: code });
      }
    }
  });

  addEventListener("keyup", (event) => {
    if (!playing || !playerId) return;
    const code = event.code;
    if (pendingMovement.has(code)) {
      pendingMovement.delete(code);
      sendInput({ type: "keyup", key: code });
    }
  });

  addEventListener("blur", () => {
    for (const code of pendingMovement) sendInput({ type: "keyup", key: code });
    pendingMovement.clear();
  });
}

function isMovement(code) {
  if (playerId === 1) {
    return ["KeyW", "KeyA", "KeyS", "KeyD"].includes(code);
  }
  return ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(code);
}

function predictMovement(game, player, dt) {
  if (!player || !player.alive) return;
  let dx = 0;
  let dz = 0;
  if (playerId === 1) {
    if (pendingMovement.has("KeyA")) dx -= 1;
    if (pendingMovement.has("KeyD")) dx += 1;
    if (pendingMovement.has("KeyW")) dz -= 1;
    if (pendingMovement.has("KeyS")) dz += 1;
  } else {
    if (pendingMovement.has("ArrowLeft")) dx -= 1;
    if (pendingMovement.has("ArrowRight")) dx += 1;
    if (pendingMovement.has("ArrowUp")) dz -= 1;
    if (pendingMovement.has("ArrowDown")) dz += 1;
  }
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
      const localPlayer = remoteGame.players[playerId - 1];
      if (localPlayer && localPlayer.alive) {
        if (!predictedGame) {
          predictedGame = Object.create(Game.prototype);
          Object.assign(predictedGame, remoteGame);
          predictedGame.players = remoteGame.players.map((p) => ({ ...p }));
        }
        predictMovement(predictedGame, predictedGame.players[playerId - 1], dt);
        renderGame = predictedGame;
      }
    }

    onlineRenderer.render(renderGame, onlineMusic, dt, now);
    if (onlinePresentation) onlinePresentation.update(renderGame);
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
