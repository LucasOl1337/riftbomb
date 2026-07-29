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
