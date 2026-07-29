# Percepção do bot — o mundo, os inputs e a sequência

**Status:** percepção e política baseline já estão no código; este documento segue como referência do modelo de percepção.
**Política / output:** cobertos por `intents.md` e `baseline-policy.mjs`.
**Fonte de verdade do estado:** `game/run-champion-bomb-duel.js` (Match / `Game`).

## O que já está fechado e no código

| Passo | Detalhe | Código | Teste |
|------:|---------|--------|-------|
| 1 | Casca da arena: `cols`, `rows`, `tile`, cópia de `grid` | `sense-arena.mjs` → `senseArena` | `verify-perception.test.mjs` |
| 2 | WorldView somente-leitura: self, rival, grid, bombas, blasts, pickups e meta, com cópias que não vazam para a Match | `build-world-view.mjs` | `verify-world-view.test.mjs` |
| 3 | Política baseline consome a WorldView e emite intenções (andar, plantar bomba) | `baseline-policy.mjs` | `verify-baseline-policy.test.mjs` |

Células: `0` livre · `1` sólido · `2` quebrável (`CELL` no mesmo arquivo).

**Ainda não fechado:** uso de skills pelo baseline (a política sempre emite `skill: null`).

O texto longo abaixo é **nota de trabalho / inventário**, não decisão travada.

---

## 0. Princípio

O bot **não enxerga pixels, DOM, áudio nem WebGL**.  
Ele enxerga um **snapshot estruturado** da Match, montado pela partida, no momento certo do frame.

Camadas:

| Camada | Dono | Papel |
|--------|------|--------|
| Mundo simulado | `game/` | Verdade da física e regras |
| **Percepção** | contrato `bot-opponent/` | O que o bot *pode* ler e *quando* |
| Memória curta | política (depois) | O que o bot *guarda* entre pensamentos |
| Intenção / output | política (depois) | Fora deste documento |

Até a política existir, este arquivo fixa só as duas primeiras camadas + a ordem temporal.

---

## 1. Espaços e unidades

### 1.1 Grade da arena

| Símbolo | Valor atual | Notas |
|---------|-------------|--------|
| `cols` | 13 | Índice de coluna `c` ∈ [0, 12] |
| `rows` | 11 | Índice de linha `r` ∈ [0, 10] |
| `tile` | 1.32 | Lado da célula no mundo |
| Borda | `r=0`, `c=0`, `r=rows-1`, `c=cols-1` | Sempre sólido na geração |

**Célula** `grid[r][c]`:

| Valor | Significado jogável |
|------:|---------------------|
| `0` | Livre (andável) |
| `1` | Sólido / hard wall (indestrutível) |
| `2` | Quebrável (crate) |

Coordenada de célula: **(r, c)** — linha primeiro, depois coluna (como no código).

### 1.2 Mundo contínuo

Contestants e vários efeitos vivem em **(x, z)** contínuos (y é visual).

- Centro da célula: via `worldFromCell(r, c)`.
- Célula sob um ponto: via `cellFromWorld(x, z)`.
- Movimento do bot no status quo só **reavalia** direção perto do centro da célula (`nearCenter`); a percepção deve expor **os dois**: mundo e célula.

### 1.3 Tempo

| Campo | Unidade | Significado |
|-------|---------|-------------|
| `dt` | segundos | Duração do frame / do tick de pensamento |
| `elapsed` | s | Tempo desde o start da Match |
| `roundAge` | s | Tempo desde o início do Round atual |
| `roundTime` | s | Countdown restante do Round (parte de 90) |
| Timers de CD / fuse / age | s | Sempre em segundos, não em frames |

Não há “turno de tabuleiro”. A percepção é **contínua no tempo**, amostrada a cada frame em que o bot pensa.

---

## 2. Quem é o “self” do bot

Hoje no produto:

| Papel | `players[]` | Side | Controle default |
|-------|-------------|------|------------------|
| Humano P1 | `players[0]`, `id === 1` | blue | Sempre humano |
| Oponente | `players[1]`, `id === 2` | red | Bot até handoff |

