export const RIFTBOMB_BRIDGE_VERSION = 1 as const;

export type ChampionId =
  | "katarina"
  | "zed"
  | "renekton"
  | "vladimir"
  | "gangplank";

export type ArenaId =
  | "lattice"
  | "clearing"
  | "labyrinth"
  | "forts"
  | "pit";

export type ClientMode =
  | "online"
  | "solo"
  | "local"
  | "challenge"
  | "join";

export type RuntimeRole = "offline" | "host" | "guest";
export type RuntimePhase = "boot" | "setup" | "lobby" | "match";

export interface RuntimeState {
  phase: RuntimePhase;
  role: RuntimeRole;
  roomCode: string;
  connected: boolean;
  rivalConnected: boolean;
  guestReady: boolean;
  inviteMode: boolean;
  inviteUrl: string;
  busy: boolean;
  hostChampion: ChampionId;
  guestChampion: ChampionId;
  arena: ArenaId;
  matchTarget: number;
  status: string;
  tone: "" | "ok" | "error";
}

export interface RuntimeStateMessage {
  source: "riftbomb-runtime";
  version: typeof RIFTBOMB_BRIDGE_VERSION;
  type: "state";
  reason: string;
  state: RuntimeState;
}

export interface ClientCommand {
  source: "riftbomb-client";
  version: typeof RIFTBOMB_BRIDGE_VERSION;
  type: "command";
  action: string;
  payload?: Record<string, unknown>;
}

export const CHAMPIONS: ReadonlyArray<{
  id: ChampionId;
  name: string;
  role: string;
  portrait: string;
}> = [
  {
    id: "katarina",
    name: "Katarina",
    role: "Assassina",
    portrait: "/client/champions/katarina.webp",
  },
  {
    id: "zed",
    name: "Zed",
    role: "Assassino",
    portrait: "/client/champions/zed.webp",
  },
  {
    id: "renekton",
    name: "Renekton",
    role: "Lutador",
    portrait: "/client/champions/renekton.webp",
  },
  {
    id: "vladimir",
    name: "Vladimir",
    role: "Mago",
    portrait: "/client/champions/vladimir.webp",
  },
  {
    id: "gangplank",
    name: "Gangplank",
    role: "Especialista",
    portrait: "/client/champions/gangplank.webp",
  },
] as const;

export const ARENAS: ReadonlyArray<{
  id: ArenaId;
  name: string;
  shortName: string;
  description: string;
  hero: string;
}> = [
  {
    id: "lattice",
    name: "Salt Lens Array",
    shortName: "Salt Lens",
    description: "Rotas abertas, leitura rápida e confrontos diretos.",
    hero: "/client/arenas/lattice.webp",
  },
  {
    id: "clearing",
    name: "Nacre Hollow",
    shortName: "Nacre",
    description: "Arena equilibrada com corredores de pressão variável.",
    hero: "/client/arenas/clearing.webp",
  },
  {
    id: "labyrinth",
    name: "Cinderfrost Works",
    shortName: "Cinderfrost",
    description: "Passagens estreitas e domínio de espaço.",
    hero: "/client/arenas/labyrinth.webp",
  },
  {
    id: "forts",
    name: "Aeolian Bastions",
    shortName: "Bastions",
    description: "Bolsões defensivos e ataques por flanco.",
    hero: "/client/arenas/labyrinth.webp",
  },
  {
    id: "pit",
    name: "Storm-Eye Basin",
    shortName: "Storm-Eye",
    description: "Centro perigoso e decisões de alto risco.",
    hero: "/client/arenas/clearing.webp",
  },
] as const;

export const MODES: ReadonlyArray<{
  id: ClientMode;
  eyebrow: string;
  name: string;
  description: string;
  badge?: string;
}> = [
  {
    id: "online",
    eyebrow: "PVP AUTORITATIVO",
    name: "Duelo online",
    description: "Crie uma sala e enfrente um amigo no servidor de São Paulo.",
    badge: "RECOMENDADO",
  },
  {
    id: "solo",
    eyebrow: "CONTRA CPU",
    name: "Treinamento",
    description: "Teste Champions, rotas e habilidades no seu ritmo.",
  },
  {
    id: "local",
    eyebrow: "MESMO DISPOSITIVO",
    name: "Versus local",
    description: "Dois jogadores, dois controles e uma única arena.",
  },
  {
    id: "challenge",
    eyebrow: "MELHOR DE 10",
    name: "Desafio personalizado",
    description: "Trave Champions e arena antes de compartilhar o link.",
  },
  {
    id: "join",
    eyebrow: "CÓDIGO DE 6 DÍGITOS",
    name: "Entrar em sala",
    description: "Use o código enviado pelo administrador da partida.",
  },
] as const;

export const INITIAL_RUNTIME_STATE: RuntimeState = {
  phase: "boot",
  role: "offline",
  roomCode: "",
  connected: false,
  rivalConnected: false,
  guestReady: false,
  inviteMode: false,
  inviteUrl: "",
  busy: true,
  hostChampion: "katarina",
  guestChampion: "zed",
  arena: "lattice",
  matchTarget: 3,
  status: "Carregando o runtime da arena…",
  tone: "",
};

const championIds = new Set(CHAMPIONS.map(({ id }) => id));
const arenaIds = new Set(ARENAS.map(({ id }) => id));
const runtimeRoles = new Set<RuntimeRole>(["offline", "host", "guest"]);
const runtimePhases = new Set<RuntimePhase>([
  "boot",
  "setup",
  "lobby",
  "match",
]);

export function isChampionId(value: unknown): value is ChampionId {
  return typeof value === "string" && championIds.has(value as ChampionId);
}

export function isArenaId(value: unknown): value is ArenaId {
  return typeof value === "string" && arenaIds.has(value as ArenaId);
}

export function isRuntimeStateMessage(
  value: unknown,
): value is RuntimeStateMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<RuntimeStateMessage>;
  const state = message.state as Partial<RuntimeState> | undefined;
  return (
    message.source === "riftbomb-runtime" &&
    message.version === RIFTBOMB_BRIDGE_VERSION &&
    message.type === "state" &&
    Boolean(state) &&
    runtimeRoles.has(state?.role as RuntimeRole) &&
    runtimePhases.has(state?.phase as RuntimePhase) &&
    typeof state?.roomCode === "string" &&
    typeof state?.connected === "boolean" &&
    typeof state?.rivalConnected === "boolean" &&
    typeof state?.guestReady === "boolean" &&
    typeof state?.inviteMode === "boolean" &&
    typeof state?.inviteUrl === "string" &&
    typeof state?.busy === "boolean" &&
    Number.isFinite(state?.matchTarget) &&
    typeof state?.status === "string" &&
    ["", "ok", "error"].includes(state?.tone ?? "") &&
    isChampionId(state?.hostChampion) &&
    isChampionId(state?.guestChampion) &&
    isArenaId(state?.arena)
  );
}

export function championById(id: ChampionId) {
  return CHAMPIONS.find((champion) => champion.id === id) ?? CHAMPIONS[0];
}

export function arenaById(id: ArenaId) {
  return ARENAS.find((arena) => arena.id === id) ?? ARENAS[0];
}

export function modeById(id: ClientMode) {
  return MODES.find((mode) => mode.id === id) ?? MODES[0];
}
