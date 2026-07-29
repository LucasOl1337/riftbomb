# Performance Swarm — Riftbomb

## Objetivo do enxame

Evoluir a performance do Riftbomb em até 20 rodadas sequenciais, com ganhos objetivos em tempo, peso, CPU/memória, rede, build ou percepção de velocidade, sem alterar regras de negócio ou reduzir garantias de segurança.

## Estado sequencial

- Rodada atual: **5/20 — Frontend: assets (disponível)**
- Última rodada concluída: **4/20 — Frontend: render e hidratação**
- Próxima rodada planejada: **5/20 — Frontend: assets**
- Worktree isolada: `C:/Users/user/.codex/worktrees/f4aa/riftbomb`
- Branch local: `automation/perf-sequential-r01-baseline`
- Base: `8a259be1666088ab733ca9f7028100253f46774c`
- Runtime medido: Node `v24.14.0`, npm `11.18.0`, Windows/PowerShell

## Reivindicação ativa

Nenhuma. A rodada 4 foi concluída e o escopo foi liberado.

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
- Shell `/`: o grafo JS (`index`, runtime, framework e page) caiu de **331.629 B raw / 103.296 B gzip** para **289.213 B raw / 89.968 B gzip** na rodada 3; CSS permaneceu em **23.301 B raw / 5.666 B gzip**. Fontes e imagens são adicionais e condicionais ao HTML/render.
- Assets publicados: texturas de arena **5.149.084 B / 17 arquivos**; modelos de campeão **75.414.049 B / 15 arquivos**; carregados sob demanda pela escolha do duelo.
- `online/dist`: **83.971.289 B / 88 arquivos**. Os maiores são `katarina-frames.bin` (22.167.600 B) e `katarina-normals.bin` (11.083.800 B).
- Artefato offline gerado: **107.716.723 B**; ele é um produto offline único, não o payload inicial publicado.

## Métrica principal e budgets iniciais

Métrica principal: **bytes não comprimidos e número de requests necessários para reconstruir `/riftbomb.html` antes dos assets selecionados**, acompanhados pela mediana histórica de `data-riftbomb-ready-ms` quando houver medição em navegador visível.

| Budget inicial | Limite | Baseline | Margem |
|---|---:|---:|---:|
| Payload estático crítico do jogo | ≤ 800.000 B | 739.851 B | 60.149 B |
| Requests estáticos críticos do jogo | ≤ 8 | 6 | 2 |
| JS do shell `/`, não comprimido | ≤ 350.000 B | 289.213 B atual (331.629 B inicial) | 60.787 B |
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

## Inventário de gargalos — rodada 2

Medição executada em 2026-07-29 a partir de São Paulo. As amostras publicadas usam `curl` contra `https://bombpvp.com`; são três requests independentes por recurso, não um waterfall de navegador. O proxy de CPU usa Node/Web Crypto sobre a parte local de 667.151 B, 100 iterações por lote em três lotes.

| Prioridade | Suspeito | Evidência objetiva | Impacto provável | Rodada indicada |
|---:|---|---|---|---:|
| 1 | Cadeia serial do iframe sem cache fresco no navegador | HTML → loader → manifest → parte → CSS/JS; medianas independentes somam **~1.549 ms**. Todos os seis recursos retornaram `Cache-Control: public, max-age=0, must-revalidate`, apesar de `CF-Cache-Status: HIT` | Cada visita exige round-trips de revalidação antes de a arena ficar pronta; afeta primeira carga e retorno | 6 |
| 2 | Modelo do campeão selecionado | **Katarina 33.629.823 B**, Zed 15.793.471 B, Gangplank 11.384.503 B, Renekton 7.881.443 B e Vladimir 6.724.809 B; três arquivos por campeão | A escolha pode adicionar 6,7–33,6 MB antes do primeiro duelo/primeira animação; maior risco em rede móvel | 3 e 5 |
| 3 | Latência da consulta `/api/pvp` | GET seguro para sala inexistente: 1.024 / 612 / 454 ms; mediana **612 ms**, status 404 e payload de 26 B | O custo não está no payload; há provável espera de Worker/D1/rota que merece decomposição antes de otimizar | 8 e 9 |
| 4 | Payload crítico publicado perto do budget | Produção entregou **758.717 B** raw nos seis recursos do jogo, contra 739.851 B do baseline local (**+18.866 B / +2,55%**); margem restante do budget de 800 KB: 41.283 B | Drift entre artefato local e publicado reduz a margem e pode virar regressão silenciosa | 3 e 15 |
| 5 | Grafo JS/CSS do shell | Baseline local: 331.629 B JS + 23.301 B CSS raw; proxies gzip medidos nesta rodada para os assets gerados: ~104,4 KB JS + 5,7 KB CSS | Budget de JS tem só 18.371 B de margem; pode atrasar a UI do lobby em dispositivo fraco | 3 e 4 |
| 6 | Custo de build/validação online | `npm test` online: 13,44 / 11,70 / 12,34 s, mediana **12,34 s**; lint 12,98 s; servidor 3,19 / 2,97 / 3,06 s, mediana **3,06 s** | Custo relevante para feedback de desenvolvimento, mas menor que os gargalos de runtime | 13 |

