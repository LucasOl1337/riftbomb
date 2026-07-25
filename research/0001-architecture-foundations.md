# Fundamentos de arquitetura para evoluir o Riftbomb

> Pesquisa 0001 · 25 de julho de 2026  
> Escopo: HTML/JavaScript autocontido versus fonte TypeScript modular; módulos e bundle; game loop; vertical slice; critérios de extração; testes mínimos.  
> Método: documentação oficial, especificações e textos dos autores originais. Recomendações específicas para o Riftbomb estão marcadas como **decisão proposta** ou **inferência**, para não confundir evidência externa com escolha de projeto.

## Resposta executiva

Não precisamos escolher entre “o HTML que ficou bom” e “um projeto TypeScript”. São decisões em eixos diferentes:

| Eixo | Decisão proposta para o Riftbomb |
|---|---|
| Linguagem de autoria | TypeScript, para contratos e refactors assistidos pelo editor |
| Organização da fonte | Poucos módulos ES, grossos e coesos; estrutura rasa |
| Runtime | JavaScript no navegador |
| Unidade de produto | Uma vertical slice jogável e sempre integrada |
| Entrega | Bundle estático; manter a opção de gerar um HTML autocontido |
| Regra de modularização | Extrair depois de observar uma fronteira de mudança, não para preencher uma arquitetura planejada |

