# Handoff — Treinamento do Bot V1/Renekton

**Data/hora deste registro:** 2026-07-30 08:56 (horário local)
**Sessão:** 2026-07-29 ~21:24 → 2026-07-30 ~09:00 (≈12h, com pausa para deploy)
**PR:** https://github.com/LucasOl1337/riftbomb/pull/7 (branch `feat/bot-v1-renekton-training`, commit `8b617aa`)
**Deploy:** bombpvp.com no ar com o bot treinado (version `fff93875`; `/bot-v1.js` como asset separado)

---

## 1. Objetivo central

Criar o primeiro bot com personalidade do Riftbomb — o **piloto V1**, que controla campeões (primeiro: Renekton) — e treiná-lo iterativamente até jogar bem o suficiente para derrotar humanos. O usuário definiu a estrutura (bot primeiro, campeão dentro: `bot-opponent/v1/renekton/`) e pediu um loop autônomo de ciclos de ~30 min com subagents, revisão adversarial (Codex CLI) e medição contínua de performance.

## 2. O que foi decidido

- **Estrutura de módulos (D10, `bot-opponent/decisions.md`):** `bot-opponent/v1/` guarda personalidade, planejamento e memória comum do piloto; `bot-opponent/v1/renekton/` guarda kit, combos e memória tática. Próximos campeões entram como `v1/<campeão>/`; um `v2/` só quando houver nova geração. Baseline congelado como referência (D5).
- **Sem ML:** política clássica (heurísticas + busca). Grid pequeno, offline, determinismo (D2).
- **O bot nunca trapaceia (D3):** só emite intenções (`{ dx, dz, plantBomb, skill }`) que passam pelo mesmo `castAbility`/`placeBomb` do input humano.
- **Memória ≠ mundo (D9):** Fury, cooldowns, vida vêm do WorldView; memória é do controlador.
- **Orçamento online:** o jogo empacotado para o bombpvp.com tem teto de 750 KB; o bundle do V1 (72 KB) vai como **asset separado** `/bot-v1.js`, fora do payload inicial.

## 3. O que foi implementado (16 ciclos, log completo em `bot-opponent/v1/training-loop.md`)

| Peça | Onde | O que faz |
|---|---|---|
| Integração | `game/run-champion-bomb-duel.js` | `updateBot` → `castAbility(slot, bot)`; política criada por campeão do CPU; fallback baseline |
| Harness | `bot-opponent/v1/run-cpu-duels.mjs` | CPU-vs-CPU headless (vm), seed determinística, métricas JSON; flag `--opponent v1` (self-play) e `--aggression` |
| Percepção temporal | `v1/danger-timeline.mjs` | Quando cada célula fica mortal/segura (fuse 2,35s, blast 0,58s, cadeia +1 frame — valores do jogo) |
| Escape | `escapePlan` (idem) | Dijkstra em (célula × tempo) com espera em célula segura |
| Navegação | `v1/navigate-arena.mjs` | BFS; alvos: orb de skill própria > pickup > rival |
| Abrir rota | `v1/open-route.mjs` | Bombardeia o crate que bloqueia a rota do alvo, só com fuga temporal provada |
| Unstick/unwedge | `v1/plan-arena-actions.mjs` | Recupera de stall de parede e de congelamento pós-dash |
| Kit Renekton | `v1/renekton/` | Combos E→(R)→W→Q→Dice, Dominus no engage, mira por facing, reconciliação de cast rejeitado, gates de pouso livre do dash |
| Modelo do rival | `v1/read-rival.mjs` | Heat map, hábitos de fuga/bomba (inerte vs baseline — medido) |
| Personalidade | `v1/personality.mjs` + `v1/advantage.mjs` | Eixo agressão (neutro por medição) + engage condicionado a vantagem |
| Online | `online/scripts/package-riftbomb.mjs` | V1 como asset `/bot-v1.js` + tag externa; `createBotPolicy` intacto |

## 4. Métricas finais (100 partidas, seed 42, reproduzidas pelo supervisor)

- **vs baseline: 100V×0B, zero derrotas em rounds** (era 0% no início). Sobrevivência à 1ª bomba 100%. R/Dominus em uso real.
- **Self-play (V1×V1 sem kit): 60V×40B.**
- Suíte: **187/187 verde** (`npm test` na raiz); online 39/39; server 1/1.

## 5. Pendências

- **Merge do PR #7** (usuário decide). Depois do merge, novo deploy a partir da `main` se desejado.
- **Playtest humano:** o V1 nunca enfrentou humanos. Treinamento → rival CPU Renekton no bombpvp.com (ou `riftbomb.html` local). Registrar notas no training-loop.
- **Working tree:** ficaram de fora do commit `learning-records/` e `artifacts/landing-*` (trabalho da sessão paralela do usuário).
- **1 derrota de round residual** em seed 42 (bot descongelado se expõe) — anotada no log do ciclo 15.

## 6. Riscos e pontos de atenção

- **Baseline é oponente fraco** (trava em paredes): 100% contra ele ≠ força real. A régua honesta é o self-play (60×40) e, em breve, humanos.
- **Fracos prováveis contra humanos** (anotados no log): conservadorismo do escape temporal (prefere não agir a arriscar), hesitação de ~1s entre skills fora de combo.
- **`dice-exit`** é o único dash sem gate de pouso livre (decisão documentada, ciclo 14) — primeiro suspeito se uma morte por wedge reaparecer.
- **Strip por regex** no empacotador do bundle (`package-v1-bot.mjs`) só suporta ESM simples (imports de 1 linha, exports nomeados) — limitação aceita e documentada.
- **Repo com sessões paralelas:** o usuário trabalha em outra sessão nos mesmos arquivos (`run-champion-bomb-duel.js`, `online/`). Antes de editar, sempre reler o arquivo.
- **Gate de geografia:** máx. 3 níveis de diretório; sem pastas-folha de 1 arquivo (por isso DocsDev tem README + handoff); `docs/` é isento, `DocsDev/` não.

## 7. Próximos passos recomendados

1. Playtest humano registrado (protocolo simples de notas no training-loop).
2. Se retomar o treino: nova goal + heartbeat de 30 min (cron `7,37 * * * *`, prompt no histórico da sessão); próximos fios: agressão condicionada por leitura de humano, modelo do rival contra oponente móvel (self-play), kill speed.
3. Certificação multi-seed (42 + 7 + 1 nova) como padrão — evita overfitting de seed.
4. Considerar `v1/katarina/` como segundo campeão para testar a plugabilidade da estrutura (D10).

## 8. Como continuar (mapa rápido para o próximo agente)

- **Ler primeiro:** `bot-opponent/v1/training-loop.md` (protocolo + log dos 16 ciclos), `bot-opponent/decisions.md` (D1–D10), `bot-opponent/README.md` (mapa do módulo).
- **Rodar tudo:** `npm test` (raiz; inclui build). Harness: `node bot-opponent/v1/run-cpu-duels.mjs --matches 100 --seed 42` (≈25–40 min; rodar em background).
- **Nunca:** Playwright headless (`STOP-HEADLESS-PLAYWRIGHT.md`); editar `riftbomb.html`/`game/load-*.js` à mão (gerados); commitar/push sem pedido explícito do usuário.
- **Build:** `npm run build` regenera `riftbomb.html` + bundles; o bundle V1 é montado por `bot-opponent/package-v1-bot.mjs` (constantes top-level precisam de prefixo — o bundle divide escopo).
- **Deploy:** `cd online && npm run deploy:build` (build verificado + wrangler → bombpvp.com).
