# Performance Swarm — Riftbomb

## Objetivo do enxame

Evoluir a performance do Riftbomb em até 20 rodadas sequenciais, com ganhos objetivos em tempo, peso, CPU/memória, rede, build ou percepção de velocidade, sem alterar regras de negócio ou reduzir garantias de segurança.

## Estado sequencial

- Rodada atual: **20/20 — Polimento final e relatório (concluída)**
- Última rodada concluída: **20/20 — Polimento final e relatório**
- Próxima rodada planejada: **ciclo sequencial concluído; aguardar coletor humano**
- Worktree isolada: `C:/Users/user/.codex/worktrees/r20p/riftbomb`
- Branch local: `automation/perf-sequential-r20-final-report`
- Base: `8584b6b89ed7c5d43006c7ea6d2784ae2204afc0`
- Runtime medido: Node `v24.14.0`, npm `11.18.0`, Windows/PowerShell; build online sob WSL Node `v22.22.1`

## Reivindicação ativa

Nenhuma. A rodada 20 e o ciclo sequencial foram concluídos; o ledger está liberado para o coletor humano.

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

- Jogo publicado local até reconstruir o documento: **741.346 B não comprimidos em 6 requests frios** (`807` HTML + `3.327` loader + `263` manifest + `668.535` parte + `11.921` CSS + `56.493` JS). A rodada 7 adicionou 657 B para retirar a inicialização WebGL decorativa do task crítico.
- Manifest atual: uma parte de **668.535 B** sob `/riftbomb-parts/<sha256>/part-00`; limite configurado por parte: 4 MiB. Em revisita da mesma versão, essa parte permanece fresca por um ano e sai do cache do navegador, removendo **1 revalidação e até 668.535 B de transferência** do caminho crítico.
- Shell `/`: o grafo JS (`index`, runtime, framework e page) caiu de **331.629 B raw / 103.296 B gzip** para **289.213 B raw / 89.968 B gzip** na rodada 3; CSS permaneceu em **23.301 B raw / 5.666 B gzip**. Fontes e imagens são adicionais e condicionais ao HTML/render.
- Assets publicados: texturas de arena **5.149.084 B / 17 arquivos**; modelos de campeão caíram de **75.414.049 B** para **56.844.566 B / 15 arquivos** na rodada 5; continuam carregados sob demanda pela escolha do duelo.
- `online/dist`: baseline de **83.971.289 B / 88 arquivos**; build atual **65.270.569 B**. O delta total inclui limpeza de artefatos antigos, portanto o ganho causal usado é o inventário de modelos acima.
- Artefato offline gerado: **107.716.723 B**; ele é um produto offline único, não o payload inicial publicado.

## Métrica principal e budgets finais

Métrica principal: **bytes não comprimidos e número de requests necessários para reconstruir `/riftbomb.html` antes dos assets selecionados**, acompanhados pela mediana histórica de `data-riftbomb-ready-ms` quando houver medição em navegador visível.

| Budget | Limite | Estado final | Margem |
|---|---:|---:|---:|
| Payload estático crítico do jogo | ≤ 800.000 B | 743.151 B no build LF da rodada 19; 743.190 B no artefato final sob checkout CRLF; até 73.020 B sem a parte numa revisita quente | ≥ 56.810 B no frio |
| Requests estáticos críticos do jogo | ≤ 8 frio; ≤ 5 na revisita da mesma versão | 5 frio; até 4 na revisita | 3 frio; revisita supera o alvo em 1 request |
| Texturas de arena solicitadas no boot | ≤ 5 arquivos / ≤ 2.700.000 B | 17 / 5.149.084 B antes; 5 / 2.634.254 B atual, com guard executável em 5/5 arenas | 65.746 B de margem |
| JS do shell `/`, não comprimido | ≤ 350.000 B | 289.213 B atual (331.629 B inicial) | 60.787 B |
| CSS do shell `/`, não comprimido | ≤ 25.000 B | 23.301 B | 1.699 B |
| VAT publicado de Katarina | ≤ 25.000.000 B | 24.938.550 B atual (33.251.400 B inicial) | 61.450 B |
| Build raiz, mediana local | ≤ 3.500 ms | 2.738,222 ms final (2.954,2 ms inicial) | 761,778 ms |
| Teste raiz completo, mediana local | ≤ 7.500 ms | 5.238,931 ms final, 43/43 (6.587,3 ms inicial, 41/41) | 2.261,069 ms |
| Gate agregado raiz + online, mediana local | ≤ 22.000 ms | 18.689,4 ms após a rodada 13 (28.266,6 ms antes) | 3.310,6 ms |
| Teste do servidor, mediana local | ≤ 4.000 ms | 4.716,110 ms final, 14 contratos (3.056,6 ms inicial, 3 grupos) | excede em 716,110 ms; cobertura cresceu e a comparação não isola runtime |
| `POST /api/pvp` create, mediana publicada | ≤ 50 ms | 28,0 ms histórico | 22,0 ms |
| Chamadas D1 sequenciais no create aquecido | ≤ 1 | 2 antes da rodada 8; 1 atual | atende |
| `POST /api/pvp` join, mediana publicada | ≤ 30 ms | 14,4 ms histórico | 15,6 ms |
| Serializações JSON por broadcast para dois jogadores | ≤ 1 | 2 antes da rodada 10; 1 atual | atende |
| Mensagens WebSocket processadas por cliente | ≤ 120/s sustentadas; burst ≤ 240 antes de conversão/parsing | ilimitadas antes; token bucket 120/s e 240 atual | trabalho de CPU por socket fica limitado sem remover `maxPayload` ou autenticação |
| Valores materializados por leitura de sala com SDP máximo | ≤ 33.000 B | 64.175 B antes da rodada 9; 32.080 B máximo atual | 920 B |
| Intervals registrados com 128 partidas | ≤ 4 | 256 antes da rodada 11; 2 atuais | atende com 2 de margem |
| Atraso p95 do event loop com 128 partidas, benchmark local | ≤ 4 ms | 7,029 ms antes da rodada 11; 2,890 ms atual | 1,110 ms |
| Verificação de grade estável, 384.000 snapshots | ≤ 300 ms de mediana; 0 strings temporárias | 982,999 ms e 384.000 strings antes; 199,591 ms e 0 strings atuais | 100,409 ms; sem strings efêmeras |
| Overhead dos contadores do relógio a 90 Hz | ≤ 0,001 ms/s | 4,108 ns/ciclo; estimados 0,000370 ms/s atuais | 0,000630 ms/s de margem |
| Boot do servidor até `listen`, mediana contrafactual local | ≤ 175 ms | 164,645 ms eager antes; 157,526 ms lazy atual | 17,474 ms |
| Primeira partida após boot lazy, mediana local | ≤ 20 ms | 12,273 ms atual | 7,727 ms |

