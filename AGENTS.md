# Regra de localização

Coloque coisa nova na capacidade com que ela muda: partida offline em `game/`, aparência da arena em `game/arena-appearance/`, oponente CPU em `bot-opponent/`, conteúdo de campeão em `champions/<nome>/`, preparação de modelos jogáveis em `champions/prepare-playable-models/`, PvP publicado em `online/` e curso em `architecture-course/`; só crie outro módulo quando o histórico mostrar um novo grupo de arquivos mudando junto.

## Convenções do esqueleto de produto

1. `game/play-riftbomb.html` registra módulos editáveis; `riftbomb.html` e loaders gerados não são editados à mão.
2. `bot-opponent/` percebe o mundo e emite intenções; somente `game/` valida e aplica ações humanas ou de CPU.
3. Em `online/server/`, `server.mjs` cuida de HTTP/WebSocket e `authoritative-rooms.mjs` cuida do relógio, ciclo de vida e snapshots das salas.
4. Cada fluxo publicado mantém um único transporte ativo; fallback só permanece com entrada registrada e teste que o exercita.
5. Mudanças no jogo rodam `npm test`; mudanças online rodam também `npm test` em `online/` e `online/server/`, sem Playwright headless.

## STOP: headless Playwright

Veja `STOP-HEADLESS-PLAYWRIGHT.md`. Não execute scripts hostile-ui nem inicie `headless_shell` sem permissão explícita do usuário.

## Produção = bombpvp.com (não “só local”)

O produto que o usuário confere é **https://bombpvp.com**, não só `riftbomb.html` / pasta local.

### Quando o trabalho NÃO está pronto

Se a mudança afeta o que o jogador **vê, ouve ou joga** no site (SFX, VFX, UI, client online, empacotamento do jogo, War Table, assets em `online/public/`, regras consumidas pelo client), **não encerre** com “pronto no repo / passou teste”. Isso ainda é só local até ir pro ar.

### Checklist obrigatório nesses casos

1. Testar no source (`npm test` / suites relevantes — SFX/explosão: `game/verify-rift-sfx.test.mjs`, `game/verify-cinematic-explosion.test.mjs`).
2. Empacotar e **publicar**: em `online/`, rodar `npm run deploy:build` (build verificado + wrangler → bombpvp.com). Exige `wrangler login` ou `CLOUDFLARE_API_TOKEN`.
3. **Provar no ar** antes de declarar feito:
   - Ler `https://bombpvp.com/riftbomb-parts/manifest.json` e confirmar que o `sha256` / `partsPath` mudou.
   - Baixar o(s) `part-XX` e buscar markers do patch (string/constante nova).
   - Hard refresh no browser do usuário ainda pode cachear; o proof é o artifact live, não a sensação do agente.
4. Mudança só de regras autoritativas / servidor de partida: Worker **e** Oracle (São Paulo) quando o guia do repo exigir deploy coordenado — client sozinho não basta se a simulação mudou.
5. Se o usuário **não** pediu deploy e a mudança é claramente WIP interno (docs, curso, experimento), diga explicitamente que **não** foi publicado; caso contrário, **publique**.

### Erro a não repetir

Integrar som/VFX/assets no source e deixar o usuário achar no bombpvp.com o comportamento antigo = falha de entrega. “Funciona no working tree” ≠ “está no ar”.

---

## Explosão da bomba (conceitos + regras)

A bomba da arena é **cruz Bomberman** (corredor cardinal), não uma esfera radial. Visual e áudio precisam fechar juntos; pós-process radial e rabo de sample longos quebram a leitura.

### Ciclo de vida visual (fonte da verdade)

Em `game/run-champion-bomb-duel.js` → `explodeBomb`:

| Conceito | Valor | Onde |
|----------|--------|------|
| Células de blast | `blasts[]` com `core` + braços `dr/dc` | `explodeBomb` |
| **Duração da animação** | **`life: 0.72`** | cada blast cell |
| Remoção | `age >= life` no update | o fogo some do tabuleiro |
| Desenho | `RIFTBOMB_BOMB_APPEARANCE.drawExplosion` | `draw-black-bomb.js` |
| Partículas GPU | `renderer.drawExplosionBurst` (cruz, não nuvem radial) | `draw-bomber-rift.js` |

Fases aproximadas (`phase = age / life`, life = 0.72 s):

- **0–10%** (~0–0,07 s): flash de ignição
- **~5–85%**: fogo / pico da cruz
- **~45–100%**: fumaça e saída

Se mudar `life`, **atualize o áudio na mesma mudança** (`visualLife` / default no sample path).

### Áudio da explosão (sample de arena)

| Conceito | Regra |
|----------|--------|
| Sample | FreeSound **#741173** “Big Explosion” (qubodup, **CC0**) |
| Arquivo fonte | `game/arena-appearance/audio/arena-bomb-explosion.mp3` |
| Proveniência | `game/arena-appearance/audio/PROVENANCE.md` |
| Bundle | `package-arena-sfx.mjs` → `load-arena-sfx.js` (`RIFTBOMB_ARENA_SFX_SOURCES`) |
| Runtime | `play-rift-sfx.js` profile **`arena`**: toca sample se decodificado; senão synth |
| **Duração de playback** | **≤ life visual (0,72 s)** — nunca deixar o sample de 3+ s tocar inteiro |
| API | `playExplosionAt(..., { sourceId, visualLife: 0.72 })` |
| Chain / secondary | janela mais curta (~0,48 s) para não empilhar rabo |
| Champions | profiles (`powder`, `shadow`, `blood`, …) continuam sintéticos / banks próprios |

**Regra de ouro:** quando a animação da blast some, o som da explosão também some. Arquivo longo no disco é ok; o **envelope de playback** é que importa.

