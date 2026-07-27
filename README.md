# Riftbomb

Protótipo PvP de arena inspirado em Bomberman e League of Legends, com WebGL2, áudio
sintetizado e cinco campeões jogáveis: Katarina, Zed, Renekton, Vladimir e Ziggs.

## Jogar

`riftbomb.html` é o jogo completo e autocontido. Abra o arquivo diretamente ou sirva esta
pasta:

```powershell
python -m http.server 4177 --bind 127.0.0.1
```

Depois acesse `http://127.0.0.1:4177/riftbomb.html`.

## PvP online

A versão publicada com lobby por código, seleção independente de campeão,
mapa e trilha fica em `online/`. O host controla a simulação e os navegadores
trocam comandos e snapshots por WebRTC; a API mantém apenas a sinalização
temporária das salas.

Jogue em:

https://riftbomb-online.juliherreiro.chatgpt.site

Para validar a aplicação hospedável:

```powershell
cd online
npm ci
npm test
```

## Mudar o jogo

`game/play-riftbomb.html` é a entrada editável. Ela declara a ordem dos módulos; o build
descobre essa ordem, empacota os modelos e gera `riftbomb.html`. A página costura módulos nomeados pela
capacidade que entregam:

- `show-champion-duel.css`: apresentação da partida.
- `animate-bomber-rift-background.js`: fundo vivo da arena.
- `draw-bomber-rift.js`: WebGL, modelos e efeitos.
- `play-rift-soundtrack.js`: música e efeitos sonoros.
- `present-champion-bomb-duel.js`: apresentação da partida no navegador.
- `run-champion-bomb-duel.js`: regras, campeões, bombas, CPU embutido (baseline) e placar.
- `start-champion-duel.js`: controles e início da partida.

Oponente AI (requisitos, plano e políticas futuras): `BOTS/`.

Gere novamente o HTML autocontido e rode os gates:

```powershell
npm test
```

## Mudar um campeão

Cada campeão concentra modelo jogável, arquivos extraídos, ícones e evidências no próprio
nome:

- `champions/katarina/`
- `champions/zed/`
- `champions/renekton/`
- `champions/vladimir/`
- `champions/ziggs/`

`champions/prepare-playable-models/` é a entrada para converter, assar, inspecionar e
empacotar esses modelos. `bake-playable-champion.mjs` recebe o nome do campeão e preserva
as diferenças de poses dentro de uma única implementação. O material do curso de arquitetura começa em
`architecture-course/course-map.html`.

Projeto de fã não comercial e não endossado pela Riot Games.
