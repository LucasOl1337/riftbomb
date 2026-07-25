# Riftbomb

Protótipo PvP de arena inspirado em Bomberman e League of Legends, construído em um único
HTML autocontido com WebGL2, shaders, áudio sintetizado e campeões jogáveis.

## Executar

Abra `riftbomb-symphony.html` diretamente ou inicie um servidor local nesta pasta:

```powershell
python -m http.server 4177 --bind 127.0.0.1
```

Depois acesse:

```text
http://127.0.0.1:4177/riftbomb-symphony.html
```

## Conteúdo

- `riftbomb-symphony.html`: jogo completo e autocontido.
- `art/`: modelos, texturas, animações e material-fonte dos campeões.
- `tools/model-baker/`: pipeline usado para converter e incorporar os modelos no HTML.
- `references/`: referências visuais utilizadas durante o desenvolvimento.
- `model-ziggs/`: material-fonte do Ziggs.

## Campeões atuais

Katarina, Zed, Renekton, Vladimir e Ziggs.

Projeto de fã não comercial e não endossado pela Riot Games.
