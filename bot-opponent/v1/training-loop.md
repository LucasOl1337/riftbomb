# Training loop — Bot V1/Renekton

Protocolo dos ciclos de heartbeat (~30 min) do treinamento autônomo do V1.
Supervisor: agente principal do Kimi. Execução: subagents. Revisão: adversarial
a cada ciclo.

## Missão

Fazer o V1/Renekton jogar bem o suficiente para derrotar o baseline de forma
consistente e, depois, pressionar humanos — sem nunca trapacear as regras da
Match (D3).

## Protocolo de cada ciclo

1. **Estado**: rodar `npm test` na raiz; se vermelho, o ciclo é só reparo.
2. **Leitura**: reler a seção "Log de ciclos" abaixo e escolher o próximo
   item do backlog não marcado como feito.
3. **Execução**: delegar a implementação a um subagent coder com briefing
   completo (objetivo, arquivos, contratos, restrições). Trabalho pequeno e
   verificável por ciclo — um item, não três.
4. **Revisão adversarial**: revisar o diff como revisor hostil (regressões,
   acoplamento com `game/`, bot trapaceando regras, teste que não exercita o
   caminho novo). Quando disponível, invocar a skill `codex-mode` para uma
   segunda revisão independente; registrar se ela rodou ou falhou.
5. **Registro**: atualizar o "Log de ciclos" com data, item, outcome, métricas
   e próximo passo. Atualizar docs do módulo se algum contrato mudou.

## Restrições duras

- Nunca Playwright headless (`STOP-HEADLESS-PLAYWRIGHT.md`).
- `npm test` verde ao fim de cada ciclo; diff mínimo; sem refator oportunista.
- Bot nunca escreve estado da Match; só emite intenções (D3/D9).
- Fury, cooldowns e vida vêm do WorldView, nunca de memória do bot.
- Geografia: máximo 3 níveis; sem pastas novas fora de `bot-opponent/v1/`.

## Backlog ordenado

- [x] B1 — Kit no WorldView: confirmado que o WorldView já expõe cooldowns
      flat (`qCooldown`…`rCooldown`), `fury`, `skillsUnlocked` (array 0=Q…3=R),
      `renektonDashRecast` e `renektonDominus`; `skillReady` alinhado ao
      formato real, incluindo janela de recast do E ("Dice") e guarda de
      Dominus ativo. Formato documentado no header de `renekton-skills.mjs`.
- [x] B2 — `Game.updateBot()` encaminha `intent.skill` para o mesmo
      entrypoint do input humano (`castAbility`); definir mira de skills
      direcionais (facing preparado ou campo explícito).
      Entregue: mapeamento q/w/e/r → slots 0–3 com `Object.hasOwn`, bundle
      `load-v1-bot.js` gerado no build, fallback baseline sem o bundle; mira
      segue `lastDx/lastDz` (movimento do bot). Revisão adversarial Codex
      aplicada no ciclo 2b.
- [x] B3 — Harness CPU-vs-CPU headless em Node: N partidas V1 vs baseline
      com RNG determinístico; reporta win rate e métricas. Sem browser.
      Entregue em `v1/run-cpu-duels.mjs` + `v1/verify-cpu-duels.test.mjs`
      (P1 pilotado por imitação de teclado WASD, sem costura em `game/`).
- [x] B4 — Mapa de perigo temporal: por célula, quando fica mortal e quando
      volta a ser segura (derivado de bombas+fuses); função pura e testada.
      Entregue no ciclo 7 em `v1/danger-timeline.mjs` (envelope
      `{ deadlyFrom, deadlyUntil }` por célula, blast 0,58s, cadeia com
      atraso de 1 frame — valores verificados em `game/`).
- [x] B5 — Escape tempo-expandido: BFS com dimensão temporal +
      `hasEscape(bomba hipotética)`; bomba só com rota de fuga.
      Entregue no ciclo 7: `escapePlan` (Dijkstra em (célula, tempo) com
      espera em célula segura e fallback "menos pior") e
      `hasTemporalBombEscape` (prova de fuga temporal para todo plant —
      open-route e veto de plants do baseline).
- [ ] B6 — Recast do E e combos Renekton (Slice→Dice, engage→W→Q→saída)
      usando `renekton-memory`.
- [ ] B7 — Modelo do rival: memória entre rounds de hábitos (rotas de fuga,
      onde planta); usar no posicionamento de bomba.
- [ ] B8 — Personalidade V1: pesos próprios (agressão, risco, ganância de
      pickup) tunados via self-play do B3.

## Métricas de referência (a partir do B3)

- Win rate V1 vs baseline em 100 partidas (alvo inicial: > 60%).
- Sobrevivência à própria primeira bomba (> 90%).
- Pickups por round; skills usadas em momento legível (não spam).

