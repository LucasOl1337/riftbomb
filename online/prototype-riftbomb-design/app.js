// Three variants of the Riftbomb pre-match shell, switchable via ?variant=.
// PROTOTYPE ONLY: all state is local, simulated, and intentionally disposable.

const MODES = [
  {
    id: "quick",
    index: "01",
    eyebrow: "PAREAMENTO AUTOMÁTICO",
    name: "Quick Match",
    description: "Encontre um rival e entre direto em uma melhor de 3.",
    action: "ENTRAR NA FILA",
  },
  {
    id: "online",
    index: "02",
    eyebrow: "SALA PRIVADA",
    name: "Jogar com amigo",
    description: "Crie uma sala no servidor de São Paulo e compartilhe o código.",
    action: "CRIAR SALA",
  },
  {
    id: "solo",
    index: "03",
    eyebrow: "CONTRA CPU",
    name: "Treinamento",
    description: "Teste rotas e habilidades contra Dominus-01.",
    action: "INICIAR TREINO",
  },
  {
    id: "local",
    index: "04",
    eyebrow: "MESMO DISPOSITIVO",
    name: "Versus local",
    description: "Dois jogadores, dois controles e uma arena.",
    action: "PREPARAR VERSUS",
  },
  {
    id: "challenge",
    index: "05",
    eyebrow: "MELHOR DE 10",
    name: "Desafio",
    description: "Trave a formação antes de compartilhar o convite.",
    action: "CRIAR DESAFIO",
  },
  {
    id: "join",
    index: "06",
    eyebrow: "CÓDIGO DE 6 CARACTERES",
    name: "Entrar em sala",
    description: "Use o código enviado pelo administrador da partida.",
    action: "ENTRAR NA SALA",
  },
];

const CHAMPIONS = [
  {
    id: "katarina",
    name: "Katarina",
    role: "Assassina",
    signature: "Mobilidade · Recast",
    image: "/client/champions/katarina.webp",
  },
  {
    id: "zed",
    name: "Zed",
    role: "Assassino",
    signature: "Sombra · Execução",
    image: "/client/champions/zed.webp",
  },
  {
    id: "renekton",
    name: "Renekton",
    role: "Lutador",
    signature: "Fúria · Pressão",
    image: "/client/champions/renekton.webp",
  },
  {
    id: "vladimir",
    name: "Vladimir",
    role: "Mago",
    signature: "Sangue · Sustento",
    image: "/client/champions/vladimir.webp",
  },
  {
    id: "gangplank",
    name: "Gangplank",
    role: "Especialista",
    signature: "Barril · Zona",
    image: "/client/champions/gangplank.webp",
  },
];

const ARENAS = [
  {
    id: "lattice",
    number: "01",
    name: "Salt Lens Array",
    shortName: "Salt Lens",
    description: "Rotas abertas, leitura rápida e confrontos diretos.",
    trait: "LEITURA",
    value: "ABERTA",
    danger: "Centro exposto",
    cover: "32%",
    image: "/client/arenas/lattice.webp",
  },
  {
    id: "clearing",
    number: "02",
    name: "Nacre Hollow",
    shortName: "Nacre",
    description: "Corredores de pressão variável e flancos curtos.",
    trait: "RITMO",
    value: "EQUILIBRADO",
    danger: "Rotas espelhadas",
    cover: "46%",
    image: "/client/arenas/clearing.webp",
  },
  {
    id: "labyrinth",
    number: "03",
    name: "Cinderfrost Works",
    shortName: "Cinderfrost",
    description: "Passagens estreitas e domínio agressivo de espaço.",
    trait: "PRESSÃO",
    value: "ALTA",
    danger: "Gargalos térmicos",
    cover: "61%",
    image: "/client/arenas/labyrinth.webp",
  },
  {
    id: "forts",
    number: "04",
    name: "Aeolian Bastions",
    shortName: "Bastions",
    description: "Bolsões defensivos e ataques por flanco.",
    trait: "DEFESA",
    value: "TÁTICA",
    danger: "Entradas laterais",
    cover: "55%",
    image: "/client/arenas/forts-key-art-v2.webp",
  },
  {
    id: "pit",
    number: "05",
    name: "Storm-Eye Basin",
    shortName: "Storm-Eye",
    description: "Centro perigoso e decisões de alto risco.",
    trait: "RISCO",
    value: "EXTREMO",
    danger: "Olho da tempestade",
    cover: "39%",
    image: "/client/arenas/pit-key-art-v2.webp",
  },
];

