# DocsDev — documentação de sessões

Handoffs de sessão de desenvolvimento do Riftbomb. Um arquivo por sessão,
nomeado `handoff-<tema>-<data>.md`.

## Índice

- [handoff-bot-v1-renekton-2026-07-30.md](./handoff-bot-v1-renekton-2026-07-30.md) —
  treinamento do Bot V1/Renekton: de 0% a 100% de win rate sobre o baseline
  (sessão de 2026-07-29 a 2026-07-30).

## Onde mora a documentação forte do projeto (não migrar)

Por convenção do repositório (AGENTS.md — "coisa nova na capacidade com que
ela muda"), a documentação de cada módulo vive junto do módulo, e links
cruzados dependem desses caminhos. DocsDev guarda apenas handoffs de sessão.

- `bot-opponent/README.md` — mapa do módulo do bot (percepção, política, V1)
- `bot-opponent/decisions.md` — decisões D1–D10 do sistema de bots
- `bot-opponent/planning.md` — fases e arquitetura
- `bot-opponent/perception.md` / `intents.md` — contratos de WorldView e intenções
- `bot-opponent/v1/training-loop.md` — protocolo e log completo dos 16 ciclos de treino
- `game/combat-system.md` — regras de combate
- `AGENTS.md` — regra de localização e convenções do esqueleto de produto
- `docs/qa/comparar-qa/matriz.md` — registro de QA (do usuário)
