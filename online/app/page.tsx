"use client";

import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ARENAS,
  CHAMPIONS,
  INITIAL_RUNTIME_STATE,
  MODES,
  RIFTBOMB_BRIDGE_VERSION,
  arenaById,
  championById,
  isRuntimeStateMessage,
  modeById,
  runtimeStateEquals,
  type ArenaId,
  type ChampionId,
  type ClientCommand,
  type ClientMode,
  type RuntimeState,
} from "./riftbomb-client";

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

function Icon({
  children,
  className = "",
  viewBox = "0 0 24 24",
}: {
  children: ReactNode;
  className?: string;
  viewBox?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    >
      {children}
    </svg>
  );
}

function ModeIcon({ mode }: { mode: ClientMode }) {
  if (mode === "online") {
    return (
      <Icon>
        <path d="m7 4 10 16M17 4 7 20M5 7l3-3 2 4M19 7l-3-3-2 4" />
      </Icon>
    );
  }
  if (mode === "solo") {
    return (
      <Icon>
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </Icon>
    );
  }
  if (mode === "local") {
    return (
      <Icon>
        <circle cx="8" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M2.5 19c.5-4 2.3-6 5.5-6s5 2 5.5 6M13 15c1-.9 2.2-1.4 3.8-1.4 2.7 0 4.2 1.7 4.7 5.4" />
      </Icon>
    );
  }
  if (mode === "challenge") {
    return (
      <Icon>
        <path d="M9.5 14.5 14.5 9M7.5 17H6a4 4 0 0 1 0-8h3M16.5 7H18a4 4 0 1 1 0 8h-3" />
      </Icon>
    );
  }
  return (
    <Icon>
      <path d="M4 12h12M12 7l5 5-5 5M20 5v14" />
    </Icon>
  );
}

function RuntimeFrame({
  frameRef,
  legacy = false,
}: {
  frameRef?: RefObject<HTMLIFrameElement | null>;
  legacy?: boolean;
}) {
  return (
    <iframe
      ref={frameRef}
      className={legacy ? "game-frame game-frame--legacy" : "game-frame"}
      src={legacy ? "/riftbomb.html" : "/riftbomb.html?client=1"}
      title="Riftbomb Online"
      allow="autoplay; fullscreen; gamepad; screen-wake-lock"
      tabIndex={-1}
    />
  );
}

function LegacyClient() {
  return (
    <main className="game-shell game-shell--legacy">
      <RuntimeFrame legacy />
      <button
        className="legacy-return"
        type="button"
        onClick={() => window.location.assign("/")}
      >
        Voltar ao novo client
      </button>
    </main>
  );
}

