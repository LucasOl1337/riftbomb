// War Table is an isolated, local-only pre-match prototype.
// It deliberately reuses published artwork without contacting Riftbomb services.

const MODES = [
  {
    id: "quick",
    index: "01",
    eyebrow: "Pareamento automático",
    name: "Partida rápida",
    description: "Encontre um rival na região e dispute uma melhor de 3.",
    action: "ENTRAR NA FILA",
    format: "MELHOR DE 3",
  },
  {
    id: "friend",
    index: "02",
    eyebrow: "Convite por link",
    name: "Jogar com amigo",
    description: "Configure uma melhor de 10 e envie um link que abre o duelo direto.",
    action: "GERAR LINK DIRETO",
    format: "MELHOR DE 10",
  },
  {
    id: "solo",
    index: "03",
    eyebrow: "Contra CPU",
    name: "Treinamento",
    description: "Treine contra o V1 Renekton certificado como Dominus-01.",
    action: "INICIAR TREINO",
    format: "SESSÃO LIVRE",
  },
];

const TRAINING_BOT = Object.freeze({
  id: "v1-renekton",
  name: "V1 Renekton",
  callsign: "Dominus-01",
  champion: "renekton",
  intelligence: "4/5",
  intelligenceLabel: "Tático adaptativo",
  record: "100–0",
  survival: "100%",
  description: "Abre rotas, lê hábitos e converte vantagem no combo E → R → W → Q → Dice.",
  weakness: "Especialista em Renekton; ainda não pilota outros kits.",
});

const CHAMPIONS = [
  {
    id: "katarina",
    name: "Katarina",
    role: "Assassina",
    signature: "Mobilidade · Reativação",
    image: "/client/champions/katarina.webp",
  },
  {
    id: "zed",
    name: "Zed",
    role: "Assassino",
    signature: "Sombra · Execução",
    image: "/assets/champions/zed-war-table-v1.webp",
  },
  {
    id: "renekton",
    name: "Renekton",
    role: "Lutador",
    signature: "Fúria · Pressão",
    image: "/assets/champions/renekton-war-table-v1.webp",
  },
  {
    id: "vladimir",
    name: "Vladimir",
    role: "Mago",
    signature: "Sangue · Sustento",
    image: "/assets/champions/vladimir-war-table-v1.webp",
  },
  {
    id: "gangplank",
    name: "Gangplank",
    role: "Especialista",
    signature: "Barril · Zona",
    image: "/assets/champions/gangplank-war-table-v1.webp",
  },
];

const ARENAS = [
  {
    id: "lattice",
    number: "01",
    name: "Salt Lens Array",
    shortName: "Salt Lens",
    description: "Rotas abertas, leitura rápida e confrontos diretos.",
    trait: "Leitura aberta",
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
    trait: "Ritmo equilibrado",
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
    trait: "Pressão alta",
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
    trait: "Defesa tática",
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
    trait: "Risco extremo",
    danger: "Olho da tempestade",
    cover: "39%",
    image: "/client/arenas/pit-key-art-v2.webp",
  },
];

const state = {
  mode: "quick",
  champion: "katarina",
  rival: "zed",
  arena: "lattice",
  phase: "idle",
  inviteId: "",
  inviteUrl: "",
  region: "SÃO PAULO",
  ping: 28,
};

let flowTimers = [];

const app = document.querySelector("#app");
const announcer = document.querySelector("#war-table-announcer");

function currentMode() {
  return MODES.find(({ id }) => id === state.mode) ?? MODES[0];
}

function currentChampion() {
  return CHAMPIONS.find(({ id }) => id === state.champion) ?? CHAMPIONS[0];
}

function currentRival() {
  if (state.mode === "solo") {
    return CHAMPIONS.find(({ id }) => id === TRAINING_BOT.champion) ?? CHAMPIONS[2];
  }
  const configuredRival = CHAMPIONS.find(({ id }) => id === state.rival);
  if (configuredRival && configuredRival.id !== state.champion) return configuredRival;
  return CHAMPIONS.find(({ id }) => id !== state.champion) ?? CHAMPIONS[0];
}

