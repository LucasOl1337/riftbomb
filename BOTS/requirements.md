# Requisitos — sistema de bots AI

Última atualização: 2026-07-26  
Produto: Riftbomb (duelo de arena, Match = first to 3 Rounds, offline HTML)

## 1. Objetivo

Ter um oponente de CPU que:

1. Completa partidas solo de forma crível (não “anda aleatório e morre”).
2. Usa as **mesmas regras** que um jogador humano (sem atalhos de motor).
3. Escala de “treino” até “desafio”, sem rebalancear o campeão humano.
4. Fica testável e substituível (políticas diferentes atrás do mesmo contrato).

## 2. Atores e modos

| Ator | Papel |
|------|--------|
| P1 humano | Sempre controlado por teclado/touch |
| P2 bot | CPU até alguém reivindicar P2 com input local |
| P2 humano local | Substitui o bot no meio da Match quando setas/Enter forem usados |

### Modos de Match (requisito de produto)

| Modo | Descrição | Prioridade |
|------|-----------|------------|
| Solo vs CPU | Default atual | P0 |
| Local 1v1 | Já existe; bot desliga | P0 (não regredir) |
| CPU vs CPU (headless / demo) | Útil para teste e showcase | P2 |
| Multi-bot / free-for-all | Fora de escopo enquanto Match for 1v1 | Fora |

## 3. Requisitos funcionais

### RF-01 — Controle do contestant vermelho

O bot controla o `players[1]` (Red) enquanto `p2Human === false`.  
Deve emitir intenções em tempo real, a cada tick da partida (ou em sub-rate interno), não em turnos discretos de tabuleiro.

### RF-02 — Mesmo pipeline de ação do humano

Intenções do bot passam pelos **mesmos** caminhos de:

- movimento (`movementFor` / `updateContestant`)
- bomba de arena (`placeBomb`)
- kit do campeão (Q/W/E/R e recasts, quando implementado)

Proibido: teleporte ilegal, ver células ocultas além do que a regra expõe, alterar fuse/range por baixo da mesa.

### RF-03 — Sobrevivência a perigo de bomba

O bot deve preferir sair de células em perigo de blast (próprio ou rival) antes de caçar o rival.

### RF-04 — Pressão ofensiva com bombas

O bot deve plantar bombas para:

- quebrar caixas e abrir mapa / pegar powerups
- pressionar o rival em alinhamento de linha/coluna quando for seguro o suficiente para escapar

### RF-05 — Coleta de powerups

O bot deve valorizar pickups (`range`, `bomb`, `speed`, `shield`) sem se matar para pegá-los.

### RF-06 — Uso do kit do campeão (gap atual)

Hoje o CPU **não** usa skills. Requisito alvo:

| Fase | Comportamento |
|------|----------------|
| Baseline | Só movimento + bomba (paridade com status quo) |
| Kit v1 | Usa 1–2 skills “simples” por campeão (ex.: dash de escape, skill de poke) |
| Kit v2 | Combo e timing de R coerentes com o kit real |

O bot deve escolher kit **do campeão que está jogando** (Katarina, Zed, Renekton, Vladimir, Gangplank…), não um kit genérico inventado.

### RF-07 — Dificuldades

No mínimo três níveis nomeados de produto:

| Nível | Intenção de design |
|-------|--------------------|
| Treino | Reação lenta, erra escapes, rara pressão de bomba, quase sem kit |
| Rift | Default; joga “certo” o essencial, kit básico |
| Dominus | Reação rápida, bom pathing, kit agressivo, pouca hesitação |

Dificuldade afeta **política e timing**, não stats do campeão (HP/dano/CD base iguais ao humano).

### RF-08 — Handoff humano

Se P2 reivindicar controle no meio do round:

- bot para imediatamente
- estado de `aiDx` / `aiDz` / commit não “puxa” o personagem contra o input
- placar e bombs já plantados permanecem

### RF-09 — Determinismo opcional

Dado o mesmo `seed` da Match + mesma sequência de inputs humanos + mesma política, o bot deve ser **reprodutível** o suficiente para regressão.  
Ruído aleatório da política deve consumir o PRNG da Match (`this.random()`), não `Math.random()` solto.

### RF-10 — Observabilidade de debug

Em modo desenvolvimento (flag ou query), deve ser possível inspecionar:

- célula alvo / direção commitada
- score das opções recentes
- motivo da última bomba / skill
- nível de dificuldade ativo

Não precisa de UI polida na v1; dataset no card do player ou log basta.

## 4. Requisitos não funcionais

### RNF-01 — Offline

Bot roda 100% no cliente, sem rede, sem modelo de LLM em runtime.  
“AI” aqui = política de jogo (heurística / search / behavior tree / utility), não chamada a API.

### RNF-02 — Orçamento de frame

Pensamento do bot ≤ **0,5 ms** médio por frame em hardware alvo do protótipo (máquina de dev).  
Pathfinding pesado, se existir, deve ser amortizado ou limitado (grid 13×11 permite BFS barato).

### RNF-03 — Isolamento de responsabilidade

Política de bot **não** importa renderer, áudio nem DOM.  
Só recebe snapshot + emite intenções.

### RNF-04 — Testabilidade

Gates automáticos cobrem:

- bot não fica parado 5s com caminho livre e rival vivo (smoke)
- bot tenta sair de célula com perigo iminente (regra)
- handoff `p2Human` desliga `updateBot`
- (depois) skill só dispara se CD e regra permitirem

### RNF-05 — Localidade no repositório

Planejamento e, depois, código de política vivem sob `BOTS/`.  
Regras de arena, colisão e dano permanecem em `game/`.

## 5. Fora de escopo (explícito)

- Matchmaking online / bot em servidor
- LLM / chat do oponente
- Aprendizado por reforço treinado em pipeline pesado (pode ser pesquisa futura; não bloqueia v1)
- Bot controlando P1
- Personalidade narrativa por campeão com VO dedicado (nice-to-have depois do kit)

## 6. Critérios de aceite por fase

### Fase A — Baseline extraído

- [ ] `updateBot` atual portado para política nomeada sem mudança de feeling perceptível
- [ ] Contrato snapshot → intenções documentado
- [ ] Solo vs CPU e local 1v1 não regredidos

### Fase B — Sobrevivência e pressão

- [ ] Escape de blast previsível na maioria dos casos
- [ ] Menos suicídio por bomba própria
- [ ] Coleta de powerup quando seguro

### Fase C — Kit v1 + dificuldades

- [ ] Pelo menos um skill útil por campeão jogável no roster atual
- [ ] Três níveis Treino / Rift / Dominus selecionáveis (mesmo que só por flag no início)

### Fase D — Polimento

- [ ] Debug de decisão
- [ ] Gates de regressão verdes no `npm test`
- [ ] README de produto menciona o sistema de bots

## 7. Linguagem de domínio (bots)

| Termo | Significado | Evitar |
|-------|-------------|--------|
| **Bot** | Controlador de um contestant na Match | AI agent, NPC genérico |
| **Política** | Algoritmo que escolhe intenções | Brain, neural net (a menos que exista de verdade) |
| **Intenção** | Pedido de ação (mover, bomba, skill) ainda não validado | Command cheating / force action |
| **Snapshot** | Visão somente-leitura do estado que o bot pode usar | God state mutável |
| **Dificuldade** | Perfil de timing/erro da política | Stat buff escondido |
| **Handoff** | Transição bot → P2 humano local | Takeover, host migration |
