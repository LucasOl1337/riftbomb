# Riftbomb War Table

> PROTÓTIPO DESCARTÁVEL — não é uma rota de produção e não se conecta ao servidor autoritativo.

Pergunta do experimento: **como montar protocolo, arena e formação antes da partida sem competir visualmente com a arena?**

A War Table é a única direção ativa do laboratório. Command Deck, Rift Cinema, o seletor de variantes e o rodapé de ação global foram aposentados. URLs antigas com `?variant=` abrem a mesma War Table e removem o parâmetro legado.

O estado vive apenas na memória. Modos, Champions, arenas, convite e pareamento são simulações visuais.

## Executar

Na raiz do repositório:

```powershell
npm --prefix online/prototype-riftbomb-design run dev
```

Abra `http://127.0.0.1:4177/`.

## Interações disponíveis

- Escolher entre Partida rápida, Jogar com amigo e Treinamento.
- Selecionar Champion e arena.
- Percorrer o fluxo local `idle → searching → found → ready`.
- Gerar e copiar um link direto de desafio MD10; a URL carrega Champion e arena para o convidado.
- Inspecionar o perfil real do bot `Dominus-01 / V1 Renekton` no Treinamento.
- Cancelar a busca com o botão ou com `Escape`.

## Limites do experimento

- Não importa código de `online/app/`.
- Não altera `game/`, o bundle gerado ou o protocolo online.
- Reutiliza arenas já publicadas em `online/public/client/` e mantém os retratos gerados desta experiência em `assets/champions/`.
- O servidor aceita apenas loopback e não persiste dados.

Versus local, Desafio separado e entrada manual por código foram removidos. O antigo Desafio agora é o fluxo de Jogar com amigo: configura-se uma MD10 e compartilha-se um link direto. A arena não possui bases; os marcadores “Base azul/vermelha” eram semântica inventada pelo protótipo e foram eliminados.

## Referência

O contrato em `DESIGN.md` foi sintetizado para o Riftbomb. A referência estrutural é [ESportsArena](https://designmd.ai/chef/esportsarena), localizada pela API oficial do DesignMD e usada sob licença MIT apenas como comparação de densidade, hierarquia e estados.