function currentArena() {
  return ARENAS.find(({ id }) => id === state.arena) ?? ARENAS[0];
}

function clearFlowTimers() {
  flowTimers.forEach((timer) => window.clearTimeout(timer));
  flowTimers = [];
}

function resetFlow() {
  clearFlowTimers();
  state.phase = "idle";
  state.inviteId = "";
  state.inviteUrl = "";
}

function brandLockup() {
  return `
    <a class="brand-lockup" href="/" aria-label="Riftbomb — restaurar montagem inicial">
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

function connectionBadge() {
  return `
    <div class="connection-badge" role="status" aria-label="Sala segura em ${state.region}, ${state.ping} milissegundos">
      <i aria-hidden="true"></i>
      <span><b>SALA SEGURA</b><small>${state.region} · ${state.ping}MS</small></span>
    </div>`;
}

function avatar(champion, size = "md") {
  return `
    <span class="champion-avatar champion-avatar--${size}" data-champion-portrait="${champion.id}" aria-hidden="true">
      <img src="${champion.image}" alt="" />
    </span>`;
}

function sectionHeading(index, eyebrow, title, id) {
  return `
    <header class="section-heading">
      <span aria-hidden="true">${index}</span>
      <div><small>${eyebrow}</small><h2 id="${id}">${title}</h2></div>
    </header>`;
}

function modeOptions() {
  return MODES.map((mode) => {
    const selected = state.mode === mode.id;
    return `
      <button
        class="mode-option${selected ? " is-selected" : ""}"
        type="button"
        data-select-mode="${mode.id}"
        aria-pressed="${selected}"
      >
        <span class="mode-option__index">${mode.index}</span>
        <span class="mode-option__copy">
          <b>${mode.name}</b>
          <small>${mode.eyebrow}</small>
          <span>${mode.description}</span>
        </span>
        <i aria-hidden="true"></i>
      </button>`;
  }).join("");
}

function protocolRules() {
  const rules = state.mode === "friend"
    ? [
        ["SÉRIE", "MD10"],
        ["CONVITE", "LINK"],
        ["ENTRADA", "DIRETA"],
      ]
    : state.mode === "solo"
      ? [
          ["BOT", "V1"],
          ["PILOTO", "RENEKTON"],
          ["NÍVEL", "4/5"],
        ]
      : [
          ["SÉRIE", "MD3"],
          ["VIDA", "100 HP"],
          ["BOMBA", "35"],
        ];

  return `
    <dl class="protocol-rules" aria-label="Regras do protocolo">
      ${rules.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}
    </dl>`;
}

function championOptions() {
  return CHAMPIONS.map((champion) => {
    const selected = state.champion === champion.id;
    return `
      <button
        class="champion-option${selected ? " is-selected" : ""}"
        type="button"
        data-select-champion="${champion.id}"
        aria-pressed="${selected}"
        aria-label="${champion.name}, ${champion.role}"
      >
        ${avatar(champion, "sm")}
        <span class="champion-option__copy"><b>${champion.name}</b><small>${champion.role}</small></span>
        <span class="champion-option__state" aria-hidden="true">${selected ? "TRAVADO" : ""}</span>
      </button>`;
  }).join("");
}

function arenaOptions() {
  return ARENAS.map((arena) => {
    const selected = state.arena === arena.id;
    return `
      <button
        class="arena-option${selected ? " is-selected" : ""}"
        type="button"
        data-select-arena="${arena.id}"
        aria-pressed="${selected}"
        aria-label="${arena.name}: ${arena.description}"
      >
        <span class="arena-option__image"><img src="${arena.image}" alt="" /></span>
        <span class="arena-option__copy"><small>${arena.number}</small><b>${arena.shortName}</b></span>
      </button>`;
  }).join("");
}

function encounterBar() {
  const champion = currentChampion();
  const rival = currentRival();
  const rivalLabel = state.mode === "solo" ? `CPU · ${TRAINING_BOT.callsign}` : "OPONENTE";
  return `
    <section class="encounter-bar" aria-label="Confronto projetado">
      <article class="fighter fighter--self">
        ${avatar(champion, "sm")}
        <span><small>VOCÊ</small><b>${champion.name}</b><em>${champion.signature}</em></span>
      </article>
      <div class="versus-mark" aria-label="versus"><span>V</span><i></i><span>S</span></div>
      <article class="fighter fighter--rival">
        ${avatar(rival, "sm")}
        <span><small>${rivalLabel}</small><b>${rival.name}</b><em>${rival.signature}</em></span>
      </article>
    </section>`;
}

function matchFacts() {
  const arena = currentArena();
  const mode = currentMode();
  return `
    <dl class="match-facts">
      <div><dt>FORMATO</dt><dd>${mode.format}</dd></div>
      <div><dt>REGIÃO</dt><dd>${state.region}</dd></div>
      <div><dt>COBERTURA</dt><dd>${arena.cover}</dd></div>
      <div><dt>AMEAÇA</dt><dd>${arena.danger}</dd></div>
    </dl>`;
}

function trainingBotCard() {
  if (state.mode !== "solo") return "";
  const botChampion = currentRival();
  return `
    <article class="training-bot-card" aria-label="Oponente de treino ${TRAINING_BOT.name}">
      <header class="training-bot-card__identity">
        ${avatar(botChampion, "md")}
        <span><small>${TRAINING_BOT.callsign}</small><b>${TRAINING_BOT.name}</b><em>${TRAINING_BOT.description}</em></span>
        <i aria-hidden="true">V1</i>
      </header>
      <dl class="training-bot-card__metrics">
        <div><dt>NÍVEL</dt><dd aria-label="${TRAINING_BOT.intelligence}, ${TRAINING_BOT.intelligenceLabel}">${TRAINING_BOT.intelligence}<small>Tático</small></dd></div>
        <div><dt>PLACAR</dt><dd aria-label="${TRAINING_BOT.record} contra o baseline">${TRAINING_BOT.record}<small>vs. base</small></dd></div>
        <div><dt>BOMBA 1</dt><dd aria-label="${TRAINING_BOT.survival} de sobrevivência à primeira bomba">${TRAINING_BOT.survival}<small>intacto</small></dd></div>
      </dl>
      <p><small>LIMITE ATUAL</small>${TRAINING_BOT.weakness}</p>
    </article>`;
}

function createInviteUrl() {
  const token = `${currentChampion().id.slice(0, 2)}${currentArena().number}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  const inviteUrl = new URL(window.location.origin);
  inviteUrl.searchParams.set("invite", token);
  inviteUrl.searchParams.set("champion", state.champion);
  inviteUrl.searchParams.set("arena", state.arena);
  state.inviteId = token;
  state.inviteUrl = inviteUrl.toString();
}

