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

## Mudar o jogo

`game/play-riftbomb.html` é a entrada editável. Ela costura seis módulos nomeados pela
capacidade que entregam:

- `show-champion-duel.css`: apresentação da partida.
- `animate-bomber-rift-background.js`: fundo vivo da arena.
- `draw-bomber-rift.js`: WebGL, modelos e efeitos.
- `play-rift-soundtrack.js`: música e efeitos sonoros.
- `run-champion-duel.js`: regras, campeões, bombas, CPU e placar.
- `start-champion-duel.js`: controles e início da partida.

Gere novamente o HTML autocontido e rode os gates:

```powershell
npm test
```

Projeto de fã não comercial e não endossado pela Riot Games.
