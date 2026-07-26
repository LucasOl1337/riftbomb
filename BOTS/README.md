# BOTS

Sistema de oponentes controlados por IA do Riftbomb.

Esta pasta concentra **requisitos, planejamento e decisões** do bot. Código de regras e partida continua em `game/` até existir um seam estável o bastante para extrair a política de IA sem reescrever a Match.

## Mapa

| Arquivo | Conteúdo |
|---------|----------|
| [perception.md](./perception.md) | **Como o bot enxerga o mundo** — inputs, WorldView, sequência no frame |
| [requirements.md](./requirements.md) | O que o sistema de bots precisa entregar |
| [planning.md](./planning.md) | Fases, arquitetura proposta e ordem de trabalho |
| [status-quo.md](./status-quo.md) | O que o CPU faz hoje no código da partida |
| [decisions.md](./decisions.md) | Decisões fechadas e hipóteses ainda abertas |

## Como estamos construindo (ritmo)

Um detalhe por vez: conversar → implementar o mínimo → teste → só então o próximo.  
Sem fechar o contrato inteiro de cabeça. Tabela do que já entrou: topo de `perception.md`.

## Fronteira do módulo

- **BOTS (percepção)** descreve: WorldView somente-leitura + serviços (`random`).
- **BOTS (política, depois)** decide: intenções do oponente.
- **game** decide: se a intenção é legal, aplica dano, bombas, round e placar.
- **champions** decide: dados e kit do campeão — o bot não embute assets.

## Estado atual (produto)

- Match solo começa com P2 em CPU.
- P2 vira humano local se alguém pressionar setas ou Enter.
- O CPU de hoje só **anda** e **planta bomba**. Não usa Q / W / E / R.
- Lógica embutida em `game/run-champion-bomb-duel.js` (`updateBot`).
- Percepção ainda **não** está extraída: o CPU lê o `Game` por dentro.

## Próximo passo

Fechar e, se necessário, refinar `perception.md` → documentar **intents** → só então baseline de política consumindo WorldView.
