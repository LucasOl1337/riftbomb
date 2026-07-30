# Handoff — Riftbomb, rodada 15: Marca Fatal autoritativa do Zed

Criado em **2026-07-30 08:47:22 -03:00** (`America/Sao_Paulo`).

Este documento registra o estado no encerramento da sessão. Ele distingue
deliberadamente código local, validação local, commit, push e produção.

## Resumo executivo

A sessão trabalhou na **rodada 15 do programa de aproximação de qualidade ao
League of Legends**. A melhoria única escolhida foi transformar a ultimate
Marca Fatal do Zed de um teleporte instantâneo em um compromisso autoritativo
de duas fases, compartilhado entre offline e PvP.

O núcleo mecânico está implementado no working tree e o teste autoritativo
diretamente afetado passa **28/28**. A rodada **não está concluída**: os
artefatos gerados estão stale, os gates completos não foram repetidos depois
dos últimos patches, faltam screenshots/traces finais, não há commit/push da
rodada 15 e nada desta rodada foi publicado.

Não considerar o objetivo geral concluído. As cinco dimensões continuam abaixo
de 90/100.

## Identidade do trabalho

| Campo | Valor |
|---|---|
| Repositório remoto | `https://github.com/LucasOl1337/riftbomb.git` |
| Worktree ativo | `C:\Projetos\riftbomb-round13-action-ack` |
| Branch | `codex/round15-zed-death-mark-commitment` |
| HEAD/base | `9c88c5f71260178bd8e84eec5e923652c51a7ec7` |
| Upstream da branch atual | não configurado |
| Última rodada publicada | rodada 14, piso Storm-Eye |
| Worker publicado conhecido | `7641f165-344a-42b5-93b8-8ab1468dedd4` |
| Oracle mecânica conhecida | release da rodada 13, commit `e9fdc93` |
| Estado Git | 11 arquivos modificados antes de `DocsDev`; nenhum commit da rodada 15 |
| Cena de QA | `020`, estado `in_progress` |

Em 2026-07-30 durante este fechamento, `https://bombpvp.com/riftbomb`
respondeu HTTP 200. Isso prova disponibilidade, não prova que a rodada 15 está
publicada; a produção continua na rodada 14.

## Objetivo central discutido

O pedido persistente do usuário é:

- testar o jogo com a skill `comparar-qa`;
- fazer uma melhoria por rodada;
- aproximar gráficos, som, mecânicas, netcode e fluidez do League of Legends;
- usar screenshots e provas em cada rodada;
- continuar até cada aspecto atingir pelo menos 90/100;
- usar pesquisa web, subagentes e revisão adversarial;
- usar `imagegen` quando um asset gráfico original for útil;
- fazer commit e deploy das rodadas aprovadas.

Placar publicado no início e no fim desta sessão:

| Aspecto | Nota publicada |
|---|---:|
| Gráficos | 72/100 |
| Som | 74/100 |
| Mecânicas | 62/100 |
| Netcode | 78/100 |
| Fluidez | 63/100 |

A rodada 15 ainda não recebe pontos. Uma atualização conservadora de Mecânicas
só deve ser feita após `verified_live`.

## Regras e restrições que continuam válidas

1. Não executar Playwright headless, `headless_shell` ou scripts hostile-ui sem
   autorização explícita do usuário na mesma mensagem.
2. UI deve ser verificada em navegador visível.
3. Editar `game/play-riftbomb.html` e módulos fonte; não editar manualmente
   `riftbomb.html` ou loaders gerados.
4. `bot-opponent/` emite intenções; somente `game/` valida e aplica ações.
5. Mudança de jogo exige `npm test` na raiz. Mudança online exige também
   `npm test` em `online/` e `online/server/`.
6. Cada fluxo publicado mantém um transporte ativo. Não criar fallback sem
   entrada registrada e teste.
7. Assets externos exigem proveniência e atenção a licença/marca. O projeto é
   de fã e não comercial; não assumir que autorização técnica equivale a
   licença de redistribuição de material proprietário.

## Referências usadas na rodada

- Riot Games, página oficial do Zed:
  <https://www.leagueoflegends.com/en-us/champions/zed/>
- League Wiki, dados detalhados de Death Mark:
  <https://wiki.leagueoflegends.com/en-us/Template%3AData_Zed/Death_Mark>
- CommunityDragon, dados públicos do campeão:
  <https://raw.communitydragon.org/latest/game/data/characters/zed/>
- Recurso indicado pelo usuário para modelos:
  <https://modelviewer.lol/>
