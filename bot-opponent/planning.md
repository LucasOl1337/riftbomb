# Planejamento — bots AI

Última atualização: 2026-07-26

## 1. Situação

O Riftbomb já tem um CPU embutido na classe `Game` (`updateBot`). Ele é suficiente para demo solo, mas:

- não usa kit de campeão
- mistura política com regras da arena no mesmo arquivo enorme
- não tem dificuldade configurável
- é difícil de testar isolado

Este plano extrai e evolui o bot **sem reescrever a partida**.

## 2. Princípio de arquitetura

```
┌──────────────────────────────────────────────────────────┐
│  game/  (regras, física, placar, input humano)           │
│                                                          │
│   Match state ──► buildSnapshot() ──► política do bot    │
│                                      │                   │
│   applyIntents(intents) ◄────────────┘                   │
│         │                                                │
│         ▼                                                │
│   placeBomb / castQ… / movement vectors                  │
└──────────────────────────────────────────────────────────┘
```

- **Snapshot** é imutável do ponto de vista do bot (cópia rasa de números + grid).
- **Intenções** são desejos: `{ move: {dx,dz}, plantBomb: bool, skill: null|"q"|"w"|"e"|"r"|… }`.
- **Game** valida e aplica. Bot nunca escreve `grid`, `health` ou `bombs` direto.

### Por que não LLM / rede

Produto é **offline game** autocontido. Grid 13×11 + kits finitos cabem em heurística/search clássico. LLM adiciona latência, custo e não-determinismo sem ganho claro no feeling Bomberman.

## 3. Contrato proposto (v0)

### Snapshot (entrada)

Campos mínimos:

- `cols`, `rows`, `tile`, `roundAge`, `roundTime`
- `grid[r][c]` (0 livre, 1 sólido, 2 quebrável — espelhar enum real)
- `self`: id, x, z, health, maxBombs, range, speed flags, CDs, estado de kit relevante
- `rival`: id, x, z, health, invulnerable, alive
- `bombs[]`: r, c, range, age, fuse, ownerId, passOwners
- `blasts[]` / perigo derivado (ou o bot recalcula com a mesma regra `dangerAt`)
- `pickups[]`: r, c, type
- `difficulty`
- `championId` do self
- `rng` handle ou valores já amostrados (preferir: bot chama `random()` injetado)

### Intenções (saída)

```
{
  dx: -1|0|1,
  dz: -1|0|1,
  plantBomb: boolean,
  skill: null | "q" | "w" | "e" | "r" | "recast-e" | "swap-shadow" | …
}
```

Uma intenção por ciclo de pensamento. Commit de movimento pode durar vários frames (como hoje com `aiCommit`).

### API da política

```
createBotPolicy(profile) → {
  think(snapshot, dt) → intents
  reset(roundInfo) → void
}
```

Perfis: `treino` | `rift` | `dominus` (e depois variantes por campeão se necessário).

## 4. Camadas internas da política (evolução)

Ordem de introdução — cada camada só entra quando a anterior estiver estável:

| Camada | Responsabilidade | Fase |
|--------|------------------|------|
| **1. Perigo** | Mapa de custo por célula (blast atual + bomba plantada) | A/B |
| **2. Movimento** | Escolhe vizinho / espera no tile | A |
| **3. Bomba** | Quando plantar e se existe escape | B |
| **4. Objetivo** | Rival vs pickup vs abrir caixa | B |
| **5. Kit** | Skills por campeão | C |
| **6. Personalidade** | Pesos por dificuldade / estilo | C |

Não começar com behavior tree complexa. Utility score no grid (como o baseline) + BFS de escape já resolve 80% do feeling.

## 5. Integração no `game/`

### Passo seguro (sem big-bang)

1. Extrair `dangerAt` / helpers de leitura para funções puras usáveis pelo bot **ou** expor via snapshot já computado.
2. Criar `bot-opponent/rift-cpu-policy.js` (nome final a decidir) com a lógica atual de `updateBot`.
3. Em `Game.update`, se `!p2Human`, chamar política e copiar `aiDx`/`aiDz` + `placeBomb` / skills.
4. Deixar `updateBot` como thin wrapper até o build (`assemble-riftbomb.mjs`) incluir a política na ordem certa — **ou** manter o arquivo de política importado só no assemble.

### Build / HTML autocontido

Hoje o assemble empacota scripts listados em `game/play-riftbomb.html`.  
Para empacotar código de `bot-opponent/`:

