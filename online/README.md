# Riftbomb Online

Aplicação hospedável do Riftbomb com partidas PvP entre dois navegadores.

## Fluxo da partida

- `Partida rápida` procura automaticamente um rival e joga uma melhor de 3;
- `Jogar com amigo` trava a formação e a arena em uma melhor de 10 e gera um link direto;
- o convidado abre o link e ocupa o segundo lugar sem digitar código ou confirmar uma etapa intermediária;
- `Treinamento` inicia uma sessão local contra o V1 Renekton (`Dominus-01`);
- a partida online não pode ser pausada;
- a Oracle em São Paulo mantém a simulação autoritativa a 60 ticks/s;
- os dois jogadores enviam comandos por WebSocket e recebem snapshots a 30 Hz.

A API em `app/api/pvp/route.ts` usa D1 para reservar os identificadores internos dos convites.
Esses códigos continuam no protocolo, mas não fazem parte da interface pública.
O Worker encaminha `/game-ws` ao servidor em `server/`; nenhum navegador é dono
do relógio, bombas, dano, placar ou transições de rodada.

## Estrutura

- `app/page.tsx`: War Table de produção, seleção e entrada na partida;
- `app/war-table.css`: sistema visual responsivo da montagem pré-partida;
- `public/online-duel.js`: bridge interna de comandos e sincronização do runtime;
- `public/online-duel.css`: somente alertas operacionais do runtime;
- `app/api/pvp/route.ts`: criação, entrada e encerramento de salas;
- `server/`: motor headless, protocolo WebSocket e instalação na Oracle;
- `scripts/package-riftbomb.mjs`: divide o `riftbomb.html` da raiz em partes
  para carregamento;
- `tests/`: verificações da War Table, do protocolo e do HTML renderizado.

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