Os budgets são guardrails, não alegações de SLA. Bytes são tamanhos em disco, sem compressão HTTP; latências de API são históricas e precisam ser remedidas antes de qualquer nova alegação de ganho.

## Scorecard final — antes × depois

| Dimensão | Antes | Depois | Ganho ou garantia acumulada |
|---|---:|---:|---|
| JS do shell `/` | 331.629 B raw / 103.296 B gzip | 289.213 B raw / 89.968 B gzip | -42.416 B raw e -13.328 B gzip (-12,8%/-12,9%) |
| Atualizações React para 10.001 snapshots iguais | 10.001 | 1 | -99,99% dos caminhos redundantes, com os 15 campos do contrato cobertos |
| VATs dos cinco campeões | 74.278.392 B | 55.708.794 B | -18.569.598 B (-25%) sem perder canais úteis, frames ou precisão |
| Requests críticos frios de `/riftbomb.html` | 6 | 5 | -1 request (-16,67%); revisita da mesma versão cai a até 4 |
| Parte do jogo transferida na revisita | até 670.170 B atuais | 0 B quando fresca | namespace SHA-256 imutável elimina 1 revalidação e a transferência da parte atual |
| Inicializações WebGL decorativas no task crítico | 1 | 0 | fundo preservado em idle; partida pode cancelar a montagem pendente |
| Texturas de arena no boot | 17 requests / 5.149.084 B | 5 requests / 2.634.254 B | -70,59% requests e -48,84% bytes; budget executado para 5/5 arenas |
| Chamadas D1 na criação aquecida | 2 | 1 | -50% round-trips sem remover cleanup, retry ou transação |
| Valores materializados na leitura de sala com SDP máximo | 64.175 B | 32.079 B host / 32.080 B convidado | ≈-50%, mantendo uma consulta por PK |
| Serializações por broadcast para dois jogadores | 40.000 | 20.000 | -50%; mediana proxy 448,27 → 226,33 ms (-49,5%) |
| Timers em 128 partidas | 256 | 2 | -99,22%; atraso p95 7,029 → 2,890 ms (-58,88%) |
| Verificações de grade estável | 982,999 ms / 384.000 strings | 199,591 ms / 0 strings | -79,70%, 4,93x, sem alocações de string por snapshot |
| Boot do servidor até `listen` | 164,645 ms eager | 157,526 ms lazy | -7,119 ms (-4,32%); primeira partida paga +0,867 ms uma vez |
| Gate agregado raiz + online | 28.266,6 ms | 18.689,4 ms | -9.577,2 ms (-33,9%) ao remover build duplicado |
| Flood de 200.000 frames por socket | 200.000 parses / 436,003 ms | 240 parses / 5,766 ms | -98,68% no proxy, preservando auth, `maxPayload`, validação e backpressure |
| Sinais agregados em `/health` | somente total de salas | 10 sinais | capacidade, clocks e event loop observáveis sem códigos, tokens ou payloads |

## Validação final da rodada 20

| Gate | Resultado final | Evidência |
|---|---:|---|
| Build raiz | 3/3 | 2.790,777 / 2.576,020 / 2.738,222 ms; mediana 2.738,222 ms |
| Teste raiz com build | 43/43 em 3/3 | 5.185,961 / 5.238,931 / 5.435,958 ms; mediana 5.238,931 ms |
| Online | 19/19 | build verificado + testes em 12.346,765 ms |
| Servidor autoritativo | 14/14 em 3/3 | 4.690,347 / 4.736,182 / 4.716,110 ms; mediana 4.716,110 ms |
| Lint online | 0 erros | 11.437,208 ms; quatro avisos históricos/intencionais de `<img>` |
| Artefato crítico | 5 requests / 743.190 B | HTML 1.070 B + loader 3.536 B + CSS 11.921 B + JS 56.493 B + parte 670.170 B |
| Integridade | ok | `git diff --check`; manifest e parte mantêm SHA-256 e fallback externo |

Playwright/headless não foi executado. Não houve deploy, push, PR ou merge.

## Mapa de arquivos e caminhos quentes

