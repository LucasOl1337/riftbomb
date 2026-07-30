# Matriz de QA multidispositivo do Riftbomb

Atualizado em: 2026-07-30

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
| Total inventariado | 19 |
| Aprovadas | 0 |
| Mudança necessária | 0 |
| Corrigidas localmente | 6 |
| Verificadas ao vivo | 12 |
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
| 014 | Qualidade LoL · rodada 09 · roteamento semântico Q/W/E/R | verified_live | Codex `/root` | 2026-07-30T01:12:41-03:00 | `4747568` + produção anterior | `ba77212` · release `84eabbf` · Worker `0fa64580` | ✅ antes/local/live, input real e framebuffer WebGL 1280×720 | — | — | ✅ 20/20 casts reais selecionam a ação VAT autoral; atores derivados, buffer, rejeição, cancelamento e transições sem flashback | ✅ 140/140 + 39/39 + 32/32; 17/17 assets live; console live limpo; P0=0, P1=0 | `artifacts/comparar-qa/2026-07-29/lol-quality-round-09/` | Mecânicas 58→62 e Fluidez 60→63. O fluxo publicado de Katarina E passou de `Q/Spell1` incorreto para `E/Spell3`; cinco rotas erradas e flickers de timers antigos foram eliminados. Assets físicos e dispositivos móveis permanecem fora do escopo desta rodada. |
| 015 | Qualidade LoL · rodada 10 · ACK causal e replay de movimento | verified_live | Codex `/root` | 2026-07-30T02:09:04-03:00 | Worker `0fa64580` + Oracle anterior | `d114a11` · Oracle `d114a11` · Worker `e0597eb4` | ✅ antes/live, dois clientes e input real, 1936×1048 | — | — | ✅ epoch por partida, sequência exata, ACK pós-tick e replay; rolling deploy nos dois sentidos | ✅ 140/140 + 46/46 + 33/33; console live limpo; 0 ciclos pulados; P0=0, P1=0 no escopo | `artifacts/comparar-qa/2026-07-30/lol-quality-round-10/` | Netcode 60→66. Uma `seq=2` adiantada permaneceu sem ACK; replay `seq=1→2` avançou ACK `0→1→2`. Ações one-shot e retomada autenticada por assento continuam pendentes. |
| 016 | Qualidade LoL · rodada 11 · retomada autenticada após F5 | verified_live | Codex `/root` | 2026-07-30T02:20:13-03:00 | `c9da842` + Worker `e0597eb4` | `a21c49f` · Oracle `a21c49f` · Worker `be838e1a` | ✅ antes 1936×1048/1440×900 e depois 1280×720, dois clientes visíveis, F5 e teclado real | — | — | ✅ bearer de 256 bits por assento, digest no servidor, substituição atômica, grace exato de 20 s, ACK preservado, boot coalescido e presença false→true | ✅ 140/140 + 63/63 + servidor 54/54; dry-run; P0=0/P1=0 bloqueadores | `artifacts/comparar-qa/2026-07-30/lol-quality-round-11/` | Netcode 66→72. O cliente voltou à mesma rodada após F5 em 3.523 ms, o rival confirmou reconexão em 3.598 ms e novo input `D` foi aceito. Bearer estável sem rotação e ACK de ações one-shot permanecem pendentes. |
| 017 | Qualidade LoL · rodada 12 · material original do piso da arena | verified_live | Codex `/root` | 2026-07-30T04:08:04-03:00 | `3cb5a11` + Worker `be838e1a` | `80503b1` · Worker `53cabbe1` | ✅ antes 1440×900; depois local/live no mesmo enquadramento | ✅ antes/local/live 844×390 emulado, controles touch visíveis | ✅ bloqueio correto 390×844 e gameplay 844×390 emulados | ✅ colisão e regras intactas; perfil Salt Lens isolado, 5 taps e mesmo draw | ✅ 141/141 + 63/63 + servidor 54/54; WebGL2 visível limpo; P0/P1/P2=0 | `artifacts/comparar-qa/2026-07-30/lol-quality-round-12/` | Gráficos 63→68. Piso autoral fingerprinted publicado e verificado byte a byte; casts, sombras e as outras quatro arenas continuam como gargalos explícitos. |
| 018 | Qualidade LoL · rodada 13 · ACK/replay exatamente-uma-vez de ações | verified_live | Codex `/root` | 2026-07-30T05:13:38-03:00 | `afc4e78` + Worker `53cabbe1` | `669d745` · Oracle `e9fdc93` · Worker `dbb42e55` | ✅ baseline, partida e F5, 1440×900 | ⚠️ 844×390 emulado; físico pendente | ✅ 844×390 + gate 390×844 emulados | ✅ bomba/habilidade sob gap, drop, duplicação, atraso, rejeição e F5; soak 10 min com 2.299/2.299 ACKs | ✅ 141/141 + 75/75 + servidor 55/55; skipped 0/0; reauditoria P0/P1/P2=0 | `artifacts/comparar-qa/2026-07-30/lol-quality-round-13/` | Netcode 72→78. Stream confiável separado, FIFO persistida, ACK cumulativo e replay idempotente publicados. Rotação do bearer, reconciliação adaptativa e dispositivos/redes físicas continuam pendentes. |
| 019 | Qualidade LoL · rodada 14 · piso competitivo da Storm‑Eye | verified_live | Codex `/root` | 2026-07-30T06:41:28-03:00 | `bb696e8` + Worker `dbb42e55` | `6f34f00` · Worker `7641f165` | ✅ antes/local/live no viewport solicitado 1440×900; bitmap visível 1440×780 | ⚠️ físico não reexecutado | ✅ antes/local/live 844×390 + gate 390×844 emulados; bitmaps limitados pelo host registrados | ✅ colisão e regras intactas; perfil Storm‑Eye isolado, 2 taps de albedo + 3 de bump e zero sampler/passe/draw adicional | ✅ 142/142 + 75/75 + servidor 55/55; WebGL2 visível limpo; P0/P1/P2=0 | `artifacts/comparar-qa/2026-07-30/lol-quality-round-14/` | Gráficos 68→72. Piso autoral fingerprinted reduziu ruído global em 68,01% e contraste macro em 79,37%; casts, sombras e as outras três arenas permanecem gargalos. |