O compilador TypeScript remove anotações de tipo e produz JavaScript; o sistema de tipos não muda sozinho o comportamento em runtime. Portanto, a extensão `.ts` não torna uma mecânica mais lenta nem a extensão `.html` a torna melhor. O que diferenciou o Riftbomb foi a forma de autoria — localidade, ciclo de feedback e vertical slice — e o uso de WebGL/áudio/assets, não um runtime especial de HTML. [TypeScript: TypeScript for the New Programmer](https://www.typescriptlang.org/docs/handbook/typescript-from-scratch.html) · [TypeScript: The Basics — Erased Types](https://www.typescriptlang.org/docs/handbook/2/basic-types.html)

A fonte pode ser dividida com `import`/`export` e depois empacotada para produção. Vite trata `index.html` como entrada e parte do grafo de módulos e gera um bundle estático de produção; logo, **fonte modular não implica distribuição fragmentada**. O inverso também é verdadeiro: um único HTML pode conter código internamente muito acoplado. [MDN: JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) · [Vite: Getting Started](https://vite.dev/guide/) · [Vite: Building for Production](https://vite.dev/guide/build)

## 1. O que existe dentro do “HTML do Riftbomb”

O artefato atual é um documento HTML contendo CSS inline a partir da [linha 9](../riftbomb-symphony.html#L9) e dois blocos JavaScript a partir das [linhas 1919](../riftbomb-symphony.html#L1919) e [2482](../riftbomb-symphony.html#L2482). As mecânicas não são executadas por HTML: são executadas pelo motor JavaScript do navegador. HTML fornece o documento e os pontos de montagem; CSS apresenta a interface; JavaScript mantém estado, calcula regras, usa WebGL e toca áudio.

### 1.1 O que TypeScript realmente acrescenta

TypeScript verifica o programa durante a autoria e, depois, apaga anotações e outras construções puramente de tipo. O JavaScript resultante não carrega a informação dos tipos, e programas TypeScript usam as mesmas bibliotecas de runtime que programas JavaScript. O compilador também pode transformar sintaxe JavaScript moderna conforme o `target`, portanto “apagar tipos” não significa necessariamente emitir texto idêntico à fonte. [TypeScript: TypeScript for the New Programmer](https://www.typescriptlang.org/docs/handbook/typescript-from-scratch.html) · [TypeScript: The Basics — Erased Types e Downleveling](https://www.typescriptlang.org/docs/handbook/2/basic-types.html)

Há uma ressalva: nem toda construção exclusiva do TypeScript é apenas tipo. `enum`, por exemplo, pode gerar um objeto JavaScript em runtime. A formulação rigorosa é: **anotações e construções puramente de tipo são apagadas; algumas extensões da linguagem possuem emissão**. [TypeScript: Enums](https://www.typescriptlang.org/docs/handbook/enums.html)

Também segue daí que tipagem não valida dados externos em runtime. Um save game, JSON, mensagem de rede ou configuração ainda precisa ser validado como valor quando entra no programa, porque a informação de tipo já não existe no JavaScript executado. Isso é consequência direta da remoção dos tipos descrita pela documentação oficial. [TypeScript: TypeScript for the New Programmer](https://www.typescriptlang.org/docs/handbook/typescript-from-scratch.html)

**Inferência para o Riftbomb:** TypeScript vale a pena como ferramenta de autoria se continuar servindo ao jogo. Ele pode detectar nomes de eventos errados, estados incompletos de campeão e contratos incompatíveis entre simulação e renderização. Ele não prova que uma habilidade é divertida, que o blast tem bom “feel” ou que a direção visual está correta.

## 2. Módulos ES e bundling: autoria e entrega são separáveis

### 2.1 O que um módulo fornece

Um módulo ES tem escopo próprio e declara sua interface com `export`; outro módulo consome essa interface com `import`. Módulos podem importar outros módulos sucessivamente, formando um grafo dirigido de dependências. A especificação ECMAScript representa formalmente imports, exports e módulos solicitados em `Module Record`; a documentação MDN apresenta a mesma relação como um dependency graph. [ECMAScript: Scripts and Modules](https://tc39.es/ecma262/multipage/ecmascript-language-scripts-and-modules.html) · [MDN: JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)

O navegador carrega uma entrada ESM com `<script type="module" src="./main.js"></script>`. Imports relativos são resolvidos como URLs; imports de pacote como `"three"` precisam de import map ou de uma ferramenta que os transforme. A execução local por `file://` costuma esbarrar nas regras de segurança/CORS de módulos, por isso a documentação recomenda testar por servidor HTTP. [MDN: JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) · [MDN: `import`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import)

Módulos não garantem boa arquitetura. O grafo pode conter ciclos e um binding pode ser lido antes de ser inicializado; a própria documentação recomenda dependências analisáveis e, idealmente, um grafo acíclico. [MDN: JavaScript modules — cyclic imports](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules#cyclic_imports)

### 2.2 O que um bundler muda

Bundling percorre imports e reúne dependências em uma saída otimizada; não é apenas concatenar arquivos. Vite serve a fonte sob demanda como ESM durante desenvolvimento e usa bundling para produção, porque imports aninhados sem bundle adicionam viagens de rede. Na documentação atual de 2026, Vite usa Rolldown no build; referências antigas que afirmam que a versão atual usa Rollup estão temporalmente desatualizadas. [esbuild: API — Bundle](https://esbuild.github.io/api/#bundle) · [Vite: Why Vite](https://vite.dev/guide/why.html)

Vite coloca `index.html` no centro do projeto, resolve os `<script type="module">` e assets referenciados e, no build, gera uma aplicação estática apropriada para hospedagem. [Vite: Getting Started — `index.html` and Project Root](https://vite.dev/guide/#index-html-and-project-root) · [Vite: Building for Production](https://vite.dev/guide/build)

Contudo, Vite não promete, sozinho, um único HTML completamente autocontido. Por padrão ele possui diretório de assets, limite de 4 KiB para inline de assets e opções de code splitting. Embutir JavaScript, CSS, modelos, áudio e texturas grandes em um único documento exige uma configuração/plugin ou etapa final específica. [Vite: Build Options — assets directory, inline limit e CSS splitting](https://vite.dev/config/build-options.html)

**Decisão proposta:** manter duas propriedades independentes:

```text
src/*.ts              = forma de trabalhar e compreender
        ↓ build
dist/*                = forma normal de testar a produção
        ↓ empacotamento opcional
riftbomb-single.html  = forma portátil de demonstrar/distribuir
```

O HTML autocontido deve ser um **produto de build**, não a única fonte editável. Isso preserva a vantagem de abrir e compartilhar um arquivo sem obrigar cada mudança a atravessar um documento de milhares de linhas.

## 3. Game loop: separar o relógio da tela do relógio das regras

### 3.1 O contrato do navegador

`requestAnimationFrame()` agenda um callback antes do próximo repaint. A frequência geralmente acompanha o monitor — 60, 75, 120 ou 144 Hz são possibilidades comuns —, a chamada é one-shot e callbacks costumam ser pausados em abas ocultas. A documentação também alerta que ignorar o timestamp faz a animação variar conforme a taxa de atualização. [MDN: `Window.requestAnimationFrame()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)

Logo, `requestAnimationFrame()` é um excelente relógio de **apresentação**, mas não promete um tick fixo de gameplay. A documentação de jogos da MDN distingue `update()`, autoridade que calcula o estado, de `render()`, que apresenta esse estado, e discute frequências diferentes para atualização e desenho. [MDN: Anatomy of a video game](https://developer.mozilla.org/en-US/docs/Games/Anatomy)

Glenn Fiedler demonstra que deltas variáveis e grandes podem alterar o comportamento da simulação e causar instabilidade. Sua solução de passo fixo acumula tempo real, consome-o em passos `dt` constantes e renderiza separadamente; interpolação entre estado anterior e atual pode suavizar o desenho. Ele também alerta para a “spiral of death” quando simular X segundos custa mais de X segundos reais, recomendando folga de processamento e/ou limite de passos por frame. [Glenn Fiedler: Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/)

Fixed timestep melhora estabilidade e reprodutibilidade, mas não produz determinismo completo sozinho: RNG, ordem de eventos, entradas, estado externo e diferenças de ponto flutuante continuam relevantes. Fiedler vincula o passo inteiramente fixo à reprodutibilidade do lockstep, sem afirmar que ele resolva sozinho todos esses fatores. [Glenn Fiedler: Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/)

### 3.2 Situação atual do Riftbomb

O loop atual já chama `game.update(dt)` antes de `renderer.render(...)`, o que é uma boa separação inicial. Entretanto, o `dt` vem diretamente do intervalo entre frames, apenas limitado ao intervalo de 1–50 ms; assim, as regras ainda avançam com passo variável. Veja [`frame(now)`](../riftbomb-symphony.html#L7686).

A classe `Game` ainda realiza apresentação: `announce()` modifica DOM e `update()` chama `updateUI()`. Portanto, `Game` não é hoje uma simulação isolável, apesar da existência de uma classe `Renderer`. Veja [`announce`](../riftbomb-symphony.html#L7394), [`update`](../riftbomb-symphony.html#L7402) e [`updateUI`](../riftbomb-symphony.html#L7451).

Há uma base útil para reprodutibilidade: `Game.random()` implementa um PRNG com seed interna. Porém, `start()` troca a seed por um valor derivado de `Date.now()`, enquanto áudio/VFX também usam `Math.random()` em outros pontos. Isso sugere separar explicitamente aleatoriedade autoritativa de aleatoriedade cosmética. Veja [`random`](../riftbomb-symphony.html#L5639), [`start`](../riftbomb-symphony.html#L5859) e os usos de [`Math.random`](../riftbomb-symphony.html#L4916).

### 3.3 Loop recomendado

Esta é uma **decisão proposta**, derivada de MDN e Fiedler, não uma cópia normativa:

```ts
const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const MAX_STEPS = 8;

function frame(nowMs: number) {
  requestAnimationFrame(frame);

  const elapsed = Math.min((nowMs - previousMs) / 1000, MAX_FRAME);
  previousMs = nowMs;
  accumulator += elapsed;

  const input = inputSystem.sample();
  let steps = 0;

  while (accumulator >= STEP && steps < MAX_STEPS) {
    previousState = currentState;
    const result = stepGame(currentState, input, STEP, gameplayRng);
    currentState = result.state;
    pendingEvents.push(...result.events);
    accumulator -= STEP;
    steps++;
  }

  renderer.render(previousState, currentState, accumulator / STEP);
  audio.consume(pendingEvents);
  ui.present(currentState, pendingEvents);
  pendingEvents.length = 0;
}
```

O contrato importante é menor que o código:

```text
Input captura intenção
        ↓
stepGame altera estado autoritativo com dt fixo e RNG explícito
        ↓
eventos descrevem o que aconteceu
        ↓
Renderer, áudio e UI apresentam; não decidem regras
```

Para a primeira migração, interpolação pode ser adiada se não houver stutter perceptível. Já separar o `stepGame` do DOM/WebGL e tornar tempo/RNG explícitos oferece valor imediato para testes. A MDN ressalta que separar frequências aumenta complexidade, portanto o projeto deve manter a implementação mais simples que cumpra os requisitos observados. [MDN: Anatomy of a video game — trade-offs](https://developer.mozilla.org/en-US/docs/Games/Anatomy#other_ways_to_handle_variable_refresh_rate_needs)

## 4. Por que começar grosso e por vertical slice reduz coordenação

### 4.1 “Monolith first” não significa “um arquivo para sempre”

Martin Fowler usa “monolith first” no contexto de serviços/deployments, não como recomendação literal de um arquivo-fonte. O argumento transferível é mais limitado: ciclos rápidos de feedback importam no início, fronteiras estáveis são difíceis de acertar antecipadamente e refatorar dentro de um monólito é mais barato que mover comportamento por fronteiras rígidas. Fowler também recomenda modularidade interna e reconhece que a evidência relatada é anedótica, portanto não devemos converter o texto em lei universal. [Martin Fowler: Monolith First](https://martinfowler.com/bliki/MonolithFirst.html)

Aplicado com cuidado ao Riftbomb, isso favorece **granularidade grossa no início**, não desorganização. Uma classe `Game` ou um módulo de campeão pode conter comportamento que ainda está sendo descoberto; a fronteira só vira contrato quando houver evidência de que muda de forma independente.

### 4.2 Vertical slice preserva a experiência inteira

Jimmy Bogard define vertical slice como agrupar os interesses necessários a um caso de uso e acoplar ao longo do eixo de mudança, minimizando acoplamento entre slices. Ele também propõe começar simples e refatorar para padrões que emergem de code smells, em vez de impor uma abstração global antecipada. [Jimmy Bogard: Vertical Slice Architecture](https://www.jimmybogard.com/vertical-slice-architecture/)

Para um jogo, “vertical slice” não precisa significar uma pasta por request HTTP. A **inferência para o Riftbomb** é tratar uma entrega como algo jogável de ponta a ponta. Exemplo: “Zed usa Living Shadow” só está concluído quando entrada, regra, cooldown, bot, VFX, som e HUD funcionam juntos. Durante descoberta, manter essas decisões próximas reduz a quantidade de contratos provisórios que precisam mudar em sincronia.

### 4.3 Modularização boa esconde decisões, não reproduz um fluxograma

No artigo original de 1972, David Parnas descreve módulos como atribuições de responsabilidade e recomenda que cada um esconda uma decisão de design suscetível a mudança. O objetivo é permitir compreender um módulo por vez e alterar um sem exigir alterações nos demais; decompor simplesmente pelas etapas do processamento não oferece os mesmos benefícios. [D. L. Parnas: On the Criteria To Be Used in Decomposing Systems into Modules](https://doi.org/10.1145/361598.361623) · [cópia do artigo original](https://citeseerx.ist.psu.edu/document?doi=5d752e29e29b42cc509417699a98d9dca8212c83&repid=rep1&type=pdf)

Sandi Metz documenta outro risco: uma abstração criada cedo pode acumular parâmetros e condicionais à medida que casos quase iguais divergem. Sua recomendação é preferir temporariamente duplicação e reextrair apenas quando a abstração correta ficar visível. [Sandi Metz: The Wrong Abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction)

**Síntese para o caso Bomb PvP → Riftbomb:** o problema não foi “módulo”. Foi transformar hipóteses de organização em numerosas fronteiras obrigatórias antes de descobrir o produto. O antídoto não é congelar 7.000 linhas em um HTML; é usar poucos módulos profundos, integração contínua da vertical slice e extração orientada por evidência.

## 5. Critérios concretos para extrair um módulo

Não extrair por número de linhas. Tamanho pode apontar onde investigar, mas não identifica sozinho uma responsabilidade ou uma decisão a esconder; o critério de Parnas é a decisão de design protegida pela fronteira. [Parnas: On the Criteria To Be Used in Decomposing Systems into Modules](https://doi.org/10.1145/361598.361623)

### 5.1 Portão de extração

Extrair somente quando for possível responder **sim** às três perguntas obrigatórias e houver ao menos um gatilho observado:

Perguntas obrigatórias:

1. **Que decisão este módulo esconde?** Deve caber em uma frase, por exemplo: “como o blast se propaga pelo grid” ou “como recursos WebGL são criados e destruídos”. Esse é o critério de information hiding de Parnas. [Parnas](https://doi.org/10.1145/361598.361623)
2. **Qual é o contrato menor que a implementação?** Deve ser possível nomear poucos valores/funções de entrada e saída sem expor todo o estado interno. Módulos ES fornecem precisamente o mecanismo de interface explícita por `export`/`import`. [MDN: JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
3. **Para que lado aponta a dependência?** A extração não pode introduzir import circular ou fazer a simulação depender de DOM/WebGL. Grafos de módulos podem conter ciclos, mas ciclos de inicialização têm comportamento mais difícil e podem gerar erro antes de um binding estar pronto. [MDN: cyclic imports](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules#cyclic_imports)

Gatilhos observáveis — basta um, desde que as três perguntas acima tenham resposta:

- a mesma regra precisa ser testada sem navegador;
- dois ou mais recursos reais repetem uma política estável;
- uma parte tem ciclo de vida externo próprio, como `AudioContext`, recursos WebGL ou listeners de input;
- mudanças recentes mostram que aquele conceito evolui independentemente;
- condicionais e parâmetros aparecem porque casos antes tratados como iguais passaram a divergir — sinal para desfazer ou redesenhar a abstração, conforme Metz; [Sandi Metz](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction)
- um feature slice está tocando sempre o mesmo conjunto de arquivos e a nova fronteira reduziria, em vez de aumentar, esse conjunto; o eixo de mudança é o critério de Bogard. [Jimmy Bogard](https://www.jimmybogard.com/vertical-slice-architecture/)

### 5.2 Motivos que não bastam

Não criar módulo, interface ou camada apenas porque:

- o arquivo passou de um limite arbitrário de linhas;
- “um jogo profissional costuma ter” `Manager`, `Service`, `Repository`, ECS ou plugin system;
- talvez exista um segundo consumidor no futuro;
- a abstração torna o diagrama mais simétrico;
- permite atribuir subtarefas paralelas sem que as fronteiras tenham sido validadas pelo jogo.

Esses casos contradizem o princípio de descobrir fronteiras estáveis antes de endurecê-las e aumentam o risco da “wrong abstraction”. [Martin Fowler: Monolith First](https://martinfowler.com/bliki/MonolithFirst.html) · [Sandi Metz: The Wrong Abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction)

### 5.3 Estrutura inicial de referência

Esta estrutura é deliberadamente rasa. É uma **hipótese de partida**, não um backlog para preencher:

```text
riftbomb/
├─ index.html                 # casca e pontos de montagem
├─ src/
│  ├─ main.ts                # composição + game loop
│  ├─ game/
│  │  ├─ state.ts            # modelo autoritativo
│  │  ├─ step.ts             # orquestra um tick, sem DOM/WebGL
│  │  ├─ rng.ts              # RNG autoritativo seedável
│  │  ├─ bombs.ts            # somente se passar o portão de extração
│  │  └─ champions.ts        # dividir por campeão apenas quando houver colisão real
│  ├─ renderer.ts            # WebGL e recursos gráficos
│  ├─ audio.ts               # WebAudio e consumo de eventos
│  ├─ input.ts               # teclado/touch → intenções
│  └─ ui.ts                  # DOM/HUD
├─ tests/
│  └─ game.spec.ts           # invariantes autoritativas
└─ tools/
   └─ build-single-html.*    # somente quando o formato portátil for validado
```

Não há razão inicial para múltiplos pacotes, monorepo ou project references. A documentação TypeScript apresenta project references como solução para programas maiores, separação lógica e desempenho de compilação, mas também documenta configurações e caveats adicionais. A **decisão proposta** é adotá-las apenas se tempo de typecheck, memória do editor ou necessidade de builds independentes se tornar um problema medido. [TypeScript: Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)

## 6. Testes mínimos para regras de jogo

Typecheck não testa comportamento em runtime, pois tipos são apagados. Por isso a base segura deve combinar `tsc --noEmit` com poucos testes de regras executáveis. [TypeScript: The Basics — Erased Types](https://www.typescriptlang.org/docs/handbook/2/basic-types.html)

O ponto de alavancagem é uma função semelhante a:

```ts
stepGame(state, input, fixedDt, rng) -> { state, events }
```

Tempo e aleatoriedade explícitos tornam o teste previsível. Quando código ainda depende de `Date`, `setTimeout` ou `setInterval`, Vitest permite controlar relógio e timers; sua própria orientação recomenda controlar valores não determinísticos e preferir implementações reais quando são rápidas e confiáveis. [Vitest: Testing in Practice — non-deterministic values](https://vitest.dev/guide/learn/testing-in-practice#non-deterministic-values) · [Vitest: Mocking Timers](https://vitest.dev/guide/mocking/timers) · [Vitest: Mocking Dates](https://vitest.dev/guide/mocking/dates)

### 6.1 Suíte mínima por risco, não por quantidade

Cada linha abaixo representa um comportamento/invariante, não necessariamente um único `it()`:

| Área | Casos mínimos que devem falhar se a regra quebrar |
|---|---|
| Colocação de bomba | aceita célula livre; rejeita parede, bomba existente e capacidade esgotada |
| Fuse | não explode antes do limiar; explode uma única vez ao cruzá-lo |
| Blast | atravessa chão; para em pedra; destrói caixa e para nela |
| Reação em cadeia | blast antecipa outra bomba; cada bomba resolve uma vez; ordem é definida |
| Dano | próprio blast também acerta; escudo/invulnerabilidade consome ou bloqueia exatamente como especificado |
| Movimento/colisão | jogador não atravessa pedra, caixa ou bomba bloqueante; posição permanece válida nos limites |
| Habilidade | custo/cooldown impede recast; cooldown volta a zero sem ficar negativo; estado transitório termina |
| Rodada | timeout/morte decide o resultado uma vez; transição não duplica score ou efeitos |
| Determinismo local | seed + estado + sequência de inputs iguais por N ticks produzem o mesmo estado canônico e eventos |
| Invariantes gerais | vida, cooldowns, coordenadas e contadores permanecem dentro dos domínios definidos |

Esse conjunto protege o coração do Bomber PvP sem reconstruir a infraestrutura extensa do Bomb PvP. A seleção é uma **recomendação baseada nos riscos observáveis do domínio atual**, não uma alegação de que dez linhas de tabela sejam universalmente suficientes.

Depois da suíte por exemplos, regras com espaço combinatório grande — blast em grids, colisão e sequências de ações — podem receber property-based tests. `fast-check` gera muitos inputs e reduz uma falha ao menor contraexemplo que ainda a reproduz; isso complementa, não substitui, exemplos importantes de design. [fast-check: What is Property-Based Testing?](https://fast-check.dev/docs/introduction/what-is-property-based-testing/)

### 6.2 Um smoke test de integração

Além das regras puras, manter um único smoke test no navegador:

1. carrega o build;
2. inicia uma partida;
3. envia input de movimento e bomba;
4. avança até uma explosão;
5. verifica ausência de erro de console e presença de estado/HUD esperado.

Comparação visual pode ser adicionada apenas a cenas estáveis. Playwright suporta screenshots de referência, mas alerta que sistema operacional, navegador, hardware e configurações alteram a renderização; por isso screenshot não deve ser tratado como prova das regras de gameplay. [Playwright: Visual comparisons](https://playwright.dev/docs/test-snapshots)

### 6.3 Gate enxuto por mudança

**Decisão proposta:** toda mudança de mecânica precisa passar por:

```text
1. tsc --noEmit
2. testes das regras afetadas
3. smoke test do build
4. playtest curto dentro da arena
```

O quarto item é intencional: testes automatizados verificam contratos conhecidos; não medem diversão, clareza visual ou “feel”. Esse gate evita repetir o padrão em que muitos indicadores locais ficam verdes enquanto a experiência integrada continua fraca.

## 7. Regras operacionais que resultam desta pesquisa

1. **Sempre manter o jogo executável.** Refactor não pode criar semanas de infraestrutura sem uma build jogável.
2. **Entregar por vertical slice.** Uma habilidade só termina quando regra, feedback visual, áudio, HUD e comportamento relevante do bot funcionam juntos. Isso adapta o eixo de mudança descrito por Bogard ao domínio do jogo. [Jimmy Bogard: Vertical Slice Architecture](https://www.jimmybogard.com/vertical-slice-architecture/)
3. **Preservar fronteiras profundas e poucas.** Simulação autoritativa não conhece DOM, WebGL ou WebAudio; apresentação lê estado e eventos. Essa separação segue a distinção update/render da MDN. [MDN: Anatomy of a video game](https://developer.mozilla.org/en-US/docs/Games/Anatomy)
4. **Não abstrair o segundo caso antes de compreendê-lo.** Duplicação temporária é aceitável quando revela diferenças entre campeões; reextrair após o padrão estabilizar. [Sandi Metz: The Wrong Abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction)
5. **Tratar o HTML único como saída.** A fonte usa ESM/TypeScript; o pipeline decide se a distribuição será um diretório estático ou um HTML portátil. [Vite: Getting Started](https://vite.dev/guide/)
6. **Medir a necessidade antes de escalar arquitetura.** Project references, ECS, replay, netcode, editor de conteúdo e plugin system exigem um problema atual e uma vertical slice que os prove, não apenas possibilidade futura. O princípio de fronteiras descobertas e custo de prematuridade é sustentado por Fowler; a aplicação concreta ao Riftbomb é nossa decisão. [Martin Fowler: Monolith First](https://martinfowler.com/bliki/MonolithFirst.html)

## Conclusão

O Riftbomb não ficou melhor porque “HTML vence TypeScript”. Ficou melhor porque o trabalho permaneceu próximo da experiência final e convergiu rapidamente para uma vertical slice forte. TypeScript pode preservar esse ganho se for usado como uma camada leve de autoria, com ESM, um game loop explícito e poucos módulos que escondem decisões reais.

A direção recomendada é:

> **Fonte TypeScript modular e rasa; simulação pequena e testável; desenvolvimento sempre vertical; bundle simples; HTML autocontido como artefato opcional.**

Isso não copia a arquitetura do Bomb PvP e também não congela o protótipo no formato que o tornou possível. Preserva a velocidade de descoberta do monólito e adiciona apenas as fronteiras que já conseguimos justificar.

## Fontes principais

- [TypeScript Handbook — TypeScript for the New Programmer](https://www.typescriptlang.org/docs/handbook/typescript-from-scratch.html)
- [TypeScript Handbook — The Basics](https://www.typescriptlang.org/docs/handbook/2/basic-types.html)
- [TypeScript Handbook — Modules: Theory](https://www.typescriptlang.org/docs/handbook/modules/theory.html)
- [ECMAScript Language Specification — Scripts and Modules](https://tc39.es/ecma262/multipage/ecmascript-language-scripts-and-modules.html)
- [MDN — JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
- [MDN — `requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- [MDN — Anatomy of a video game](https://developer.mozilla.org/en-US/docs/Games/Anatomy)
- [Vite — Getting Started](https://vite.dev/guide/)
- [Vite — Why Vite](https://vite.dev/guide/why.html)
- [Glenn Fiedler — Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/)
- [D. L. Parnas — On the Criteria To Be Used in Decomposing Systems into Modules](https://doi.org/10.1145/361598.361623)
- [Martin Fowler — Monolith First](https://martinfowler.com/bliki/MonolithFirst.html)
- [Jimmy Bogard — Vertical Slice Architecture](https://www.jimmybogard.com/vertical-slice-architecture/)
- [Sandi Metz — The Wrong Abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction)
- [Vitest — Testing in Practice](https://vitest.dev/guide/learn/testing-in-practice)
- [fast-check — What is Property-Based Testing?](https://fast-check.dev/docs/introduction/what-is-property-based-testing/)
- [Playwright — Visual comparisons](https://playwright.dev/docs/test-snapshots)