function phaseCopy() {
  const mode = currentMode();
  if (state.phase === "invite" || state.phase === "copied") {
    return {
      eyebrow: state.phase === "copied" ? "LINK COPIADO" : "DESAFIO CONFIGURADO",
      label: state.phase === "copied" ? "COPIAR NOVAMENTE" : "COPIAR LINK",
      status: `MD10 · ${currentChampion().name} · ${currentArena().shortName} · entrada direta`,
      tone: "success",
    };
  }
  if (state.phase === "guest") {
    return {
      eyebrow: `CONVITE ${state.inviteId}`,
      label: "ACEITAR DESAFIO",
      status: `Formação do anfitrião carregada · ${currentChampion().name} · ${currentArena().shortName}`,
      tone: "success",
    };
  }
  if (state.phase === "searching") {
    return {
      eyebrow: "PAREAMENTO EM CURSO",
      label: "CANCELAR BUSCA",
      status: `Varrendo ${state.region} · estimativa 00:18`,
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
      status: state.mode === "solo"
        ? `${TRAINING_BOT.callsign} carregado com o piloto Renekton V1.`
        : "Ambos os lados confirmaram a partida.",
      tone: "success",
    };
  }
  return {
    eyebrow: mode.eyebrow.toUpperCase(),
    label: mode.action,
    status: mode.description,
    tone: "neutral",
  };
}

