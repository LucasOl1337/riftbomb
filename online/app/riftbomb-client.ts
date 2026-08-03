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

/** Product modes exposed by the War Table. Legacy room actions stay in the runtime bridge. */
export type ClientMode = "quick" | "friend" | "solo";

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
  matchmaking: boolean;
  quickMatch: boolean;
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
  signature: string;
  portrait: string;
}> = [
  {
    id: "katarina",
    name: "Katarina",
    role: "Assassina",
    signature: "Mobilidade · Reativação",
    portrait: "/client/champions/avatars/katarina-avatar-dbf4bd7a3da41838e6ebea98a5eff5296451184dc3b071d53e4e9aa186845923.webp",
  },
  {
    id: "zed",
    name: "Zed",
    role: "Assassino",
    signature: "Sombra · Execução",
    portrait: "/client/champions/avatars/zed-avatar-1a959b10d054d0aefe1c0046eebd888810d7cab306bc928282312eee101e86ba.webp",
  },
  {
    id: "renekton",
    name: "Renekton",
    role: "Lutador",
    signature: "Fúria · Pressão",
    portrait: "/client/champions/avatars/renekton-avatar-f424bf8e43906e3a0d6471acede086d23ad1cd1bfe0c25fbfa0258c36f39ce51.webp",
  },
  {
    id: "vladimir",
    name: "Vladimir",
    role: "Mago",
    signature: "Sangue · Sustento",
    portrait: "/client/champions/avatars/vladimir-avatar-7c9df2bdc3347435963d6febd028f9a68013d699fa42b580200637e8a642e944.webp",
  },
  {
    id: "gangplank",
    name: "Gangplank",
    role: "Especialista",
    signature: "Barril · Zona",
    portrait: "/client/champions/avatars/gangplank-avatar-59ce1e1c7d3174fc807506f81079ade20ea660eaa218aa2aa4b204ad5764e4cf.webp",
  },
] as const;

export const ARENAS: ReadonlyArray<{
  id: ArenaId;
  name: string;
  shortName: string;
  description: string;
  trait: string;
  danger: string;
  cover: string;
  hero: string;
  heroSrcSet: string;
}> = [
  {
    id: "lattice",
    name: "Salt Lens Array",
    shortName: "Salt Lens",
    description: "Rotas abertas, leitura rápida e confrontos diretos.",
    trait: "Leitura aberta",
    danger: "Centro exposto",
    cover: "32%",
    hero: "/client/arenas/lattice.webp",
    heroSrcSet: "/client/arenas/responsive/lattice-160-69f4459258e37a51282f358cf68a6c1f37f6a29fd9042141b616b0b496a9543c.webp 160w, /client/arenas/responsive/lattice-320-017ed634e9148be7463658dbc76825aa56478b91c3607d255b0e56f775dbaca0.webp 320w, /client/arenas/responsive/lattice-640-d769bc70693e4a8c11e30c638b727b0dbf86e529e9e68fbd09387099e06b818f.webp 640w, /client/arenas/responsive/lattice-1024-5d6f0a7202032e925f2b688550dd732ad42eeb2b2e39721d449bd9d17f94af1f.webp 1024w, /client/arenas/lattice.webp 1600w",
  },
  {
    id: "clearing",
    name: "Nacre Hollow",
    shortName: "Nacre",
    description: "Corredores de pressão variável e flancos curtos.",
    trait: "Ritmo equilibrado",
    danger: "Rotas espelhadas",
    cover: "46%",
    hero: "/client/arenas/clearing.webp",
    heroSrcSet: "/client/arenas/responsive/clearing-160-fa92645bb79da3cd11a0c69f8c7aca7fa11dd2536631faafe9d4faec85db4b92.webp 160w, /client/arenas/responsive/clearing-320-9149bafa9e6f6cc014342ba9e6cbf14e6545d814b7d085844f79f778ec5d1a4b.webp 320w, /client/arenas/responsive/clearing-640-c66e1cdb805e580191eeb84de0269460b7bdfaf4eae82140b903c393b51e92c5.webp 640w, /client/arenas/responsive/clearing-1024-9604737e3d37a06edbd8ac752d0bcdb6173b5bf0e73822f90f11f2bb46ff8136.webp 1024w, /client/arenas/clearing.webp 1600w",
  },
  {
    id: "labyrinth",
    name: "Cinderfrost Works",
    shortName: "Cinderfrost",
    description: "Passagens estreitas e domínio agressivo de espaço.",
    trait: "Pressão alta",
    danger: "Gargalos térmicos",
    cover: "61%",
    hero: "/client/arenas/labyrinth.webp",
    heroSrcSet: "/client/arenas/responsive/labyrinth-160-dcffca722347e1119209ff5d6abb58f8c199cd6958c92b84cf159e0845d1225d.webp 160w, /client/arenas/responsive/labyrinth-320-41c2c23a42fd41abf04bb0c78746808a63e0f585e3ddd310feb0f94959fd64a4.webp 320w, /client/arenas/responsive/labyrinth-640-3d80ceb9c238bdf7bd48d51b1282ac8e91a380e3b8a3d651cc0dd9de52686909.webp 640w, /client/arenas/responsive/labyrinth-1024-f72179514997010448fdc1a5b6adbe5894dc15cd8f94269ffbf3e46df24484a5.webp 1024w, /client/arenas/labyrinth.webp 1600w",
  },
  {
    id: "forts",
    name: "Aeolian Bastions",
    shortName: "Bastions",
    description: "Bolsões defensivos e ataques por flanco.",
    trait: "Defesa tática",
    danger: "Entradas laterais",
    cover: "55%",
    hero: "/client/arenas/forts-key-art-v2.webp",
    heroSrcSet: "/client/arenas/responsive/forts-key-art-v2-160-d78186b91e4d554a14e9a9f8cd23014366140567cae7bf5e2392cede1dd0c011.webp 160w, /client/arenas/responsive/forts-key-art-v2-320-ec817612c62cc0c15ba70ac141b8b237f6e2360a57b8f6b38efa4ed88c7c993c.webp 320w, /client/arenas/responsive/forts-key-art-v2-640-3ecf8e6aadb2cf34f21da2a2206ac7ccc370cf7c3255761fcab83cac75fcd275.webp 640w, /client/arenas/responsive/forts-key-art-v2-1024-ce2ad5fc9b86884e009799b9420e5452fe62fbc10d8f16673dde859246f31982.webp 1024w, /client/arenas/forts-key-art-v2.webp 1600w",
  },
  {
    id: "pit",
    name: "Storm-Eye Basin",
    shortName: "Storm-Eye",
    description: "Centro perigoso e decisões de alto risco.",
    trait: "Risco extremo",
    danger: "Olho da tempestade",
    cover: "39%",
    hero: "/client/arenas/pit-key-art-v2.webp",
    heroSrcSet: "/client/arenas/responsive/pit-key-art-v2-160-3d9b44d18928740cc653b2917b2032a296af7c6380cc5f9457b29c5348968fd1.webp 160w, /client/arenas/responsive/pit-key-art-v2-320-f328d9e2a839a6632945e1a065a216c1241edbd4539865311cdd1ad9869e9f55.webp 320w, /client/arenas/responsive/pit-key-art-v2-640-7f06dc487378e3aaa81994563b9aeb5fd93333d5e5d82266cf8b38a2b50375dd.webp 640w, /client/arenas/responsive/pit-key-art-v2-1024-602f7ba21f77ad2ecaa3b1fe2878bb69cae6a5850078671c49a8b196441a67f4.webp 1024w, /client/arenas/pit-key-art-v2.webp 1600w",
  },
] as const;