const VARIANTS = [
  { id: "command", key: "A", name: "COMMAND DECK" },
  { id: "cinema", key: "B", name: "RIFT CINEMA" },
  { id: "warroom", key: "C", name: "WAR TABLE" },
];

const variantAliases = new Map([
  ["a", "command"],
  ["b", "cinema"],
  ["c", "warroom"],
  ...VARIANTS.map(({ id }) => [id, id]),
]);

const state = {
  variant: readVariant(),
  mode: "quick",
  champion: "katarina",
  rival: "zed",
  arena: "lattice",
  phase: "idle",
  roomCode: "RIFT42",
  region: "SÃO PAULO",
  ping: 28,
};

let flowTimers = [];

const app = document.querySelector("#app");
const variantLabel = document.querySelector("#variant-label");
const stateSummary = document.querySelector("#state-summary");
const stateReadout = document.querySelector("#state-readout");
const announcer = document.querySelector("#prototype-announcer");

function readVariant() {
  const requested = new URLSearchParams(window.location.search).get("variant")?.toLowerCase();
  return variantAliases.get(requested) ?? "command";
}

function currentMode() {
  return MODES.find(({ id }) => id === state.mode) ?? MODES[0];
}

function currentChampion() {
  return CHAMPIONS.find(({ id }) => id === state.champion) ?? CHAMPIONS[0];
}

function currentRival() {
  return CHAMPIONS.find(({ id }) => id === state.rival) ?? CHAMPIONS[1];
}

function currentArena() {
  return ARENAS.find(({ id }) => id === state.arena) ?? ARENAS[0];
}

function currentVariant() {
  return VARIANTS.find(({ id }) => id === state.variant) ?? VARIANTS[0];
}

function clearFlowTimers() {
  flowTimers.forEach((timer) => window.clearTimeout(timer));
  flowTimers = [];
}

function brandLockup(compact = false) {
  return `
    <a class="brand-lockup${compact ? " brand-lockup--compact" : ""}" href="/" aria-label="Riftbomb — início do protótipo">
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="24" r="13.5"></circle>
        <path d="M17 7h10l-2 7h-6z"></path>
        <path class="brand-lockup__rift" d="m25 12-7 10 5 1-5 11 11-14-6-1z"></path>
        <path d="M31 9c3 1 5 3 6 6"></path>
      </svg>
      <span>
        <b>RIFT<span>/</span>BOMB</b>
        <small>ARENA TÁTICA</small>
      </span>
    </a>`;
}

function connectionBadge(label = "ONLINE") {
  return `
    <div class="connection-badge" role="status">
      <i aria-hidden="true"></i>
      <span>${label}</span>
      <b>${state.region} · ${state.ping}MS</b>
    </div>`;
}

function modeOptions(flavor = "default") {
  return MODES.map(
    (mode) => `
      <button
        class="mode-option mode-option--${flavor}${state.mode === mode.id ? " is-selected" : ""}"
        type="button"
        data-select-mode="${mode.id}"
        aria-pressed="${state.mode === mode.id}"
      >
        <span class="mode-option__index">${mode.index}</span>
        <span class="mode-option__copy">
          <small>${mode.eyebrow}</small>
          <b>${mode.name}</b>
        </span>
        <span class="mode-option__mark" aria-hidden="true">${state.mode === mode.id ? "◆" : "◇"}</span>
      </button>`,
  ).join("");
}

function championOptions(flavor = "grid") {
  return CHAMPIONS.map(
    (champion) => `
      <button
        class="champion-option champion-option--${flavor}${state.champion === champion.id ? " is-selected" : ""}"
        type="button"
        data-select-champion="${champion.id}"
        aria-pressed="${state.champion === champion.id}"
        aria-label="${champion.name}, ${champion.role}"
      >
        <span class="champion-option__portrait">
          <img src="${champion.image}" alt="" />
        </span>
        <span class="champion-option__copy">
          <b>${champion.name}</b>
          <small>${champion.role}</small>
        </span>
        <i aria-hidden="true"></i>
      </button>`,
  ).join("");
}

function arenaOptions(flavor = "strip") {
  return ARENAS.map(
    (arena) => `
      <button
        class="arena-option arena-option--${flavor}${state.arena === arena.id ? " is-selected" : ""}"
        type="button"
        data-select-arena="${arena.id}"
        aria-pressed="${state.arena === arena.id}"
        aria-label="${arena.name}: ${arena.description}"
      >
        <img src="${arena.image}" alt="" />
        <span>
          <small>${arena.number}</small>
          <b>${arena.shortName}</b>
        </span>
      </button>`,
  ).join("");
}