- Registro/editáveis do jogo: `game/play-riftbomb.html` (28.743 B) e módulos sob `game/`.
- Build offline: `game/assemble-riftbomb.mjs`; gera o arquivo LFS `riftbomb.html`.
- Aparência/asset bundling: `game/arena-appearance/package-arena-appearance.mjs` e `game/arena-appearance/load-arena-appearance.js`.
- Fundo decorativo: `game/animate-bomber-rift-background.js` define o custom element; `game/arena-appearance/defer-bomber-rift-background.js` só conecta o segundo WebGL em idle, com timeout de 1 s.
- Empacotamento publicado: `online/scripts/package-riftbomb.mjs`; separa jogo, texturas e modelos e publica as partes no namespace do SHA-256.
- Shell/loader publicados: `online/riftbomb-shell.html` é a fonte do HTML gerado; `online/public/riftbomb-loader.js` usa primeiro o manifesto incorporado, exige `partsPath` igual ao SHA-256, faz fetch paralelo, concatenação, SHA-256, decode e `document.write`, mantendo o manifesto externo como fallback.
- Política HTTP estática: `online/public/_headers`; somente partes fingerprintadas recebem cache imutável, enquanto o manifest permanece `no-store`.
- Lobby: `online/app/page.tsx` (27.064 B) e `online/app/riftbomb-client.ts` (6.654 B).
- Salas/API: `online/app/api/pvp/route.ts`; persistência, projeções SQL e benchmark em `online/app/api/pvp/room-storage.ts` e `online/scripts/benchmark-pvp-read.mjs`.
- Transporte: `online/server/src/server.mjs` (7.318 B); autenticação do proxy e `maxPayload` continuam no upgrade WebSocket, e o token bucket entra antes de `toString`/`JSON.parse`.
- Limite de mensagens: `online/server/src/message-rate-limit.mjs` (987 B); mantém buckets fracos isolados por socket, burst de 240 e refill de 120/s.
- Telemetria operacional: `/health` combina `performance.eventLoopUtilization()` sob demanda com contadores agregados de `AuthoritativeRooms`; não expõe códigos, presets, tokens ou payloads de sala.
- Codificação WebSocket: `online/server/src/json-transport.mjs`; reutiliza o JSON somente durante o broadcast corrente e mantém readiness/backpressure antes de codificar.
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
| 5/20 | Concluída | Remoção sem perda do quarto canal constante dos VATs publicados; runtime mantém compatibilidade RGB/RGBA | Katarina VAT: 33.251.400 → 24.938.550 B (-8.312.850 B / -25%); cinco VATs: -18.569.598 B | `5112417` |
| 6/20 | Concluída | Fingerprint SHA-256 nas partes do jogo e cache imutável restrito ao namespace versionado; manifest permanece `no-store` | Worker local: header da parte confirmado 3/3 como `max-age=31556952, immutable`; revisita elimina 1 revalidação e até 667.878 B de transferência | `3d9b2c7` |
| 7/20 | Concluída | Fundo WebGL decorativo tornado inerte durante o parse e montado em idle; início da partida cancela a montagem pendente | Inicializações WebGL antes do idle: 1 → 0 em 3/3 no proxy instrumentado; zero scripts/origens remotos; custo de payload +657 B | `187be3b` |
| 8/20 | Concluída | Limpeza expirada e primeiro `INSERT` de criação de sala agrupados numa transação `D1Database.batch`; retry de colisão preservado sem nova limpeza | Chamadas D1 no sucesso normal: 2 → 1 (-50%); proxy de 20 ms/chamada, mediana 41,72 → 21,10 ms em 3/3 | `785fd45` |
| 9/20 | Concluída | Projeções SQL distintas para host/convidado removem o SDP e os valores de autenticação não usados sem adicionar round-trip | Linha com SDPs máximos: 64.175 → 32.079 B no host e 32.080 B no convidado (≈-50%); 1 chamada e plano por PK mantidos em 3/3 | `de2bfe5` |
| 10/20 | Concluída | Codificação JSON reutilizada dentro de cada broadcast autoritativo para host e convidado, sem cache persistente de estado mutável | 40.000 → 20.000 serializações (-50%); proxy de 1.041 B, mediana 448,27 → 226,33 ms (-49,5%) em 3/3 | `d4a38b4` |
| 11/20 | Concluída | Dois relógios compartilhados substituem timers por sala; filas limitadas a oito salas cedem o event loop sem acumular ciclos atrasados | 128 salas: intervals 256 → 2; callbacks medianos 20.630 → 2.997 (-85,47%); p95 7,029 → 2,890 ms (-58,88%); snapshots medianos 7.059 → 7.680 | `8fe1241` |
| 12/20 | Concluída | Runtime do duelo, `node:vm` e `node:fs/promises` saíram do grafo de boot e são carregados uma vez na primeira partida | 27 pares intercalados: boot mediano 164,645 → 157,526 ms (-7,119 ms / -4,32%); primeira partida +0,867 ms | `9b90a2d` |
| 13/20 | Concluída | Gate agregado reutiliza o `riftbomb.html` que acabou de construir, enquanto `npm test` online isolado continua reconstruindo a raiz por padrão | Build raiz no fluxo raiz + online: 2 → 1; mediana 28.266,6 → 18.689,4 ms (-9.577,2 ms / -33,9%) em 3/3 | `069ed98` |
| 14/20 | Concluída | Cache estrutural exato substitui `JSON.stringify` da grade em todo snapshot estável, preservando mutações e refresh periódico | 384.000 verificações: mediana 982,999 → 199,591 ms (-79,70% / 4,93x); strings temporárias 384.000 → 0 | `8c05e87` |
| 15/20 | Concluída | `/health` passou a expor dez sinais agregados de capacidade, relógio e event loop, sem identificadores de sala ou credenciais | Antes: somente total de salas; depois: 10 sinais, com 4,108 ns/ciclo de overhead mediano em nove pares | `40461a2` |
| 16/20 | Concluída | Token bucket por socket limita floods antes de conversão/parsing sem remover autenticação do proxy, `maxPayload`, validação autoritativa ou backpressure | 200.000 frames: parses 200.000 → 240; mediana 436,003 → 5,766 ms (-98,68%); overhead permitido 26,169 ns/mensagem em nove pares | `86a0f1e` |
| 17/20 | Concluída | Renderer e seletor carregam somente as cinco texturas da arena ativa; previews não selecionados começam com layout/cores e hidratam sob interação | Boot: 17 → 5 requests; 5.149.084 → 2.634.254 B (-2.514.830 B / -48,84%) em 3/3 inventários | `ee00e78` |
| 18/20 | Concluída | Guard de regressão mede todas as arenas nos WebPs-fonte e aplica os budgets de requests e bytes no gate raiz | Cobertura executável: 0 → 5/5 arenas; pior caso estável em 3/3, 5 requests / 2.634.254 B, margem 65.746 B | `23c213d` |
| 19/20 | Concluída | Manifesto do jogo incorporado pelo empacotador no shell gerado; loader mantém fallback externo e validação SHA-256 | Cadeia manifesto→parte: 2 → 1 requests; proxy de 50 ms/resposta, mediana 109,931 → 55,395 ms; payload crítico +170 B | `fc94cc3` |
| 20/20 | Concluída | Scorecard final, budgets atuais, gates finais, limitações e prioridades remanescentes consolidados sem nova mudança de runtime | 20/20 rodadas documentadas; raiz 43/43 em 3/3, online 19/19, servidor 14/14 em 3/3, lint 0 erros | `PENDENTE_COMMIT_R20` |

## Escopos reivindicados

Nenhum escopo ativo.

