# Patch Notes — Riftbomb

## 2026-07-27 — duelo consolidado e trilha aprovada

**Comparação:** PC e `origin/main` partiam de `cf65d6c`. Durante a consolidação, outro agente acrescentou `2e9af59` na mesma branch; o commit foi auditado e preservado. A árvore de jogo local altera 46 arquivos, com 264 inserções e 25.557 remoções, além dos 3 arquivos do ajuste online.  
**Branch de publicação:** `agent/2026-07-27-safe-commit`.  
**Conflitos:** nenhum após `fetch`.

### O que muda no jogo

- O duelo passa a apresentar cinco campeões jogáveis — Katarina, Zed, Renekton, Vladimir e Gangplank — com Red Gangplank como oponente/jogador 2 explícito.
- Skills começam bloqueadas e são liberadas por drops; nomes e planejamento do bot usam o kit do campeão real, sem inventar habilidades genéricas.
- O placar, subtítulo, acessibilidade do canvas e instruções de controles refletem os dois participantes e a corrida até três vitórias.
- A seleção de arenas recebe miniaturas temáticas derivadas da grade real, incluindo chão, pedras, caixas e spawns azul/vermelho.
- A trilha é reduzida às três composições aprovadas: Silver Thread, Blood Moon e Skyglass. O gerador e o runtime compartilham a mesma lista para não reintroduzir faixas aposentadas.
- O lobby online deixa de aguardar o timeout completo de ICE assim que já existe um candidate utilizável, reduzindo a latência de conexão; fixture e teste de fonte acompanham a otimização.
- O empacotador online e o seletor do convidado foram reconciliados com a remoção de Ziggs: ambos usam o catálogo atual de cinco campeões e Gangplank como fallback.

### Limpeza deliberada

Foram removidos previews antigos de Katarina/Zed e todo o pacote de reconstrução experimental de Ziggs (JSONs, renders, crops e artes de referência). Essa limpeza explica quase todas as 25 mil linhas removidas; o banco de samples compartilhado permanece porque alimenta as três trilhas aprovadas.

### Qualidade e propriedade intelectual

Os textos agora deixam claro que Riftbomb é um protótipo fã não comercial e não endossado pela Riot Games. Os créditos distinguem marcas/ativos derivados do jogo, código e áudio original do projeto. Testes de verificação impedem o retorno de Ziggs e de trilhas aposentadas.

### Risco conhecido

A remoção de artefatos é ampla, porém concentrada em material de preview/reconstrução que não faz parte do runtime atual. A validação deve confirmar o HTML principal, as cinco opções de campeão e as três trilhas.

Scripts shell agora declaram `eol=lf` para que o build online não seja quebrado por conversão CRLF em checkouts Windows.