function phaseCopy() {
  const mode = currentMode();
  if (state.phase === "searching") {
    return {
      eyebrow: "PAREAMENTO EM CURSO",
      label: "CANCELAR BUSCA",
      status: `Varrendo ${state.region} · janela estimada 00:18`,
      tone: "warning",
    };
  }
  if (state.phase === "found") {
    return {
      eyebrow: "RIVAL LOCALIZADO",
      label: "CONFIRMAR FORMAÇÃO",
      status: `${currentRival().name} · rota confirmada · ${state.ping + 4}ms`,
      tone: "success",
    };
  }
  if (state.phase === "ready") {
    return {
      eyebrow: "FORMAÇÃO PRONTA",
      label: "ENTRAR NA ARENA",
      status: "Ambos os lados confirmaram. A arena está pronta.",
      tone: "success",
    };
  }
  return {
    eyebrow: mode.eyebrow,
    label: mode.action,
    status: mode.description,
    tone: "neutral",
  };
}

function primaryAction(flavor = "default") {
  const phase = phaseCopy();
  return `
    <div class="primary-action primary-action--${flavor}" data-tone="${phase.tone}">
      <div class="primary-action__status" role="status">
        <small>${phase.eyebrow}</small>
        <p>${phase.status}</p>
      </div>
      <button type="button" data-primary-action>
        <span>${phase.label}</span>
        <b aria-hidden="true">↗</b>
      </button>
    </div>`;
}

function matchFacts(flavor = "default") {
  const arena = currentArena();
  return `
    <dl class="match-facts match-facts--${flavor}">
      <div><dt>FORMATO</dt><dd>MELHOR DE 3</dd></div>
      <div><dt>REGIÃO</dt><dd>${state.region}</dd></div>
      <div><dt>COBERTURA</dt><dd>${arena.cover}</dd></div>
      <div><dt>AMEAÇA</dt><dd>${arena.danger}</dd></div>
    </dl>`;
}

function roomCodeField() {
  if (state.mode !== "join") return "";
  return `
    <label class="room-code-field">
      <span>CÓDIGO DA SALA</span>
      <input
        type="text"
        inputmode="text"
        autocomplete="off"
        maxlength="6"
        value="${state.roomCode}"
        data-room-code
        aria-describedby="room-code-hint"
      />
      <small id="room-code-hint">6 caracteres · sem I, O, 0 ou 1</small>
    </label>`;
}

function versusPair(flavor = "default") {
  const champion = currentChampion();
  const rival = currentRival();
  return `
    <div class="versus-pair versus-pair--${flavor}">
      <article class="fighter fighter--blue">
        <img src="${champion.image}" alt="" />
        <span><small>VOCÊ · LADO AZUL</small><b>${champion.name}</b><em>${champion.signature}</em></span>
      </article>
      <div class="versus-mark" aria-label="versus"><span>V</span><i></i><span>S</span></div>
      <article class="fighter fighter--red">
        <img src="${rival.image}" alt="" />
        <span><small>RIVAL · LADO VERMELHO</small><b>${rival.name}</b><em>${rival.signature}</em></span>
      </article>
    </div>`;
}