## Ciclo concluído e próximas recomendações

1. **Payload do campeão selecionado:** Katarina ainda soma 25.316.996 B em três arquivos publicados, com VAT de 24.938.550 B a apenas 61.450 B do budget. A próxima investigação deve medir primeiro frame por campeão e avaliar quantização, compressão ou streaming por clip sem perder precisão, animações ou compatibilidade WebGL.
2. **Latência publicada de `/api/pvp`:** o GET 404 histórico teve mediana de 612 ms, enquanto create/join mantêm medianas históricas de 28,0/14,4 ms. Remedir produção e decompor Worker/D1/cold start antes de editar; não cachear offer/answer mutáveis sem invalidação síncrona entre isolates.
3. **Browser visível e rede real:** repetir `data-riftbomb-ready-ms`, Network e o fluxo lobby → sala → primeiro frame. Confirmar em produção o cache da parte fingerprintada, o manifest incorporado e a montagem ociosa do fundo; este ciclo não afirma LCP/INP.
4. **Custo do gate do servidor:** a suíte final de 14 contratos teve mediana de 4.716,110 ms, 716,110 ms acima do budget inicial de 4.000 ms. A cobertura cresceu desde os três grupos iniciais, portanto decompor processos/setup antes de atribuir o delta ao runtime ou elevar o budget.
5. O ciclo está pronto para o coletor humano. Não houve push, deploy, PR ou merge; integrar os commits locais na ordem registrada pelo histórico.

## Evidências e limitações

- Rodada 20: foi criada a worktree isolada `C:/Users/user/.codex/worktrees/r20p/riftbomb`, branch `automation/perf-sequential-r20-final-report`, a partir de `8584b6b`; a landing compartilhada não foi tocada. O único arquivo intencionalmente alterado foi `PerformanceSwarm.md`.
- O artefato final reconstruído contém **5 requests / 743.190 B** no caminho crítico frio: HTML 1.070 B, loader 3.536 B, CSS 11.921 B, JS 56.493 B e parte 670.170 B. O build LF da rodada 19 media 743.151 B; os 39 B adicionais vêm de CRLF no checkout Windows e não mudam o grafo nem o budget de 800.000 B.
- Build raiz em 3/3: **2.790,777 / 2.576,020 / 2.738,222 ms**, mediana **2.738,222 ms**. Teste raiz com build em 3/3: **5.185,961 / 5.238,931 / 5.435,958 ms**, mediana **5.238,931 ms**, sempre **43/43**.
- Gate online: build verificado e **19/19** em **12.346,765 ms**. Servidor em 3/3: **4.690,347 / 4.736,182 / 4.716,110 ms**, mediana **4.716,110 ms**, sempre **14/14**. Lint online: **0 erros**, quatro avisos históricos de `<img>`, **11.437,208 ms**. `git diff --check` passou.
- Limitações da rodada 20: o relatório consolida benchmarks locais acumulados com metodologias diferentes; não soma proxies como se fossem um único tempo de usuário. Não houve navegador visível, deploy ou nova medição publicada de Web Vitals/API. Playwright/headless não foi usado.
- Arquivo da rodada 20: `PerformanceSwarm.md`; commit local `PENDENTE_COMMIT_R20`.

- Rodada 19: `online/scripts/package-riftbomb.mjs` passou a gerar `online/public/riftbomb.html` a partir de `online/riftbomb-shell.html` e incorpora nele exatamente o mesmo manifesto escrito em `riftbomb-parts/manifest.json`. O loader usa os metadados incorporados no caminho normal e só busca o JSON externo para compatibilidade com shells antigos/sem atributo; tamanho total, `partsPath` fingerprintado e SHA-256 continuam validados antes de `document.write`.
- Inventário causal com a mesma parte de 670.170 B, repetido **3/3**: requests estáticos críticos **6 → 5 (-16,67%)**; bytes raw **742.981 → 743.151 B (+170 B / +0,023%)**. O pequeno aumento troca 170 B por retirar uma dependência serial e mantém 56.849 B de margem no budget de 800.000 B.
- Proxy HTTP local com conexão aquecida e atraso controlado de 50 ms por resposta, três pares: caminho externo **107,711 / 116,226 / 109,931 ms** (mediana **109,931 ms**) e incorporado **55,252 / 55,395 / 64,725 ms** (mediana **55,395 ms**); economia pareada mediana **52,459 ms**. Isso evidencia o round-trip removido, mas não é uma alegação de TTFB/LCP em produção.
- Validação da rodada 19: teste focado **10/10**; `npm test` raiz **43/43**; `npm test` online concluiu build verificado e **19/19** após instalar pelo lockfile; servidor **14/14**; lint online **0 erros** e quatro avisos históricos de `<img>`; `git diff --check` passou. Playwright/headless não foi usado.
- Limitação da rodada 19: não houve deploy nem navegador visível, então `data-riftbomb-ready-ms`, Network e Web Vitals publicados não foram remedidos. O primeiro gate online parou antes do build por ausência de `node_modules`; `npm ci` preservou `package-lock.json` e a repetição passou.
- Arquivos de produto/teste da rodada 19: `online/riftbomb-shell.html`, `online/scripts/package-riftbomb.mjs`, `online/public/riftbomb-loader.js`, `online/public/riftbomb.html` e `online/tests/pvp-source.test.mjs`; commit local `fc94cc3`.

