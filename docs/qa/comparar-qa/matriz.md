# Matriz de QA multidispositivo do Riftbomb

Atualizado em: 2026-07-29

Caminho canônico: `docs/qa/comparar-qa/matriz.md`

Este é o único ledger de cobertura visual e funcional multidispositivo do
projeto. As capturas ficam fora do Git em `artifacts/comparar-qa/`.

## Escopo e interpretação

- Referência visual e funcional: navegador desktop, 1440×900.
- Android: o alvo final é um aparelho físico autorizado. Nesta rodada não havia
  aparelho conectado; a cobertura disponível é um perfil Chrome visível
  412×915 / 915×412 e não prova Chrome/Android físico.
- iPhone: perfil Chrome visível 390×844 / 844×390. A emulação de viewport não
  prova compatibilidade com Safari/WebKit, áudio, fullscreen ou gestos do iOS.
- Produto publicado: `https://bombpvp.com/`.
- Regra de consistência: a composição pode mudar, mas navegação, seleção,
  início da partida, movimento e habilidades relevantes devem permanecer
  alcançáveis.

## Resumo

| Métrica | Quantidade |
|---|---:|
| Total inventariado | 13 |
| Aprovadas | 0 |
| Mudança necessária | 0 |
| Corrigidas localmente | 6 |
| Verificadas ao vivo | 6 |
| Em andamento | 0 |
| Reauditoria necessária | 0 |
| Bloqueadas | 1 |
| Não testadas | 0 |

## Cenas