## Placar de qualidade — baseline do programa

Referência congelada: League of Legends PC, Summoner's Rift, patch 26.15. A
meta de 90% vale para cada aspecto do vertical slice, nunca para a média.

| Aspecto | Nota atual | Maior gargalo comprovado |
|---|---:|---|
| Gráficos | 72/100 | casts ainda têm silhuetas/deformações inferiores à referência, faltam sombras suaves e as outras três arenas ainda usam materiais anteriores |
| Som | 74/100 | faltam teste auditivo, mix medido, material original mais rico e feedback local reconciliado |
| Mecânicas | 62/100 | faltam cast lock, resolução simultânea neutra e fidelidade fina dos kits |
| Netcode | 78/100 | o bearer de retomada ainda não rotaciona; faltam reconciliação/clock sync adaptativos e soak em dispositivos e redes físicas sob perda severa |
| Fluidez | 63/100 | faltam trace p95/p99, matriz física, locomoção íntegra de Zed e eliminação do parse síncrono do catálogo VAT de 95,53 MiB |

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

### Rodada 09 — roteamento semântico Q/W/E/R publicado

O teste black-box passou a executar `Game.castAbility` real e entregar o mesmo
jogador ao resolvedor VAT real. A produção anterior acertava somente 15/20
combinações: Katarina W/E, Zed W, Renekton W e Gangplank W caíam em outra ação,
normalmente `Q`, porque `castAnim` não carregava identidade semântica. O estado
agora publica `abilityAnimAction`, duração e tempo restante somente depois de
um cast aceito. Ao expirar, um ator moderno volta à locomoção sem reativar
timers especialistas antigos.

A matriz terminou 20/20. Ela cobre cast direto e bufferizado, rejeição espacial,
cancelamento de Death Lotus, W/R da sombra derivada de Zed, a borda de 510 ms de
Renekton W e sequências R→Q/E que antes podiam exibir um frame antigo. O pool de
Vladimir e o fallback de snapshots legados/model review mantiveram sua
prioridade. A reauditoria adversarial terminou sem P0/P1; o P2 opcional é ampliar
os asserts permanentes desses fallbacks, já exercitados em VM durante a revisão.

