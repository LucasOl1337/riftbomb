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

**Bot**:
O controlador de CPU de um contestant na Match (hoje o Red / P2 até handoff humano local).
_Avoid_: NPC genérico, AI agent, enemy script

**Bot policy**:
O algoritmo em `BOTS/` que, a partir de um snapshot da arena, emite intenções (mover, bomba, skill).
_Avoid_: Brain, neural net (salvo se existir de verdade)

**Intent**:
Pedido de ação do bot ainda sujeito às regras da Match.
_Avoid_: Forced action, cheat command