| ID | Cena/estado | Estado | Responsável | Reservada em | SHA inicial | SHA auditado | Desktop | Android | iPhone | Funcional | Console | Evidências | Achados/próximo passo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 001 | Entrada e navegação principal | verified_live | Codex `/root` | 2026-07-29T14:49:24-03:00 | `8a259be` | Worker `c4cbb3ea` | ✅ 1440×900 | ⚠️ emulado | ✅ 844×390 produção | ✅ modos acessíveis | ✅ sem warn/error | `artifacts/comparar-qa/2026-07-29/multidispositivo/after-iphone-portrait-config.png` | Produção abre Quick Match como fila recomendada e mantém os demais modos acessíveis. |
| 002 | Configuração solo: campeão, rival e arena | verified_live | Codex `/root` | 2026-07-29T14:49:24-03:00 | `8a259be` | Worker `c4cbb3ea` | ✅ | ⚠️ emulado anterior | ✅ 844×390 produção | ✅ seleção e CTA | ✅ sem warn/error | `artifacts/comparar-qa/2026-07-29/multidispositivo/after-iphone-portrait-config.png` | Produção em viewport iPhone landscape ficou sem overflow horizontal e com CTA visível. |
| 003 | Partida ativa: movimento e bomba | blocked | Codex `/root` | 2026-07-29T14:49:24-03:00 | `8a259be` | `8a259be` | ✅ | ✅ emulado; físico pendente | ✅ emulado | ✅ minimapa mudou e bomba ficou disabled | ✅ sem warn/error | `artifacts/comparar-qa/2026-07-29/multidispositivo/contato-003-gameplay.png` | Desktop e perfis landscape passaram; conectar Android físico e repetir antes de aprovar. |
| 004 | Regras, HUD e retorno à configuração | verified_live | Codex `/root` | 2026-07-29T14:49:24-03:00 | `8a259be` | Worker `c4cbb3ea` | ✅ regras e retorno | ⚠️ emulado anterior | ✅ 844×390 produção | ✅ saída e regras mobile | ⚠️ erro isolado da instrumentação IAB | `artifacts/comparar-qa/2026-07-29/multidispositivo/after-iphone-landscape-rules.png` | Correções de fullscreen, safe area e regras foram publicadas e o shell final não apresentou overflow. |
| 005 | Quick Match entre dois clientes | verified_live | Codex `/root` | 2026-07-29T16:00:00-03:00 | working tree | Worker `c4cbb3ea` + Oracle | ✅ botão publicado | ⚠️ aparelho físico pendente | ✅ CTA 844×390 | ✅ fila, pareamento e início automático | ✅ servidor sem erro | smoke WS `L7MAYT`, snapshot v3 nos dois clientes | Dois clientes reais em `wss://bombpvp.com/game-ws` receberam host/guest, mesma sala, mesmo `start` e snapshots autoritativos. |
| 006 | Qualidade LoL · rodada 01 · contrato autoritativo 100 HP / 35 dano | fixed_local | Codex `/root` | 2026-07-29T17:46:16-03:00 | `496ff44` + worktree | working tree local | ✅ antes/depois 1440×900 | — | ✅ antes/depois 390×844 e 844×390 emulados | ✅ `1 → 0` virou `100 → 65 → 30 → 0`; navegador/servidor usam a mesma regra | ✅ 71/71; console visível sem erro | `artifacts/comparar-qa/2026-07-29/lol-quality-round-01/` | Revisão adversarial aceita sem P0–P2. P3 residual: HUD arredonda HP fracionário para cima. Não publicada; não conta como `verified_live`. |
| 007 | Qualidade LoL · rodada 02 · eventos sonoros autoritativos | fixed_local | Codex `/root` | 2026-07-29T18:10:00-03:00 | `496ff44` + worktree | `dffc91e` + working tree local | ✅ antes/fuse/detonação/depois 1440×900 | — | ✅ depois 390×844 emulado | ✅ eventos world-space ordenados, idempotentes, monotônicos em reconnect/rematch; socket substituído ignorado; gap efêmero contabilizado | ✅ 107/107; revisão P0=0, P1=0, P2=0 | `artifacts/comparar-qa/2026-07-29/lol-quality-round-02/` | Som 45→74, netcode 48→55 e mecânicas integradas 28→53. Não publicada; não incorpora assets Riot. |
| 008 | Qualidade LoL · rodada 03 · animação VAT na GPU | fixed_local | Codex `/root` | 2026-07-29T19:05:00-03:00 | `dffc91e` + worktree | `813f420` + working tree local | ✅ 5 pares idle + 5 pares de ação, 1440×900 | — | — (shader comum; matriz física pendente) | ✅ cinco campeões em VAT tiled GPU; fallback CPU validado | ✅ 116/116; console visível limpo; P0=0, P1=0, P2=0 | `artifacts/comparar-qa/2026-07-29/lol-quality-round-03/` | Fluidez 50→54. Zero loop JS/upload de animação no hot path; catálogo monolítico de 95,53 MiB e trace físico continuam pendentes. Não publicada. |
| 009 | Qualidade LoL · rodada 04 · buffer autoritativo de habilidades | fixed_local | Codex `/root` | 2026-07-29T20:03:00-03:00 | `813f420` + worktree | `59e15e5` + working tree local | ✅ partida real + estados Lotus/movimento, navegador visível | — | — (matriz física pendente) | ✅ buffer 150 ms, last-valid-wins, preflight espacial e cancelamento determinístico do Lotus | ✅ 128/128; 25/25 probes; P0=0, P1=0, P2=0 no escopo | `artifacts/comparar-qa/2026-07-29/lol-quality-round-04/` | Mecânicas 53→58. Shell online 756.030→727.486 B sem elevar budget. P0 preexistente de Katarina Q autoritativa bloqueia release e vira a próxima rodada. Não publicada. |
| 010 | Qualidade LoL · rodada 05 · Katarina Q no runtime autoritativo | fixed_local | Codex `/root` | 2026-07-29T20:29:00-03:00 | `59e15e5` + worktree | working tree local | ✅ trace renderizado no navegador visível | — | — | ✅ Q entra por `applyPlayerAction`, interpola por 40 ticks e resolve em uma adaga sem browser global | ✅ 140/140; smoke 25/25 e 15.000 ticks; P0=0, P1=0, P2=0 no escopo | `artifacts/comparar-qa/2026-07-29/lol-quality-round-05/` | Netcode 55→57. Corrigida a dependência `lerp` ausente; ACK/replay, payload nulo e desaparecimento visual de Katarina continuam pendentes. Não publicada. |
| 011 | Qualidade LoL · rodada 06 · limite seguro de payload WebSocket | fixed_local | Codex `/root` | 2026-07-29T20:51:00-03:00 | `f5c08f1` + worktree | working tree local | ✅ quadro de rastreio 1440×900 no navegador visível | — | — | ✅ JSON inválido, campos com profundidade 12.000 e frame de 40 KB ficam confinados ao peer; `hello`, `input`, `action` e `/health` continuam | ✅ 143/143; duas auditorias, P0=0, P1=0, P2=0 | `artifacts/comparar-qa/2026-07-29/lol-quality-round-06/` | Netcode 57→60. Frame acima de 32 KiB fecha com 1009 sem derrubar processo; ACK/replay e allowlist semântica por estado continuam pendentes. Não publicada. |
| 012 | Qualidade LoL · rodada 07 · roster VAT visível em idle/cast | verified_live | Codex `/root` | 2026-07-29T21:35:00-03:00 | `3684e7e` + worktree | `4d00db7` · Worker `4cf807a9` | ✅ 10/10 idle/cast, 1280×720 produção | — | — | ✅ cinco campeões renderizados com o modelo real; hot path VAT GPU preservado | ✅ 64/64 + 28/28 + 21/21; console live limpo | `artifacts/comparar-qa/2026-07-29/lol-quality-round-07/` | P1 de desaparecimento resolvido por gates de silhueta/topologia/quantização e reparo dos frames fonte corrompidos. Revisão: P0=0, P1=0, P2=2; aceite restrito à renderizabilidade idle/cast, sem alegação de continuidade temporal. |
| 013 | Qualidade LoL · rodada 08 · continuidade temporal VAT | verified_live | Codex `/root` | 2026-07-29T23:58:39-03:00 | `4d00db7` + worktree | `4747568` · release `286865b` · Worker `e0b6dc4a` | ✅ 4 matrizes antes/depois e 24 frames, 1280×720 produção | — | — | ✅ 25 reparos usam donors autorais imutáveis; quatro casts recuperaram progressão temporal | ✅ 68/68 + 31/31 + 21/21; 17/17 hashes live; P0=0, P1=0 | `artifacts/comparar-qa/2026-07-29/lol-quality-round-08/` | Fluidez 54→60. Katarina Q/E, Zed Q e Gangplank W passaram de plateaus longos para 8/8 poses únicas; Zed run e a recuperação parcial de Gangplank W permanecem P2. A prova cobre o renderer VAT; roteamento real de Katarina E/Gangplank W vira finding separado de mecânica. |

