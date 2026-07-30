# Guia consolidado de desenvolvimento do Riftbomb

Atualizado em **2026-07-30 08:47:22 -03:00**.

## Produto e objetivo de qualidade

Riftbomb é um protótipo de arena PvP inspirado em Bomberman e League of
Legends, com WebGL2, cinco campeões jogáveis, partida offline autocontida e PvP
com servidor autoritativo. É um projeto de fã não comercial e não endossado
pela Riot Games.

O programa de qualidade atual trabalha em uma melhoria por rodada, usando
comparação visual/mecânica, evidências e revisão adversarial. A meta do usuário
é atingir pelo menos **90/100 em cada dimensão**, não uma média. O último placar
publicado é:

| Dimensão | Nota publicada | Gargalo principal |
|---|---:|---|
| Gráficos | 72/100 | casts, sombras e três arenas com materiais anteriores |
| Som | 74/100 | teste auditivo, mix medido e material original mais rico |
| Mecânicas | 62/100 | fidelidade fina dos kits e resolução simultânea |
| Netcode | 78/100 | rotação de bearer, reconciliação/clock adaptativos e redes físicas |
| Fluidez | 63/100 | p95/p99, matriz física, locomoção do Zed e catálogo VAT síncrono |

A rodada 15 está local e não altera esse placar até ser concluída, publicada e
marcada como `verified_live` no ledger.

## Geografia obrigatória

- Partida offline e regras compartilhadas: `game/`.
- Aparência da arena: `game/arena-appearance/`.
- Oponente CPU: `bot-opponent/`; ele percebe o mundo e emite intenções.
- Conteúdo de campeão: `champions/<nome>/`.
- Preparação de modelos: `champions/prepare-playable-models/`.
- PvP e publicação: `online/`.
- Curso: `architecture-course/`.

Somente `game/` valida e aplica ações humanas ou do CPU. Em produção,
`online/server/src/server.mjs` trata HTTP/WebSocket e
`authoritative-rooms.mjs` trata relógio, ciclo de vida e snapshots.

## Fontes editáveis e artefatos gerados

- `game/play-riftbomb.html` registra os módulos editáveis.
- `riftbomb.html` é gerado por `npm run build`; não editar à mão.
- `online/public/riftbomb.html`, `online/public/riftbomb-parts/manifest.json` e
  as partes fingerprinted são gerados pelo empacotamento online.
- Alterou código embutido? Refaça primeiro o build raiz e depois o pacote
  online, ou os testes byte-for-byte acusarão artefato stale.

## Regras de QA e segurança

- É proibido executar `headless_shell`, Playwright headless ou recriar os
  antigos testes hostile-ui sem autorização explícita do usuário na mesma
  mensagem.
- Para UI, use navegador visível, console real e screenshots.
- O protocolo `comparar-qa` mantém o ledger em
  `docs/qa/comparar-qa/matriz.md`; screenshots e traces pesados ficam fora do
  Git em `artifacts/comparar-qa/`.
- Uma cena não vira `verified_live` sem build publicado, evidência live e gates
  compatíveis com o escopo.

## Gates mínimos

Na raiz:

```powershell
npm test
```

Para mudança online:

```powershell
cd online
npm test
cd server
npm test
```

Lint online confiável no Windows/WSL quando o script encontra um ESLint global
antigo:

```powershell
cd online
node node_modules/eslint/bin/eslint.js . --ignore-pattern dist --ignore-pattern .next
```

Também execute `git diff --check`. Não use Playwright headless como gate.

## Topologia de produção

```text
browser
  -> wss://bombpvp.com/game-ws
  -> Cloudflare Worker + D1
  -> Oracle São Paulo
  -> Game compartilhado a 60 ticks/s
  -> snapshots a 30 Hz
```

Domínio: <https://bombpvp.com>. Fallback:
<https://riftbomb-online.lucasplays2000.workers.dev>.

O Worker e a Oracle compartilham as regras de `game/`. Mudanças mecânicas nessa
camada exigem deploy coordenado dos dois lados; o protocolo atual não negocia
feature/versionamento de regras.

## Documentos operacionais

- Ledger e placar: `docs/qa/comparar-qa/matriz.md`.
- Regras de combate: `game/combat-system.md`.
- Empacotamento/publicação: `online/README.md`.
- Runtime autoritativo: `online/server/README.md`.
- Barra visual: `game/arena-appearance/ART-QUALITY.md`.
- Estado incompleto mais recente:
  `DocsDev/HANDOFF-2026-07-30-0847-BRT-RIFTBOMB-ROUND-15.md`.