- Rodada 18: o teste raiz que já verificava o lazy loading agora descobre todos os blocos de tema declarados em `run-champion-bomb-duel.js`, aplica o plano real de carregamento e soma os WebPs-fonte correspondentes. Novas arenas que não entrarem na medição falham por diferença na contagem de temas; qualquer arena acima de **5 requests** ou **2.700.000 B** falha com o valor observado.
- Antes desta rodada, o budget móvel estava documentado, mas **0 arenas** tinham o teto de bytes executado pelo gate. Depois, **5/5 arenas** são medidas; em três execuções focadas e três gates raiz o pior caso permaneceu em **5 requests / 2.634.254 B**, com **65.746 B de margem**. Não houve mudança em runtime, payload ou regra de negócio.
- Validação da rodada 18: teste focado **19/19 em 3/3**; raiz **43/43 em 3/3**, tempos **9.503,464 / 5.688,204 / 5.845,599 ms**, mediana **5.845,599 ms**, abaixo do budget de 7.500 ms; online concluiu build verificado e **17/17**; servidor **14/14**; `git diff --check` passou. Playwright/headless não foi usado.
- Limitação da rodada 18: `npm run lint` resolveu o ESLint global 6.4 sob a fronteira Windows/WSL em vez do local 9.39.4; duas tentativas com o binário local explícito não terminaram em mais de 60 s e foram encerradas sem resultado. A normalização LF dos quatro scripts shell, `game/arena-appearance/load-arena-appearance.js` e `riftbomb.html` foi apenas preparação local e ficou fora dos commits seletivos. Os bytes são determinísticos nos assets locais; não houve navegador visível, deploy ou nova alegação de LCP/INP.
- Arquivo de produto/teste da rodada 18: `game/verify-riftbomb.test.mjs`; commit local `23c213d`.

- Rodada 17: `Renderer.createArenaTextures()` criava 17 `Image`s imediatamente e os cinco cards do seletor também pintavam previews com todas as famílias. Agora os 17 fallbacks WebGL continuam válidos, mas somente o plano da arena ativa inicia rede; cada Promise é memoizada. Os quatro cards não selecionados desenham layout/cores sem rede e hidratam resolução integral em `pointerenter`, foco ou clique.
- Inventário determinístico repetido **3/3**: texturas solicitadas no boot **17 → 5 (-70,59%)** e bytes WebP **5.149.084 → 2.634.254 B (-2.514.830 B / -48,84%)** para a arena padrão. Num piso controlado de 1,6 Mbit/s, somente transferência raw cai de **25,745 para 13,171 s (-12,574 s)**; isso não é alegado como waterfall real de navegador.
- O custo do plano lazy acrescentou **1.645 B** ao payload estático crítico (741.346 → 742.991 B), mantendo **6 requests** e margem de **57.009 B** no budget de 800.000 B. Resolução, arquivos WebP, mipmaps, anisotropia e fallbacks não foram reduzidos.
- Validação da rodada 17: teste focado passou; raiz **43/43** em duas execuções do gate durante a rodada; online fez build/verificação do artefato e **17/17** em duas execuções; servidor **14/14**; lint online terminou com **0 erros** e quatro avisos conhecidos. `git diff --check` passou. Playwright/headless não foi usado.
- Limitação da rodada 17: requests/bytes vêm do grafo de carregamento testado e do tamanho determinístico dos assets locais; não houve navegador visível, throttling real, decode/GPU profiling ou deploy. Interagir com outras arenas carrega sob demanda seus três WebPs exclusivos, como esperado.
- Arquivos de produto/teste da rodada 17: `game/arena-appearance/plan-arena-texture-loads.js`, `game/play-riftbomb.html`, `game/draw-bomber-rift.js`, `game/start-champion-duel.js` e `game/verify-riftbomb.test.mjs`; commit local `ee00e78`. Artefatos gerados `game/arena-appearance/load-arena-appearance.js` e `riftbomb.html` ficaram fora do commit seletivo.

- Rodada 16: o servidor aceitava frames sem limite de frequência; `maxPayload: 32_768` restringia apenas o tamanho individual. O token bucket novo admite burst de **240 mensagens** e repõe **120/s por socket**, descartando excesso antes de `Buffer.toString()` e `JSON.parse()`; autenticação por segredo do proxy, limite de payload, validações autoritativas e backpressure não foram removidos.
- Benchmark reproduzível `npm run benchmark:message-rate-limit`, com aquecimento e **nove pares intercalados** sobre 200.000 frames de 1 KiB: trabalho de parsing **200.000 → 240 (-99,88%)**; mediana **436,003 → 5,766 ms (-98,68%)**. Em 1.000.000 de mensagens admitidas, o custo incremental mediano do bucket foi **26,169 ns/mensagem**.
- O cliente publicado deduplica inputs com `lastSentInput` e só transmite quando o bitmask muda; o budget de 120/s com burst 240 fica acima da cadência normal observada. Testes específicos passaram **3/3**, incluindo refill, teto de burst, isolamento por socket e configuração inválida.
- Validação da rodada 16: servidor **14/14**, raiz **42/42**, online build manual equivalente + artifact check + **17/17**, lint online com **0 erros** e quatro avisos conhecidos. O wrapper `npm test` online continuou bloqueado antes do build pelo CRLF conhecido de `build-verified.sh`; o mesmo empacotamento, `vinext build`, validação do Worker e testes foram executados separadamente. `git diff --check` passou; Playwright/headless não foi usado.
- Limitação da rodada 16: o benchmark usa buffers de 1 KiB e loop local, não sockets ou CPU publicados. O ganho causal é o limite de parses por socket; uma abertura distribuída de muitas conexões continua dependendo da autenticação do proxy e da capacidade de infraestrutura.

- Rodada 15: `/health` preserva `ok`, `rooms`, `authority` e `region` e adiciona **10 sinais**: partidas ativas, dois estados de relógio, quatro contadores de ciclos, snapshots produzidos, clientes WebSocket e utilização do event loop. O teste HTTP confirmou uma partida/dois clientes e ausência do código `ABC234` e do segredo de proxy na resposta.
- Benchmark reproduzível `npm run benchmark:telemetry`, com aquecimento e **nove pares intercalados de 1.000.000 ciclos**: mediana anterior **25,619 ms** versus instrumentada **29,727 ms**; delta **4,108 ns/ciclo**, estimado em **0,000370 ms/s** nos dois relógios (90 Hz). É um microbenchmark local de overhead do contador, não CPU de produção.
- O payload ilustrativo de `/health` cresceu de **67 para 306 B** (+239 B) com dez sinais; isso afeta apenas sondagens de saúde, permanece `no-store` e não entra no transporte do jogo.
- Validação da rodada 15: raiz **42/42**, online **17/17**, servidor **11/11** somando os grupos; lint online com **0 erros** e quatro avisos conhecidos de `<img>`. `git diff --check` passou. Playwright/headless não foi usado.