- ou o HTML de entrada referencia `../bot-opponent/...` e o assembler resolve
- ou `game/` reexporta um único bridge fino

Decisão preferida: **bridge fino em `game/`** que só instancia a política; corpo da política em `bot-opponent/`. Assim a geografia do produto continua legível (“regras em game, comportamento do oponente em bot-opponent”).

### Geografia do repo

- Profundidade máxima 3 níveis (gate existente).
- Evitar pastas folha com um único arquivo.
- Nome `bot-opponent` descreve a capacidade do produto, não uma camada técnica.

## 6. Fases de entrega

### Fase 0 — Documentação (esta pasta) ✅ em curso

- Requisitos, status quo, decisões, este plano.

### Fase 1 — Contrato + baseline (feeling idêntico)

**Entrega:** política extraída; comportamento ≈ atual.

Tarefas:

1. Congelar testes manuais / notes do feeling atual (fuga, perseguição, bomba).
2. Definir snapshot mínimo e intents.
3. Portar `updateBot` linha a linha para `bot-opponent/`.
4. Wire no `Game`; `p2Human` inalterado.
5. Gate: handoff e “bot age” smoke se já houver harness; senão checklist manual.

**Estimativa:** ~1–2 sessões focadas.

### Fase 2 — Sobrevivência e bomba inteligente

**Entrega:** menos suicídio; escape com BFS; bomba só com rota de fuga.

Tarefas:

1. Simular blast das bombas ativas no grid.
2. `hasEscape(after hypothetical bomb)`.
3. Priorizar pickup seguro.
4. Ajustar pesos Treino/Rift (mesmo código, timers diferentes).

**Estimativa:** ~2 sessões.

### Fase 3 — Kit v1 por campeão

**Entrega:** cada campeão do roster usa ≥1 skill de forma útil.

Ordem sugerida (do mais simples ao mais estadoful):

1. **Renekton** — E para fechar/escapar; Q em melee
2. **Vladimir** — Q em range; W de pool para overblast (cuidado)
3. **Katarina** — E em dagger / escape; Q para marcar
4. **Zed** — W shadow + swap; Q poke
5. **Gangplank** — barril + Q

Cada campeão pode ter um módulo de pesos `bot-opponent/kits/<champ>.md` (doc) e depois `.js` se o arquivo crescer junto.

**Estimativa:** 1 sessão por campeão na v1 rasa.

### Fase 4 — Dificuldades de produto + debug

**Entrega:** seletor (intro ou flag) Treino / Rift / Dominus + painel debug mínimo.

### Fase 5 — CPU vs CPU / stress

**Entrega:** ambos bots para validar regras e showcase; opcional.

## 7. Riscos

| Risco | Mitigação |
|-------|-----------|
| Extrair cedo demais e quebrar assemble HTML | Bridge + um script; teste `npm test` após wire |
| Bot “perfeito” frustrante | Dificuldade default = Rift; treino generoso |
| Skills desalinhadas com animação/CD | Só chamar as mesmas funções do input humano |
| Snapshot gigante / custo de cópia | Grid 13×11; copiar arrays pequenos; reusar buffers se precisar |
| Escopo de “AI” infinito | Critérios de aceite por fase; não treinar modelo |

## 8. Métricas de playtest (qualitativas)

Em 5 rounds vs Rift default:

1. Bot sobrevive à própria primeira bomba na maioria das vezes?
2. Bot quebra caixas e pega ≥1 powerup com frequência?
3. Bot força o humano a se mexer (pressão), não só foge eterno?
4. Kit v1: skill aparece em momento legível (não spam aleatório)?
5. Dominus é claramente mais duro que Treino?

Registrar notas em `bot-opponent/` só quando uma sessão de playtest mudar requisito — não log diário obrigatório.

## 9. Ordem de trabalho imediata

1. **Percepção** — [perception.md](./perception.md) (WorldView, inputs, sequência no frame). ✅ doc v1
2. **Intents** — documentar o que o bot pode *pedir* (mover, bomba, skill…), ainda sem política.
3. **Sensor em código** (opcionalmente antes da política): `buildWorldView` testável, sem cérebro.
4. **Política baseline** — consumir WorldView; feeling ≈ `updateBot` atual.
5. Só então pesos / BFS / skills.

Não pular de docs de produto direto para “como o bot decide” sem intents + percepção estáveis.