A prova pública repetiu o mesmo cenário antes/depois em viewport visível
1280×720. Pela UI real, o botão `DEPLOY P1 KATARINA` iniciou a partida; uma tecla
`E` real executou Shunpo e, após 160 ms, mediu `E/Spell3`, 0,26 s restantes,
cooldown 7,84 s e deslocamento 3,96 m. A captura anterior mostra o defeito
`Q/Spell1`; o framebuffer do Worker `0fa64580` mostra a rota corrigida. O console
publicado ficou sem warning/error. A instrumentação só alterou a aba de QA e
foi descartável; nenhum Playwright headless ou `headless_shell` foi iniciado.

O release `84eabbf` contém o commit funcional `ba77212`. O mesmo `dist` validado
e publicado tem 105 arquivos e 69.238.455 bytes, com inventário SHA-256
`e9e86ad0831d973c9957368dc916853cf65c92c6fe046540575b44abf9dda4ce`.
Manifesto e parte única de 710.745 bytes apontam para
`76950c0e75a14445db432fc11c7a46226831c04b9801684106a3c9cf411d013d`;
manifesto, parte e 15 assets de campeão coincidiram 17/17 por hash HTTP. O shell
HTML público mede 359 bytes a mais apenas porque a Cloudflare injeta seu beacon
de analytics; ele contém o mesmo manifesto e reconstruiu o jogo correto.

O ganho de nota é deliberadamente conservador: Mecânicas 58→62 pelo contrato
20/20 entre habilidade aceita e resposta visual, e Fluidez 60→63 por eliminar
flickers e flashbacks entre ações. O resultado ainda está abaixo da meta de 90
e não altera Gráficos, Som ou Netcode.

### Rodada 10 — ACK causal e replay de movimento publicados

A produção anterior aceitava apenas a última máscara recebida. Um probe que
anunciou protocolo v1 recebeu `input: null` em `connected`, `start` e snapshot;
o comando publicado era somente `{type:"input", mask:8}`, sem identidade,
geração ou confirmação. Perder a transição neutra podia manter movimento, e
uma transição nova não tinha como distinguir atraso de aplicação.

O movimento agora usa epoch por partida e sequência estritamente contígua por
assento. O servidor confirma primeiro o recebimento em `accepted` e só avança
o ACK cumulativo depois que o tick autoritativo consumiu a máscara. O cliente
mantém outbox limitada a 64 transições, retransmite somente o head-of-line a
cada 120 ms e preserva o mesmo `inputSeq`; cursores futuros, regressivos ou de
outra partida não limpam a fila. Bombas e habilidades continuam one-shot e não
foram incluídas nesse replay, evitando duplicar ações não idempotentes.

O teste público reordenou deliberadamente uma soltura `seq=2` antes da pressão
`seq=1`. O snapshot permaneceu em `accepted=0, ack=0`; após replay da lacuna,
avançou para `1/1`, e o replay da soltura terminou em `2/2`. Dois clientes
visíveis formaram uma partida no domínio publicado, uma tecla `D` real passou
pelo novo cliente e ambos permaneceram sincronizados. O console ficou limpo;
o health da Oracle mostrou dois sockets, 4.773 snapshots e zero ciclos de tick
ou snapshot pulados. As capturas têm 1936×1048; os traces JSON guardam o
contrato antes/depois sem depender de uma sobreposição visual transitória.

O rollout foi bidirecional. A Oracle recebeu primeiro o tarball do commit
`d114a11` (51.271 bytes; SHA-256
`a0827c2c7643b501da2ee327f0a4bc390f06564ce8973a51d89ca42bb82a7714`),
com backup anterior, health pre/post e hashes dos dois fontes principais
iguais aos extraídos localmente. Antes do Worker novo, dois clientes antigos
parearam, moveram e mantiveram o relógio autoritativo sem ciclos pulados. O
Worker `e0597eb4-69eb-44e4-9d8a-c3475ff682d6` publicou depois exatamente o
`dist` validado, e `online-duel.js` coincidiu por SHA-256 local/HTTP em
`4d2007ef81183889fb2de457e26b216bb7bf9911553645cb9402ef41cf33780f`.