function renderCommandDeck() {
  const arena = currentArena();
  const champion = currentChampion();
  return `
    <section class="experience command-deck" aria-labelledby="command-title">
      <header class="command-topbar">
        ${brandLockup()}
        <div class="prototype-context"><span>DESIGN LAB / 01</span><b>PRE-MATCH ASSEMBLY</b></div>
        ${connectionBadge()}
      </header>

      <div class="command-layout">
        <aside class="command-modes" aria-labelledby="command-modes-title">
          <div class="section-kicker"><span>01</span><p>ESCOLHA O PROTOCOLO</p></div>
          <h1 id="command-title">MONTE<br />O CONFRONTO</h1>
          <p class="command-intro">Decisão rápida, estado explícito e nenhuma surpresa antes da arena.</p>
          <h2 class="sr-only" id="command-modes-title">Modos de jogo</h2>
          <div class="mode-stack">${modeOptions("deck")}</div>
          ${roomCodeField()}
        </aside>

        <section class="command-arena" aria-labelledby="command-arena-title">
          <div class="command-section-heading">
            <div><small>02 / CAMPO DE OPERAÇÃO</small><h2 id="command-arena-title">${arena.name}</h2></div>
            <div class="arena-counter"><b>${arena.number}</b><span>/ 05</span></div>
          </div>

          <figure class="arena-stage">
            <img src="${arena.image}" alt="Vista tática da arena ${arena.name}" />
            <figcaption>
              <span class="arena-stage__trait"><small>${arena.trait}</small><b>${arena.value}</b></span>
              <p>${arena.description}</p>
              <div class="arena-stage__controls">
                <button type="button" data-cycle-arena="-1" aria-label="Arena anterior">←</button>
                <span>${arena.shortName.toUpperCase()}</span>
                <button type="button" data-cycle-arena="1" aria-label="Próxima arena">→</button>
              </div>
            </figcaption>
          </figure>

          <div class="arena-strip" aria-label="Selecionar arena">${arenaOptions("strip")}</div>
        </section>

        <aside class="command-loadout" aria-labelledby="command-loadout-title">
          <div class="section-kicker"><span>03</span><p>TRAVE SUA FORMAÇÃO</p></div>
          <div class="selected-champion">
            <div class="selected-champion__portrait"><img src="${champion.image}" alt="" /></div>
            <span><small>${champion.role.toUpperCase()}</small><h2 id="command-loadout-title">${champion.name}</h2><p>${champion.signature}</p></span>
          </div>
          <div class="champion-grid" aria-label="Selecionar Champion">${championOptions("grid")}</div>
          ${versusPair("compact")}
          ${matchFacts("stack")}
          ${primaryAction("deck")}
        </aside>
      </div>
    </section>`;
}

function renderCinema() {
  const arena = currentArena();
  const champion = currentChampion();
  const mode = currentMode();
  return `
    <section class="experience rift-cinema" aria-labelledby="cinema-title">
      <div class="cinema-backdrop" aria-hidden="true">
        <img src="${arena.image}" alt="" />
        <span></span>
      </div>

      <header class="cinema-topbar">
        ${brandLockup(true)}
        <nav aria-label="Contexto do protótipo"><span>PLAY</span><b>FORMAÇÃO</b><span>DESIGN LAB / B</span></nav>
        ${connectionBadge("REDE ESTÁVEL")}
      </header>

      <div class="cinema-layout">
        <section class="cinema-hero">
          <p class="cinema-overline"><span>${arena.number} / 05</span> CAMPO SELECIONADO</p>
          <h1 id="cinema-title">${arena.shortName}</h1>
          <p class="cinema-description">${arena.description}</p>
          <div class="cinema-traits">
            <span><small>${arena.trait}</small><b>${arena.value}</b></span>
            <span><small>AMEAÇA</small><b>${arena.danger}</b></span>
            <span><small>COBERTURA</small><b>${arena.cover}</b></span>
          </div>
          ${primaryAction("cinema")}
        </section>

        <aside class="cinema-console" aria-label="Configurar confronto">
          <div class="cinema-console__step">
            <span>01</span>
            <div><small>PROTOCOLO</small><h2>${mode.name}</h2><p>${mode.description}</p></div>
          </div>
          <div class="cinema-mode-line" aria-label="Selecionar modo">${modeOptions("cinema")}</div>
          ${roomCodeField()}

          <div class="cinema-console__step cinema-console__step--champion">
            <span>02</span>
            <div><small>SEU CHAMPION</small><h2>${champion.name}</h2><p>${champion.signature}</p></div>
          </div>
          <div class="cinema-champions" aria-label="Selecionar Champion">${championOptions("portrait")}</div>
          ${versusPair("cinema")}
        </aside>
      </div>

      <footer class="cinema-filmstrip">
        <div class="cinema-filmstrip__label"><small>03</small><span>ESCOLHA O MUNDO</span></div>
        <div class="cinema-arenas" aria-label="Selecionar arena">${arenaOptions("cinema")}</div>
      </footer>
    </section>`;
}