- Recurso indicado pelo usuário para pesquisa sonora:
  <https://wiki.spectralcoding.com/info:league_of_legends_sounds:league_of_legends_sounds.html>

`imagegen` foi lida e considerada, mas não usada: esta rodada é uma mudança
determinística de mecânica/netcode, sem necessidade de raster novo.

## Baseline comprovado

Antes da mudança, um trace determinístico em arena aberta mostrou:

- callback de R movia Zed de `z=0` para `z=2.64` imediatamente;
- a marca e a sombra eram criadas no mesmo instante;
- Q era aceita no mesmo instante;
- nos 100 ms seguintes Zed ainda se movia `0.345` unidade e trocava a animação
  para Q.

Evidência existente fora do Git:

```text
C:\Projetos\riftbomb\artifacts\comparar-qa\2026-07-30\lol-quality-round-15\before-authoritative-trace.json
```

Esse diretório contém somente esse JSON. Nenhum screenshot “antes” ou “depois”
foi capturado nesta rodada.

## Implementação local atual

### Timeline e estado autoritativo

- Windup/vanish: **0,6 s**.
- Dash: **0,35 s**.
- Compromisso total: **0,95 s**.
- Fuse da marca após landing: **3 s**.
- Sombra de origem: **9 s**.
- O estado fica em `player.zedDeathMarkCommitment` e é serializado no snapshot
  existente, sem alterar o protocolo de transporte.
- `r` dirige a animação VAT de vanish e `rStrike` dirige `Spell4_Strike` no
  dash.
- O alvo permanece fixo por `targetId`; o endpoint acompanha a posição desse
  mesmo alvo durante o dash, sem retargetar outro contestant.

### Lock, alvo e resolução

- Zed fica inalvejável e sem movimento, bomba ou nova ação durante o
  compromisso.
- O buffer de habilidades aceita intenção nos últimos 150 ms.
- Botões HUD e touch agora abrem nessa janela; a bomba permanece travada até o
  landing.
- Vladimir em Sanguine Pool não pode ser adquirido como alvo.
- Pool iniciado no windup cancela com cooldown de 0,5 s; pool iniciado no dash
  permite terminar o deslocamento, mas impede a aplicação.
- Spell shield bloqueia a **aplicação** da marca e é consumido nesse momento.
- Shield adquirido depois da aplicação não apaga o pop.
- Untargetability ou hit-lock posteriores à aplicação não apagam a detonação.
- A marca aplicada sobrevive à morte do Zed.
- O tempo excedente de um tick que cruza o landing avança a idade da marca;
  partições de `dt` equivalentes não perdem até 50 ms no endpoint.

### Settlement de rodada

- O round não pode travar no meio de um dash pendente.
- Um pop pós-morte pendente impede `roundLocked` até resolver.
- Morte do caster por bomba dentro do mesmo tick de 50 ms não antecipa o fim
  do round.
- `finalizeRound` cancela qualquer compromisso remanescente, incluindo timeout,
  para que nenhum estado fique congelado durante a transição.
- Draw pós-morte e vitória do sobrevivente estão cobertos.

### Cliente e apresentação

- Renderer aplica alpha distinto no windup e no dash.
- HUD expõe `data-death-mark-phase`,
  `data-death-mark-commitment` e
  `data-death-mark-buffer-window`.
- O texto da fase usa `phaseRemaining`; não mostra mais o total de 0,95 s como
  se todo ele fosse vanish.
- Predição online consulta `game.canMoveContestant`.
- Reconciliação local também limpa alvo residual e aceita o snapshot mecânico
  como autoridade durante windup/dash.
- `game/apply-combat-rules.js` encaminha as opções do sétimo argumento de
  `hitSkill`; sem isso, o runtime de 100 HP descartaria a semântica do pop já
  aplicado.

## Arquivos modificados na rodada 15

| Arquivo | Papel da mudança |
|---|---|
| `docs/qa/comparar-qa/matriz.md` | reserva da cena 020 como `in_progress` |
| `game/run-champion-bomb-duel.js` | state machine, locks, targetability, marca, shield, settlement e determinismo |
| `game/apply-combat-rules.js` | encaminhamento das opções de dano anexado no wrapper de 100 HP |
| `game/draw-bomber-rift.js` | apresentação de vanish/dash e ação `rStrike` |
| `game/present-champion-bomb-duel.js` | HUD, fase, lock e janela touch/mouse de buffer |
| `game/verify-riftbomb.test.mjs` | contratos de animação e fonte |
| `online/public/online-duel.js` | gate de predição e reconciliação durante compromisso |
| `online/server/tests/authoritative-core.test.mjs` | regressões autoritativas da Marca Fatal |
| `online/tests/pvp-source.test.mjs` | guardas estruturais do cliente online |
| `riftbomb.html` | gerado anteriormente; agora stale após os últimos patches |
| `online/public/riftbomb.html` | gerado anteriormente; agora stale após os últimos patches |