/** Product-facing projection of the trained bot profile owned by bot-opponent/v1. */
export const TRAINING_BOT = Object.freeze({
  id: "v1-renekton",
  name: "V1 Renekton",
  callsign: "Dominus-01",
  champion: "renekton" as ChampionId,
  intelligence: "4/5 · Tático adaptativo",
  record: "100–0 vs baseline",
  survival: "100% na primeira bomba",
  description: "Abre rotas, lê hábitos e converte vantagem no combo E → R → W → Q → Dice.",
  weakness: "Especialista em Renekton",
});

export const MODES: ReadonlyArray<{
  id: ClientMode;
  eyebrow: string;
  name: string;
  description: string;
  badge?: string;
}> = [
  {
    id: "quick",
    eyebrow: "RIVAL ONLINE",
    name: "Partida rápida",
    description: "Rival em São Paulo. Melhor de 3, sem criar sala.",
  },
  {
    id: "friend",
    eyebrow: "CONVITE POR LINK",
    name: "Jogar com amigo",
    description: "Gere um link de melhor de 10 e mande para o amigo entrar direto.",
  },
  {
    id: "solo",
    eyebrow: "CONTRA CPU",
    name: "Treinamento",
    description: "Pratique contra Dominus-01 (V1 Renekton) no navegador, sem fila.",
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
  matchmaking: false,
  quickMatch: false,
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
    typeof state?.matchmaking === "boolean" &&
    typeof state?.quickMatch === "boolean" &&
    Number.isFinite(state?.matchTarget) &&
    typeof state?.status === "string" &&
    ["", "ok", "error"].includes(state?.tone ?? "") &&
    isChampionId(state?.hostChampion) &&
    isChampionId(state?.guestChampion) &&
    isArenaId(state?.arena)
  );
}

export function runtimeStateEquals(
  left: RuntimeState | null,
  right: RuntimeState,
) {
  return (
    left === right ||
    (left !== null &&
      left.phase === right.phase &&
      left.role === right.role &&
      left.roomCode === right.roomCode &&
      left.connected === right.connected &&
      left.rivalConnected === right.rivalConnected &&
      left.guestReady === right.guestReady &&
      left.inviteMode === right.inviteMode &&
      left.inviteUrl === right.inviteUrl &&
      left.busy === right.busy &&
      left.matchmaking === right.matchmaking &&
      left.quickMatch === right.quickMatch &&
      left.hostChampion === right.hostChampion &&
      left.guestChampion === right.guestChampion &&
      left.arena === right.arena &&
      left.matchTarget === right.matchTarget &&
      left.status === right.status &&
      left.tone === right.tone)
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
