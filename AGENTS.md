# Regra única

Coloque regras e apresentação da partida em `game/`, conteúdo de um campeão em `champions/<nome>/`, preparação de modelos em `champions/prepare-playable-models/`, oponente CPU / políticas de bot em `BOTS/` e material didático em `architecture-course/`; só crie outro módulo quando o histórico mostrar um novo grupo de arquivos mudando junto.

## BOTS (user 2026-07-26)

Planejamento e política do oponente AI: **`BOTS/`**. Bot emite intenções; `game/` valida e aplica as mesmas regras do humano. Sem LLM em runtime. Ver `BOTS/README.md`.

## Art / Imagine (user 2026-07-26)

Arena textures: **`game/Assets/ART-QUALITY.md`**. Bar = product-photo crate detail (planks, grain, braces, nails). Native Imagine only — no upscale. Reference: `game/Assets/raw-imagine/_ref-crate-detail-level.png`. Same bar for ground, walls, props.

## STOP: headless Playwright (user 2026-07-25)

See STOP-HEADLESS-PLAYWRIGHT.md. Do not run hostile-ui Playwright scripts or spawn headless_shell without explicit user permission.