Após criar `DocsDev`, os três documentos deste hub também aparecem como novos.

## Revisão adversarial: problemas encontrados e tratados

Os subagentes encontraram P1/P2 reproduzíveis antes do fechamento:

- `roundLocked` podia congelar o dash se o alvo morresse durante a fase;
- timeout podia preservar compromisso congelado;
- timer pós-morte podia expirar antes do pop quando criado em `updateBombs` no
  mesmo tick;
- carry após 0,95 s era descartado e gerava até 50 ms de diferença;
- Sanguine Pool não participava de `isContestantTargetable`;
- marca já aplicada desaparecia sem dano contra untargetability posterior;
- spell shield era consultado no pop, e não na aplicação;
- wrapper de combate descartava o sétimo argumento de `hitSkill`;
- reconciliação online residual ainda movia Zed apesar do gate de predição;
- HUD/touch não conseguiam usar o buffer final de 150 ms;
- endpoint do dash ficava congelado em vez de acompanhar o mesmo alvo;
- label de vanish mostrava o tempo total do compromisso.

Todos receberam patches e regressões locais. A revisão adversarial final ainda
precisa ser repetida sobre o diff completo depois do rebuild.

## Validação realizada

### Estado atual, depois dos últimos patches

- `online/server`: `node --test tests/authoritative-core.test.mjs` → **28/28**.
- `online`: `node --test tests/pvp-source.test.mjs` → **16/16**.
- raiz: `node --test game/verify-riftbomb.test.mjs` → **24/25**.
  A única falha é esperada e objetiva:
  `apply-combat-rules.js must be embedded byte-for-byte`.
  Isso confirma que `riftbomb.html` precisa ser regenerado.
- `git diff --check` → passou; somente avisos LF/CRLF.

### Antes dos últimos patches adversariais

- raiz: o Node reportou **142/142**, embora o wrapper externo tenha encerrado
  por timeout logo depois da saída de sucesso;
- online completo: **76/76**;
- servidor completo: todas as suítes passaram, incluindo core 26/26 e 60
  testes somados nos grupos executados;
- ESLint local correto: **0 erros**, 4 warnings preexistentes de `<img>` em
  `online/app/page.tsx`.

Esses números anteriores não substituem a repetição final, porque código mudou
depois deles.

## O que ficou pendente

### Bloqueadores de release

1. Capturar o screenshot **antes** no build de produção atual, antes de qualquer
   deploy da rodada 15.
2. Gerar novamente `riftbomb.html` e o pacote online.
3. Rodar os três gates completos depois do rebuild.
4. Confirmar que a parte fingerprinted online contém as regras atuais; o pacote
   anterior tinha timestamp/hash de fonte anterior.
5. Repetir revisão adversarial final e corrigir qualquer P0/P1/P2 do escopo.
6. Fazer QA visível local e depois live.
7. Atualizar cena 020, placar e narrativa somente após evidência live.
8. Commitar, fazer push e executar deploy duplo Worker + Oracle.

### Cobertura ainda recomendada

- snapshot/F5 no meio do windup e do dash;
- host e guest espelhados no caminho real de `AuthoritativeRooms`;
- bot emitindo intenção R pelo caminho real;
- landing em parede/borda e alvo inalvejável exatamente no endpoint;
- teste comportamental, não apenas estrutural, da reconciliação online;
- matriz física mobile e rede com perda/jitter;
- trace p95/p99 e inspeção visual do tracking de alvo em movimento;
- pop e áudio exatamente uma vez em duas sessões reais.

### Fidelidade ainda ausente

- O recast da R para retornar à sombra de origem ainda não existe.
- A fidelidade dos outros kits continua desigual.
- A rodada não resolve os gargalos de som, sombras suaves, catálogo VAT de
  95,53 MiB ou dispositivos físicos.

## Evidência visual pendente

O navegador visível foi preparado, mas a extensão Chrome não conseguiu criar
ou assumir uma aba controlável (`tabs.new` exigia aba ativa e os ids observados
não eram positivos). Nenhum Playwright headless foi usado. Não há screenshot
válido desta rodada.

Viewports requeridos pelo ledger:

- desktop `1440×900` (o host pode devolver bitmap de altura menor; registrar);
- landscape mobile `844×390`;
- gate portrait `390×844`.