**Self** = o contestant que a política controla (hoje sempre Red / id 2).  
**Rival** = o outro contestant vivo (hoje sempre Blue / id 1).

Handoff: se `p2Human === true`, **não há percepção de bot** — o pipeline de CPU não roda.

Campeão do Red no código: `selectedChampion2` (default **zed**).  
A percepção deve carregar `self.champion` de forma genérica (não hardcodar um campeão).

---

## 3. O que existe no mundo (catálogo bruto)

Tudo que a Match mantém e que *pode* importar para visão.  
Marcado como **P0** (necessário já no baseline de movimento/bomba), **P1** (kit / fase skills), **FX** (só apresentação — bot não precisa).

### 3.1 Estrutura da arena — P0

- `grid[r][c]` completo (visão total da arena top-down do protótipo; sem fog of war — ver decisões)
- `cols`, `rows`, `tile`
- Identidade da arena (`selectedArena` / template id) — útil para heurísticas futuras; **opcional P1**

### 3.2 Relógio e fase da Match — P0

- `mode` — bot só age com sentido em `"playing"`
- `paused`, `roundLocked` — se true, não deve “jogar”
- `round`, `roundWins` (placar [blue, red] / [p1, p2])
- `matchTarget` (3)
- `roundAge`, `roundTime`
- `roundDecisionTimer` — se ≥ 0, round está prestes a fechar

### 3.3 Contestants — P0 (+ campos de kit em P1)

Por jogador (`self` e `rival`):

**Identidade / pose**

- `id`, `champion`, `side`, `name`
- `x`, `z`, `facing`, `lastDx`, `lastDz`
- `alive`, `health`, `maxHealth`
- `moving` (derivado no update; pode ser omitido se o bot não usar)

**Sobrevivência / combate arena**

- `speed`, `maxBombs`, `range`, `shield`
- `invulnerable`, `hurt`, `stunned`
- `dashing`, `dashCooldown`, `dashRequested`
- `speedBoost`

**Kit / skills — P1**

- `skillsUnlocked[4]` — Q/W/E/R (ou slots) desbloqueados por drop; skills começam locked
- `qCooldown`, `wCooldown`, `eCooldown`, `rCooldown`
- Estados por campeão (só os do `self.champion` + o que o rival expõe e afeta o self):
  - Katarina: `ultChannel`, `ultTick`, `spin`, daggers no mundo
  - Zed: `zedSwapWindow`, shadows, marks
  - Renekton: `fury`, `renektonDominus`, `renektonDashRecast`, …
  - Vladimir: `vladimirPool`, `vladimirQStacks`, marks no chão
  - Gangplank: barrels / barrages

**Campos internos de CPU (não são “mundo”, são memória de controle)**

- `aiDx`, `aiDz`, `aiCommit`, `aiThink`  
  → a percepção **pode** reenviá-los como *memória do controlador*, mas não são fatos da arena. Preferível: memória na política, não poluir o snapshot do mundo.

### 3.4 Bombas de arena — P0

Cada bomba ativa (`!exploded` ou cleanup residual):

| Campo | Uso na visão |
|-------|----------------|
| `id` | Identidade estável no frame |
| `ownerId` | De quem é |
| `r`, `c`, `x`, `z` | Onde está |
| `age`, `fuse` | Quanto falta (`fuse - age`) |
| `range` | Alcance do blast |
| `exploded` | Já estourou? |
| `passOwners` | Quem ainda atravessa a bomba |

Contagem derivável: `activeBombsFor(self)` = quantas bombas do self ainda contam no cap `maxBombs`.

### 3.5 Blasts ativos — P0

Células em fogo agora:

- `r`, `c`, `age`, `life`, `ownerId`, `source` (id da bomba), `core`

Estar na mesma célula que um blast vivo = dano iminente / hit rules.

### 3.6 Pickups — P0

