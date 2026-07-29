# Performance Swarm — Riftbomb

## Objetivo do enxame

Evoluir a performance do Riftbomb em até 20 rodadas sequenciais, com ganhos objetivos em tempo, peso, CPU/memória, rede, build ou percepção de velocidade, sem alterar regras de negócio ou reduzir garantias de segurança.

## Estado sequencial

- Rodada atual: **2/20 — Inventário de gargalos (disponível)**
- Última rodada concluída: **1/20 — Baseline real**
- Próxima rodada planejada: **2/20 — Inventário de gargalos**
- Worktree isolada: `C:/Users/user/.codex/worktrees/f4aa/riftbomb`
- Branch local: `automation/perf-sequential-r01-baseline`
- Base: `8a259be1666088ab733ca9f7028100253f46774c`
- Runtime medido: Node `v24.14.0`, npm `11.18.0`, Windows/PowerShell

## Reivindicação ativa

Nenhuma. A rodada 1 foi concluída e o escopo foi liberado.

## Baseline inicial

### Stack e comandos seguros

| Capacidade | Stack / transporte | Build | Teste / validação |
|---|---|---|---|
| Jogo offline | HTML/CSS/JS modular, empacotado em um HTML | `npm run build` na raiz | `npm test` na raiz |
| Shell publicado | React 19, Next 16 via vinext/Vite 8, Cloudflare Worker | `npm run build` em `online/` | `npm test` e `npm run lint` em `online/` |
| Salas publicadas | Route handler `/api/pvp`, Drizzle/D1 | incluído no build online | testes em `online/tests/` |
| Partida autoritativa | Node + `ws`, transporte `/game-ws` | sem etapa de build | `npm test` em `online/server/` |

Playwright/headless não foi executado, conforme `STOP-HEADLESS-PLAYWRIGHT.md`.

### Rotas e caminhos críticos

- **Rota crítica principal:** `/riftbomb.html` publicado. A sequência estática é HTML do loader → `riftbomb-loader.js` → manifest → uma parte do jogo → `online-duel.css` + `online-duel.js`; em seguida abre `/game-ws`.
- **Rota crítica secundária:** `/`, o lobby React que escolhe arena/campeões e cria ou entra em sala por `/api/pvp` antes de navegar para o jogo.
- **Fluxo offline crítico:** `game/play-riftbomb.html` registra módulos; `game/assemble-riftbomb.mjs` gera `riftbomb.html`.
- **API crítica:** `POST/GET /api/pvp`; transporte autoritativo único em `/game-ws`.

### Métricas coletadas

| Métrica | Execuções | Resultado-base |
|---|---|---|
| Build raiz | 2.954,2 / 2.762,6 / 3.103,0 ms | mediana **2.954,2 ms**, média 2.939,9 ms |
| Teste raiz, incluindo build | 7.374,7 / 6.080,3 / 6.587,3 ms | mediana **6.587,3 ms**, 41/41 testes |
| Teste do servidor autoritativo | 3.627,3 / 3.056,6 / 2.851,8 ms | mediana **3.056,6 ms**, 3/3 grupos |
| Testes online sem rebuild | 388,2 / 409,1 / 442,5 ms | mediana **409,1 ms**, 11/11 testes |
| Build/test online completo | uma tentativa, 1.965,2 ms até falhar | bloqueado antes do build por CRLF em `build-verified.sh` (`set: pipefail`) |
| Boot publicado histórico | 84,9 / 87,7 / 97,8 ms | mediana **87,7 ms**, conforme `PERFORMANCE.md` de 2026-07-27 |

### Payloads e requests estáticos

- Jogo publicado até reconstruir o documento: **739.851 B não comprimidos em 6 requests** (`807` HTML + `3.315` loader + `164` manifest + `667.151` parte + `11.921` CSS + `56.493` JS).
- Manifest atual: uma parte de **667.151 B**; limite configurado por parte: 4 MiB.
- Shell `/`: **331.629 B de JS não comprimido** no grafo atual (`index`, runtime, framework e page) e **23.301 B de CSS**. Fontes e imagens são adicionais e condicionais ao HTML/render.
- Assets publicados: texturas de arena **5.149.084 B / 17 arquivos**; modelos de campeão **75.414.049 B / 15 arquivos**; carregados sob demanda pela escolha do duelo.
- `online/dist`: **83.971.289 B / 88 arquivos**. Os maiores são `katarina-frames.bin` (22.167.600 B) e `katarina-normals.bin` (11.083.800 B).
- Artefato offline gerado: **107.716.723 B**; ele é um produto offline único, não o payload inicial publicado.

## Métrica principal e budgets iniciais