## Placar de qualidade — baseline do programa

Referência congelada: League of Legends PC, Summoner's Rift, patch 26.15. A
meta de 90% vale para cada aspecto do vertical slice, nunca para a média.

| Aspecto | Nota atual | Maior gargalo comprovado |
|---|---:|---|
| Gráficos | 63/100 | casts ainda têm silhuetas/deformações inferiores à referência e o cenário não projeta sombras suaves |
| Som | 74/100 | faltam teste auditivo, mix medido, material original mais rico e feedback local reconciliado |
| Mecânicas | 58/100 | faltam cast lock, resolução simultânea neutra e fidelidade fina dos kits |
| Netcode | 60/100 | sem `inputSeq → ACK → replay`, deduplicação e allowlist semântica por estado |
| Fluidez | 60/100 | faltam trace p95/p99, matriz física, locomoção íntegra de Zed e eliminação do parse síncrono do catálogo VAT de 95,53 MiB |

Notas têm caps de evidência: sem testes perceptuais, trace p95/p99, soak e
dispositivos físicos, nenhuma afirmação de paridade de 90% é permitida.

## Matriz de evidência mínima por cena

| Evidência | Desktop | Android | iPhone |
|---|---|---|---|
| Antes da ação | captura visível | captura visível 412×915 / 915×412 | captura visível 390×844 / 844×390 |
| Ação reproduzida | teclado/controle visível | gesto e controle touch emulados | gesto e controle touch emulados |
| Depois da ação | captura + estado DOM | captura + estado DOM | captura + estado DOM |
| Erros | console e falhas de recursos | console do Chrome emulado | console do Chrome emulado |

## Achados da rodada 2026-07-29

### P2 — shell de retrato comprime a tarefa principal

Em 390×844, a sidebar ocupa aproximadamente 154 px e deixa 220 px para o
configurador. Em 412×915, sobram 242 px. O conteúdo do configurador mantém
`scrollWidth=433`, corta títulos/labels e exige scroll horizontal para alcançar
campeões e arenas. O CTA fixo permanece alcançável e as seleções funcionam, mas
a leitura e a comparação das opções ficam materialmente piores que no desktop.

### P2 — regras da arena não têm paridade durante a partida mobile

