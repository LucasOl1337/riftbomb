"use client";

import {
  type FormEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ARENAS,
  CHAMPIONS,
  INITIAL_RUNTIME_STATE,
  MODES,
  RIFTBOMB_BRIDGE_VERSION,
  TRAINING_BOT,
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

const REGION = "SÃO PAULO";

function RuntimeFrame({ frameRef }: { frameRef: RefObject<HTMLIFrameElement | null> }) {
  return (
    <iframe
      ref={frameRef}
      className="game-frame"
      src="/riftbomb.html?client=1"
      title="Riftbomb Online"
      allow="autoplay; fullscreen; gamepad; screen-wake-lock"
      tabIndex={-1}
    />
  );
}

function BrandMark() {
  return (
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="24" r="13.5" />
      <path d="M17 7h10l-2 7h-6z" />
      <path className="brand-lockup__rift" d="m25 12-7 10 5 1-5 11 11-14-6-1z" />
      <path d="M31 9c3 1 5 3 6 6" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
    </svg>
  );
}

function ChampionAvatar({
  champion,
  size = "md",
}: {
  champion: ReturnType<typeof championById>;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={`champion-avatar champion-avatar--${size}`}
      data-champion-portrait={champion.id}
      aria-hidden="true"
    >
      <img src={champion.portrait} alt="" loading="lazy" decoding="async" />
    </span>
  );
}

function UnknownRivalAvatar() {
  return (
    <span
      className="champion-avatar champion-avatar--sm champion-avatar--unknown"
      aria-hidden="true"
    >
      ?
    </span>
  );
}

function SectionHeading({
  index,
  eyebrow,
  title,
  id,
}: {
  index: string;
  eyebrow: string;
  title: string;
  id: string;
}) {
  return (
    <header className="section-heading">
      <span aria-hidden="true">{index}</span>
      <div>
        <small>{eyebrow}</small>
        <h2 id={id}>{title}</h2>
      </div>
    </header>
  );
}

function formatRuntimeStatus(runtime: RuntimeState, mode?: ClientMode) {
  if (runtime.tone === "error") {
    if (/not found|expired/i.test(runtime.status)) return "O convite expirou ou não existe mais.";
    if (/already has two|room_full/i.test(runtime.status)) return "O duelo já está com os dois lugares ocupados.";
    if (/treino local|offline beginGame|start the local/i.test(runtime.status)) {
      return "Não foi possível iniciar o treino local. Recarregue a página e tente de novo.";
    }
    // Sticky online resume failures must not read as “treino precisa de servidor”.
    if (mode === "solo" || /temporarily unavailable|no longer accepts|session was kept/i.test(runtime.status)) {
      return "Sessão online anterior falhou. No treino isso não é necessário — clique em Iniciar treino de novo.";
    }
    return "Não foi possível concluir a conexão. Tente novamente.";
  }
  if (runtime.phase === "boot") return "Preparando a arena e os campeões…";
  if (runtime.matchmaking) return "Buscando um rival disponível na região de São Paulo.";
  if (runtime.phase === "match") return "Partida em andamento.";
  if (runtime.role === "host" && !runtime.connected) return "Conectando ao servidor de São Paulo…";
  if (runtime.role === "host" && !runtime.rivalConnected) return "Link pronto. Envie ao seu amigo para ocupar o segundo lugar.";
  if (runtime.role === "host" && !runtime.guestReady) return "Seu amigo entrou e está preparando a formação.";
  if (runtime.role === "host") return "Os dois jogadores estão prontos. Inicie a partida.";
  if (runtime.role === "guest" && !runtime.connected) return "Entrando no duelo do seu amigo…";
  if (runtime.role === "guest") return "Convite aceito. Aguarde o anfitrião iniciar a partida.";
  return "Arena carregada. Revise o protocolo e confirme quando estiver pronto.";
}

function modeFormat(mode: ClientMode) {
  if (mode === "friend") return "MELHOR DE 10";
  if (mode === "solo") return "SESSÃO LIVRE";
  return "MELHOR DE 3";
}

function modeRules(mode: ClientMode) {
  if (mode === "friend") {
    return [
      ["SÉRIE", "MD10"],
      ["CONVITE", "LINK"],
      ["ENTRADA", "DIRETA"],
    ];
  }
  if (mode === "solo") {
    return [
      ["BOT", "V1"],
      ["PILOTO", "RENEKTON"],
      ["NÍVEL", "4/5"],
    ];
  }
  return [
    ["SÉRIE", "MD3"],
    ["REGIÃO", "SÃO PAULO"],
    ["FILA", "AUTOMÁTICA"],
  ];
}

export default function Home() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const lastRuntimeRef = useRef<RuntimeState | null>(null);
  const [runtime, setRuntime] = useState(INITIAL_RUNTIME_STATE);
  const [activeMode, setActiveMode] = useState<ClientMode>("quick");
  const [champion, setChampion] = useState<ChampionId>("katarina");
  const [rivalChampion, setRivalChampion] = useState<ChampionId>("zed");
  const [arena, setArena] = useState<ArenaId>("lattice");
  const [copyLabel, setCopyLabel] = useState("COPIAR LINK DIRETO");
  const [clientNotice, setClientNotice] = useState("");
  const [showInviteFallback, setShowInviteFallback] = useState(false);
  const [presentationNotice, setPresentationNotice] = useState(
    "No iPhone, desative o bloqueio de rotação e vire o aparelho. Para jogar sem bordas, adicione o Riftbomb à Tela de Início.",
  );

  const sendCommand = useCallback((action: string, payload?: Record<string, unknown>) => {
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
  }, []);

  useEffect(() => {
    function receiveRuntimeMessage(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        event.source !== frameRef.current?.contentWindow ||
        !isRuntimeStateMessage(event.data)
      ) return;

      const next = event.data.state;
      if (runtimeStateEquals(lastRuntimeRef.current, next)) return;
      lastRuntimeRef.current = next;
      setRuntime(next);
      setChampion(next.role === "guest" ? next.guestChampion : next.hostChampion);
      setRivalChampion(next.role === "guest" ? next.hostChampion : next.guestChampion);
      setArena(next.arena);
      if (next.quickMatch) setActiveMode("quick");
      else if (next.role !== "offline") setActiveMode("friend");
    }

    window.addEventListener("message", receiveRuntimeMessage);
    return () => window.removeEventListener("message", receiveRuntimeMessage);
  }, []);

  useEffect(() => {
    sendCommand("sync");
  }, [sendCommand]);

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
  const friendHostAwaiting = isHost && runtime.inviteMode && !runtime.rivalConnected;
  const quickRivalKnown = activeMode === "quick" && inLobby && (runtime.rivalConnected || isGuest);
  const projectedRival = activeMode === "solo" || activeMode === "friend" || quickRivalKnown
    ? selectedRival
    : null;

  const primaryDisabled = !bridgeReady ||
    (runtime.busy && !runtime.matchmaking) ||
    (isGuest && runtime.guestReady) ||
    (friendHostAwaiting && !runtime.inviteUrl) ||
    (isHost && !friendHostAwaiting && (!runtime.connected || !runtime.guestReady));

  function chooseMode(mode: ClientMode) {
    if (inLobby || runtime.matchmaking || runtime.busy) return;
    setActiveMode(mode);
    if (mode === "solo") {
      setRivalChampion(TRAINING_BOT.champion);
      // Drop sticky online-resume error so Treinamento does not look "offline broken".
      sendCommand("choose-offline");
      setRuntime((current) =>
        current.tone === "error"
          ? {
              ...current,
              tone: "ok",
              status: "Treino local selecionado. Sem servidor necessário.",
              busy: false,
              role: "offline",
              connected: false,
              matchmaking: false,
            }
          : current
      );
    }
    if (mode === "friend" && rivalChampion === champion) {
      setRivalChampion(CHAMPIONS.find((item) => item.id !== champion)?.id ?? "zed");
    }
    setClientNotice("");
    setShowInviteFallback(false);
  }

  function chooseChampion(next: ChampionId) {
    if (inLobby || runtime.busy || runtime.matchmaking) return;
    setChampion(next);
    if (activeMode === "friend" && rivalChampion === next) {
      setRivalChampion(CHAMPIONS.find((item) => item.id !== next)?.id ?? "zed");
    }
  }

  function chooseArena(next: ArenaId) {
    if (inLobby || runtime.busy || runtime.matchmaking) return;
    setArena(next);
  }

  async function enterFullscreen() {
    let fullscreenUnavailable = false;
    try {
      if (!document.fullscreenElement) {
        const requestFullscreen = document.documentElement.requestFullscreen;
        if (requestFullscreen) {
          await requestFullscreen.call(document.documentElement, { navigationUI: "hide" });
        } else fullscreenUnavailable = true;
      }
    } catch {
      fullscreenUnavailable = true;
    }

    try {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (value: "landscape") => Promise<void>;
      };
      await orientation.lock?.("landscape");
    } catch {
      // Safari can expose the API while refusing it outside an installed app.
    }

    if (window.matchMedia("(orientation: portrait)").matches) {
      setPresentationNotice(
        fullscreenUnavailable
          ? "O Safari não consegue girar nem ocupar toda a tela sozinho. Desative o bloqueio de rotação, vire o iPhone e use Compartilhar → Adicionar à Tela de Início para remover as bordas."
          : "A tela cheia abriu, mas a rotação continua bloqueada. Desative o bloqueio de rotação do iPhone e vire o aparelho.",
      );
      return;
    }

    setPresentationNotice(
      document.fullscreenElement
        ? "Tela cheia horizontal ativada."
        : "Horizontal ativado. Para remover as bordas do Safari, use Compartilhar → Adicionar à Tela de Início.",
    );
  }

  function requestMobileMatchPresentation() {
    const phoneLike = window.matchMedia("(pointer: coarse)").matches ||
      Math.min(window.innerWidth, window.innerHeight) <= 520;
    if (phoneLike) void enterFullscreen();
  }

  async function copyInvite() {
    if (!runtime.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(runtime.inviteUrl);
      setCopyLabel("LINK COPIADO");
      setClientNotice("Convite MD10 copiado. Seu amigo entra direto ao abrir o link.");
      setShowInviteFallback(false);
      window.setTimeout(() => setCopyLabel("COPIAR LINK DIRETO"), 1800);
    } catch {
      setShowInviteFallback(true);
      setClientNotice("A cópia automática foi bloqueada. Selecione o link abaixo.");
    }
  }

  function launchSelectedMode(event?: FormEvent) {
    event?.preventDefault();
    setClientNotice("");
    setShowInviteFallback(false);

    if (runtime.matchmaking) {
      sendCommand("cancel-quick-match");
      return;
    }
    if (!bridgeReady) {
      setClientNotice("A arena ainda está carregando. Aguarde um instante.");
      return;
    }
    // Solo must not be blocked by a stale "busy" left by failed online resume.
    if (runtime.busy && activeMode !== "solo") return;
    if (friendHostAwaiting) {
      void copyInvite();
      return;
    }
    if (isGuest) {
      if (!runtime.guestReady) sendCommand("toggle-ready");
      return;
    }
    if (isHost) {
      requestMobileMatchPresentation();
      sendCommand("start-online");
      return;
    }
    if (activeMode === "quick") {
      sendCommand("quick-match", { champion, arena });
      return;
    }
    if (activeMode === "friend") {
      sendCommand("create-challenge", {
        hostChampion: champion,
        guestChampion: rivalChampion,
        arena,
      });
      return;
    }

    // Solo never waits on online busy flags left by a dead resume attempt.
    if (runtime.busy && activeMode === "solo") {
      setRuntime((current) => ({ ...current, busy: false, tone: "ok" }));
    }
    requestMobileMatchPresentation();
    sendCommand("start-offline", {
      mode: "solo",
      champion,
      guestChampion: TRAINING_BOT.champion,
      arena,
      bot: TRAINING_BOT.id,
    });
  }

  const leaveLobby = useCallback(() => {
    sendCommand("leave-lobby");
    setClientNotice("");
    setShowInviteFallback(false);
    setRuntime((current) => ({
      ...current,
      role: "offline",
      phase: "setup",
      roomCode: "",
      connected: false,
      rivalConnected: false,
      guestReady: false,
      inviteMode: false,
      inviteUrl: "",
      busy: false,
      status: "Left the online lobby.",
      tone: "ok",
    }));
  }, [sendCommand]);

  const leaveMatch = useCallback(() => {
    sendCommand("leave-match");
    setClientNotice("");
    setRuntime((current) => ({
      ...current,
      role: "offline",
      phase: "setup",
      roomCode: "",
      connected: false,
      rivalConnected: false,
      guestReady: false,
      inviteMode: false,
      inviteUrl: "",
      busy: false,
      status: "You left the match.",
      tone: "ok",
    }));
  }, [sendCommand]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (runtime.phase === "match") {
        event.preventDefault();
        leaveMatch();
      } else if (runtime.role !== "offline" && runtime.phase === "lobby") {
        event.preventDefault();
        leaveLobby();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [leaveLobby, leaveMatch, runtime.phase, runtime.role]);

  const primaryLabel = useMemo(() => {
    if (!bridgeReady) return "CARREGANDO ARENA";
    if (runtime.matchmaking) return "CANCELAR BUSCA";
    if (runtime.busy) return "CONECTANDO";
    if (friendHostAwaiting) return copyLabel;
    if (isGuest) return runtime.guestReady ? "AGUARDANDO ANFITRIÃO" : "CONFIRMAR FORMAÇÃO";
    if (isHost) {
      if (!runtime.rivalConnected) return "AGUARDANDO OPONENTE";
      if (!runtime.guestReady) return "OPONENTE PREPARANDO";
      return "INICIAR PARTIDA";
    }
    if (activeMode === "quick") return "ENTRAR NA FILA";
    if (activeMode === "friend") return "GERAR LINK DIRETO";
    return "INICIAR TREINO";
  }, [
    activeMode,
    bridgeReady,
    copyLabel,
    friendHostAwaiting,
    isGuest,
    isHost,
    runtime.busy,
    runtime.guestReady,
    runtime.matchmaking,
    runtime.rivalConnected,
  ]);

  const statusLabel = runtime.tone === "error"
    ? "FALHA NA CONEXÃO"
    : runtime.matchmaking
      ? "PAREAMENTO AUTOMÁTICO"
      : friendHostAwaiting
        ? "CONVITE MD10 PRONTO"
        : isGuest
          ? "ENTRADA DIRETA"
          : isHost && runtime.guestReady
            ? "FORMAÇÃO PRONTA"
            : selectedMode.eyebrow;

  const rules = modeRules(activeMode);
  const region = activeMode === "solo" ? "NAVEGADOR" : REGION;

  return (
    <main className={`game-shell${inMatch ? " is-match-live" : ""}`}>
      <a className="skip-link" href="#war-workspace">Pular para a montagem da partida</a>
      <RuntimeFrame frameRef={frameRef} />

      {inMatch ? (
        <div className="match-chrome" role="toolbar" aria-label="Controles da partida">
          <button className="match-exit-button" type="button" onClick={leaveMatch}>
            SAIR DA PARTIDA
          </button>
        </div>
      ) : null}

      <section className="war-table" aria-labelledby="war-table-title" aria-hidden={inMatch}>
        <header className="war-topbar">
          <div className="war-topbar__inner">
            <div className="brand-lockup" aria-label="Riftbomb Arena Tática">
              <BrandMark />
              <span>
                <b>RIFT<span>/</span>BOMB</b>
                <small>ARENA TÁTICA</small>
              </span>
            </div>

            <div className="war-title-block">
              <small>MONTAGEM PRÉ-PARTIDA</small>
              <h1 id="war-table-title">WAR TABLE</h1>
            </div>

            <div className="war-connection">
              <button
                className="fullscreen-button"
                type="button"
                onClick={() => void enterFullscreen()}
                aria-label="Abrir em tela cheia"
              >
                <ExpandIcon />
              </button>
              <div
                className={`connection-badge${runtime.tone === "error" ? " is-error" : ""}`}
                role="status"
                aria-label={bridgeReady ? `Runtime disponível em ${region}` : "Runtime inicializando"}
              >
                <i aria-hidden="true" />
                <span>
                  <b>{activeMode === "solo" ? "ARENA LOCAL" : "SALA SEGURA"}</b>
                  <small>
                    {bridgeReady
                      ? activeMode === "solo" ? "NAVEGADOR · LOCAL" : `${region} · ONLINE`
                      : "INICIALIZANDO"}
                  </small>
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="war-workspace" id="war-workspace">
          <aside className="war-panel war-protocol" aria-labelledby="protocol-title">
            <SectionHeading index="I" eyebrow="PROTOCOLO" title={selectedMode.name} id="protocol-title" />
            <p className="war-protocol__intro">
              Escolha como a partida começa. O item ativo mostra a consequência antes da confirmação.
            </p>

            <nav className="mode-list" aria-label="Selecionar modo">
              {MODES.map((mode, index) => {
                const selected = activeMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    className={`mode-option${selected ? " is-selected" : ""}`}
                    type="button"
                    onClick={() => chooseMode(mode.id)}
                    disabled={inLobby || runtime.matchmaking || runtime.busy}
                    aria-pressed={selected}
                  >
                    <span className="mode-option__index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="mode-option__copy">
                      <b>{mode.name}</b>
                      <small>{mode.eyebrow}</small>
                      <span>{mode.description}</span>
                    </span>
                    <i aria-hidden="true" />
                  </button>
                );
              })}
            </nav>

            <dl className="protocol-rules" aria-label="Regras do protocolo">
              {rules.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

            {activeMode === "solo" ? (
              <article className="training-bot-card" aria-label={`Oponente de treino ${TRAINING_BOT.name}`}>
                <header className="training-bot-card__identity">
                  <ChampionAvatar champion={championById(TRAINING_BOT.champion)} size="md" />
                  <span>
                    <small>{TRAINING_BOT.callsign}</small>
                    <b>{TRAINING_BOT.name}</b>
                    <em>{TRAINING_BOT.description}</em>
                  </span>
                  <i aria-hidden="true">V1</i>
                </header>
                <dl className="training-bot-card__metrics">
                  <div><dt>NÍVEL</dt><dd>4/5<small>Tático</small></dd></div>
                  <div><dt>PLACAR</dt><dd>100–0<small>vs. base</small></dd></div>
                  <div><dt>BOMBA 1</dt><dd>100%<small>intacto</small></dd></div>
                </dl>
                <p><small>LIMITE ATUAL</small>{TRAINING_BOT.weakness}; ainda não pilota outros kits.</p>
              </article>
            ) : null}
          </aside>

          <section className="war-theatre" aria-labelledby="theatre-title">
            <header className="theatre-heading">
              <span aria-hidden="true">II</span>
              <div>
                <small>TEATRO DA PARTIDA · ARENA {String(ARENAS.findIndex((item) => item.id === arena) + 1).padStart(2, "0")}/05</small>
                <h2 id="theatre-title">{selectedArena.name}</h2>
              </div>
              <b>{selectedArena.trait}</b>
            </header>

            <section className="encounter-bar" aria-label="Confronto projetado">
              <article className="fighter fighter--self">
                <ChampionAvatar champion={selectedChampion} size="sm" />
                <span>
                  <small>VOCÊ</small>
                  <b>{selectedChampion.name}</b>
                  <em>{selectedChampion.signature}</em>
                </span>
              </article>
              <div className="versus-mark" aria-label="versus"><span>V</span><i /><span>S</span></div>
              <article className={`fighter fighter--rival${projectedRival ? "" : " is-unknown"}`}>
                {projectedRival ? <ChampionAvatar champion={projectedRival} size="sm" /> : <UnknownRivalAvatar />}
                <span>
                  <small>
                    {activeMode === "solo"
                      ? `CPU · ${TRAINING_BOT.callsign}`
                      : activeMode === "friend"
                        ? isGuest ? "ANFITRIÃO" : "CONVIDADO"
                        : quickRivalKnown ? "RIVAL ENCONTRADO" : "FILA REGIONAL"}
                  </small>
                  <b>{projectedRival?.name ?? "Aguardando rival"}</b>
                  <em>{projectedRival?.signature ?? "O pareamento define o segundo jogador"}</em>
                </span>
              </article>
            </section>

            <figure className="war-map">
              <div className="war-map__image">
                <img src={selectedArena.hero} alt={`Vista tática da arena ${selectedArena.name}`} />
              </div>
              <figcaption>
                <span>{selectedArena.description}</span>
                <b>RISCO · {selectedArena.danger}</b>
              </figcaption>
            </figure>

            <nav className="arena-list" aria-label="Selecionar arena">
              {ARENAS.map((item, index) => {
                const selected = arena === item.id;
                return (
                  <button
                    key={item.id}
                    className={`arena-option${selected ? " is-selected" : ""}`}
                    type="button"
                    onClick={() => chooseArena(item.id)}
                    disabled={inLobby || runtime.matchmaking || runtime.busy}
                    aria-pressed={selected}
                    aria-label={`${item.name}: ${item.description}`}
                  >
                    <span className="arena-option__image"><img src={item.hero} alt="" loading="lazy" decoding="async" /></span>
                    <span className="arena-option__copy">
                      <small>{String(index + 1).padStart(2, "0")}</small>
                      <b>{item.shortName}</b>
                    </span>
                  </button>
                );
              })}
            </nav>
          </section>

          <aside className="war-panel war-dossier" aria-labelledby="dossier-title">
            <SectionHeading index="III" eyebrow="FORMAÇÃO" title="CAMPEÃO" id="dossier-title" />

            <section className="selected-combatant" aria-label="Campeão selecionado">
              <ChampionAvatar champion={selectedChampion} size="lg" />
              <div>
                <small>{selectedChampion.role.toUpperCase()}</small>
                <b>{selectedChampion.name}</b>
                <p>{selectedChampion.signature} · {selectedArena.shortName}</p>
              </div>
            </section>

            <div className="champion-list" aria-label="Selecionar campeão">
              {CHAMPIONS.map((item) => {
                const selected = champion === item.id;
                return (
                  <button
                    key={item.id}
                    className={`champion-option${selected ? " is-selected" : ""}`}
                    type="button"
                    onClick={() => chooseChampion(item.id)}
                    disabled={inLobby || runtime.matchmaking || runtime.busy}
                    aria-pressed={selected}
                    aria-label={`${item.name}, ${item.role}`}
                  >
                    <ChampionAvatar champion={item} size="sm" />
                    <span className="champion-option__copy"><b>{item.name}</b><small>{item.role}</small></span>
                    <span className="champion-option__state" aria-hidden="true">{selected ? "TRAVADO" : ""}</span>
                  </button>
                );
              })}
            </div>

            <div className="dossier-summary">
              <dl className="match-facts">
                <div><dt>FORMATO</dt><dd>{modeFormat(activeMode)}</dd></div>
                <div><dt>REGIÃO</dt><dd>{region}</dd></div>
                <div><dt>COBERTURA</dt><dd>{selectedArena.cover}</dd></div>
                <div><dt>AMEAÇA</dt><dd>{selectedArena.danger}</dd></div>
              </dl>

              <div className="formation-lock">
                <small>FORMAÇÃO ATUAL</small>
                <p><b>{selectedChampion.name}</b><span aria-hidden="true">/</span>{selectedArena.shortName}<span aria-hidden="true">/</span>{selectedMode.name}</p>
              </div>

              <section
                className="action-cluster"
                data-tone={runtime.tone === "error" ? "error" : runtime.matchmaking || friendHostAwaiting ? "warning" : "ready"}
              >
                <div className="action-cluster__status" aria-live="polite">
                  <small>{statusLabel}</small>
                  <p>{formatRuntimeStatus(runtime, activeMode)}</p>
                </div>

                {showInviteFallback && runtime.inviteUrl ? (
                  <label className="invite-fallback">
                    <span>LINK DO CONVITE</span>
                    <input value={runtime.inviteUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
                  </label>
                ) : null}

                {clientNotice ? <p className="client-notice" role="status">{clientNotice}</p> : null}

                <button
                  className="action-cluster__primary"
                  type="button"
                  onClick={() => launchSelectedMode()}
                  disabled={primaryDisabled}
                >
                  <span>{primaryLabel}</span><b aria-hidden="true">→</b>
                </button>

                {inLobby ? (
                  <button className="action-cluster__secondary" type="button" onClick={leaveLobby}>
                    SAIR DA SALA
                  </button>
                ) : null}
              </section>
            </div>
          </aside>
        </div>
      </section>

      <div
        className="rotate-gate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rotate-gate-title"
        aria-describedby="rotate-gate-copy"
      >
        <strong id="rotate-gate-title">VIRE O CELULAR DE LADO</strong>
        <span id="rotate-gate-copy" aria-live="polite">{presentationNotice}</span>
        <button className="rotate-gate__action" type="button" onClick={() => void enterFullscreen()}>
          TENTAR TELA CHEIA
        </button>
      </div>
    </main>
  );
}