- `r`, `c` (e/ou `x`, `z`)
- `type`: `"range" | "bomb" | "speed" | "shield"` (+ futuros skill drops se existirem no grid de drops)

Powerups **escondidos dentro de crates** (`powerupPlan`) **não** entram na visão até a crate quebrar e o pickup nascer — o bot não “vê dentro” da caixa.

### 3.7 Entidades de kit no mundo — P1

Só relevantes quando a política de skills existir; a percepção já deve reservar slots:

| Família | Exemplos de campos |
|---------|-------------------|
| `daggers` | id, ownerId, x, z, age, readyAt, life |
| `projectiles` | dono, trajeto/alvo, tipo |
| `zedShadows` | ownerId, x, z, kind, age, life, swapAvailable |
| `zedMarks` | ownerId, targetId, … |
| `vladimirMarks` | ownerId, x, z, radius, … |
| `gangplankBarrels` | ownerId, r/c ou x/z, age, exploded |
| `gangplankBarrages` | área/tempo |
| `ultimates` / `slashes` | hitboxes temporárias de skill |
| `skillTrails` | **FX** — omitir |

### 3.8 Fora da visão do bot (sempre)

| Coisa | Motivo |
|-------|--------|
| `particles`, `skillTrails`, cores, shock, camera shake | Apresentação |
| `renderer`, `sfx`, `presentation`, DOM, teclas do humano | Infra / outro jogador |
| `enemies` (legado vazio) | Não é o duelo 1v1 atual |
| Seed interno / implementação do PRNG | Bot só recebe amostras via `random()` injetado, se precisar de ruído |
| Plano oculto de powerup em crates intactas | Informação escondida de design |

---

## 4. Inputs que o bot recebe

Dois canais distintos:

### 4.1 Canal A — Snapshot do mundo (somente leitura)

Objeto imutável **do ponto de vista do bot** (cópia ou view congelada naquele instante).  
Nome de trabalho: **`WorldView`**.

Estrutura lógica (não é código final):

```
WorldView
├── meta
│   ├── cols, rows, tile
│   ├── mode, paused, roundLocked
│   ├── round, roundAge, roundTime, roundWins, matchTarget
│   └── selfId, rivalId
├── grid                     // rows × cols, valores 0|1|2
├── self                     // contestant self (campos §3.3 P0; P1 depois)
├── rival                    // contestant rival
├── bombs[]                  // §3.4
├── blasts[]                 // §3.5
├── pickups[]                // §3.6
├── kitWorld                 // §3.7 — vazio/omitido no baseline
└── clock.dt                 // dt deste tick de percepção
```

Regras:

1. **Somente leitura.** Política não escreve em `WorldView`.
2. **Sem ponteiros mutáveis vivos** para arrays da Match se isso permitir side-effect; preferir cópia rasa dos números e arrays necessários.
3. **Mesma semântica de coordenadas** que o `Game` (não inverter r/c).
4. **Sem UI strings** obrigatórias (`name` pode ir por debug; decisão não depende de label).

### 4.2 Canal B — Controles de amostragem (serviços, não “fatos”)

Injetados junto com o snapshot ou no contexto do think:

| Serviço | Contrato | Uso |
|---------|----------|-----|
| `random() → [0,1)` | Mesmo PRNG da Match (`Game.random`) | Ruído determinístico |
| (opcional) `now` | Já coberto por meta de tempo | Evitar `Date.now` na política |

Não é input de mundo; é **instrumento** para a política ser reprodutível.

### 4.3 Canal C — Memória do controlador (não é mundo)

Estado que a política carrega entre pensamentos, **fora** do `WorldView`:

Exemplos (status quo atual embutido no player):

- direção commitada
- tempo restante de commit
- timer até o próximo think
- (futuro) último alvo, último motivo de bomba, sticky goal

No contrato limpo:

- Match **não** precisa saber a semântica dessa memória.
- Percepção entrega o mundo; a política junta `WorldView + Memory + dt`.