Build: `npm run build:arena-appearance` inclui `package-arena-sfx.mjs`. O `assemble-riftbomb.mjs` embute `load-arena-sfx.js` via script em `play-riftbomb.html` (antes de `play-rift-sfx.js`).

### Impacto de câmera vs anel circular (post FX)

Dois helpers no renderer (`draw-bomber-rift.js`):

| API | Efeito | Usar quando |
|-----|--------|-------------|
| **`addImpact(strength)`** | só `cameraShake` + `hitPulse` | bomba, caixote quebrado, qualquer hit que **não** deve ler como onda radial |
| **`addShock(x, z, strength)`** | impact **+** anel dourado pós-process (`uShock*`, `shockWarp`) | skills/impacto pontual onde o anel é desejável |

**Proibido na detonation da bomba da arena:**

- `addShock` em `explodeBomb` (use `addImpact`)
- `addShock` em `destroyBreakable` — caixotes morrem o tempo todo nos braços da cruz; cada `addShock` recria o “raio circular dourado”

Testes: `game/verify-cinematic-explosion.test.mjs`, `game/verify-rift-sfx.test.mjs`.

### Hitbox ↔ visual (HITBOX_VISUAL_MATCH_V1)

| Eixo | Regra |
|------|--------|
| **Células letais** | As mesmas `blasts[]` desenhadas (`r,c` por célula da cruz) |
| **Alcance** | `1..bomb.range` por eixo, para em parede (`grid===1`) e caixote (`grid===2`) |
| **Tempo** | Dano **enquanto** `blast.age < blast.life` (0,72 s), não só no frame da detonation — `applyActiveBlastDamage()` no `update` |
| **Espaço** | Partículas GPU clampadas ao AABB da célula (`±0.49 * tile` do centro); sparks CPU com `homeHalf` |
| **Teste** | `verify-cinematic-explosion.test.mjs` (walk-in mid-life + clamp shader) |

Desalinhamentos proibidos: fogo pintado em célula segura; célula letal sem fogo; dano one-shot com fogo ainda no chão.

### Visual = 100% partículas (PARTICLES_ONLY_V1)

A explosão da bomba **não** desenha mesh de fogo:

| Proibido na `drawExplosion` | Motivo |
|-----------------------------|--------|
| `cube` heat bed / smoke / debris | lê como **retângulo** no chão e no ar |
| `fxPlate` / Imagine plates | sticker retangular semi-transparente |
| `sphere` sparks via `renderer.draw` | mesh, não o campo GPU |

**Permitido:** só `renderer.drawExplosionBurst` (points GPU, smoke + fire).
Marker: `PARTICLES_ONLY_V1` em `draw-black-bomb.js`.
Densidade: `burstSmokeCount` / `burstFireCount` no renderer (sem mesh para “preencher”).

CPU `spawnCorridorParticles` no `explodeBomb` continua como soft points do sistema de partículas — não mesh cubes.

### Paleta de fogo — sem borda vermelha (NO_RED_RIM_V1)

A cruz de fogo deve ser **âmbar / laranja / amarelo**. Vermelho sangue nas bordas é bug visual.

| Fonte do bug | Por que parece “borda vermelha” |
|--------------|----------------------------------|
| Burst GPU cool color deep red | Partículas moribundas + soft point additive = franja vermelha |
| Heat bed `DEEP_RED` em `drawFireBar` | Laje vermelha sob o sheet |
| Sparks / corridor particles `[0.55, 0.06, 0.01]` | Camada vermelha nos braços |

**Regras:**

- Cool end do ramp = **dark amber** (g ≥ ~0,12), nunca blood red (g ≈ 0).
- Fragment do burst: falloff apertado + clamp `body.r` vs `body.g`.
- Partículas de corridor: só laranja/âmbar/fumaça.
- Marker de código: `NO_RED_RIM_V1` em `draw-bomber-rift.js`, `draw-black-bomb.js`, `explodeBomb`.
- Testes: sem camada blood-red; shader sem cool tail legado `vec3(0.42, 0.05, 0.008)`.

### Empacotamento online do jogo

1. `npm run build` na raiz (arena + sfx + `riftbomb.html` monólito).
2. `online/scripts/package-riftbomb.mjs` fatia em `/riftbomb-parts/<sha>/part-XX`.
3. `online` `deploy:build` sobe Worker + assets para bombpvp.com.
4. Client carrega via `public/riftbomb-loader.js` + manifest (hash).

Mudou SFX/VFX/regras de client → **novo sha no manifest live** ou o patch não existe no ar.

### Checklist rápido “mudei a explosão”

- [ ] Visual ainda é cruz (sem bola branca / sem anel radial de post / sem borda vermelha)
- [ ] `blasts[].life` e `visualLife` / duration do sample batem
- [ ] Bomba e caixote usam `addImpact`, não `addShock`
- [ ] Paleta só âmbar/laranja (marker `NO_RED_RIM_V1`)
- [ ] `npm test` (ou pelo menos verify-cinematic-explosion + verify-rift-sfx)
- [ ] `cd online && npm run deploy:build`
- [ ] Manifest live com hash novo + marker no part

### Erros já cometidos (não repetir)

1. Sample/VFX só no working tree → site antigo no bombpvp.com.
2. Cortar `addShock` só na bomba e deixar caixote com `addShock` → anel volta no blast real.
3. Tocar sample de vários segundos enquanto o blast vive 0,72 s → áudio “atrasado” / rabo.
4. Declarar pronto sem provar o artifact em `https://bombpvp.com/riftbomb-parts/manifest.json`.
5. Cool fire / heat bed em vermelho profundo → “borda vermelha” na explosão.
6. Cubes/plates na explosão “para legibilidade” → retângulos óbvios; use só partículas GPU.
