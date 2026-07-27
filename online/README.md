# Riftbomb Online

Aplicação hospedável do Riftbomb com partidas PvP entre dois navegadores.

## Fluxo da partida

- o host cria um lobby e compartilha o código;
- cada jogador escolhe o próprio campeão;
- o host escolhe arena e trilha, inclusive sem música;
- o convidado confirma `READY`;
- a partida online não pode ser pausada;
- o host mantém a simulação autoritativa;
- movimento, ações e snapshots usam canais WebRTC separados.

A API em `app/api/pvp/route.ts` usa D1 apenas para trocar ofertas e respostas
WebRTC temporárias. O estado da partida segue diretamente entre os navegadores.

## Estrutura

- `public/online-duel.js`: lobby, controles independentes e sincronização;
- `public/online-duel.css`: interface responsiva do modo online;
- `app/api/pvp/route.ts`: criação, entrada e encerramento de salas;
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

Versão pública:

https://riftbomb-online.juliherreiro.chatgpt.site
