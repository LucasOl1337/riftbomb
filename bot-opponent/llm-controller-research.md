# LLM como controlador ou treinador do bot

Pesquisa de viabilidade em 2026-07-30, baseada apenas em documentação oficial.

## Modelos verificados

- OpenAI: `gpt-5.6-sol` está disponível pela API; o alias `gpt-5.6` aponta
  para Sol. Suporta Responses API, streaming, function calling e Structured
  Outputs. Preço Standard publicado: US$ 5 / 1M tokens de entrada e US$ 30 /
  1M tokens de saída. A documentação não publica um SLA numérico de latência.
- xAI: `grok-4.5` está disponível por Responses API e Chat Completions, com
  reasoning configurável, function calling e Structured Outputs. Preço
  publicado: US$ 2 / 1M tokens de entrada e US$ 6 / 1M tokens de saída.

## Conclusão para o Riftbomb

Controle remoto por frame não atende o contrato atual de pensamento médio de
0,5 ms e introduz rede, custo, indisponibilidade e não determinismo. Structured
Outputs garante a forma do JSON, não garante que uma jogada seja legal ou ainda
seja relevante quando chegar.

A arquitetura recomendada é híbrida: o LLM escolhe objetivos táticos de baixa
frequência ou analisa replays offline; o V1 conserva fuga temporal, pathfinding,
execução de skills, validação e fallback em tempo real. Para ganho sustentável,
o melhor uso do modelo frontier é como professor: rotular decisões, criticar
replays e produzir dados que sejam destilados para uma política local rápida.

## Fontes oficiais

- [OpenAI — GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [OpenAI — guia da família GPT-5.6](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI — preços](https://developers.openai.com/api/docs/pricing)
- [OpenAI — Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI — function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [OpenAI — streaming](https://developers.openai.com/api/docs/guides/streaming-responses)
- [xAI — Grok 4.5](https://docs.x.ai/developers/grok-4-5)
- [xAI — modelos e preços](https://docs.x.ai/developers/models)
- [xAI — Structured Outputs](https://docs.x.ai/developers/model-capabilities/text/structured-outputs)
