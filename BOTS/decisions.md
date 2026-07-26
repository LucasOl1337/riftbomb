# Decisões — bots AI

Formato: decisão fechada ou hipótese com default.  
Atualizar quando o playtest ou a implementação invalidar algo.

## Fechadas (propostas adotadas neste kickoff)

### D1 — Módulo `BOTS/` existe

**Decisão:** requisitos, planejamento e, depois, política de IA vivem em `BOTS/`.  
**Motivo:** histórico vai mudar o oponente separado das regras da arena e dos assets de campeão.  
**Consequência:** `AGENTS.md` registra a fronteira; `game/` continua dono da Match.

### D2 — Offline, sem LLM em runtime

**Decisão:** bot = política clássica (heurística / search / utility).  
**Motivo:** produto offline autocontido; grid pequeno; latência e determinismo.

### D3 — Bot não trapaceia regras

**Decisão:** intenções passam pelos mesmos entrypoints do input humano.  
**Motivo:** fairness, reuso, menos bugs de estado.

### D4 — Dificuldade não buffa stats

**Decisão:** Treino / Rift / Dominus mudam timing, ruído e agressividade da política.  
**Motivo:** campeão continua a mesma ficha; só o “piloto” muda.

### D5 — Baseline = portar `updateBot` antes de “melhorar”

**Decisão:** primeira entrega de código é feeling idêntico, só extraído.  
**Motivo:** seam real + regressão zero de demonstração solo.

### D6 — Skills vêm depois de sobrevivência/bomba

**Decisão:** ordem Fase 1 → 2 → 3 do [planning.md](./planning.md).  
**Motivo:** kit em bot burro que se explode piora o feeling.

### D7 — Percepção antes de política e de output

**Decisão:** o contrato de **como o bot enxerga o mundo** (`perception.md`) fecha antes de definir intents e antes de portar/escrever política.  
**Motivo:** sem input estável, o bot volta a acoplar no `Game` inteiro.  
**Consequência:** implementação de código de decisão só depois de WorldView P0 + (doc de) intents.

### D8 — Instantâneo do think no frame

**Decisão:** o bot observa o mundo **no mesmo ponto** do `updateBot` atual: depois de envelhecer blasts e tick de `roundAge`/`roundTime`, **antes** de mover contestants e **antes** de `updateBombs` do frame.  
**Motivo:** preservar semântica temporal do status quo; evitar “ver o futuro” do fuse do mesmo frame sem querer.

### D9 — Memória ≠ mundo

**Decisão:** `aiCommit` / timers de think / sticky goals são **memória do controlador**, não campos do WorldView de arena.  
**Motivo:** o snapshot descreve a Match; a política carrega o que lembra entre frames.

## Defaults para pontos ainda flexíveis

### H1 — Nome dos níveis

**Default:** `treino` · `rift` · `dominus`.  
**Alternativa:** Easy / Normal / Hard (mais genérico — evitar se o tom do jogo aguentar os nomes de domínio).

### H2 — Onde o jogador escolhe dificuldade

**Default v1:** default `rift`; override por query `?cpu=treino|rift|dominus` ou flag interna.  
**Depois:** controle na intro ao lado do select de campeão.

### H3 — Visão do bot

**Default:** informação completa do grid e bombas (como um humano que “vê a arena toda” no protótipo top-down).  
**Não** implementar fog of war agora.

### H4 — Formato do código da política

**Default:** JS vanilla alinhado ao resto do `game/` (sem TypeScript obrigatório na v1).  
**Tipos:** opcional em JSDoc se o contrato estabilizar.

### H5 — Um arquivo vs vários

**Default inicial:** um `rift-cpu-policy.js` + docs.  
**Extrair** `kits/` só quando o segundo campeão com lógica própria fizer o arquivo oscilar por razões diferentes.

### H6 — CPU no P1

**Default:** não. P1 é sempre humano neste produto.

## Log de mudanças

| Data | Mudança |
|------|---------|
| 2026-07-26 | Kickoff: pasta `BOTS/`, requisitos, plano, status quo, decisões D1–D6 |
| 2026-07-26 | D7–D9 + `perception.md`: visão do mundo e sequência antes de output |
