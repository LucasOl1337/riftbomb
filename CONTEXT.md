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