### 4.4 O que o bot **não** recebe como input de decisão

- Key/mouse/touch do P1 (trapacear leitura de input humano)
- Framebuffer / “o que está na tela”
- Latência de rede (offline)
- Prompt em linguagem natural

---

## 5. Sentidos derivados (ainda percepção, não política)

Alguns valores são **calculáveis só com o snapshot** e são legítimos como *camada de percepção pré-processada*, desde que a fórmula seja a da regra do jogo (ou uma aproximação documentada).

| Sentido | Entrada | Saída conceitual | Prioridade |
|---------|---------|------------------|------------|
| `cellOf(entity)` | x,z | `{r,c}` | P0 |
| `dangerAt(r,c)` | bombs + grid + fuse | 0..3 (como hoje) | P0 |
| `timeToFuse(bomb)` | age, fuse | segundos | P0 |
| `blastCells(bomb)` | bomb + grid | lista de células atingidas se explodir agora | P1 (bomba inteligente) |
| `isBlockedWorld(x,z)` | grid + bombs + passOwners | bool | P0 se movimento fino; baseline usa célula |
| `activeBombCount(self)` | bombs | int | P0 |
| `manhattan / hypot` | posições | distâncias | P0 |

**Regra:** derivados podem ser:

- calculados **pela Match** ao montar o snapshot (campos `danger[][]` opcional), ou
- calculados **pelo módulo de percepção** em `bot-opponent/` a partir do snapshot cru,

mas **não** inventam regras novas (ex.: perigo que o jogo não aplica).

Baseline atual usa `dangerAt` + distância + pickup — isso é pré-processamento de percepção + score; o score em si já é política e **não** entra neste doc como requisito de visão.

---

## 6. Sequência temporal

### 6.1 Quando o bot “abre os olhos” no frame

Ordem real em `Game.update(dt)` (trecho relevante):

1. Se não está `playing` ou está `paused` → bot **não** roda.
2. Atualiza idade de **blasts** e filtra os mortos.
3. Se `roundLocked` → bot **não** roda.
4. Atualiza `roundTime`, `roundAge`.
5. **`updateBot(dt)`** ← *aqui* a percepção deve ser montada e o think ocorre.
6. `updateContestant` para todos (movimento aplica `aiDx`/`aiDz` já escolhidos).
7. Updates de kit (Katarina, Zed, …).
8. `updateBombs` (fuse avança / explosões **deste** frame).
9. `collectPickups`.
10. Decisão de fim de round / timeout.

### 6.2 Implicação para o `WorldView`

No instante da percepção (passo 5), o bot vê:

| Já refletido neste frame | Ainda **não** refletido neste frame |
|--------------------------|-------------------------------------|
| Blasts envelhecidos / removidos | Movimento dos players deste `dt` |
| Estado pós-frame anterior completo | Explosões cujo fuse completa **neste** `updateBombs` |
| `roundAge` / `roundTime` já tickados | Pickups coletados neste frame |
| | Skills que o humano “lançaria” no mesmo frame após o bot |

Ou seja: o bot age com visão **quase síncrona**, ligeiramente **antes** da simulação de movimento e bombas do frame.  
Isso é aceitável e deve ser **estável** — não reordenar o think para depois das bombas sem reescrever este contrato.

### 6.3 Sequência **dentro** de um ciclo de percepção (contrato)

Ordem obrigatória de montagem/consumo — ainda sem decidir output:

```
[Match frame]
    │
    ├─1. Guardas: mode, paused, roundLocked, p2Human, self.alive
    │      se falhar → sem WorldView / think não roda
    │
    ├─2. Congelar fatos brutos (§3 P0)
    │      grid, bombs, blasts, pickups, self, rival, meta, dt
    │
    ├─3. Anexar kitWorld se fase ≥ P1
    │
    ├─4. Derivar sentidos baratos (§5) se forem parte do pacote
    │      cellOf(self/rival), danger na célula atual, etc.
    │
    ├─5. Empacotar WorldView (read-only)
    │
    ├─6. Entregar à política: (WorldView, memory, random, dt)
    │      ★ política / output = documento futuro
    │
    └─7. Match aplica intenções depois (movimento no passo 6 do frame, etc.)
```