function renderWarRoom() {
  const arena = currentArena();
  const champion = currentChampion();
  const mode = currentMode();
  return `
    <section class="experience war-room" aria-labelledby="war-title">
      <header class="war-topbar">
        ${brandLockup()}
        <div class="war-title-block"><small>OPERAÇÃO / ${arena.number}</small><h1 id="war-title">WAR TABLE</h1></div>
        ${connectionBadge("SALA SEGURA")}
      </header>

      <div class="war-layout">
        <aside class="war-protocol" aria-labelledby="war-protocol-title">
          <div class="war-section-title"><span>Ⅰ</span><div><small>PROTOCOLO</small><h2 id="war-protocol-title">${mode.name}</h2></div></div>
          <p>${mode.description}</p>
          <div class="war-mode-list" aria-label="Selecionar modo">${modeOptions("war")}</div>
          ${roomCodeField()}
          <div class="war-rule"><small>REGRA DA SALA</small><b>MELHOR DE 3</b><span>100 HP · BOMBA 35</span></div>
        </aside>

        <section class="war-map" aria-labelledby="war-map-title">
          <div class="war-map__heading">
            <span>Ⅱ</span>
            <div><small>TEATRO DA PARTIDA</small><h2 id="war-map-title">${arena.name}</h2></div>
            <b>${arena.trait} / ${arena.value}</b>
          </div>
          ${versusPair("war")}
          <figure class="war-table-map">
            <div class="war-table-map__frame">
              <img src="${arena.image}" alt="Mapa da arena ${arena.name}" />
              <span class="war-table-map__axis war-table-map__axis--x">A · B · C · D · E</span>
              <span class="war-table-map__axis war-table-map__axis--y">01 · 02 · 03 · 04 · 05</span>
              <i class="war-table-map__marker war-table-map__marker--blue" aria-label="Ponto inicial azul">B</i>
              <i class="war-table-map__marker war-table-map__marker--red" aria-label="Ponto inicial vermelho">R</i>
            </div>
            <figcaption><span>${arena.description}</span><b>${arena.danger}</b></figcaption>
          </figure>
          <div class="war-arena-tabs" aria-label="Selecionar arena">${arenaOptions("war")}</div>
        </section>

        <aside class="war-dossier" aria-labelledby="war-dossier-title">
          <div class="war-section-title"><span>Ⅲ</span><div><small>DOSSIÊ DE COMBATE</small><h2 id="war-dossier-title">${champion.name}</h2></div></div>
          <div class="war-selected-champion">
            <img src="${champion.image}" alt="" />
            <div><small>${champion.role.toUpperCase()}</small><b>${champion.signature}</b><p>Formação projetada para ${arena.shortName}.</p></div>
          </div>
          <div class="war-champion-list" aria-label="Selecionar Champion">${championOptions("dossier")}</div>
          ${matchFacts("war")}
        </aside>
      </div>

      <footer class="war-action-dock">
        <div class="war-lock-summary">
          <small>FORMAÇÃO ATUAL</small>
          <b>${champion.name} / ${arena.shortName} / ${mode.name}</b>
        </div>
        ${primaryAction("war")}
      </footer>
    </section>`;
}

function render({ focusSelector } = {}) {
  document.body.dataset.variant = state.variant;
  document.body.dataset.arena = state.arena;
  document.body.dataset.phase = state.phase;

  if (state.variant === "cinema") app.innerHTML = renderCinema();
  else if (state.variant === "warroom") app.innerHTML = renderWarRoom();
  else app.innerHTML = renderCommandDeck();

  const variant = currentVariant();
  const mode = currentMode();
  const champion = currentChampion();
  const arena = currentArena();
  const phase = phaseCopy();
  variantLabel.textContent = `${variant.key} · ${variant.name}`;
  stateSummary.textContent = `${mode.name.toUpperCase()} · ${champion.name.toUpperCase()} · ${arena.shortName.toUpperCase()}`;
  stateReadout.innerHTML = `
    <div><dt>VARIANTE</dt><dd>${variant.key} · ${variant.name}</dd></div>
    <div><dt>FASE</dt><dd>${state.phase.toUpperCase()}</dd></div>
    <div><dt>MODO</dt><dd>${mode.name}</dd></div>
    <div><dt>CHAMPION</dt><dd>${champion.name}</dd></div>
    <div><dt>RIVAL</dt><dd>${currentRival().name}</dd></div>
    <div><dt>ARENA</dt><dd>${arena.name}</dd></div>
    <div><dt>REDE</dt><dd>${state.region} · ${state.ping}ms</dd></div>
    <div><dt>STATUS</dt><dd>${phase.status}</dd></div>`;
  document.title = `${variant.key} · ${variant.name} — Riftbomb Prototype`;

  if (focusSelector) {
    requestAnimationFrame(() => document.querySelector(focusSelector)?.focus());
  }
}

function announce(message) {
  announcer.textContent = "";
  requestAnimationFrame(() => {
    announcer.textContent = message;
  });
}

function setVariant(nextVariant, announceChange = true) {
  const normalized = variantAliases.get(nextVariant) ?? "command";
  state.variant = normalized;
  const url = new URL(window.location.href);
  url.searchParams.set("variant", normalized);
  window.history.replaceState(null, "", url);
  render();
  if (announceChange) announce(`Variante ${currentVariant().key}: ${currentVariant().name}`);
}