function primaryAction() {
  const phase = phaseCopy();
  return `
    <section class="action-cluster" data-tone="${phase.tone}" aria-label="Confirmar montagem">
      <div class="action-cluster__status" role="status">
        <small>${phase.eyebrow}</small>
        <p>${phase.status}</p>
      </div>
      <button type="button" data-primary-action>
        <span>${phase.label}</span><b aria-hidden="true">→</b>
      </button>
    </section>`;
}

function renderWarTable() {
  const arena = currentArena();
  const champion = currentChampion();
  const mode = currentMode();
  return `
    <section class="war-table" aria-labelledby="war-table-title">
      <header class="war-topbar">
        <div class="war-topbar__inner">
          ${brandLockup()}
          <div class="war-title-block"><small>MONTAGEM PRÉ-PARTIDA</small><h1 id="war-table-title">WAR TABLE</h1></div>
          ${connectionBadge()}
        </div>
      </header>

      <div class="war-workspace">
        <aside class="war-panel war-protocol" aria-labelledby="protocol-title">
          ${sectionHeading("I", "PROTOCOLO", mode.name, "protocol-title")}
          <p class="war-protocol__intro">Escolha como a partida começa. O item ativo mostra a consequência antes da confirmação.</p>
          <nav class="mode-list" aria-label="Selecionar modo">${modeOptions()}</nav>
          ${protocolRules()}
          ${trainingBotCard()}
        </aside>

        <section class="war-theatre" aria-labelledby="theatre-title">
          <header class="theatre-heading">
            <span aria-hidden="true">II</span>
            <div><small>TEATRO DA PARTIDA · ARENA ${arena.number}/05</small><h2 id="theatre-title">${arena.name}</h2></div>
            <b>${arena.trait}</b>
          </header>
          ${encounterBar()}
          <figure class="war-map">
            <div class="war-map__image">
              <img src="${arena.image}" alt="Vista tática da arena ${arena.name}" />
            </div>
            <figcaption><span>${arena.description}</span><b>RISCO · ${arena.danger}</b></figcaption>
          </figure>
          <nav class="arena-list" aria-label="Selecionar arena">${arenaOptions()}</nav>
        </section>

        <aside class="war-panel war-dossier" aria-labelledby="dossier-title">
          ${sectionHeading("III", "FORMAÇÃO", "CAMPEÃO", "dossier-title")}

          <section class="selected-combatant" aria-label="Campeão selecionado">
            ${avatar(champion, "lg")}
            <div><small>${champion.role.toUpperCase()}</small><b>${champion.name}</b><p>${champion.signature} · ${arena.shortName}</p></div>
          </section>

          <div class="champion-list" aria-label="Selecionar campeão">${championOptions()}</div>

          <div class="dossier-summary">
            ${matchFacts()}
            <div class="formation-lock">
              <small>FORMAÇÃO ATUAL</small>
              <p><b>${champion.name}</b><span aria-hidden="true">/</span>${arena.shortName}<span aria-hidden="true">/</span>${mode.name}</p>
            </div>
            ${primaryAction()}
          </div>
        </aside>
      </div>
    </section>`;
}

function render({ focusSelector } = {}) {
  document.body.dataset.arena = state.arena;
  document.body.dataset.mode = state.mode;
  document.body.dataset.phase = state.phase;
  app.innerHTML = renderWarTable();
  document.title = `${currentArena().shortName} · War Table · Riftbomb`;

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

function clearInviteRoute() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("invite")) return;
  url.searchParams.delete("invite");
  url.searchParams.delete("champion");
  url.searchParams.delete("arena");
  window.history.replaceState(null, "", url);
}