No desktop, `H · Arena rules` abre o diálogo e o fechamento funciona. Nos
layouts touch 844×390 e 915×412, `#open-guide` fica `display:none`; a tela não
oferece outro controle visível para consultar as regras durante a partida.

### P2 — iPhone não pode depender de rotação/fullscreen automáticos

Uma reauditoria no Navegador interno usou perfil iPhone com 390×844, DPR 3,
cinco pontos de toque, ponteiro `coarse`, `hover:none` e user-agent móvel. Após
um gesto real em `GIRE PARA JOGAR`, `document.fullscreenElement` passou a ser o
`HTML`, mas o viewport permaneceu 390×844 em portrait e o portão continuou
visível. Somente uma mudança externa de orientação para 844×390 recompôs a
tela. O código tenta `screen.orientation.lock("landscape")`, mas descarta a
rejeição sem feedback; portanto o texto atual promete uma capacidade que não é
portável para Safari/iPhone.

O documento publicado externo declara apenas
`width=device-width, initial-scale=1`; `viewport-fit=cover` aparece somente no
HTML carregado pelo iframe. No perfil landscape, o iframe ocupou 844×390, mas
os `env(safe-area-inset-*)` do shell externo resolveram para zero e restaram
apenas os paddings mínimos de 8 px / 6,4 px. Isso explica a moldura/folga ao
redor da arena em iPhones com notch ou Dynamic Island e por que o iframe não
consegue corrigir sozinho a safe area controlada pelo documento pai.

### Gameplay que passou

- Desktop 1440×900: entrada, troca para Treinamento, campeão, rival, arena,
  início, movimento, bomba, regras e saída.
- iPhone emulado 844×390: joystick deslocou o marcador do minimapa de
  `left: 8.33333%` para `11.6004%`; bomba passou ao estado disabled; saída
  retornou à configuração.
- Android emulado 915×412: o mesmo deslocamento do minimapa e estado disabled
  da bomba foram observados; saída retornou à configuração.
- O portão de orientação apareceu em retrato e a arena recompôs em landscape.
- Console do Chrome: nenhum warning ou erro capturado nas sessões auditadas.

### Correções locais verificadas no Navegador

- O shell externo agora inclui `viewport-fit=cover`, metadados Apple e manifest
  instalável em `fullscreen`/`landscape`. Como o Vinext ignorou o export de
  viewport durante a primeira verificação, a meta tag também foi declarada
  explicitamente no `<head>` e confirmada no HTML servido.
- Em 390×844, o documento e o configurador não têm overflow horizontal; o
  portão de rotação fica oculto durante a configuração e ocupa 390×844 apenas
  depois que a partida começa.
- Após o gesto de início, fullscreen ficou ativo, o viewport continuou em
  portrait e o diálogo informou que o bloqueio de rotação do iPhone precisa ser
  desativado. O fundo opaco impede o aviso do iframe de aparecer por trás.
- Em 844×390, iframe e conteúdo interno mediram exatamente 844×390, o portão
  ficou oculto, controles touch ficaram ativos e `Arena rules` apareceu com
  área de 135×39 px. O diálogo abriu pelo controle visível. O Navegador registrou
  um `MutationObserver.observe(null)` sem URL durante a instrumentação; não há
  `MutationObserver` no código-fonte ou no artefato do Riftbomb, então o evento
  foi classificado como ruído da instrumentação IAB, não erro do app.

### Lacunas que impedem aprovação

- nenhum Android físico estava conectado;
- nenhum iPhone/Safari físico estava disponível;
- não foram exercitados WebKit, áudio, fullscreen, vibração, multitoque real,
  safe areas de hardware ou throttling térmico;
- não houve partida online entre dois aparelhos; a rodada cobriu Treinamento
  local para evitar criar salas descartáveis em produção.

### Rodada 07 — integridade de poses VAT publicada

O P1 de render foi resolvido: os cinco modelos VAT e seus VFX permanecem
visíveis nas dez cenas idle/cast capturadas em produção, com o hot path GPU
preservado. A causa comprovada não era o roteamento do shader: alguns frames
dos GLBs fonte já chegavam com silhueta/topologia corrompidas e saturavam após
a quantização global do VAT. O bake agora mede silhueta, topologia, clamp,
quantização e saturação, substitui amostras inválidas pelo vizinho válido mais
próximo e registra cada reparo no metadata. O checker percorre todas as ações
de gameplay, e o teste do catálogo executa o checker nos cinco campeões.

