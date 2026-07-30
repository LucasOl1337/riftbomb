# Bot opponent

Oponente controlado por CPU do Riftbomb. O bot percebe a Match por um snapshot
somente-leitura (WorldView) e emite intenções; `game/` valida e aplica cada
intenção pelas mesmas regras do input humano.

## Mapa

| Arquivo | Conteúdo |
|---------|----------|
| [sense-arena.mjs](./sense-arena.mjs) | Casca da arena: copia `cols`, `rows`, `tile` e `grid` |
| [build-world-view.mjs](./build-world-view.mjs) | Monta a WorldView somente-leitura do bot a partir da Match |
| [baseline-policy.mjs](./baseline-policy.mjs) | Política baseline: decide intenções a partir da WorldView |
| [package-baseline-bot.mjs](./package-baseline-bot.mjs) | Empacota a política em `game/load-baseline-bot.js` (gerado, não versionado) |
| [package-v1-bot.mjs](./package-v1-bot.mjs) | Empacota o V1 em `game/load-v1-bot.js` (gerado, não versionado), ampliando `RIFTBOMB_BOTS` com `createV1Policy` e `createRenektonPilot` |
| [v1/create-v1-policy.mjs](./v1/create-v1-policy.mjs) | Bot V1: piloto com personalidade; cérebro de arena baseline + campeão plugável |
| [v1/plan-arena-actions.mjs](./v1/plan-arena-actions.mjs) | V1: classifica objetivo (escapar/pickup/pressionar) e registra decisões |
| [v1/v1-memory.mjs](./v1/v1-memory.mjs) | V1: memória comum entre frames (objetivo, rota, última decisão) |
| [v1/renekton/renekton-skills.mjs](./v1/renekton/renekton-skills.mjs) | Renekton: avalia Q/W/E/R e emite intenções de skill (nunca executa) |
| [v1/renekton/renekton-memory.mjs](./v1/renekton/renekton-memory.mjs) | Renekton: memória tática do kit (combo, recast do E, hesitação) |
| [perception.md](./perception.md) | Como o bot enxerga o mundo — inputs, WorldView, sequência no frame |
| [intents.md](./intents.md) | Contrato de intenções (mover, bomba, skill) |
| [requirements.md](./requirements.md) | O que o sistema de bots precisa entregar |
| [planning.md](./planning.md) | Fases, arquitetura proposta e ordem de trabalho |
| [status-quo.md](./status-quo.md) | Registro histórico do CPU embutido (antes da extração) |
| [decisions.md](./decisions.md) | Decisões fechadas e hipóteses ainda abertas |

## Fronteira do módulo

- **Bot opponent (percepção)** descreve: WorldView somente-leitura + serviços (`random`).
- **Bot opponent (política)** decide: intenções do oponente.
- **game** decide: se a intenção é legal, aplica dano, bombas, round e placar.
- **champions** decide: dados e kit do campeão — o bot não embute assets.

## Estado atual (produto)

- Match solo começa com P2 em CPU; P2 vira humano local ao pressionar setas ou Enter.
- O CPU solo entra pela política deste módulo — não há heurística de bot duplicada
  nas regras da Match (`game/run-champion-bomb-duel.js`).
- O CPU solo é o **V1 com piloto Renekton** (via `load-v1-bot.js`): a intenção
  `skill` entra por `castAbility`, o mesmo entrypoint do input humano. Sem o
  bundle V1, a Match cai para a política baseline (move e planta, sem skills).
- Percepção e política são cobertas por `verify-perception.test.mjs`,
  `verify-world-view.test.mjs` e `verify-baseline-policy.test.mjs`.

## Próximo passo

Novos pilotos de campeão para o V1 (o contrato de `skill` já executa; falta
ensinar outros kits além do Renekton) e dar uso aos valores especiais
(`"recast-e"`, `"swap-shadow"`) que a Match ainda ignora.
