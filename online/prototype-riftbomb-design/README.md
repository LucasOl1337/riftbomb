# Riftbomb Design Prototype

> PROTÓTIPO DESCARTÁVEL — não é uma rota de produção e não se conecta ao servidor autoritativo.

Pergunta do experimento: **como o shell de entrada do Riftbomb deve parecer e organizar decisões antes da partida?**

O localhost contém três direções estruturais na mesma rota:

- `?variant=command` — Command Deck: console tático denso.
- `?variant=cinema` — Rift Cinema: arena e atmosfera primeiro.
- `?variant=warroom` — War Table: preparação como briefing competitivo.

O estado é inteiramente local e vive apenas na memória. Modos, Champions, arenas e o fluxo de pareamento são simulações visuais.

## Executar

Na raiz do repositório:

```powershell
npm --prefix online/prototype-riftbomb-design run dev
```

Abra `http://127.0.0.1:4177/`.

Use as setas do switcher inferior ou as teclas `←` e `→` quando o foco não estiver em um controle. O URL preserva a variante selecionada para compartilhamento.

## Limites do experimento

- Não importa código de `online/app/`.
- Não altera `game/`, o bundle gerado ou o protocolo online.
- Reutiliza somente as artes já publicadas em `online/public/client/`.
- O servidor aceita apenas loopback e não persiste dados.

