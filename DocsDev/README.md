# DocsDev — central de documentação do Riftbomb

Este diretório é a porta de entrada para desenvolvimento, operação, QA e
passagens de bastão do Riftbomb.

Criado em **2026-07-30 08:47:22 -03:00 (America/Sao_Paulo)** porque a
documentação essencial estava distribuída entre a raiz e módulos do produto.
Os arquivos que são contratos canônicos de um módulo continuam em seus locais
originais: movê-los quebraria convenções, links ou gates. O conhecimento
essencial foi consolidado aqui e todos os documentos relevantes passaram a
estar indexados por este hub.

## Comece por aqui

1. [Guia consolidado do projeto](PROJECT-GUIDE.md)
2. [Handoff da sessão de 2026-07-30 — rodada 15 / Marca Fatal](HANDOFF-2026-07-30-0847-BRT-RIFTBOMB-ROUND-15.md)
3. [Matriz canônica do programa comparar-qa](../docs/qa/comparar-qa/matriz.md)
4. [Regras obrigatórias para agentes](../AGENTS.md)
5. [Proibição de Playwright headless](../STOP-HEADLESS-PLAYWRIGHT.md)

## Índice da documentação canônica

| Tema | Documento canônico | Por que é importante |
|---|---|---|
| Produto, execução e módulos | [README](../README.md) | Como jogar, gerar o HTML e localizar as capacidades. |
| Vocabulário do domínio | [CONTEXT](../CONTEXT.md) | Nomes que devem permanecer consistentes no código e nas docs. |
| Geografia e regras do repositório | [AGENTS](../AGENTS.md) | Fronteiras de módulos e gates obrigatórios. |
| Segurança de QA | [STOP-HEADLESS-PLAYWRIGHT](../STOP-HEADLESS-PLAYWRIGHT.md) | Proíbe `headless_shell` e os antigos testes hostile-ui sem autorização explícita. |
| Histórico de produto | [CHANGELOG](../CHANGELOG.md) | Alterações publicadas e links para notas de versão. |
| Notas da versão 1.2.0 | [Patch Notes](../PATCH_NOTES_V1.2.0.md) | Consolidado histórico de arenas, desempenho e fundação online. |
| Desempenho | [PERFORMANCE](../PERFORMANCE.md) | Scorecard, método e limites das medições. |
| Histórico da landing | [Swarm Ledger](../SwarmLedger-landing.md) | Registro extenso das rodadas do enxame comercial; histórico, não estado atual. |
| QA comparativo | [Comparar QA](../docs/qa/comparar-qa/README.md) | Convenção do ledger e dos artefatos externos. |
| Ledger multidispositivo | [Matriz comparar-qa](../docs/qa/comparar-qa/matriz.md) | Fonte oficial de cenas, provas, versões e notas de qualidade. |
| Combate | [Combat System](../game/combat-system.md) | Escala de 100 HP, dano, escudos, buffer e arquitetura compartilhada. |
| Aparência da arena | [Arena Appearance](../game/arena-appearance/README.md) | Localização e empacotamento de pisos, paredes e temas. |
| Barra de arte | [Art Quality](../game/arena-appearance/ART-QUALITY.md) | Critérios permanentes para aceitar assets. |
| Pré-produção visual | [Arena Visual Preproduction](../game/arena-appearance/ARENA-VISUAL-PREPRODUCTION.md) | Direção visual e riscos antes de produzir assets. |
| Kit modular da arena | [Modular Kit](../game/arena-appearance/MODULAR-KIT.md) | Contrato dos materiais e peças reutilizáveis. |
| Proveniência visual | [Raw Imagine](../game/arena-appearance/raw-imagine/README.md) | Prompts, fontes, hashes e registro dos assets autorais. |
| PvP publicado | [Online](../online/README.md) | Fluxo, estrutura, comandos e domínio de produção. |
| Servidor autoritativo | [Online Server](../online/server/README.md) | Topologia Worker → Oracle e responsabilidades do runtime. |
| Oponente CPU | [Bot Opponent](../bot-opponent/README.md) | Fronteira intenção → validação, estado e mapa do módulo. |
| Requisitos do bot | [Bot Requirements](../bot-opponent/requirements.md) | Contratos do oponente. |
| Percepção, intenção e planejamento | [Perception](../bot-opponent/perception.md), [Intents](../bot-opponent/intents.md), [Planning](../bot-opponent/planning.md) | Limites de informação e de decisão do CPU. |
| Decisões do bot | [Bot Decisions](../bot-opponent/decisions.md) | Registro de decisões arquiteturais. |
| Curso de arquitetura | [Mission](../architecture-course/mission.md), [Resources](../architecture-course/resources.md), [Teaching Notes](../architecture-course/teaching-notes.md) | Missão, fontes e material didático. |
| Histórico de risco headless | [Hostile UI Attempts](../learning-records/hostile-ui/ATTEMPTS.md) | Contexto do incidente de CPU e da proibição atual. |

## Política de manutenção

- Crie um novo handoff datado em `DocsDev/` antes de encerrar uma sessão com
  trabalho incompleto.
- Atualize `PROJECT-GUIDE.md` quando a arquitetura, os gates ou a topologia de
  produção mudarem.
- Não duplique o ledger de QA nem contratos específicos de módulo; mantenha-os
  no caminho canônico e atualize os links deste índice.
- Registre explicitamente o que está apenas local, o que foi commitado, o que
  foi enviado ao remoto e o que realmente foi validado em produção.
