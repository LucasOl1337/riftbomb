# Riftbomb

Protótipo PvP de arena inspirado em Bomberman e League of Legends, com WebGL2,
efeitos de combate procedurais e cinco campeões jogáveis: Katarina, Zed,
Renekton, Vladimir e Gangplank.

## Jogar

`riftbomb.html` é o jogo completo e autocontido. Abra o arquivo diretamente ou sirva esta
pasta:

```powershell
python -m http.server 4177 --bind 127.0.0.1
```

Depois acesse `http://127.0.0.1:4177/riftbomb.html`.

## PvP online

A versão publicada com lobby por código e seleção independente de campeão e
mapa fica em `online/`. O servidor autoritativo executa a partida mesmo quando
o host minimiza ou fecha a aba; os dois navegadores enviam apenas comandos e
recebem snapshots simétricos.

Jogue em:

https://bombpvp.com

Fallback Workers: https://riftbomb-online.lucasplays2000.workers.dev

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
- `play-rift-sfx.js`: efeitos procedurais de combate.
- `present-champion-bomb-duel.js`: apresentação da partida no navegador.
- `run-champion-bomb-duel.js`: regras, campeões, bombas, CPU embutido (baseline) e placar.
- `start-champion-duel.js`: controles e início da partida.

Oponente controlado pelo computador: `bot-opponent/`.

A aparência e os temas da arena ficam em `game/arena-appearance/`; sua entrada de
empacotamento é `package-arena-appearance.mjs`.

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

`champions/prepare-playable-models/` é a entrada para converter, assar, inspecionar e
empacotar esses modelos. `bake-playable-champion.mjs` recebe o nome do campeão e preserva
as diferenças de poses dentro de uma única implementação. O material do curso de arquitetura começa em
`architecture-course/course-map.html`.

Para reimportar o roster base diretamente do Khada Model Viewer, extrair as texturas e
assar **todos** os clips de cada GLB no runtime VAT:

```powershell
node champions/prepare-playable-models/import-modelviewer-roster.mjs
```

Também é possível importar somente campeões específicos passando seus nomes, por exemplo
`zed renekton`. O comando exige ImageMagick (`magick`) para gerar os atlas WebP, grava a
origem exata no metadata e executa a verificação de integridade após cada campeão.

Projeto de fã não comercial e não endossado pela Riot Games.
