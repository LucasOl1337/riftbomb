# Riftbomb

Riftbomb é uma disputa de arena entre campeões, resolvida em rounds e distribuída como um jogo offline autocontido.

## Language

**Champion**:
O lutador escolhido para disputar uma Match, com aparência e habilidades próprias.
_Avoid_: Character, hero

**Match**:
A disputa completa entre dois Champions, vencida pelo primeiro a ganhar três Rounds.
_Avoid_: Game, session

**Round**:
Uma disputa dentro da arena que concede um ponto da Match a um Champion ou termina empatada.
_Avoid_: Wave, level

**Playable model**:
A representação visual compacta de um Champion, incluindo geometria, poses e textura prontas para a arena.
_Avoid_: Asset bundle, baked model

**Offline game**:
O HTML autocontido e versionado que pode ser aberto diretamente para jogar Riftbomb.
_Avoid_: Build, release page

**Offline publication**:
O módulo que transforma o Offline game, emite seus assets e conecta a cadeia de boot por hashes de conteúdo.
_Avoid_: Packaging script, copy step

**Match continuity**:
O módulo client que preserva credenciais, reconexão, entrega confiável e bootstrap de uma Match publicada.
_Avoid_: Online UI, socket helper

**Authoritative room**:
O módulo server que possui assentos, fila, retomada, relógio e snapshots de uma Match online; HTTP/WebSocket é apenas seu adaptador de transporte.
_Avoid_: WebSocket handler, room map

**Bot**:
O controlador de CPU de um contestant na Match (hoje o Red / P2 até handoff humano local).
_Avoid_: NPC genérico, AI agent, enemy script

**Bot policy**:
O algoritmo em `bot-opponent/` que, a partir de um snapshot da arena, emite intenções (mover, bomba, skill).
_Avoid_: Brain, neural net (salvo se existir de verdade)

**Intent**:
Pedido de ação do bot ainda sujeito às regras da Match.
_Avoid_: Forced action, cheat command