function subscribeToLocation(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

function currentSearch() {
  return window.location.search;
}

function formatRuntimeStatus(runtime: RuntimeState) {
  if (runtime.tone === "error") {
    if (/not found|expired/i.test(runtime.status)) {
      return "Sala não encontrada ou expirada. Confira o código.";
    }
    if (/already has two|room_full/i.test(runtime.status)) {
      return "Essa sala já tem dois jogadores.";
    }
    return "Não foi possível concluir a conexão. Tente novamente.";
  }
  if (runtime.phase === "boot") return "Preparando a arena e os Champions…";
  if (runtime.phase === "match") return "Partida em andamento";
  if (runtime.role === "host" && !runtime.connected) {
    return "Conectando ao servidor de São Paulo…";
  }
  if (runtime.role === "host" && !runtime.rivalConnected) {
    return "Sala criada. Aguardando o segundo jogador.";
  }
  if (runtime.role === "host" && !runtime.guestReady) {
    return "Oponente conectado e escolhendo o Champion.";
  }
  if (runtime.role === "host" && runtime.guestReady) {
    return "Formação pronta. Você pode iniciar a partida.";
  }
  if (runtime.role === "guest" && !runtime.connected) {
    return "Entrando na sala…";
  }
  if (runtime.role === "guest" && runtime.guestReady) {
    return "Você está pronto. Aguarde o administrador.";
  }
  if (runtime.role === "guest") return "Escolha seu Champion e confirme.";
  return "Arena carregada. Escolha um modo para começar.";
}

function playerStateLabel(runtime: RuntimeState, side: "host" | "guest") {
  if (side === "host") {
    if (runtime.role === "host") return "ADMIN";
    if (runtime.role === "guest") return "ANFITRIÃO";
    return "VOCÊ";
  }
  if (!runtime.rivalConnected && runtime.role !== "guest") return "AGUARDANDO";
  if (runtime.guestReady) return "PRONTO";
  if (runtime.role === "guest") return "VOCÊ";
  return "ESCOLHENDO";
}

export default function Home() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const lastRuntimeRef = useRef<RuntimeState | null>(null);
  const [runtime, setRuntime] = useState(INITIAL_RUNTIME_STATE);
  const [activeMode, setActiveMode] = useState<ClientMode>("online");
  const [champion, setChampion] = useState<ChampionId>("katarina");
  const [rivalChampion, setRivalChampion] = useState<ChampionId>("zed");
  const [arena, setArena] = useState<ArenaId>("lattice");
  const [roomCode, setRoomCode] = useState("");
  const [copyLabel, setCopyLabel] = useState("COPIAR");
  const [clientNotice, setClientNotice] = useState("");
  const search = useSyncExternalStore(subscribeToLocation, currentSearch, () => "");
  const legacy = new URLSearchParams(search).get("legacy") === "1";

  const sendCommand = useCallback(
    (action: string, payload?: Record<string, unknown>) => {
      const target = frameRef.current?.contentWindow;
      if (!target) return;
      const message: ClientCommand = {
        source: "riftbomb-client",
        version: RIFTBOMB_BRIDGE_VERSION,
        type: "command",
        action,
        payload,
      };
      target.postMessage(message, window.location.origin);
    },
    [],
  );

  useEffect(() => {
    function receiveRuntimeMessage(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        event.source !== frameRef.current?.contentWindow ||
        !isRuntimeStateMessage(event.data)
      ) {
        return;
      }
      const next = event.data.state;
      if (runtimeStateEquals(lastRuntimeRef.current, next)) return;
      lastRuntimeRef.current = next;
      setRuntime(next);
      setChampion(next.role === "guest" ? next.guestChampion : next.hostChampion);
      setRivalChampion(
        next.role === "guest" ? next.hostChampion : next.guestChampion,
      );
      setArena(next.arena);
      if (next.roomCode) setRoomCode(next.roomCode);
      if (next.role === "guest") setActiveMode("join");
      if (next.role === "host") {
        setActiveMode(next.inviteMode ? "challenge" : "online");
      }
    }

    window.addEventListener("message", receiveRuntimeMessage);
    return () => window.removeEventListener("message", receiveRuntimeMessage);
  }, []);

  useEffect(() => {
    if (legacy === false) sendCommand("sync");
  }, [legacy, sendCommand]);

  useEffect(() => {
    if (runtime.phase !== "match") return;
    window.requestAnimationFrame(() => frameRef.current?.focus());
  }, [runtime.phase]);

  const selectedMode = modeById(activeMode);
  const selectedChampion = championById(champion);
  const selectedRival = championById(rivalChampion);
  const selectedArena = arenaById(arena);
  const bridgeReady = runtime.phase !== "boot";
  const inLobby = runtime.role !== "offline" && runtime.phase === "lobby";
  const inMatch = runtime.phase === "match";
  const isGuest = runtime.role === "guest";
  const isHost = runtime.role === "host";
  const showRivalPicker = ["solo", "local", "challenge"].includes(activeMode);
  const primaryDisabled =
    !bridgeReady ||
    runtime.busy ||
    (activeMode === "join" && !ROOM_CODE_PATTERN.test(roomCode)) ||
    (isGuest && !runtime.connected) ||
    (isHost && (!runtime.connected || !runtime.guestReady));

  const heroStyle = {
    "--client-hero": `url("${selectedArena.hero}")`,
  } as CSSProperties;

  function chooseMode(mode: ClientMode) {
    if (inLobby) return;
    setActiveMode(mode);
    setClientNotice("");
  }

  function chooseChampion(next: ChampionId) {
    setChampion(next);
    if (!inLobby) return;
    sendCommand("select-champion", { champion: next });
  }

  function chooseRival(next: ChampionId) {
    setRivalChampion(next);
    if (!inLobby || !isHost) return;
    sendCommand("select-rival-champion", { champion: next });
  }

  function chooseArena(next: ArenaId) {
    setArena(next);
    if (!inLobby || isGuest) return;
    sendCommand("select-arena", { arena: next });
  }

  function normalizeRoomCode(value: string) {
    return value
      .toUpperCase()
      .replace(/[^A-HJ-NP-Z2-9]/g, "")
      .slice(0, 6);
  }

  async function enterFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      }
    } catch {}
    try {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (value: "landscape") => Promise<void>;
      };
      await orientation.lock?.("landscape");
    } catch {}
  }

  function launchSelectedMode(event?: FormEvent) {
    event?.preventDefault();
    setClientNotice("");
    if (!bridgeReady || runtime.busy) return;

    if (isGuest) {
      sendCommand("toggle-ready");
      return;
    }
    if (isHost) {
      sendCommand("start-online");
      return;
    }
    if (activeMode === "online") {
      sendCommand("create-room", { champion, arena });
      return;
    }
    if (activeMode === "challenge") {
      sendCommand("create-challenge", {
        hostChampion: champion,
        guestChampion: rivalChampion,
        arena,
      });
      return;
    }
    if (activeMode === "join") {
      if (!ROOM_CODE_PATTERN.test(roomCode)) {
        setClientNotice("Digite os seis caracteres da sala.");
        return;
      }
      sendCommand("join-room", { code: roomCode, champion });
      return;
    }
    sendCommand("start-offline", {
      mode: activeMode,
      champion,
      guestChampion: rivalChampion,
      arena,
    });
  }

  function leaveLobby() {
    sendCommand("leave-lobby");
    setRoomCode("");
    setClientNotice("");
  }

  async function copyInvite() {
    const value = runtime.inviteMode ? runtime.inviteUrl : runtime.roomCode;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyLabel("COPIADO");
      window.setTimeout(() => setCopyLabel("COPIAR"), 1600);
    } catch {
      setClientNotice(
        runtime.inviteMode
          ? "Selecione e copie o link exibido na sala."
          : `Código da sala: ${runtime.roomCode}`,
      );
    }
  }

  const primaryLabel = useMemo(() => {
    if (!bridgeReady) return "CARREGANDO ARENA";
    if (runtime.busy) return "CONECTANDO";
    if (isGuest) return runtime.guestReady ? "CANCELAR PRONTO" : "ESTOU PRONTO";
    if (isHost) {
      if (!runtime.rivalConnected) return "AGUARDANDO OPONENTE";
      if (!runtime.guestReady) return "OPONENTE ESCOLHENDO";
      return "INICIAR PARTIDA";
    }
    if (activeMode === "online") return "CRIAR SALA";
    if (activeMode === "challenge") return "CRIAR DESAFIO";
    if (activeMode === "join") return "ENTRAR NA SALA";
    if (activeMode === "local") return "INICIAR VERSUS LOCAL";
    return "INICIAR TREINAMENTO";
  }, [
    activeMode,
    bridgeReady,
    isGuest,
    isHost,
    runtime.busy,
    runtime.guestReady,
    runtime.rivalConnected,
  ]);

  if (legacy) return <LegacyClient />;

  return (
    <main className={`game-shell${inMatch ? " is-match-live" : ""}`}>
      <RuntimeFrame frameRef={frameRef} />

      <section
        className="client-shell"
        style={heroStyle}
        aria-hidden={inMatch}
      >
        <header className="client-topbar">
          <div className="client-brand">
            <span className="client-brand-mark">
              <b>R</b>
            </span>
            <span>
              <strong>RIFTBOMB</strong>
              <small>BOMBER RIFT CLIENT</small>
            </span>
          </div>

          <nav className="client-nav" aria-label="Navegação principal">
            <button className="is-active" type="button">
              JOGAR
            </button>
            <button type="button" disabled>
              CHAMPIONS
            </button>
            <button type="button" disabled>
              PROGRESSÃO
            </button>
          </nav>

          <div className="client-utilities">
            <span className={`client-runtime${bridgeReady ? " is-ready" : ""}`}>
              <i />
              {bridgeReady ? "RUNTIME PRONTO" : "CARREGANDO"}
            </span>
            <button
              className="client-icon-button"
              type="button"
              onClick={enterFullscreen}
              aria-label="Abrir em tela cheia"
            >
              <Icon>
                <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
              </Icon>
            </button>
            <span className="client-profile" aria-label="Perfil local">
              J
            </span>
          </div>
        </header>

        <div className="client-layout">
          <aside className="mode-rail">
            <div className="mode-rail__heading">
              <span className="client-eyebrow">ESCOLHA DE FILA</span>
              <h1>Jogar</h1>
              <p>Escolha como a próxima partida será preparada.</p>
            </div>

            <div className="mode-list" role="list">
              {MODES.map((mode) => (
                <button
                  key={mode.id}
                  className={`mode-item${activeMode === mode.id ? " is-selected" : ""}`}
                  type="button"
                  onClick={() => chooseMode(mode.id)}
                  disabled={inLobby}
                  aria-pressed={activeMode === mode.id}
                >
                  <span className="mode-item__icon">
                    <ModeIcon mode={mode.id} />
                  </span>
                  <span className="mode-item__copy">
                    <small>{mode.eyebrow}</small>
                    <strong>{mode.name}</strong>
                  </span>
                  {mode.badge ? <b>{mode.badge}</b> : null}
                  <span className="mode-item__chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
              ))}
            </div>

            <button
              className="classic-link"
              type="button"
              onClick={() => window.location.assign("/?legacy=1")}
            >
              <Icon>
                <path d="M4 6h16v12H4zM8 10h8M8 14h5" />
              </Icon>
              Interface clássica
            </button>
          </aside>

          <section className="client-stage">
            <div className="client-stage__shade" />
            <div className="client-stage__grid" />

            <div className="client-hero-copy">
              <span className="client-eyebrow">{selectedMode.eyebrow}</span>
              <h2>{selectedMode.name}</h2>
              <p>{selectedMode.description}</p>
              <span className="client-server-tag">
                <i />
                {activeMode === "online" ||
                activeMode === "challenge" ||
                activeMode === "join"
                  ? "SERVIDOR AUTORITATIVO · SÃO PAULO"
                  : "SESSÃO LOCAL · SEM FILA"}
              </span>
            </div>

            <form className="match-config" onSubmit={launchSelectedMode}>
              <div className="match-config__head">
                <div>
                  <span className="client-eyebrow">
                    {isGuest ? "SUA ESCOLHA" : "CONFIGURAÇÃO DA PARTIDA"}
                  </span>
                  <h3>
                    {inLobby
                      ? `Sala ${runtime.roomCode || "------"}`
                      : `${selectedChampion.name} em ${selectedArena.shortName}`}
                  </h3>
                </div>
                {inLobby ? (
                  <button
                    className="config-text-button"
                    type="button"
                    onClick={leaveLobby}
                  >
                    SAIR DA SALA
                  </button>
                ) : null}
              </div>

              {activeMode === "join" && !inLobby ? (
                <label className="room-code-field">
                  <span>CÓDIGO DA SALA</span>
                  <input
                    value={roomCode}
                    onChange={(event) =>
                      setRoomCode(normalizeRoomCode(event.target.value))
                    }
                    placeholder="------"
                    inputMode="text"
                    autoComplete="off"
                    maxLength={6}
                    aria-label="Código de seis caracteres da sala"
                  />
                  <small>Sem as letras I e O para evitar confusão.</small>
                </label>
              ) : null}

              <div className="config-section">
                <div className="config-section__label">
                  <span>{isGuest ? "SEU CHAMPION" : "CHAMPION"}</span>
                  <small>{selectedChampion.role}</small>
                </div>
                <div className="champion-grid">
                  {CHAMPIONS.map((item) => (
                    <button
                      key={item.id}
                      className={`champion-choice${champion === item.id ? " is-selected" : ""}`}
                      type="button"
                      onClick={() => chooseChampion(item.id)}
                      disabled={runtime.busy || (inLobby && runtime.inviteMode)}
                      aria-pressed={champion === item.id}
                      title={item.name}
                    >
                      <img
                        src={item.portrait}
                        alt=""
                        width={38}
                        height={38}
                        loading="lazy"
                        decoding="async"
                      />
                      <span>{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {showRivalPicker ? (
                <div className="config-section config-section--rival">
                  <div className="config-section__label">
                    <span>
                      {activeMode === "solo" ? "RIVAL CPU" : "CHAMPION RIVAL"}
                    </span>
                    <small>{selectedRival.role}</small>
                  </div>
                  <div className="champion-grid champion-grid--compact">
                    {CHAMPIONS.map((item) => (
                      <button
                        key={item.id}
                        className={`champion-choice${rivalChampion === item.id ? " is-selected" : ""}`}
                        type="button"
                        onClick={() => chooseRival(item.id)}
                        disabled={runtime.busy || (inLobby && runtime.inviteMode)}
                        aria-pressed={rivalChampion === item.id}
                        title={item.name}
                      >
                        <img
                          src={item.portrait}
                          alt=""
                          width={38}
                          height={38}
                          loading="lazy"
                          decoding="async"
                        />
                        <span>{item.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeMode !== "join" || isHost ? (
                <div className="config-section config-section--arena">
                  <div className="config-section__label">
                    <span>ARENA</span>
                    <small>{selectedArena.description}</small>
                  </div>
                  <div className="arena-list">
                    {ARENAS.map((item, index) => (
                      <button
                        key={item.id}
                        className={`arena-choice${arena === item.id ? " is-selected" : ""}`}
                        type="button"
                        onClick={() => chooseArena(item.id)}
                        disabled={
                          runtime.busy ||
                          isGuest ||
                          (inLobby && runtime.inviteMode)
                        }
                        aria-pressed={arena === item.id}
                      >
                        <small>{String(index + 1).padStart(2, "0")}</small>
                        <span>{item.shortName}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <button
                className="config-submit config-submit--mobile"
                type="submit"
                disabled={primaryDisabled}
              >
                {primaryLabel}
              </button>
            </form>
          </section>

          <aside className="party-rail">
            <div className="party-rail__head">
              <div>
                <span className="client-eyebrow">FORMAÇÃO</span>
                <h2>{inLobby ? "Sala atual" : "Seu grupo"}</h2>
              </div>
              <span className="party-count">
                {runtime.rivalConnected || isGuest ? "2 / 2" : "1 / 2"}
              </span>
            </div>

            {inLobby ? (
              <div className="room-identity">
                <span>{runtime.inviteMode ? "LINK DO DESAFIO" : "CÓDIGO DA SALA"}</span>
                <strong>{runtime.roomCode || "------"}</strong>
                <button
                  type="button"
                  onClick={copyInvite}
                  disabled={
                    !runtime.connected ||
                    (runtime.inviteMode && !runtime.inviteUrl)
                  }
                >
                  <Icon>
                    <path d="M9 8h9v10H9zM6 15H4V5h9v2" />
                  </Icon>
                  {copyLabel}
                </button>
              </div>
            ) : null}

            <div className="party-slots">
              <article className="party-player is-present">
                <span className="party-player__portrait">
                  <img
                    src={
                      isGuest
                        ? championById(runtime.hostChampion).portrait
                        : selectedChampion.portrait
                    }
                    alt=""
                    width={49}
                    height={49}
                    loading="lazy"
                    decoding="async"
                  />
                  <i />
                </span>
                <span className="party-player__copy">
                  <small>{playerStateLabel(runtime, "host")}</small>
                  <strong>
                    {isGuest
                      ? championById(runtime.hostChampion).name
                      : selectedChampion.name}
                  </strong>
                  <span>{isGuest ? "Player 1" : "Você · Player 1"}</span>
                </span>
              </article>

              <article
                className={`party-player${runtime.rivalConnected || isGuest ? " is-present" : ""}`}
              >
                <span className="party-player__portrait">
                  {runtime.rivalConnected || isGuest || showRivalPicker ? (
                    <img
                      src={selectedRival.portrait}
                      alt=""
                      width={49}
                      height={49}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <Icon>
                      <circle cx="12" cy="8" r="3" />
                      <path d="M5 20c.5-5 2.8-7 7-7s6.5 2 7 7" />
                    </Icon>
                  )}
                  <i />
                </span>
                <span className="party-player__copy">
                  <small>{playerStateLabel(runtime, "guest")}</small>
                  <strong>
                    {runtime.rivalConnected || isGuest || showRivalPicker
                      ? selectedRival.name
                      : "Vaga aberta"}
                  </strong>
                  <span>
                    {activeMode === "solo"
                      ? "CPU · adaptativa"
                      : runtime.rivalConnected || isGuest
                        ? "Player 2"
                        : "Compartilhe o código"}
                  </span>
                </span>
              </article>
            </div>

            <div
              className={`party-status${runtime.tone === "error" ? " is-error" : ""}`}
            >
              <i />
              <p>{formatRuntimeStatus(runtime)}</p>
            </div>

            {clientNotice ? (
              <p className="client-notice" role="alert">
                {clientNotice}
              </p>
            ) : null}

            <div className="party-rail__footer">
              <button
                className="config-submit"
                type="button"
                onClick={() => launchSelectedMode()}
                disabled={primaryDisabled}
              >
                <span>{primaryLabel}</span>
                <Icon>
                  <path d="M5 12h13M14 7l5 5-5 5" />
                </Icon>
              </button>
              <small>
                {activeMode === "online" ||
                activeMode === "challenge" ||
                activeMode === "join"
                  ? "A partida online não pode ser pausada."
                  : "Controles e regras aparecem ao entrar na arena."}
              </small>
            </div>
          </aside>
        </div>

        <button className="rotate-gate" type="button" onClick={enterFullscreen}>
          <Icon>
            <rect x="3" y="7" width="18" height="10" rx="2" />
            <path d="M8 4 6 2 4 4M16 20l2 2 2-2" />
          </Icon>
          <strong>GIRE PARA JOGAR</strong>
          <span>Toque para abrir em tela cheia horizontal</span>
        </button>
      </section>
    </main>
  );
}