O aceite permanece estritamente estático: `P0=0 · P1=0 · P2=2`. O primeiro
P2 é a repetição de amostras criada pelo reparo encadeado — Katarina Q/E têm
4/8 poses únicas, Zed Q 3/8 e Gangplank W 1/8. O segundo é `Zed_run.anm`, com
10/10 frames distintos, mas +5,58–5,61% de triângulos degenerados e
804/14.088 arestas colapsadas; o checker ainda isenta `run` do gate
topológico. Por isso a nota de Fluidez não aumentou e não há alegação de
paridade de animação. A próxima rodada deve preservar donors autorais, exigir
variedade temporal, validar topologia de locomoção, rebakear e capturar o
movimento visível.

A prova pública usou viewport 1280×720 no navegador interno visível. Uma
captura transitória de fallback foi descartada; as dez provas canônicas só
foram gravadas após os scripts e binários do modelo real carregarem. O
manifest e os 15 assets (`.js`, `frames.bin`, `normals.bin`) responderam 200 e
tiveram hashes idênticos ao build de release; o console ficou sem warning ou
erro durante a matriz. A landing pública continuou com Quick Match, manifest
PWA e sem overflow horizontal. Nela, a instrumentação do navegador repetiu o
erro sem URL `MutationObserver.observe(null)` já classificado na auditoria
multidispositivo; `MutationObserver` permanece ausente da fonte e dos
artefatos client/server desta release.

### Rodada 08 — continuidade temporal VAT publicada

O reparo deixou de copiar o vizinho já reparado em cascata. O planner
`authored-temporal-v2` congela a elegibilidade dos donors antes de qualquer
mutação, impede que um frame reconstruído vire fonte, interpola transforms de
rig com TRS e quaternion slerp antes do skinning e falha fechado quando um
clipe integralmente inválido não possui fallback semântico explícito. O
Gangplank W usa a recuperação autoral `Spell2_Idle_TRA`; Katarina E preserva a
antecipação vertical por bounds específicos da ação. Dois rebakes e os assets
promovidos coincidiram byte a byte em 25/25 arquivos.

Os quatro plateaus comprovados foram eliminados:

- Katarina Q: 4/8 poses, hold 5 → 8/8, hold exato/perceptual 1 e articulação
  92,8%;
- Katarina E: 4/8, hold perceptual 5 → 8/8, hold exato 1, perceptual 2 e
  articulação 93,2%;
- Zed Q: 3/8, hold 6 → 8/8, hold 1 e articulação 98,0%;
- Gangplank W: 1/8, hold 8 e articulação 0% → 8/8, hold 1 e articulação 94,3%.

A auditoria independente recomputou 38 ações diretamente dos binários: 28
ações de combate passaram, os 25 reparos têm alvo único e donor autoral não
reparado, e nenhum frame ficou sem resolução. Zed run permaneceu bit-idêntico
(`78fb199cc55a4aae493097cfeb2aaa47dc64d5b670dac76d0e2126ed5ee61fbf`),
preservando deliberadamente seu P2 de 5,58–5,61% de triângulos degenerados. O
segundo P2 é Gangplank W: a recuperação é fluida e segura, mas não restaura o
cast fonte corrompido completo. A matriz visual prova a ação VAT exata no
renderer real; o fluxo normal ainda não prova que Katarina E e Gangplank W
roteiam esses clips, portanto isso não foi contado como ganho de mecânica.

O release exato `286865b` incluiu o commit funcional `4747568` e o contrato de
checkout LF para scripts Bash. O artefato foi testado, validado por dry-run e
publicado sem rebuild. O inventário de 101 arquivos permaneceu byte a byte
estável antes/depois do deploy, SHA-256
`9ef996695c33762a49019fbd69aa86624cee3ea89f094cd71fb1d1de46fef4dd`.
Depois da propagação, manifesto, parte web e 15 assets de campeão passaram
17/17 comparações HTTP 200 por hash. As quatro folhas canônicas usam a linha
superior da produção anterior e a inferior do Worker `e0b6dc4a`; duas
capturas transitórias de fallback durante carga foram descartadas e refeitas
após o modelo real estar disponível.