async function copyInviteLink() {
  try {
    await navigator.clipboard.writeText(state.inviteUrl);
  } catch {
    const fallback = document.createElement("textarea");
    fallback.value = state.inviteUrl;
    fallback.setAttribute("readonly", "");
    fallback.className = "sr-only";
    document.body.append(fallback);
    fallback.select();
    document.execCommand("copy");
    fallback.remove();
  }
  state.phase = "copied";
  render({ focusSelector: "[data-primary-action]" });
  announce("Link direto copiado. A formação e a arena seguem no convite.");
}

async function runPrimaryAction() {
  if (state.phase === "invite" || state.phase === "copied") {
    await copyInviteLink();
    return;
  }

  if (state.phase === "guest") {
    state.phase = "ready";
    render({ focusSelector: "[data-primary-action]" });
    announce("Desafio aceito. Arena pronta.");
    return;
  }

  if (state.phase === "searching") {
    resetFlow();
    render({ focusSelector: "[data-primary-action]" });
    announce("Busca cancelada. A formação foi preservada.");
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

  if (state.mode === "solo") {
    state.phase = "ready";
    render({ focusSelector: "[data-primary-action]" });
    announce(`${currentMode().name} preparado. Arena pronta.`);
    return;
  }

  if (state.mode === "friend") {
    createInviteUrl();
    state.phase = "invite";
    render({ focusSelector: "[data-primary-action]" });
    announce("Link direto gerado com a formação e a arena atuais.");
    return;
  }

  state.phase = "searching";
  render({ focusSelector: "[data-primary-action]" });
  announce("Pareamento iniciado.");
  flowTimers.push(window.setTimeout(() => {
    state.phase = "found";
    render();
    announce(`Rival localizado: ${currentRival().name}.`);
  }, 1600));
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
    clearInviteRoute();
    render();
    announce("Montagem inicial restaurada.");
    return;
  }

  if (target.dataset.selectMode) {
    resetFlow();
    clearInviteRoute();
    state.mode = target.dataset.selectMode;
    render({ focusSelector: `[data-select-mode="${state.mode}"]` });
    announce(`Protocolo selecionado: ${currentMode().name}.`);
    return;
  }

  if (target.dataset.selectChampion) {
    resetFlow();
    clearInviteRoute();
    state.champion = target.dataset.selectChampion;
    render({ focusSelector: `[data-select-champion="${state.champion}"]` });
    announce(`Campeão selecionado: ${currentChampion().name}.`);
    return;
  }

  if (target.dataset.selectArena) {
    resetFlow();
    clearInviteRoute();
    state.arena = target.dataset.selectArena;
    render({ focusSelector: `[data-select-arena="${state.arena}"]` });
    announce(`Arena selecionada: ${currentArena().name}.`);
    return;
  }

  if (target.matches("[data-primary-action]")) void runPrimaryAction();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || state.phase !== "searching") return;
  resetFlow();
  render({ focusSelector: "[data-primary-action]" });
  announce("Busca cancelada. A formação foi preservada.");
});

const initialUrl = new URL(window.location.href);
if (initialUrl.searchParams.has("variant")) {
  initialUrl.searchParams.delete("variant");
  window.history.replaceState(null, "", initialUrl);
}

const inviteId = initialUrl.searchParams.get("invite");
if (inviteId) {
  const invitedChampion = initialUrl.searchParams.get("champion");
  const invitedArena = initialUrl.searchParams.get("arena");
  state.mode = "friend";
  state.phase = "guest";
  state.inviteId = inviteId.slice(0, 12).toUpperCase();
  state.inviteUrl = initialUrl.toString();
  if (CHAMPIONS.some(({ id }) => id === invitedChampion)) state.champion = invitedChampion;
  if (ARENAS.some(({ id }) => id === invitedArena)) state.arena = invitedArena;
}

render();