- `npm run build` raiz passou 3/3; `npm test` raiz passou 3/3 com 41 testes por execução.
- `node --test tests/*.test.mjs` em `online/` passou 3/3 com 11 testes; o wrapper `npm test` não chegou aos testes porque o script bash falhou em CRLF.
- `npm test` em `online/server/` passou 3/3.
- Nenhuma medição de navegador foi inventada. O número de 87,7 ms e as latências de API vêm do scorecard versionado `PERFORMANCE.md`, não desta máquina.
- A worktree recebeu regeneração de `game/arena-appearance/load-arena-appearance.js` e `riftbomb.html` durante a coleta. Esses artefatos não pertencem à entrega documental e não serão incluídos no commit seletivo.
- Rodada 13: o fluxo comparável raiz + online caiu de **24.050,3 / 28.266,6 / 28.972,6 ms** (mediana **28.266,6 ms**) para **18.347,3 / 19.780,1 / 18.689,4 ms** (mediana **18.689,4 ms**), redução de **9.577,2 ms / 33,9%**. Cada amostra passou 42 testes raiz e 17 online.
- O ganho vem de reduzir o build raiz de duas para uma execução somente em `npm run test:all`. `npm test` na raiz e em `online/` mantêm seus builds obrigatórios quando chamados isoladamente; o gate público isolado online foi exercitado após a mudança e mostrou o build raiz no log.
- `npm run test:all` passou com 42 testes raiz, 17 online e 10 testes do servidor; uma execução completa levou 26.175,1 ms, mas não foi usada no delta porque o baseline comparável não incluía o servidor. `npm run lint` online terminou com zero erros e os quatro avisos de `<img>` já documentados. Playwright/headless não foi usado.
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
- Rodada 5: os VATs de origem usam quatro componentes por texel, mas o alfa é invariavelmente `65535` nas posições e `255` nas normais. O empacotador agora valida essa invariância e publica somente os três canais úteis; não remove vértices, frames, clips ou bits de precisão.
- Katarina: binários de animação **33.251.400 → 24.938.550 B** (**-8.312.850 B / -25%**); modelo publicado completo **33.629.823 → 25.316.996 B** (**-8.312.827 B / -24,72%**, incluindo o pequeno campo de contrato no JS). Nos cinco campeões, os binários VAT caíram **74.278.392 → 55.708.794 B** (**-18.569.598 B / -25%**) e o diretório publicado de modelos caiu **75.414.049 → 56.844.566 B**.
- O teste online compara os três canais publicados byte a byte com cada fonte RGBA e fixa a redução exata de 25%. O runtime seleciona `RGB16UI`/`RGB8` para o transporte compacto, preserva `RGBA16UI`/`RGBA8` para payloads antigos e usa o mesmo stride explícito no fallback CPU. A combinação está prevista na especificação WebGL 2; nenhum navegador headless foi iniciado.
- Validação da rodada 5: `npm test` raiz passou **41/41 em 3/3 repetições** após a mudança de produto, mais uma execução final após reforçar o teste; `npm test` em `online/` passou **12/12 em 3/3** com build verificado; `npm test` em `online/server/` passou os **3/3 grupos em 3/3**; lint terminou com **0 erros** e quatro avisos conhecidos da rodada 3.
- Limitação da rodada 5: bytes são determinísticos nos artefatos gerados, mas não houve navegador visível para medir tempo até o primeiro frame. O total de `online/dist` também removeu arquivos antigos durante o build; por isso o ganho causal declarado usa somente os pares de assets e o diretório de modelos inventariado.
- Os artefatos gerados `game/arena-appearance/load-arena-appearance.js` e `riftbomb.html` continuam fora dos commits seletivos.
- Rodada 6: a URL da parte deixou de ser estável (`/riftbomb-parts/part-00?v=<sha-curto>`) e passou a incorporar o SHA-256 completo (`/riftbomb-parts/<sha256>/part-00`). O loader rejeita qualquer `partsPath` que não corresponda exatamente ao digest e ainda verifica bytes totais e SHA-256 após a montagem.
- `online/public/_headers` aplica `Cache-Control: public, max-age=31556952, immutable` somente a `/riftbomb-parts/:version/*`; `manifest.json` recebe `Cache-Control: no-store`. A configuração segue o mecanismo oficial de Static Assets do Cloudflare Workers e evita cache imutável em HTML, loader, CSS ou JS de nomes estáveis.
- Prova HTTP local com `wrangler.unstable_startWorker`: manifest respondeu **200 + `no-store`**; a mesma parte fingerprintada respondeu **200 + `public, max-age=31556952, immutable` em 3/3 requests**. O parser registrou duas regras válidas e o build copiou `_headers` para `online/dist/client`.
- Impacto determinístico na revisita da mesma versão: a parte de **667.878 B** fica fresca no cache por um ano, portanto o navegador pode reconstruir o jogo com **1 revalidação de rede a menos e até 667.878 B a menos transferidos**. A carga fria permanece em seis requests e cresceu **838 B** (739.851 → 740.689 B, +0,11%) por causa do caminho/versionamento explícito.
- Validação da rodada 6: `npm test` raiz passou **41/41 em 3/3** (5.467,4 / 5.632,7 / 5.882,8 ms; mediana 5.632,7 ms); `npm test` em `online/` passou **13/13 em 3/3**, além de uma execução final após o ajuste do benchmark; `npm test` em `online/server/` passou os **3/3 grupos em 3/3** (3.005,9 / 2.720,1 / 2.734,6 ms; mediana 2.734,6 ms); lint terminou em 7.824,5 ms com **0 erros** e quatro avisos conhecidos.
- Limitação da rodada 6: nenhum deploy foi feito, logo o header novo foi verificado no runtime local do Wrangler, não em `bombpvp.com`. A economia de request/bytes é consequência direta e padronizada do cache fresco imutável, mas não substitui Network/LCP medidos em navegador visível; Playwright/headless não foi usado.
- Rodada 7: o inventário estático encontrou **0 tags de script externas** e nenhum import/fetch/WebSocket remoto literal no runtime normal do jogo/shell. A biblioteca de fundo embutida ainda contém **1 origem potencial** para um iframe de fallback quando WebGL nativo falha; ela não é carregada no caminho nativo medido e fica registrada como pendência, sem alegação de custo zero em todos os dispositivos.
- Antes, `<fluid-bg>` já estava conectado quando `customElements.define` executava, portanto o upgrade síncrono criava contexto WebGL, compilava shaders e iniciava RAF antes dos módulos essenciais seguintes. Depois, o elemento fica inerte em `<template>` e é conectado por `requestIdleCallback`, com fallback `setTimeout(0)` e timeout de 1 s; se a partida começar primeiro, o template é removido e o segundo WebGL nunca nasce.
- Proxy determinístico repetido 3 vezes: inicializações WebGL antes do idle **1/1/1 → 0/0/0**. O mock incluiu deliberadamente 25 ms de custo para tornar a fronteira visível (medianas 25,824 → 0,817 ms), portanto esses milissegundos **não** são alegados como latência real de navegador; a evidência causal é a contagem 1 → 0 e o teste executável do agendamento.
- O trade-off foi **+657 B** na parte publicada (667.878 → 668.535 B; +0,10%), mantendo o payload frio em 741.346 B, abaixo do budget de 800.000 B. Não houve request adicional.
- Validação da rodada 7: `npm test` raiz passou **42/42 em 3/3 após o teste final** (7.297,4 / 6.690,0 / 5.357,1 ms; mediana 6.690,0 ms); `npm test` em `online/` passou **13/13 em 3/3** (13.724,9 / 12.982,8 / 13.110,2 ms; mediana 13.110,2 ms); lint online terminou em 7.678 ms com **0 erros** e quatro avisos conhecidos. O servidor não foi alterado; Playwright/headless não foi usado.
- Limitação da rodada 7: sem navegador visível, não há alegação de LCP/INP ou milissegundos reais de GPU. O ganho é a remoção estrutural e testada do trabalho WebGL do task crítico, preservando o efeito após idle.
- Rodada 8: o caminho normal de criação aquecido fazia `DELETE` e `INSERT` em duas chamadas D1 aguardadas em sequência. Agora os dois statements seguem no mesmo `D1Database.batch`, que a documentação oficial define como uma única chamada ao banco e uma transação sequencial; colisões continuam em até seis tentativas e não repetem a limpeza.
- Benchmark controlado da rodada 8, repetido 3 vezes com 20 ms sintéticos por chamada: antes **41,72 / 42,13 / 41,21 ms** (mediana **41,72 ms**, 2 chamadas); depois **21,32 / 20,75 / 21,10 ms** (mediana **21,10 ms**, 1 chamada). A queda de **49,4%** no proxy não é alegada como latência real de produção; a evidência causal é **2 → 1 chamadas D1 (-50%)**.
- Validação da rodada 8: teste instrumentado específico passou **2/2**; `npm test` raiz passou **42/42**; `npm test` em `online/` passou **15/15** com build verificado; `npm test` em `online/server/` passou os **3/3 grupos**; lint terminou com **0 erros** e quatro avisos conhecidos. Playwright/headless não foi usado.
- Limitação da rodada 8: nenhum deploy ou benchmark de produção foi autorizado, portanto os 28,0 ms históricos de create não foram substituídos. Em isolate frio, `ensureSchema` ainda acrescenta uma chamada D1 anterior; a redução desta rodada vale tanto no frio (3 → 2 chamadas) quanto no caminho aquecido comum (2 → 1).
- Rodada 9: a consulta de sala selecionava `host_token`, `offer`, `answer` e `expires_at` para ambos os clientes. O host nunca usa `offer`; o convidado nunca usa `host_token` nem o conteúdo de `answer`, apenas sua presença. As novas projeções retornam `host_token = ? AS is_host, answer, expires_at` para o host e `offer, answer IS NOT NULL AS has_answer, expires_at` para o convidado.
- Benchmark local reproduzível com SQLite e os dois SDPs no limite de 32.000 caracteres, repetido 3 vezes: valores serializados **64.175 → 32.079 B** no host (**-32.096 B / -50,02%**) e **64.175 → 32.080 B** no convidado cheio (**-32.095 B / -50,01%**). Antes/depois mantiveram **1 chamada** e `EXPLAIN QUERY PLAN` confirmou `SEARCH pvp_rooms USING INDEX sqlite_autoindex_pvp_rooms_1 (code=?)` em todas as amostras; nenhum índice redundante foi adicionado.
- Validação da rodada 9: testes específicos de persistência passaram **4/4**; `npm test` raiz passou e o conjunto direto confirmou **42/42**; `npm test` em `online/` passou com build verificado e o conjunto direto confirmou **17/17**; `npm test` em `online/server/` passou os **3/3 grupos**; lint terminou com **0 erros** e quatro avisos conhecidos. `git diff --check` passou. Playwright/headless não foi usado.
- Limitação da rodada 9: os bytes medem os valores materializados em SQLite local, não bytes faturados ou latência real do D1 remoto. O ganho estrutural é a remoção de uma coluna SDP de até 32 KB por leitura; nenhum ganho de milissegundos em produção é alegado. O primeiro `npm test` online foi bloqueado pela ausência inicial de dependências; após `npm ci` com lockfile preservado, o gate passou.
- Rodada 10: `broadcast` codificava o mesmo objeto separadamente para host e convidado. `json-transport.mjs` agora verifica readiness/backpressure, codifica uma vez se houver ao menos um destinatário elegível e envia a mesma string aos sockets elegíveis; envios diretos continuam codificando cada mensagem distinta.
- Benchmark controlado da rodada 10 com payload ASCII de snapshot de **1.041 B**, 20.000 broadcasts para dois destinatários e três repetições: serializações **40.000 → 20.000 (-50%)**, bytes enviados preservados em **41.640.000**, mediana **448,27 → 226,33 ms (-49,5%)**. Os milissegundos são um proxy local de CPU, não latência de produção; a evidência causal é a contagem de codificações.
- Validação da rodada 10: teste específico passou **3/3**; `npm test` em `online/server/` passou **5/5** contando os três novos casos e os dois fluxos existentes; `npm test` em `online/` passou **17/17** com build verificado; `npm test` raiz passou **42/42**; lint terminou com **0 erros** e quatro avisos conhecidos. `git diff --check` passou. Playwright/headless não foi usado.
- Limitação da rodada 10: o benchmark usa payload sintético representativo e sockets em memória; não mede CPU ou event-loop lag do servidor publicado. O cache é deliberadamente efêmero ao broadcast atual para não reter snapshots nem introduzir invalidação entre ticks.
- Rodada 11: cada partida ativa registrava um timer de simulação a 60 Hz e outro de snapshot a 30 Hz. Em 128 salas, isso significava **256 intervals** e até **23.040 callbacks esperados em 2 s**; o baseline entregou somente 19.740 / 20.630 / 20.829 callbacks e 6.891 / 7.059 / 7.165 snapshots, evidenciando atraso sob carga.
- O relógio agora é propriedade única de `AuthoritativeRooms`: dois intervals percorrem todas as salas, e filas limitadas processam **oito salas por turno de event loop** com `setImmediate`. Um ciclo ainda ativo faz o próximo disparo ser descartado em vez de formar backlog sem limite. Cada sala conserva seu próprio `lastTick`, o limite de `dt`, a simulação a 60 Hz e snapshots a 30 Hz.
- Benchmark de 128 salas por 2 s, em 3/3 execuções: intervals **256 → 2 (-99,22%)**; callbacks medianos **20.630 → 2.997 (-85,47%)**, contando timer e `setImmediate` depois; snapshots medianos **7.059 → 7.680 (+8,80%)**, atingindo 100% do esperado na mediana; utilização mediana do event loop **49,96% → 45,77% (-4,19 p.p.)**; atraso p95 mediano **7,029 → 2,890 ms (-58,88%)** e máximo mediano **32,686 → 14,000 ms (-57,17%)**.
- Estresse pós-mudança no teto de 256 salas, 3/3: somente **2 intervals**, p95 **2,230 / 2,014 / 2,016 ms**, utilização **65,09 / 61,00 / 62,17%** e 14.856 / 15.440 / 15.272 snapshots em cerca de 2 s. Não há baseline de 256 salas, portanto esses números validam capacidade, mas não são usados para calcular ganho.
- Validação da rodada 11: testes focados passaram **6/6**; `npm test` raiz passou **42/42**; `npm test` em `online/` passou **17/17** com build verificado; `npm test` em `online/server/` passou **5/5**; lint terminou com **0 erros** e quatro avisos conhecidos. `git diff --check` passou. Playwright/headless não foi usado.
- Limitação da rodada 11: o benchmark usa partidas e serialização reais, mas sockets em memória e uma única máquina local; não mede latência de rede nem CPU do host publicado. As amostras de 2 s apresentam ruído de scheduler, por isso a comparação usa medianas de três execuções.
- Rodada 12: `server.mjs` e `authoritative-rooms.mjs` deixaram de importar estaticamente `game/create-authoritative-duel.mjs`; o módulo, `node:vm` e `node:fs/promises` entram sob demanda na primeira partida. `AuthoritativeRooms` memoiza uma única Promise, inclusive quando duas salas começam juntas, e também concentra a aplicação de ações no runtime já carregado.
- Benchmark contrafactual executável em `npm run benchmark:boot`, três lotes de nove pares intercalados (27 processos por modo): boot eager anterior **164,645 ms** de mediana versus lazy atual **157,526 ms**, ganho de **7,119 ms (-4,32%)**. Cada subprocesso usa o mesmo servidor e difere apenas pela pré-importação do módulo de duelo antes do `listen`.
- O preço deslocado foi medido pelo fluxo WebSocket real host + guest até `start`: mediana **11,406 → 12,273 ms**, acréscimo de **0,867 ms (+7,60%)** somente na primeira partida; as seguintes reutilizam a Promise memoizada. O teste específico prova carregamento zero no lobby e uma única chamada para dois starts concorrentes.
- Validação da rodada 12: teste específico passou **2/2**; `npm test` em `online/server/` passou **7/7 em 3/3 execuções**; `npm test` raiz passou **42/42**; `npm test` em `online/` passou **17/17** com build; lint terminou com **0 erros** e quatro avisos conhecidos. `git diff --check` passou. Playwright/headless não foi usado.
- Limitação da rodada 12: os tempos incluem criação de subprocesso e scheduler do Windows; por isso o resultado usa pares eager/lazy intercalados e mediana agregada, não a primeira comparação isolada contaminada. Não houve deploy, e nenhuma redução de cold start do host publicado é alegada. O marcador histórico de 87,7 ms em `PERFORMANCE.md` mede boot do frontend, não este servidor.
- Rodada 14: o snapshot de 30 Hz deixou de materializar `JSON.stringify(room.game.grid)` em toda sala. O cache mantém cópia estrutural por sala, compara valores exatamente, atualiza em lugar quando uma célula muda e só realoca quando as dimensões da grade mudam; o envio completo periódico a cada 60 sequências foi preservado.
- Benchmark final `npm run benchmark:grid-cache`, com ordem alternada e três repetições sobre a grade real de 11 linhas/143 células em 128 salas: antes **789,202 / 1.056,836 / 982,999 ms** (mediana **982,999 ms**); depois **173,883 / 202,496 / 199,591 ms** (mediana **199,591 ms**), queda de **783,408 ms / 79,70%** e speedup mediano de **4,93x** em 384.000 verificações. Strings temporárias de grade: **384.000 → 0**; caracteres materializados: **118.656.000 → 0**.
- Validação da rodada 14: teste focado passou **4/4** e cobre grade estável, mutação, mudança de dimensões e refresh periódico; `npm test` raiz passou em **10.026,2 ms**; `npm test` online passou build e **17/17** em **16.017,1 ms**; `npm test` no servidor passou **11/11** em **5.264,6 ms**; lint online terminou com **0 erros** e os quatro avisos conhecidos. `git diff --check` passou. Playwright/headless não foi usado.
- Limitação da rodada 14: os milissegundos são um proxy isolado de CPU em uma única máquina, não latência publicada nem medição de GC. A redução de strings/caracteres é contagem determinística do trabalho removido; o cache retém uma cópia pequena da grade por sala (143 valores no mapa medido) em troca de eliminar alocações efêmeras contínuas.
