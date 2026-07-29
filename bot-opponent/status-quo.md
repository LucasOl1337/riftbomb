# Status quo — CPU atual

> **Registro histórico (levantamento de 2026-07-26).** Descreve o CPU embutido
> que existia em `game/run-champion-bomb-duel.js`. Desde a extração, o CPU solo
> entra por `bot-opponent/` (`baseline-policy.mjs`, empacotada em
> `load-baseline-bot.js`) — veja `README.md` para o estado atual.

Fonte: `game/run-champion-bomb-duel.js`  
Data do levantamento: 2026-07-26

## Como o produto apresenta

- Intro: “Local versus · adaptive CPU”.
- Solo: “The CPU controls Red until Player 2 presses an arrow key or Enter.”
- HUD: `P2 · CPU` ou `P2 · LOCAL`; round label `CPU controls Red` vs `Local versus`.

## Estado na Match

| Campo | Default | Efeito |
|-------|---------|--------|
| `p2Human` | `false` | CPU ativo |
| `players[1].aiDx / aiDz` | `0` | vetor de movimento do bot |
| `players[1].aiCommit` | `0` | tempo em que mantém a direção |
| `players[1].aiThink` | `0.15–0.35` s | intervalo entre reavaliações |

Handoff: método que seta `p2Human = true` e zera `aiDx`/`aiDz` quando input de P2 chega.

## Loop

A cada frame de update da partida, se `!p2Human`:

```
updateBot(dt)
```

### `updateBot` — comportamento

1. Se bot ou rival morto → return.
2. Decrementa `aiCommit` e `aiThink`.
3. Se ainda pensando (`aiThink > 0`) → return (mantém direção anterior).
4. Só reavalia se estiver **perto do centro da célula** atual (`nearCenter < 0.16`).
5. Se `aiCommit > 0` e célula atual sem perigo → return (não oscila).
6. Gera 5 opções: N/S/L/O + parado; filtra bloqueio (`isBlocked` + bombas passáveis do bot).
7. Score por opção:
   - `−danger * 120` (via `dangerAt`)
   - `−distanceToRival * 0.7`
   - `−nearestPickup * 0.95`
   - penalidade se reverter direção (`0.35`)
   - ruído `random() * 1.8`
8. Grava `aiDx`/`aiDz` e novo `aiCommit` (0.38 se em perigo, senão 0.58).
9. Bomba (após `roundAge > 1.4` e sem perigo na célula):
   - 18% se há caixa quebrável adjacente
   - 26% se alinhado em linha/coluna com rival a < `4.2 * tile`
   - chama `placeBomb(bot)`; se plantou, zera commit

### `dangerAt(r, c)`

Para cada bomba não explodida:

- mesma célula → perigo 3
- mesma linha/coluna com path livre de blast → 1 se fuse ainda folgada, 2 se fuse < ~1.05 s

## O que o CPU **não** faz

- Não usa Q/W/E/R de nenhum campeão
- Não dash / shunpo / shadow swap / pool / barril de kit
- Não simula “e se eu plantar agora, morro?”
- Não faz pathfinding multi-passo (só vizinho imediato)
- Não tem níveis de dificuldade
- Não expõe debug de decisão
- Não usa `Math.random` solto — usa `this.random()` da Match (bom para seed)

## Movimento

`movementFor(player)`:

- id 1 (P1): WASD / touch
- id 2 + `p2Human`: setas
- id 2 + CPU: `aiDx` / `aiDz`

Ou seja: o bot **não** empurra o personagem direto; só alimenta o mesmo caminho de movimento.

## Implicações para o novo sistema

| Manter | Evoluir | Evitar regredir |
|--------|---------|-----------------|
| Handoff por setas/Enter | Escape com olhar multi-célula | Stats diferentes para bot |
| RNG da Match | Skills por campeão | Bot mutando grid |
| Score de utilidade simples como baseline | `hasEscape` antes de bomba | Reescrever regras dentro do bot |
| Near-center commit (movimento grid-like) | Dificuldades | Dependência de DOM/WebGL |

## Feeling subjetivo (baseline)

- Bom para “tem alguém do outro lado”.
- Fraco em: suicídio com bomba própria, skill gap total vs humano que usa kit, perseguição sem path longo, falta de “ler” fuse longa vs curta além do `dangerAt` binário.
