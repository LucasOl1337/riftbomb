# Resources

Curadoria inicial para o estudo arquitetural do Riftbomb. Fontes externas sustentam conceitos; decisões específicas do projeto continuam sujeitas às evidências do jogo e dos históricos de trabalho.

## Knowledge

### Linguagem, módulos e entrega

- [TypeScript Handbook — TypeScript for the New Programmer](https://www.typescriptlang.org/docs/handbook/typescript-from-scratch.html) — fonte oficial para verificação estática, apagamento de tipos e relação entre TypeScript e o JavaScript executado.
- [TypeScript Handbook — The Basics](https://www.typescriptlang.org/docs/handbook/2/basic-types.html) — exemplos oficiais de tipos apagados e transformação conforme o alvo de compilação.
- [ECMAScript — Scripts and Modules](https://tc39.es/ecma262/multipage/ecmascript-language-scripts-and-modules.html) — especificação normativa de módulos, imports, exports e dependências.
- [MDN — JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) — referência operacional sobre ESM no navegador, grafo de módulos e ciclos.
- [esbuild — Bundle](https://esbuild.github.io/api/#bundle) — definição oficial de bundling recursivo; sustenta a separação entre fonte modular e saída agregada.
- [Vite — Getting Started](https://vite.dev/guide/) e [Building for Production](https://vite.dev/guide/build) — documentação oficial do fluxo de desenvolvimento e build com `index.html` como entrada.
- [Vite — Build Options](https://vite.dev/config/build-options.html) — limites e opções que mostram por que um HTML totalmente autocontido exige uma etapa explícita.

### Loop, estado e reprodutibilidade

- [MDN — `requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) — contrato do relógio de apresentação, timestamp e variação de refresh rate.
- [WHATWG HTML — Animation frames](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html) — definição normativa das callbacks de animação.
- [Glenn Fiedler — Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/) — texto original sobre passo fixo, acumulador, interpolação e spiral of death.

### Modularização e testes

- [D. L. Parnas — On the Criteria To Be Used in Decomposing Systems into Modules](https://doi.org/10.1145/361598.361623) — artigo original sobre information hiding e decomposição por decisões suscetíveis a mudança.
- [Vitest — Testing in Practice](https://vitest.dev/guide/learn/testing-in-practice) — orientação oficial para testes confiáveis e controle de valores não determinísticos.
- [fast-check — Property-Based Testing](https://fast-check.dev/docs/introduction/what-is-property-based-testing/) — documentação oficial para geração de casos e redução de contraexemplos.
- [Playwright — Visual comparisons](https://playwright.dev/docs/test-snapshots) — documentação oficial e limitações de snapshots visuais entre ambientes.

### Evidência local

- [Pesquisa 0001 — Fundamentos de arquitetura](research-0001-architecture-foundations.md) — síntese anotada das fontes e sua aplicação ao código atual do Riftbomb.
- [Riftbomb atual](../riftbomb.html) — artefato executável autocontido; a fonte editável agora mora em `game/`.
- `C:\Projetos\bombpvp` — referência histórica para arquitetura, commits, testes e decisões; não é uma base automática para copiar.

## Wisdom

- [Martin Fowler — Monolith First](https://martinfowler.com/bliki/MonolithFirst.html) — argumento do autor sobre feedback inicial e dificuldade de prever fronteiras; aplicamos apenas o princípio, não a topologia de serviços.
- [Jimmy Bogard — Vertical Slice Architecture](https://www.jimmybogard.com/vertical-slice-architecture/) — formulação do autor para agrupar por caso de uso e eixo de mudança; no jogo, adaptamos para uma experiência jogável ponta a ponta.
- [Sandi Metz — The Wrong Abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction) — relato da autora sobre o custo de manter uma abstração antecipada e a utilidade de duplicação temporária.

Essas fontes de experiência orientam hipóteses, mas não substituem medições no Riftbomb. O critério final continua sendo mudança real, clareza do contrato e resultado no playtest.

## Gaps

- Catalogar as sessões Codex, Grok e demais históricos do Bomb PvP com data, objetivo, decisão, custo e efeito jogável.
- Construir uma linha do tempo comparável: horas/tokens/commits versus incrementos observáveis de experiência.
- Registrar quais módulos do Bomb PvP mudavam juntos com frequência para distinguir fronteiras úteis de fronteiras impostas.
- Medir baseline do Riftbomb antes da extração: boot, FPS/frame time, início de partida, bomba, explosão, habilidades e erros de console.
- Buscar relatos pós-mortem de jogos web pequenos somente quando uma pergunta concreta exigir evidência comunitária; ainda não há fonte de comunidade promovida a referência principal.