Métrica principal: **bytes não comprimidos e número de requests necessários para reconstruir `/riftbomb.html` antes dos assets selecionados**, acompanhados pela mediana histórica de `data-riftbomb-ready-ms` quando houver medição em navegador visível.

| Budget inicial | Limite | Baseline | Margem |
|---|---:|---:|---:|
| Payload estático crítico do jogo | ≤ 800.000 B | 739.851 B | 60.149 B |
| Requests estáticos críticos do jogo | ≤ 8 | 6 | 2 |
| JS do shell `/`, não comprimido | ≤ 350.000 B | 331.629 B | 18.371 B |
| CSS do shell `/`, não comprimido | ≤ 25.000 B | 23.301 B | 1.699 B |
| Build raiz, mediana local | ≤ 3.500 ms | 2.954,2 ms | 545,8 ms |
| Teste raiz completo, mediana local | ≤ 7.500 ms | 6.587,3 ms | 912,7 ms |
| Teste do servidor, mediana local | ≤ 4.000 ms | 3.056,6 ms | 943,4 ms |
| `POST /api/pvp` create, mediana publicada | ≤ 50 ms | 28,0 ms histórico | 22,0 ms |
| `POST /api/pvp` join, mediana publicada | ≤ 30 ms | 14,4 ms histórico | 15,6 ms |

Os budgets são guardrails iniciais, não alegações de SLA. Bytes são tamanhos em disco, sem compressão HTTP; latências de API são históricas e precisam ser remedidas antes de qualquer nova alegação de ganho.

## Mapa de arquivos e caminhos quentes

- Registro/editáveis do jogo: `game/play-riftbomb.html` (28.743 B) e módulos sob `game/`.
- Build offline: `game/assemble-riftbomb.mjs`; gera o arquivo LFS `riftbomb.html`.
- Aparência/asset bundling: `game/arena-appearance/package-arena-appearance.mjs` e `game/arena-appearance/load-arena-appearance.js`.
- Empacotamento publicado: `online/scripts/package-riftbomb.mjs`; separa jogo, texturas e modelos.
- Loader publicado: `online/public/riftbomb-loader.js`; faz fetch paralelo, concatenação, SHA-256, decode e `document.write`.
- Lobby: `online/app/page.tsx` (27.064 B) e `online/app/riftbomb-client.ts` (6.654 B).
- Salas/API: `online/app/api/pvp/route.ts`.
- Transporte: `online/server/src/server.mjs` (6.858 B).
- Relógio/snapshots: `online/server/src/authoritative-rooms.mjs` (3.612 B).

## Histórico de rodadas

| Rodada | Estado | Entrega | Evidência | Commit |
|---|---|---|---|---|
| 1/20 | Concluída | Baseline de rotas, comandos, tempos, payloads, arquivos quentes e budgets | 3 execuções dos checks viáveis; inventário em bytes; scorecard histórico identificado | `PENDENTE_COMMIT_LOCAL` |

## Escopos reivindicados

Nenhum escopo ativo.

## Pendências e próxima recomendação

1. **Rodada 2:** ordenar gargalos com evidência. Começar pelos 75,4 MB de modelos sob demanda, pelo grafo de 331,6 KB do shell e pelo custo de concatenação/hash/decode dos 667,2 KB do loader; confirmar o que entra realmente na primeira interação antes de otimizar.
2. Corrigir ou normalizar CRLF dos scripts bash em uma rodada compatível, pois hoje o build online não é reproduzível nesta worktree Windows. Não mascarar a falha nem mudar o script sem teste.
3. Quando houver navegador visível autorizado, repetir `data-riftbomb-ready-ms`, Network e um fluxo lobby → sala → primeiro frame. O baseline atual não afirma LCP/INP/primeiro frame.
4. Preservar o carregamento seletivo dos modelos; `katarina` sozinho possui 33,25 MB em frames/normais e merece medição específica na rodada de assets.

## Evidências e limitações

- `npm run build` raiz passou 3/3; `npm test` raiz passou 3/3 com 41 testes por execução.
- `node --test tests/*.test.mjs` em `online/` passou 3/3 com 11 testes; o wrapper `npm test` não chegou aos testes porque o script bash falhou em CRLF.
- `npm test` em `online/server/` passou 3/3.
- Nenhuma medição de navegador foi inventada. O número de 87,7 ms e as latências de API vêm do scorecard versionado `PERFORMANCE.md`, não desta máquina.
- A worktree recebeu regeneração de `game/arena-appearance/load-arena-appearance.js` e `riftbomb.html` durante a coleta. Esses artefatos não pertencem à entrega documental e não serão incluídos no commit seletivo.
- Esta rodada não mudou código de produto; o “depois” é a existência de um baseline/budgets reproduzíveis onde antes não havia coordenação do enxame.