function cycleVariant(direction) {
  const currentIndex = VARIANTS.findIndex(({ id }) => id === state.variant);
  const nextIndex = (currentIndex + direction + VARIANTS.length) % VARIANTS.length;
  setVariant(VARIANTS[nextIndex].id);
}

function cycleArena(direction) {
  const currentIndex = ARENAS.findIndex(({ id }) => id === state.arena);
  const nextIndex = (currentIndex + direction + ARENAS.length) % ARENAS.length;
  state.arena = ARENAS[nextIndex].id;
  render({ focusSelector: `[data-cycle-arena="${direction}"]` });
  announce(`Arena selecionada: ${currentArena().name}`);
}

function resetFlow() {
  clearFlowTimers();
  state.phase = "idle";
}

function runPrimaryAction() {
  if (state.phase === "searching") {
    resetFlow();
    render({ focusSelector: "[data-primary-action]" });
    announce("Busca cancelada. Formação preservada.");
    return;
  }

  if (state.phase === "found") {
    clearFlowTimers();
    state.phase = "ready";
    render({ focusSelector: "[data-primary-action]" });
    announce("Formação confirmada. Arena pronta.");
    return;
  }

  if (state.phase === "ready") {
    state.phase = "idle";
    render({ focusSelector: "[data-primary-action]" });
    announce(`Simulação concluída: entrada em ${currentArena().name}.`);
    return;
  }

  if (state.mode === "solo" || state.mode === "local") {
    state.phase = "ready";
    render({ focusSelector: "[data-primary-action]" });
    announce(`${currentMode().name} preparado. Arena pronta.`);
    return;
  }

  state.phase = "searching";
  render({ focusSelector: "[data-primary-action]" });
  announce("Pareamento iniciado.");
  flowTimers.push(
    window.setTimeout(() => {
      state.phase = "found";
      render();
      announce(`Rival localizado: ${currentRival().name}.`);
    }, 1350),
  );
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("button, a");
  if (!target) return;

  if (target.matches(".brand-lockup")) {
    event.preventDefault();
    resetFlow();
    state.mode = "quick";
    state.champion = "katarina";
    state.arena = "lattice";
    render();
    announce("Configuração inicial restaurada.");
    return;
  }

  if (target.dataset.cycleVariant) {
    cycleVariant(Number(target.dataset.cycleVariant));
    return;
  }

  if (target.dataset.cycleArena) {
    cycleArena(Number(target.dataset.cycleArena));
    return;
  }

  if (target.dataset.selectMode) {
    resetFlow();
    state.mode = target.dataset.selectMode;
    render({ focusSelector: `[data-select-mode="${state.mode}"]` });
    announce(`Modo selecionado: ${currentMode().name}`);
    return;
  }

  if (target.dataset.selectChampion) {
    resetFlow();
    state.champion = target.dataset.selectChampion;
    render({ focusSelector: `[data-select-champion="${state.champion}"]` });
    announce(`Champion selecionado: ${currentChampion().name}`);
    return;
  }

  if (target.dataset.selectArena) {
    resetFlow();
    state.arena = target.dataset.selectArena;
    render({ focusSelector: `[data-select-arena="${state.arena}"]` });
    announce(`Arena selecionada: ${currentArena().name}`);
    return;
  }

  if (target.hasAttribute("data-primary-action")) runPrimaryAction();
});

document.addEventListener("input", (event) => {
  if (!event.target.matches("[data-room-code]")) return;
  const sanitized = event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6);
  state.roomCode = sanitized;
  event.target.value = sanitized;
  stateSummary.textContent = `${currentMode().name.toUpperCase()} · ${currentChampion().name.toUpperCase()} · ${currentArena().shortName.toUpperCase()}`;
});

document.addEventListener("keydown", (event) => {
  const interactive = event.target.closest("input, textarea, select, button, a, [contenteditable]");
  if (!interactive && event.key === "ArrowLeft") {
    event.preventDefault();
    cycleVariant(-1);
  } else if (!interactive && event.key === "ArrowRight") {
    event.preventDefault();
    cycleVariant(1);
  } else if (event.key === "Escape" && state.phase !== "idle") {
    resetFlow();
    render();
    announce("Fluxo simulado cancelado.");
  }
});

window.addEventListener("popstate", () => {
  state.variant = readVariant();
  render();
});

render();