### Suspeitos eliminados ou rebaixados

- **Concatenação + SHA-256 + decode do loader:** 2,874 / 2,697 / 2,781 ms por operação; mediana **2,781 ms** no proxy local. O custo de rede domina por duas ordens de grandeza, então micro-otimizar esse código agora não teria valor perceptível.
- **Artefato offline de 107,7 MB:** grande, mas não é o payload inicial publicado; permanece relevante para distribuição offline e build, não para a primeira interação online.
- **Total de 82–84 MB em `public`/`dist`:** não é transferido de uma vez; os testes confirmam carregamento seletivo. Otimizações devem mirar o campeão efetivamente escolhido, não o diretório inteiro.

### Evidência HTTP publicada (medianas de três amostras)

| Recurso | Bytes publicados | TTFB mediano | Total mediano | Cache observado |
|---|---:|---:|---:|---|
| `/` | 21.891 B | 306 ms | 307 ms | sem `Cache-Control` observado |
| `/riftbomb.html` | 807 B | 315 ms | 315 ms | revalidação obrigatória |
| `/riftbomb-loader.js` | 3.315 B | 287 ms | 287 ms | revalidação obrigatória |
| `/riftbomb-parts/manifest.json` | 164 B | 291 ms | 291 ms | revalidação obrigatória |
| `/riftbomb-parts/part-00` | 673.974 B | 289 ms | 352 ms | revalidação obrigatória |
| `/online-duel.css` | 11.921 B | 282 ms | 282 ms | revalidação obrigatória |
| `/online-duel.js` | 68.536 B | 292 ms | 304 ms | revalidação obrigatória |

O `vinext start` local serviu shell/loader/CSS/JS, mas retornou 404 para manifest e `part-00`; por isso nenhuma latência local desses recursos foi usada como baseline de usuário. A produção respondeu 200 para ambos. Isso é uma incompatibilidade de preview a investigar, não uma alegação de falha publicada.

## Histórico de rodadas

| Rodada | Estado | Entrega | Evidência | Commit |
|---|---|---|---|---|
| 1/20 | Concluída | Baseline de rotas, comandos, tempos, payloads, arquivos quentes e budgets | 3 execuções dos checks viáveis; inventário em bytes; scorecard histórico identificado | `b5da03b` |
| 2/20 | Concluída | Ranking de gargalos de rede, assets, API, bundle e build; loader CPU rebaixado com benchmark | 3 amostras HTTP por recurso; 3 lotes de 100 operações do loader; 3 execuções dos gates | `2afaba7` |
| 3/20 | Concluída | Remoção do runtime client-side de `next/image` do lobby para WebPs locais já otimizados | Chunk da página: 60.457 → 18.041 B raw e 19.337 → 6.009 B gzip; grafo JS: -42.416 B raw / -13.328 B gzip | `82de569` |
| 4/20 | Concluída | Deduplicação de snapshots idênticos da ponte antes dos setters React | 10.001 mensagens iguais: 10.001 → 1 caminhos de atualização em 3/3 execuções (-99,99%); todos os 15 campos do contrato cobertos por teste | `e0a1d5e` |

## Escopos reivindicados

Nenhum escopo ativo.

## Pendências e próxima recomendação

1. **Rodada 5:** reduzir o payload do campeão escolhido, começando por Katarina (33,63 MB) e preservando o carregamento seletivo já existente.
2. **Rodada 6:** definir cache longo e imutável para recursos versionados; manter o manifest com invalidação segura. Confirmar em produção que visitas repetidas eliminam revalidações desnecessárias.
3. **Rodada 8/9:** decompor a consulta `/api/pvp`; a amostra de sala inexistente teve mediana de 612 ms, mas não substitui benchmark de create/join.
4. Quando houver navegador visível autorizado, repetir `data-riftbomb-ready-ms`, Network e o fluxo lobby → sala → primeiro frame. Esta rodada não afirma LCP/INP.