Capturar pelo menos cast, windup, dash e landing, além do console WebGL2 limpo.

## Sequência recomendada para o próximo agente

1. Ler `DocsDev/README.md`, este handoff, `AGENTS.md` e a cena 020 do ledger.
2. Confirmar branch/worktree e preservar todo o diff existente.
3. Capturar “antes” na produção ainda Round 14.
4. Revisar o diff recente, especialmente settlement, shield e wrapper de HP.
5. Executar na raiz, com timeout suficiente:

   ```powershell
   npm test
   ```

6. Executar em `online/`:

   ```powershell
   npm test
   node node_modules/eslint/bin/eslint.js . --ignore-pattern dist --ignore-pattern .next
   ```

7. Executar em `online/server/`:

   ```powershell
   npm test
   ```

8. Conferir `git diff --check`, manifest, tamanho e hash da parte gerada.
9. Gerar `after-authoritative-trace.json` com fronteiras 0,599 / 0,600 / 0,775
   / 0,949 / 0,950 s, buffer, pool, shield, pop pós-morte e partições de `dt`.
10. Rodar revisão adversarial final.
11. Capturar screenshots locais nos três viewports e console.
12. Commit sugerido: `Make Zed Death Mark an authoritative commitment`.
13. Push da branch `codex/round15-zed-death-mark-commitment`.
14. Fazer deploy coordenado do Worker e da Oracle com a menor janela possível.
15. Validar homepage, manifest/hash, WebSocket real, ACK/replay e snapshots.
16. Capturar screenshots live e só então marcar cena 020 `verified_live`.

## Deploy: atenção especial

A mudança está em `game/`, importado pelo servidor autoritativo e empacotado no
cliente. Publicar somente um lado cria version skew silencioso; o protocolo v1
não negocia essa feature.

- Worker: usar os scripts em `online/package.json` e a configuração
  `online/wrangler.production.jsonc`.
- Origin configurado: `https://aurora.simple-ai.cc/riftbomb-ws`.
- Oracle: inspecionar primeiro a instalação em `/opt/riftbomb`, criar backup
  recuperável, instalar somente os arquivos da release e reiniciar o serviço
  `riftbomb-game`.
- Uma chave local conhecida pelo histórico é
  `C:\Users\user\.ssh\simple-ai-oci`; nunca registrar seu conteúdo.
- O workflow GitHub já encontrou erro Cloudflare 9106 por token inválido; as
  últimas publicações usaram a sessão OAuth válida do proprietário.
- O endpoint público `/health` não foi localizado neste fechamento; verificar
  via localhost/SSH e pelo caminho real do proxy antes de considerar Oracle
  saudável.

## Atualização do ledger ao concluir

Arquivo canônico: `docs/qa/comparar-qa/matriz.md`.

- Cena 020 está `in_progress`, reservada por `/root` em
  `2026-07-30T07:53:23-03:00`.
- Base registrada: `9c88c5f`, Worker `7641f165`.
- Diretório de evidência:
  `artifacts/comparar-qa/2026-07-30/lol-quality-round-15/`.
- Não sobrescrever o histórico das cenas 001–019.
- Só alterar Mecânicas após prova live. Uma faixa conservadora possível é
  `62→68`, mas isso é recomendação, não nota aprovada.

## Inconsistências documentais descobertas no fechamento

Não foram corrigidas por estarem fora do tema da rodada:

- `grokimagineassets/_meta/catalog.json` aponta para o caminho inexistente
  `game/Assets/ART-QUALITY.md`; o real é
  `game/arena-appearance/ART-QUALITY.md`.
- `game/arena-appearance/README.md` ainda diz que a arena é totalmente
  procedural, contradizendo os pisos autorais das rodadas 12 e 14.
- `CONTEXT.md` descreve o produto apenas como offline e omite o PvP publicado.
- `architecture-course/mission.md` chama multiplayer/netcode de fora de escopo;
  deve ser rotulado como contexto histórico do curso.
- `PERFORMANCE.md` registra contagens históricas de testes muito inferiores aos
  gates atuais.
- Falta um runbook versionado e completo para deploy/rollback da Oracle.

## Estado de encerramento

- Implementação: local, não commitada.
- Teste autoritativo direto: verde 28/28.
- Artefatos gerados: stale.
- QA visual: pendente.
- Revisão adversarial final: pendente.
- Commit: não realizado.
- Push: não realizado.
- Deploy: não realizado.
- Produção: rodada 14.
- Objetivo geral 90/100 por aspecto: não concluído.