### 6.4 Ritmo de reavaliação (status quo → contrato)

O mundo é amostrável **todo frame**, mas o status quo **só re-pensa** quando:

1. `aiThink` chegou a 0, e
2. self está perto do centro da célula, e
3. não está em commit sem perigo.

Isso é **política de frequência**, não limitação do mundo.  
O contrato de percepção permite snapshot **a cada frame**; a política decide se ignora.

Recomendação de contrato:

- Match **pode** chamar `sense()` todo frame em que o bot está ativo.
- Política pode early-return sem mudar intenções (equivale ao `aiThink > 0`).

### 6.5 Ciclo de vida maior (Match / Round)

| Evento | Efeito na percepção |
|--------|---------------------|
| `start` / `startRound` | Mundo novo: grid novo, players reset, listas vazias |
| Meio do round | Stream contínuo de WorldViews |
| Morte de self ou rival | Guardas; think pode parar |
| `roundLocked` / transição | Sem think |
| Handoff `p2Human` | Pipeline de bot desliga; sem snapshot de CPU |
| Novo round | Memória de política deve `reset` (contrato futuro) |

---

## 7. Completude da informação (o que o bot “enxerga bem”)

Decisão alinhada a `decisions.md` (visão total top-down):

| Informação | Visível? |
|------------|----------|
| Todo o grid | Sim |
| Todas as bombas e fuses | Sim |
| Posição e stats públicos do rival | Sim |
| Pickups no chão | Sim |
| Conteúdo de crate intacta | **Não** |
| Input buffer do humano | **Não** |
| Próximo `random` da Match | **Não** (só ao chamar `random()`) |
| Frames futuros | **Não** — só estado presente (+ derivados determinísticos) |

O bot pode **projetar** o futuro (ex.: “se essa bomba explodir, quais células?”) usando regras conhecidas; isso é raciocínio sobre a percepção, não um sexto sentido mágico.

---

## 8. Ordem de prioridade para implementar a visão (sem política)

Quando form código, implementar **só** o sensor, testável sem cérebro:

1. **WorldView P0** — meta + grid + self/rival essenciais + bombs + blasts + pickups + dt  
2. Serialização estável / freeze para testes (mesmo seed → mesmo JSON lógico)  
3. Helpers de sentido: `cellOf`, `dangerAt` paridade com o jogo  
4. Hook no frame **no mesmo ponto** do `updateBot` atual  
5. Só então política baseline consome o WorldView  

Critério de pronto da percepção (sem bot “esperto”):

- [ ] Dado um estado de Match fixo, `buildWorldView(match)` devolve os campos P0
- [ ] Nada do view aponta de volta para mutar `match.grid` / `match.bombs` sem ser cópia segura
- [ ] Documentado o ponto do frame (este arquivo §6)
- [ ] Lista P1 kitWorld especificada mas pode ir `null` / omitida

---

## 9. Glossário curto deste documento

| Termo | Significado |
|-------|-------------|
| **WorldView** | Snapshot de percepção de um instante |
| **Fato bruto** | Campo copiado da Match sem interpretação |
| **Sentido derivado** | Valor calculado com regra explícita a partir dos fatos |
| **Memória** | Estado da política entre pensamentos (não é mundo) |
| **Guardas** | Condições que impedem montar/usar percepção |
| **P0 / P1** | Necessário para movimento+bomba vs necessário para kit |

---

## 10. Próximo documento (ainda não escrever política)

Depois deste contrato estável:

1. **`intents.md`** (ou seção em planning) — o que o bot *pode pedir* para fazer  
2. Só então **política** — como WorldView (+ memória) vira intents  

Não inverter: output sem modelo de input vira bot acoplado ao `Game` inteiro de novo.
