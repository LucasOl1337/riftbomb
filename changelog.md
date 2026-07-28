# Changelog — Riftbomb

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [2026-07-27] — duelo e score safe commit

### Added

- Gangplank no catálogo de campeões, nomes de kit e apresentação do duelo.
- Miniaturas das arenas construídas a partir da grade/tema reais.
- Estado de skills bloqueadas no início e mensagens acessíveis de alcance/participantes.
- Documentação das três trilhas originais aprovadas e seus samples compartilhados.
- Testes que fixam cinco campeões e exatamente três estilos de trilha.
- Fixture de performance online e cobertura do encerramento antecipado da espera por ICE.

### Changed

- Red side passa a usar Gangplank e os textos/placar descrevem o participante real.
- Seleção e runtime de música usam Silver Thread, Blood Moon e Skyglass, com Silver Thread como fallback.
- Planejamento/percepção do bot passam a exigir kit específico do campeão e estado `skillsUnlocked`.
- Metadados, controles, ARIA e aviso de protótipo fã foram atualizados no HTML principal e no build em `game/`.
- `online-duel.js` encerra a espera quando encontra candidate ICE utilizável, em vez de consumir o timeout inteiro.
- `.gitattributes` fixa LF para scripts shell usados pelo build verificado.
- Empacotador online usa shell compatível com Windows/Node 24 e aplica suas adaptações sobre o HTML atual.
- Lobby online remove referências restantes a Ziggs e mantém P2 selecionável entre os cinco campeões vigentes.

### Removed

- Previews antigos de Katarina e Zed.
- Reconstrução experimental completa e referências de Ziggs.
- Faixas aposentadas do seletor de score; o banco de samples reutilizado foi preservado.

### Repository state

- Base auditada: `origin/main@cf65d6c`, sem commits divergentes ou conflitos.
- Delta antes desta documentação: 46 arquivos, +264/−25.557.
- Commit concorrente preservado: `2e9af59` (`perf(online): stop ICE wait after usable candidate`).

### Validation

- `npm test`: build do HTML offline e 19/19 testes aprovados.
- Empacotamento em 10 partes, `vinext build` e suíte online: 4/4 testes aprovados.