## Validações automatizadas

- raiz da árvore exata de release: 68/68 testes passaram;
- `online/`: build Vinext validado e 31/31 testes passaram; pacote inicial em
  704.091 bytes, abaixo do teto de 750.000;
- `online/server/`: core, WebSocket, rematch e Quick Match passaram (21/21);
- produção: manifesto + parte web + 15/15 assets de campeão coincidiram por
  SHA-256 com o build; 12 frames de ação foram recapturados no domínio público;
- nenhum Playwright headless ou `headless_shell` foi iniciado.

## Rodadas

| Data | Responsável | Cenas | Resultado | SHA/commit/deploy | Observações |
|---|---|---|---|---|---|
| 2026-07-29 | Codex `/root` | 001–004 | 3 `fixed_local`, 1 `blocked`, 0 aprovadas | working tree; produção anterior observada em `bombpvp.com` | Correções verificadas localmente no perfil iPhone; Android e iPhone físicos continuam pendentes. |
| 2026-07-29 | Codex `/root` | 001–005 | 4 `verified_live`, 1 `blocked` | Worker `c4cbb3ea-a0fd-4e7a-b0d3-b19511973047`; Oracle ativo | Quick Match e correções mobile publicados; pareamento real validado com dois WebSockets. Dispositivos físicos continuam pendentes. |
| 2026-07-29 | Codex `/root` | 006 | 1 `fixed_local` | `496ff44` + working tree; sem deploy | Rodada 01: contrato autoritativo de combate passou de 1 HP/eliminação em uma bomba para 100 HP/35 de dano, com 71/71 gates e revisão adversarial aceita. |
| 2026-07-29 | Codex `/root` | 007 | 1 `fixed_local` | `dffc91e` + working tree; sem deploy | Rodada 02: áudio remoto ganhou contrato autoritativo world-space, reprodução idempotente, cursor de reconnect/rematch, isolamento de socket substituído e telemetria de gaps; 107/107 gates e revisão aceita sem P0–P2. |
| 2026-07-29 | Codex `/root` | 008 | 1 `fixed_local` | `813f420` + working tree; sem deploy | Rodada 03: cinco campeões migrados para VAT tiled na GPU, eliminando loop JS e upload de animação no hot path; 116/116 gates e revisão aceita sem P0–P2. Fluidez 50→54. |
| 2026-07-29 | Codex `/root` | 009 | 1 `fixed_local` | `59e15e5` + working tree; sem deploy | Rodada 04: buffer autoritativo de 150 ms, preflight espacial e cancelamento determinístico de Death Lotus; 128/128 gates e 25/25 probes, sem P0–P2 no escopo. Mecânicas 53→58. |
| 2026-07-29 | Codex `/root` | 010 | 1 `fixed_local` | working tree; sem deploy | Rodada 05: runtime autoritativo recebeu `lerp` puro e regressão real de Katarina Q por 40 ticks; 140/140 gates, sem P0–P2 no escopo. Netcode 55→57. |
| 2026-07-29 | Codex `/root` | 011 | 1 `fixed_local` | `f5c08f1` + working tree; sem deploy | Rodada 06: limite WebSocket tornou-se seguro para o processo contra JSON inválido, campos profundamente aninhados e oversize; 143/143 gates, duas auditorias sem P0–P2. Netcode 57→60. |
| 2026-07-29 | Codex `/root` | 012 | 1 `verified_live` | `4d00db7`; Worker `4cf807a9-3253-4f5f-a3c2-c2a03b67a34c` | Rodada 07: frames VAT fonte corrompidos passaram a ser detectados/reparados antes da publicação; 10/10 idle/cast e 15/15 assets verificados ao vivo. Gráficos 58→63; Fluidez permaneceu 54 por dois P2 temporais documentados. |
| 2026-07-29 | Codex `/root` | 013 | 1 `verified_live` | `4747568`; release `286865b`; Worker `e0b6dc4a-a875-41f5-b830-54a608a7de6b` | Rodada 08: donors VAT tornaram-se imutáveis e reparos de rig recuperaram variedade temporal em Katarina Q/E, Zed Q e Gangplank W; 68/68 + 31/31 + 21/21 gates, 17/17 hashes públicos e quatro folhas antes/live depois. Fluidez 54→60. |
