# Riftbomb Online

Aplicação hospedável do Riftbomb com partidas PvP entre dois navegadores.

## Fluxo da partida

- o host cria um lobby e compartilha o código;
- cada jogador escolhe o próprio campeão;
- o host escolhe a arena;
- o convidado confirma `READY`;
- a partida online não pode ser pausada;
- a Oracle em São Paulo mantém a simulação autoritativa a 60 ticks/s;
- os dois jogadores enviam comandos por WebSocket e recebem snapshots a 30 Hz.

A API em `app/api/pvp/route.ts` usa D1 para reservar códigos e links de convite.
O Worker encaminha `/game-ws` ao servidor em `server/`; nenhum navegador é dono
do relógio, bombas, dano, placar ou transições de rodada.

## Estrutura

- `app/page.tsx`: único frontend de lobby, seleção e entrada na partida;
- `public/online-duel.js`: bridge interna de comandos e sincronização do runtime;
- `public/online-duel.css`: somente alertas operacionais do runtime;
- `app/api/pvp/route.ts`: criação, entrada e encerramento de salas;
- `server/`: motor headless, protocolo WebSocket e instalação na Oracle;
- `scripts/package-riftbomb.mjs`: divide o `riftbomb.html` da raiz em partes
  para carregamento;
- `tests/`: verificações do lobby e do HTML renderizado.

## Desenvolvimento

Requer Node.js `>=22.13.0`.

```sh
npm ci
npm run dev
```

Validação completa:

```sh
npm test
```

## Produção

- **https://bombpvp.com** — Cloudflare Workers + D1 + Oracle São Paulo
- Fallback: https://riftbomb-online.lucasplays2000.workers.dev

Deploy (com `wrangler login` ou `CLOUDFLARE_API_TOKEN`):

```sh
npm run build
npm run deploy
```

Rebuild + deploy em um passo:

```sh
npm run deploy:build
```

O Worker `riftbomb-online` usa a base D1 `riftbomb-online` e o custom domain `bombpvp.com`.
