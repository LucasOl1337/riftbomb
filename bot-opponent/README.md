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
- A política baseline **anda** e **planta bomba**; nunca emite `skill`, então
  Q / W / E / R ficam sem uso pelo CPU.
- Percepção e política são cobertas por `verify-perception.test.mjs`,
  `verify-world-view.test.mjs` e `verify-baseline-policy.test.mjs`.

## Próximo passo

Ensinar skills ao baseline: o contrato de intenções já aceita `skill`
(veja `intents.md`); falta a política decidir quando pedir cada habilidade.