A reauditoria terminou sem P0/P1 no escopo do transporte de movimento. Os P1
preexistentes de retomada após F5 permanecem explícitos: falta token por assento
para substituição atômica, retry curto de `role_taken` e mensagem de `resume`
que reinicialize o runtime/UI antes de aplicar o snapshot completo. Eles, e o
ACK exatamente-uma-vez de ações, são melhorias separadas. Por isso Netcode sobe
somente de 60→66 e nenhum outro aspecto recebe pontos nesta rodada.

### Rodada 11 — retomada autenticada após F5 publicada

Na produção anterior, um F5 durante a partida destruía o vínculo local: o
cliente recarregado voltava à introdução e à rodada zero, enquanto o rival
permanecia sozinho na rodada um com aviso de desconexão. A captura anterior e o
trace registram os dois lados sem ler `sessionStorage`, bearer ou payload
privado.

Cada assento agora recebe um bearer aleatório de 256 bits, mantido apenas em
`sessionStorage`; o servidor conserva somente seu digest SHA-256 e usa
comparação constante. Uma retomada válida substitui o socket de forma atômica,
incrementa a geração e torna mensagens e `close` atrasados do socket antigo
inertes. Estado da partida, epoch, ACK cumulativo, cursores aceitos e fila
confiável sobrevivem, enquanto a máscara de movimento mantida é neutralizada.
O boot volta por um único snapshot coalescido e pode ser repetido sem criar
outro runtime ou relógio.

O grace de reconexão é exatamente 20 segundos. A expiração do host encerra a
sala e notifica o rival; a do convidado libera somente sua vaga. Tokens
revogados entram em denylist limitada, credenciais fora do formato hexadecimal
minúsculo falham e o fencing depois dos dois `await` de inicialização impede
ressuscitar partidas, timers ou broadcasts de salas removidas. A QA ao vivo
revelou ainda que o rival permanecia visualmente “desconectado” depois da
retomada; o patch incremental passou a publicar `presence connected:true` e o
cliente restaura o status de continuidade.

Na prova pública, os dois clientes estavam na rodada 01 com relógios 82/81. O
cliente A recebeu input real `D` e sofreu reload completo; o rival observou
`presence:false` em 448 ms, A exibiu “partida restaurada” em 3.523 ms e B exibiu
“Player 1 reconnected” em 3.598 ms. Ambos continuaram na rodada 01, relógio 43,
e um novo `D` manteve a partida ativa até o relógio 30. A sessão foi encerrada
pela UI ao final; a Oracle voltou a zero salas, zero sockets e zero partidas.
Não foram capturados segredos. Os dois warnings do cliente A são o timeout já
conhecido de `AudioContext.resume` sujeito à política de autoplay; nenhum erro
de console ocorreu.

O rollout publicou primeiro a Oracle com o tarball final de 59.428 bytes
(SHA-256 `934165b46ecbd20f78e5728e98f85b554a7d1a9761cb1bbc7516d1627e5dd32c`)
e backup em `/opt/riftbomb-backups/pre-a21c49f-20260730T065216Z.tar.gz`.
Depois, o Worker `be838e1a-652c-48c3-8390-52e7245ae521` recebeu 100% do tráfego.
O fonte principal da Oracle coincide com o blob do commit depois de normalizar
CRLF, e `online-duel.js` publicado coincide com o checkout por SHA-256
`1340ed32c04f6bd8314381cdb2c1ed9a9959474034faaaf3948f91baf597f9ec`.

A reauditoria terminou sem P0/P1 bloqueador de deploy. O bearer permanece
estável durante a vida da sessão; se for furtado, ainda pode substituir o
socket legítimo, portanto rotação segura continua como finding futuro. Bombas
e habilidades também continuam sem ACK exatamente-uma-vez. O ganho conservador
é somente Netcode 66→72; nenhum outro aspecto recebe pontos nesta rodada.

### Rodada 12 — material original de piso da Salt Lens publicado