## Evidências e limitações

- `npm run build` raiz passou 3/3; `npm test` raiz passou 3/3 com 41 testes por execução.
- `node --test tests/*.test.mjs` em `online/` passou 3/3 com 11 testes; o wrapper `npm test` não chegou aos testes porque o script bash falhou em CRLF.
- `npm test` em `online/server/` passou 3/3.
- Nenhuma medição de navegador foi inventada. O número de 87,7 ms e as latências de API vêm do scorecard versionado `PERFORMANCE.md`, não desta máquina.
- A worktree recebeu regeneração de `game/arena-appearance/load-arena-appearance.js` e `riftbomb.html` durante a coleta. Esses artefatos não pertencem à entrega documental e não serão incluídos no commit seletivo.
- Esta rodada não mudou código de produto; o “depois” é a existência de um baseline/budgets reproduzíveis onde antes não havia coordenação do enxame.
- Na rodada 2, `npm test` online passou 3/3 com 11 testes por execução ao priorizar `C:/Program Files/Git/bin` no `PATH`; o `bash.exe` padrão do Windows continua resolvendo para WSL e falha antes do build neste ambiente.
- `npm run lint` online passou em 12,98 s. O servidor autoritativo passou 3/3; o gate raiz passou 3/3 com 41 testes por execução (mediana 5,94 s nesta sessão).
- A soma de medianas HTTP (**~1.549 ms**) é um indicador de prioridade da dependência serial, não uma medição direta de waterfall. Compressão, conexão reutilizada e execução do navegador podem alterar o resultado real.
- Rodada 3: o chunk `page-*.js` caiu de **60.457 B raw / 19.337 B gzip** para **18.041 B raw / 6.009 B gzip** (respectivamente **-70,2%** e **-68,9%**). No mesmo conjunto de quatro assets usado pelo baseline (`index`, runtime, framework e page), o grafo caiu de **331.629 B / 103.296 B gzip** para **289.213 B / 89.968 B gzip** (**-12,8% raw / -12,9% gzip**).
- A remoção é segura para o payload de imagem: os quatro usos já passavam `unoptimized` para WebPs locais e dimensões explícitas. O `<img>` nativo mantém os mesmos URLs, `width`, `height`, `loading="lazy"` e `decoding="async"`; portanto, o ganho vem da retirada do runtime, não de reduzir qualidade ou antecipar bytes.
- Validação da rodada 3: `npm test` raiz passou **41/41**; `npm test` em `online/` passou **11/11** com build verificado; `npm test` em `online/server/` passou os **3/3** grupos; lint online terminou sem erros e com quatro avisos esperados de `@next/next/no-img-element` sobre a escolha intencional. Playwright headless não foi usado.
- A medição de bytes é determinística no artefato local, por isso não exige média de três execuções. Não houve navegador visível nesta rodada; nenhum ganho de LCP/INP foi alegado.
- Rodada 4: o emissor chama `updateLobbyDisplay()` (que já publica) e em seguida publica novamente em ações como seleção de Champion e arena do anfitrião. O receptor agora compara os 15 campos primitivos de `RuntimeState` e retorna antes dos setters quando o snapshot consecutivo é idêntico; mensagens com qualquer campo alterado continuam sendo aceitas.
- O benchmark determinístico foi repetido 3 vezes: uma mensagem inicial mais 10.000 clones idênticos percorriam o caminho de atualização React **10.001 vezes** antes e **1 vez** depois (**-99,99%**). Este é um proxy controlado de trabalho de render, não uma alegação de INP medida em navegador.
- Validação da rodada 4: `npm test` raiz passou **41/41**; `npm test` em `online/` passou **12/12** com build verificado; `npm test` em `online/server/` passou os **3/3** grupos; lint online terminou sem erros e manteve apenas quatro avisos conhecidos da rodada 3. Playwright headless não foi usado.
- O guard acrescentou **477 B raw / 131 B gzip** ao chunk da página (18.041 → 18.518 B raw; 6.009 → 6.140 B gzip), troca explícita por eliminar renders redundantes. Os artefatos gerados `game/arena-appearance/load-arena-appearance.js` e `riftbomb.html` permaneceram fora do commit seletivo.