## Log de ciclos

| Ciclo | Data | Item | Outcome | Métricas | Próximo |
|-------|------|------|---------|----------|---------|
| 0 | 2026-07-29 | Estrutura | Esqueleto `v1/` + `v1/renekton/` criado, 16 testes verdes | — | B1 |
| 1 | 2026-07-29 | B1 | `skillReady` alinhado ao formato real do WorldView (flat cooldowns, `skillsUnlocked`, recast do E, guarda de Dominus); suíte 79/79 | 12 testes renekton | B2 |
| 2 | 2026-07-29 | B2 | `updateBot` → `castAbility` (mesmo entrypoint humano); bundle `load-v1-bot.js` no build; CPU solo roda V1 com fallback baseline; suíte 80/80 | teste vm do encaminhamento + fallback | revisão Codex |
| 2b | 2026-07-29 | Revisão adversarial Codex | 4 achados maiores tratados: (1) crash com view nula — já coberto pelo B3; (2) **piloto×campeão**: política agora é recriada em `selectChampion2` e o piloto só entra quando o CPU joga de Renekton (sem módulo, V1 roda só o cérebro de arena — default P2 é Zed); (3) **`castAbility` não validava `stunned`** — guarda adicionada, vale para humano e bot pelo mesmo entrypoint; (4) teste vm reforçado (troca de campeão, stun). Menores: `Object.hasOwn` no mapa de slots; fallback exige as duas factories. Aceitos/documentados: strip por regex só suporta ESM simples; bundle V1 sem baseline não publica nada; freeze removido do global. Suíte 85/85 | testes novos de campeão/stun | B3 |
| 3 | 2026-07-29 | B3 | Harness headless `run-cpu-duels.mjs` (vm + stubs, P1 via teclado imitado, mulberry32 seeded em tudo, sem costura em `game/`); guarda de view nula no `think` do V1 (crash real quando o bot morre e o round segue vivo); suíte 85/85 | 100 partidas seed 42: win rate V1 **0%** (0V × 35 baseline × 65 empates por cap de frames); 641 rounds: 0V/41D/600E; sobrevivência à 1ª bomba **22%**; pickups/round **0**; skills disparadas **0** (kit nunca desbloqueia); round médio 72,4s. Diagnóstico raiz: o cérebro baseline trava permanentemente ao ser bloqueado no meio de uma célula (`nearCenter` nunca é alcançado → repete a última direção contra a parede); rounds estouram os 90s com poder empatado → empate; as 41 derrotas são auto-mortes na própria bomba | B4, com o stall de parede como bug prioritário a sanar junto |
| 4 | 2026-07-29 | Stall de parede | `unstickMovement` no V1 (querer andar sem progredir 0,45s → melhor alternativa segura, escrita na memória da arena para persistir entre thinks); baseline congelado como referência (D5); exports `worldFromCell`/`isBlocked`; suíte 88/88 | 100 partidas seed 42: win rate V1 **5%** (5V × 2 baseline × **93 empates**); sobrevivência à 1ª bomba **22% → 95%**; auto-mortes eliminadas (derrotas 41 → 2); round médio 76,6s; skills **0**; pickups/round 0,01. Novo gargalo: rounds estouram os 90s com poder empatado — o V1 não caça o rival travado nem coleta pickups (sem pathfinding), e `resolveTimeout` empata por poder idêntico | B5 (pathfinding: caçar rival + buscar pickups viram vitória no timeout); B4 depois |
| 5 | 2026-07-29 | Pathfinding BFS | `navigate-arena.mjs` (BFS 4-direções + `nextStepToward`, funções puras); navegação por rota quando o objetivo não é escape: orbs de skill próprios → pickup alcançável mais próximo por distância de caminho → célula do rival; passo persiste em `arenaMemory.lastDx/lastDz` + commit curto (0,05s — o commit longo do unstick mataria o `plantBomb` do baseline); `route`/`targetCell` preenchidos na v1-memory; ordem no think: plan → navigate → unstick (stall físico vence o frame); correção de assert latente no verify-cpu-duels (win rate arredondado); suíte 99/99 | 100 partidas seed 42: win rate V1 **5% → 12%** (12V × 2 baseline × **86 empates**); 603 rounds: 13V/3D/587E; pickups/round 0,01 → **0,055**; skills disparadas **0 → 2** (E — kit destravando via orbs); sobrevivência à 1ª bomba 95% → 92,7%; round médio 76,5s; timeouts 100. Diagnóstico: com rota livre o V1 converte empates em vitórias, mas 86% dos rounds ainda estouram os 90s com poder empatado — pickups e rival ficam atrás de crates (`grid 2` bloqueia o BFS) e o V1 não prioriza abrir caminho até o alvo; perseguição colada ao rival também anda na corda bamba do blast sem escape tempo-expandido | B5 (escape tempo-expandido); depois priorizar crate no caminho do alvo |
| 6 | 2026-07-29 | Abrir rota bombardeando crate | `open-route.mjs` (funções puras): `findRouteCrate` — BFS duplo (campo walkable do self + campo crate-passável do alvo), crate que minimiza dist(self→stand) + dist(alvo→crate), com `standCell` = vizinho livre mais próximo do self; `hasBombEscape` — simula a bomba hipotética (fuse 2,35, range do self, passOwners próprio) e exige célula alcançável com `dangerAt == 0` em `dist × s/célula + 0,35s slack < fuse` (s/célula = tile/speed do WorldView, fallback 0,45s); `canPlantRouteBomb` — mesmas travas do baseline (roundAge > 1,4, célula segura, slot de bomba). `navigateObjective`: sem alvo alcançável → `openRouteObjective` (prioridade orb própria > pickup > rival): fora do standCell navega até ele; no crate planta com fuga provada (`lastBombReason = "open-route"`, `targetCell` = crate, `route` até o standCell); sem fuga, recua um passo e espera. Bundle `package-v1-bot.mjs` + 6 testes novos; suíte **105/105** | 100 partidas seed 42: **timeouts 100 → 0** e empates de match **86 → 0**; 427 rounds: 25V/300D/102E; pickups/round 0,055 → **2,65** (~48×); skills disparadas 2 → **372** (Q33/W24/E315 — kit destrava toda partida); round médio 76,5s → **16,9s**; sobrevivência à 1ª bomba 92,7% → 87,5%. **Regressão: win rate 12% → 0%** (0V × 100 baseline). Diagnóstico: o gargalo do timeout está morto — o V1 abre o mapa, coleta e destrava o kit —, mas ao derrubar o muro ele entrega o combate aberto: persegue o rival colado sem escape tempo-expandido e morre cedo para as bombas de pressão do baseline (rounds de 17s). A defesa do V1 não acompanhou o ataque novo | B4/B5 viram bloqueadores: mapa de perigo temporal + escape tempo-expandido antes de mais agressão; depois re-tunar quando engajar o rival |
| 7 | 2026-07-30 | B4+B5 — percepção temporal de perigo | `danger-timeline.mjs` (puro): envelope `{ deadlyFrom, deadlyUntil }` por célula — blast 0,58s (`run-champion-bomb-duel.js:2449`), fuse 2,35 (`:731`), cadeia `other.age = other.fuse` + 1 frame (`:2455`, `:2412-2424`); janelas sobrepostas fundidas (conservador, documentado); `isDeadlyAt`/`safeWindowAfter`/`crossingSurvivable`; `escapePlan` — Dijkstra em (célula, chegada) com espera em célula segura, refúgio = célula segura para sempre, fallback "menos pior" (maior janela) e "hold" (primeiro passo só seguro depois → {0,0}); `safestNeighborStep`. Escape temporal assume TODO frame de perigo (`escapeTemporalDanger`, após `navigateObjective`): o scoring binário do baseline não tem gradiente em corredor. `nextStepToward`: rejeita binária → guarda temporal (atravessa lane fresca quando a travessia cabe; senão `safestNeighborStep`). Prova de fuga temporal para TODO plant: `hasTemporalBombEscape` (escapePlan com bomba hipotética deve achar refúgio) no gate do open-route + `vetoBombWithoutEscape` para plants do baseline. Correções medidas no harness: (1) passo de escape alinhado ao eixo (`escapeStepIntent`) — o passo cardeal cru enroscava no canto da própria bomba (jogo revoga `passOwners` ao sair, `:2042-2046`); (2) `memory.unstickHold` — os planners apagavam o commit de 0,6s do unstick 1 frame depois. Diagnóstico por instrumentação (script temporário, deletado): 84/90 mortes eram bombas open-route próprias (deriva pós-plant do baseline para bolso selado); depois plants-armadilha aprovados pela prova binária (janela temporal selava a saída). Suíte **116/116** | 100 partidas seed 42: **win rate 0% → 100%** (0V×100B → **100V×0B**); rounds 25V/300D/102E → **300V/12D/100E**; sobrevivência à 1ª bomba 87,5% → **100%**; pickups/round 2,65 → **9,52**; skills 372 → **2239** (Q460/W342/E1437); round médio 16,9s → 53,4s (rounds longos: o V1 sobrevive); timeouts 0. Honestidade: vitória sobre o baseline apenas — rounds de 53s indicam que o V1 mata devagar (joga seguro demais?); envelope fundido recusa escapes por brechas entre explosões (conservador); R nunca disparado | B6 (combos Renekton + quando engajar) e re-tunar agressão; B8 (pesos próprios) depois |