O piso anterior era dominado por ruído miúdo alaranjado e repetição uniforme,
o que aproximava personagens, bombas e obstáculos do mesmo plano visual. A
melhoria única desta rodada substitui apenas o material visual da arena padrão
Salt Lens por uma superfície mineral autoral com bandas macro largas, centro de
combate discretamente mais claro e detalhe micro restrito. A direção seguiu os
princípios públicos de clareza competitiva e separação de leitura descritos por
[Riot Games](https://www.leagueoflegends.com/en-us/news/dev/clarity-in-league/),
sem copiar ou incorporar texturas, modelos, sons ou marcas da Riot.

O PNG fonte foi criado com ImageGen e promovido junto de prompt, hashes, base
de direitos, `thirdPartyInputs: []` e versão do encoder. O runtime usa o sibling
fingerprinted `floor-salt-lens-combat-band-6ffb0854.webp`, 1024×1024 RGB, sem
alpha, 208.558 bytes e SHA-256
`6ffb0854daa7df93f7b8c1c0c6f82f116e548ae5419e6dc4e9b8579fca9951e6`.
O asset anterior foi preservado como rollback. Somente essa URL recebe cache
`public, max-age=31556952, immutable`.

O perfil de amostragem novo é ativado exclusivamente quando o pacote resolve o
piso `floorLattice`; as outras quatro arenas preservam o caminho legado. O
shader continua usando cinco taps, o mesmo sampler, passe e draw call. Um inset
de meio texel protege o espelhamento das bordas sob `GL_REPEAT`, e a inspeção do
mosaico 2×2 não encontrou costura perceptível. Não houve alteração em colisão,
movimento, hitboxes, temporização ou regras.

As métricas determinísticas registraram desvio macro de 0,024214 contra
0,0076 no piso anterior, high-pass de 0,027157, faixa p05–p95 de
0,324737–0,445158 e razão de costura/p95 de 0,898 no eixo X e 0,878 no Y. A
compressão WebP Q88 obteve SSIM estimado de 0,945 e PSNR de 39,38 dB. Capturas
antes/depois no mesmo estado foram feitas em 1440×900 e 844×390, além do gate
390×844; todas as sessões WebGL2 visíveis terminaram sem warnings ou erros.

O Worker `53cabbe1-06e8-4b7f-bbc0-75772f70749a` publicou exatamente o asset e
manifesto validados. Homepage e textura responderam 200; o conteúdo HTTP tem o
mesmo tamanho e SHA-256 local. A revisão adversarial final não encontrou
P0/P1/P2 bloqueador. O ganho conservador é somente Gráficos 63→68: casts,
sombras suaves e materiais das demais arenas permanecem fora do escopo e sem
pontuação nesta rodada.

### Rodada 13 — ações exatamente-uma-vez publicadas

Bombas e habilidades saíam do cliente como mensagens one-shot: uma perda podia
apagar a ação e uma retransmissão manual não tinha identidade para impedir
efeito duplo. A melhoria única desta rodada introduz um stream confiável
independente do movimento, com epoch, `actionSeq`, ACK cumulativo, fila FIFO
persistida antes do envio, limite de 16 entradas e replay do head a cada 120 ms.
O cliente restaura a fila no F5 antes de publicar a sessão e falha fechado, com
alerta acessível dentro da partida, se o navegador não puder persistir a ação.

O servidor aceita somente a próxima sequência do epoch atual. Um gap fica sem
ACK; uma duplicata recebe o cursor corrente sem reaplicar a ação. Rejeições
mecânicas e ações atrasadas de outra rodada são consumidas sem efeito para não
travar o FIFO. A capacidade confiável é monotônica durante resume e só é
zerada nos limites explícitos de nova sessão, leave ou expiração. O rollout
servidor-primeiro preservou clientes legados enquanto o Worker antigo estava
ativo.

No trace público, `seq=2` adiantada permaneceu em ACK 0; `seq=1` criou uma única
bomba e avançou ACK 1; uma duplicata conflitante de `seq=1` foi inerte. A
`seq=2` rejeitada pela mecânica avançou o cursor sem efeito. Um envio ambíguo de
`seq=3` sobreviveu ao F5 e foi resolvido uma única vez, e a habilidade `seq=4`
foi confirmada. O cliente visível voltou à mesma rodada em 5.380 ms. As
capturas desktop, landscape, portrait e pós-F5 comprovam cobertura visual; o
baseline e o depois não são o mesmo estado, portanto não são usados como
comparação pixel a pixel.

O soak live medido durou 600.091 ms: 2.299 ações canônicas produziram exatamente
2.299 transições de ACK, mesmo com 179 primeiros envios descartados, 260
duplicatas, atrasos de até 520 ms, 15 F5/resumes e 15 substituições de socket.
Foram atravessadas sete rodadas sem bombas, explosões, projéteis ou sons para as
ações deliberadamente fora da rodada corrente. Houve zero erro WebSocket, zero
fechamento inesperado e zero ciclo de tick/snapshot pulado. Depois da limpeza,
salas, partidas, sockets e fila voltaram a zero, com os dois clocks parados.

A Oracle recebeu `e9fdc93` com backup anterior ao rollout; o cliente final
`669d745` foi publicado no Worker
`dbb42e55-17ed-483a-8ff5-59293e97d919`. Homepage respondeu 200 e o
`online-duel.js` servido coincidiu byte a byte com o build local pelo SHA-256
`c2c009097cd9531c7555f7726cb15b340e29ec6420bcdf76b757084a218cc83c`.
As reauditorias de cliente e servidor terminaram com P0/P1/P2=0. O token do
workflow GitHub continua inválido (Cloudflare 9106); a publicação final foi
feita pela sessão OAuth válida do proprietário e esse P2 operacional não
afeta o artefato em produção. O ganho conservador é somente Netcode 72→78.

### Rodada 14 — piso competitivo da Storm‑Eye publicado

O albedo anterior da Storm‑Eye usava um vórtice magenta de alto contraste que
ocupava quase todo o campo e competia com personagens, bombas e telegráficos.
A melhoria única desta rodada substitui somente esse piso por basalto/vidro de
tempestade autoral em azul-marinho, com variação macro contida e sem anéis,
runas, portais ou emissivos semânticos. A direção preserva a leitura top-down
competitiva; colisão, layout, regras e conteúdo de campeão não mudaram.

O PNG fonte foi criado com ImageGen e promovido com prompt, proveniência,
hashes, base de direitos e `thirdPartyInputs: []`. O runtime usa
`floor-storm-eye-combat-field-99509f91.webp`, 1024×1024 RGB, sem alpha,
156.720 bytes e SHA-256
`99509f91a6208a6c843dc5d8ce25c6287e28d6066cd5a4f6b50e6798783e0717`.
O `floor-pit.webp` anterior permanece byte a byte no repositório como rollback,
mas não entra no pacote online novo.

Contra o rollback, o WebP novo reduziu o tamanho em 29,31%, o desvio global de
luminância em 68,01%, o contraste macro em blocos 64×64 em 79,37% e a diferença
do centro em 78,21%. A incidência medida de acentos magenta e ciano caiu a zero.
O perfil da Storm‑Eye compartilha o caminho de baixo ruído já auditado: dois
taps de albedo e três de bump, total exato de cinco, sem sampler, passe ou draw
call adicional.

A comparação no navegador visível repetiu SOLO/LOCAL, Katarina contra Zed CPU,
Storm‑Eye e rodada 01 antes, no preview e na produção final. Há capturas desktop,
landscape, gate portrait e bomba ativa; WebGL2 permaneceu em 100% e o console
terminou sem warning/error. O host visível limitou os bitmaps abaixo do viewport
CSS solicitado em uma dimensão; tamanhos e hashes reais estão registrados em
`after-visible-qa.json`, portanto a cena fica `verified_live`, não recebe alegação
de comparação pixel a pixel nem de dispositivo físico.

O Worker `7641f165-344a-42b5-93b8-8ab1468dedd4` publicou o commit `6f34f00`.
Homepage, manifesto, parte e WebP responderam 200; a textura pública tem os
mesmos 156.720 bytes e SHA-256 local, cache imutável, a parte contém somente a
URL fingerprinted nova e não contém o rollback. As reauditorias terminaram com
P0/P1/P2=0. O ganho conservador é somente Gráficos 68→72; casts, sombras suaves
e os materiais das outras três arenas continuam fora do escopo.

## Validações automatizadas

- raiz da árvore exata da release: 142/142 testes passaram;
- `online/`: build Vinext validado, 75/75 testes passaram e lint terminou com
  zero erros e quatro warnings preexistentes de `<img>`;
- `online/server/`: 55/55 testes passaram, incluindo sequência/ACK de duas
  cadeiras, rejeição mecânica, resume monotônico, rematch, leave e expiração;
- o dry-run Cloudflare passou com 93 assets, upload total de 4.949,66 KiB e
  3.020,07 KiB gzip;
- produção: homepage 200; o piso Storm‑Eye respondeu 200, 156.720 bytes, cache
  imutável e SHA-256 exato; manifesto/parte de 712.667 bytes apontam somente
  para a URL fingerprinted nova; o smoke 400/`unknown_action`, hash do cliente
  e protocolo v1 dos dois WebSockets da rodada anterior permanecem válidos;
- soak live de 10 min: 2.299/2.299 ACKs, 179 drops, 260 duplicatas, 15 F5,
  skipped tick/snapshot 0/0 e limpeza completa;
- navegador visível: antes/local/live no viewport desktop solicitado 1440×900,
  landscape 844×390, portrait 390×844 com gate e bomba ativa; WebGL2 100%,
  console sem warning/error e dimensões reais dos bitmaps registradas;
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
| 2026-07-30 | Codex `/root` | 014 | 1 `verified_live` | `ba77212`; release `84eabbf`; Worker `0fa64580-d3c8-4930-9c2b-bba0baade1df` | Rodada 09: o gameplay passou a publicar a identidade Q/W/E/R aceita e o renderer deixou de inferir pelo timer genérico; 15/20→20/20 rotas, 140/140 + 39/39 + 32/32 gates, 17/17 assets públicos e prova antes/live por input real. Mecânicas 58→62; Fluidez 60→63. |
| 2026-07-30 | Codex `/root` | 015 | 1 `verified_live` | `d114a11`; Oracle `d114a11`; Worker `e0597eb4-69eb-44e4-9d8a-c3475ff682d6` | Rodada 10: movimento ganhou epoch, sequência exata, ACK pós-tick e replay HOL limitado; rolling deploy servidor→cliente passou, 140/140 + 46/46 + 33/33 gates, hash HTTP exato, dois clientes visíveis e trace live `0→1→2`. Netcode 60→66. |
| 2026-07-30 | Codex `/root` | 016 | 1 `verified_live` | `a21c49f`; Oracle `a21c49f`; Worker `be838e1a-652c-48c3-8390-52e7245ae521` | Rodada 11: bearer autenticado por assento, substituição atômica, grace de 20 s, fencing e presença restaurada após F5; 140/140 + 63/63 + servidor 54/54, hash público exato e prova com dois clientes/input real. Netcode 66→72. |
| 2026-07-30 | Codex `/root` | 017 | 1 `verified_live` | `80503b1`; Worker `53cabbe1-06e8-4b7f-bbc0-75772f70749a` | Rodada 12: piso Salt Lens autoral, fingerprinted e isolado, com hierarquia macro/micro, mesmo custo de draw e hash HTTP exato; 141/141 + 63/63 + servidor 54/54, WebGL2 visível e revisão sem P0–P2. Gráficos 63→68. |
| 2026-07-30 | Codex `/root` | 018 | 1 `verified_live` | `669d745`; Oracle `e9fdc93`; Worker `dbb42e55-17ed-483a-8ff5-59293e97d919` | Rodada 13: bombas e habilidades ganharam sequência, ACK causal, FIFO persistida e replay idempotente; 141/141 + 75/75 + servidor 55/55, trace público, hash exato e soak de 2.299 ações sob drop/duplicação/F5. Netcode 72→78. |
| 2026-07-30 | Codex `/root` | 019 | 1 `verified_live` | `6f34f00`; Worker `7641f165-344a-42b5-93b8-8ab1468dedd4` | Rodada 14: piso Storm‑Eye autoral, fingerprinted e isolado reduziu ruído global em 68,01% e contraste macro em 79,37%, preservando cinco taps e custo de draw; 142/142 + 75/75 + servidor 55/55, hash público exato, QA visível antes/local/live e P0/P1/P2=0. Gráficos 68→72. |
