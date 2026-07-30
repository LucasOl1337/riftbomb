# Swarm Ledger — Landing Page

## 2026-07-29 17:41:14 -03:00 — precisa humano

- **Antes:** `main` no commit `496ff44`, com 26 entradas locais no status; a landing já tinha WIP não commitado em `online/app/page.tsx`, `online/app/globals.css`, `online/app/layout.tsx` e `online/app/manifest.ts`, junto de mudanças em `game/`, cliente online, servidor e testes.
- **Decisão:** criada e selecionada a branch obrigatória `swarm/riftbomb/landing`, preservando o estado local como exigido. Nenhuma nova mudança comercial foi sobreposta ao WIP existente, para não misturar assuntos.
- **Depois:** branch `swarm/riftbomb/landing` ativa; o WIP pré-existente permanece sem commit. Este ledger é o único arquivo novo desta rodada.
- **Arquivos da entrega:** nenhum. A documentação isolada não é contabilizada como entrega.
- **Evidência:** `git status --short --branch` mostrou 26 entradas locais; o diff já existente dos três arquivos rastreados da landing soma 488 inserções e 30 remoções.
- **Validação:** não executada, pois não houve implementação isolável. Playwright headless, `hostile-ui` e `headless_shell` não foram usados.
- **Commit / push / PR / deploy:** não realizados.
- **Próximo passo:** humano deve identificar e preservar o dono do WIP atual, separá-lo ou commitá-lo na branch correta e deixar `swarm/riftbomb/landing` limpa; então o enxame pode implementar uma única melhoria visível e validar desktop/mobile.

## 2026-07-29 18:01:11 -03:00 — precisa humano

- **Antes:** `swarm/riftbomb/landing` no commit `496ff44`, ainda com o WIP não commitado da rodada anterior e agora 35 entradas no status.
- **Decisão:** nenhuma melhoria comercial foi sobreposta. Os arquivos necessários para hero, CTA, copy e responsividade já misturam Quick Match, saída de partida, fullscreen/PWA, cliente online e testes; pelas regras do enxame, esse conflito entre assuntos exige intervenção humana.
- **Depois:** branch obrigatória preservada, sem alterações de produto feitas por esta rodada. O WIP existente continua intacto.
- **Arquivos da entrega:** nenhum. Esta atualização do ledger não conta como entrega.
- **Evidência:** `online/app/globals.css`, `online/app/layout.tsx`, `online/app/page.tsx` e `online/tests/client-shell.test.mjs` somam 519 inserções e 31 remoções locais; `online/app/manifest.ts` também permanece novo e não rastreado. `git diff --check` não encontrou erro de whitespace, apenas avisos de conversão LF/CRLF.
- **Validação:** build e screenshots não executados, pois não houve implementação isolável. Playwright headless, scripts `hostile-ui` e `headless_shell` não foram usados.
- **Commit / push / PR / deploy:** não realizados.
- **Próximo passo:** humano deve separar ou assumir o WIP atual e deixar livres `online/app/page.tsx`, `online/app/globals.css` e `online/app/layout.tsx`; depois o enxame pode entregar uma única melhoria visível e validar desktop/mobile.

## 2026-07-29 18:46:20 -03:00 — entregue

- **Antes:** `swarm/riftbomb/landing` permanecia com WIP de outros assuntos nos arquivos centrais da landing e sem uma política pública de rastreamento; `robots.txt` não existia no cliente publicado.
- **Decisão:** entregar uma única melhoria isolável de SEO básico sem sobrepor hero, CTA, copy ou layout: permitir rastreamento da landing e bloquear o rastreamento das rotas `/api/`.
- **Depois:** o build publicado contém `/robots.txt` com `User-agent: *`, `Allow: /` e `Disallow: /api/`; o WIP preexistente permaneceu fora do escopo.
- **Arquivos da entrega:** `online/public/robots.txt`; este ledger registra a rodada, mas não é contado como entrega de produto.
- **Evidência:** `npm test` na raiz passou 77/77; `npm test` em `online/` passou build, validação do artefato e 20/20 testes; `npm test` em `online/server/` passou 10/10 testes. `online/dist/client/robots.txt` foi localizado após o build e seu conteúdo conferido byte a byte pelas três linhas esperadas.
- **Responsivo / screenshots:** não aplicável, pois a mudança é um endpoint textual de SEO e não altera a renderização desktop ou mobile. Playwright headless, scripts `hostile-ui` e `headless_shell` não foram usados.
- **Branch:** `swarm/riftbomb/landing` sobre `b83e28b`; nenhum merge, push, PR ou deploy foi realizado.
- **Próximo passo:** quando os arquivos centrais da landing estiverem livres, melhorar o hero/CTA e então validar desktop e mobile em navegador visível.

## 2026-07-29 19:06:22 -03:00 — entregue

- **Antes:** a landing permitia rastreamento público por `robots.txt`, mas não publicava nem anunciava um sitemap canônico para o domínio comercial.
- **Decisão:** fazer uma única melhoria isolável de SEO básico sem tocar no WIP dos arquivos centrais: publicar um sitemap mínimo da entrada comercial e anunciá-lo ao crawler.
- **Depois:** `/sitemap.xml` descreve `https://bombpvp.com/` como a URL canônica, com atualização semanal, e `/robots.txt` aponta explicitamente para esse sitemap.
- **Arquivos da entrega:** `online/public/sitemap.xml` e `online/public/robots.txt`; este ledger registra a rodada, mas não é contado como entrega de produto.
- **Evidência:** `npm test` na raiz passou 79/79; `npm test` em `online/` passou build, validação do artefato e 21/21 testes; `npm test` em `online/server/` passou 10/10 testes. `online/dist/client/sitemap.xml` e `online/dist/client/robots.txt` foram conferidos após o build e contêm a URL canônica esperada.
- **Responsivo / screenshots:** não aplicável, pois a mudança cria endpoints textuais de SEO e não altera a renderização desktop ou mobile. Playwright headless, scripts `hostile-ui` e `headless_shell` não foram usados.
- **Branch:** `swarm/riftbomb/landing` sobre `dffc91e`; nenhum merge, push, PR ou deploy foi realizado.
- **Próximo passo:** quando `online/app/page.tsx` e `online/app/globals.css` estiverem livres, reforçar a hierarquia comercial do hero e validar desktop/mobile em navegador visível.

## 2026-07-29 19:26:25 -03:00 — entregue

- **Antes:** a entrada publicada ainda usava o favicon azul genérico herdado do esqueleto inicial, sem relação visual com a marca exibida no cabeçalho do Riftbomb.
- **Decisão:** fazer uma única melhoria visual isolável, sem tocar no WIP central: trocar o ícone por um monograma `R` geométrico inspirado no losango ciano e dourado já usado pela interface.
- **Depois:** a aba e os atalhos que consomem `/favicon.svg` passam a apresentar uma marca própria, com fundo escuro, contorno ciano, detalhe dourado e monograma de alto contraste.
- **Arquivos da entrega:** `online/public/favicon.svg`; este ledger registra a rodada, mas não é contado como entrega de produto.
- **Evidência:** o SVG passou no parse XML e foi rasterizado para inspeção em 512 px e 32 px; a versão de 32 px manteve o monograma legível. Após o build, `online/public/favicon.svg` e `online/dist/client/favicon.svg` tiveram o mesmo SHA-256 `74B1E4D63F285653CBF84325D4FDE68D52F12012C25A7B9F153FB9F4F21B2797`. `git diff --check` não encontrou erros.
- **Validação:** `npm test` na raiz passou 81/81; `npm test` em `online/` passou build, validação do artefato e 21/21 testes; `npm test` em `online/server/` passou 10/10 testes.
- **Responsivo / screenshots:** screenshots de viewport não se aplicam a um favicon; a evidência visual foi feita no próprio asset em tamanho cheio e no tamanho típico de aba HiDPI. Playwright headless, scripts `hostile-ui` e `headless_shell` não foram usados.
- **Branch:** `swarm/riftbomb/landing` sobre `a083546`; nenhum merge, push, PR ou deploy foi realizado.
- **Próximo passo:** quando `online/app/page.tsx` e `online/app/globals.css` estiverem livres, reforçar a proposta de valor e o CTA do hero, com validação desktop/mobile em navegador visível.

## 2026-07-29 19:45:36 -03:00 — entregue

- **Antes:** a landing já tinha um favicon próprio, mas o caminho convencional `/apple-touch-icon.png` não existia; ao salvar o Riftbomb na tela inicial de um iPhone ou iPad, o sistema ainda precisava improvisar uma miniatura da página.
- **Decisão:** fazer uma única melhoria visual isolável sem tocar no WIP central: publicar um bitmap de instalação 180×180 derivado do monograma oficial, com fundo opaco para receber corretamente o recorte nativo do iOS.
- **Depois:** atalhos adicionados à tela inicial passam a encontrar uma marca Riftbomb nítida, em sRGB, com o losango ciano/dourado e o `R` de alto contraste.
- **Arquivos da entrega:** `online/public/apple-touch-icon.png`; este ledger registra a rodada, mas não é contado como entrega de produto.
- **Evidência:** o PNG foi inspecionado visualmente em resolução nativa e validado como `180x180`, `sRGB`, `TrueColor`, sem canal alfa. Após o build, a fonte e `online/dist/client/apple-touch-icon.png` tiveram o mesmo SHA-256 `05009C51FD2EC8C644E7C22FC4BD219C55732A491D99C707C13CA0CCDAAFFD49`; `git diff --check` não encontrou erros, apenas avisos LF/CRLF em WIP preexistente.
- **Validação:** `npm test` na raiz passou 85/85; `npm test` em `online/` passou build, validação do artefato e 21/21 testes; `npm test` em `online/server/` passou 10/10 testes.
- **Responsivo / screenshots:** screenshots de viewport não se aplicam a um ícone de instalação; a evidência visual foi feita no próprio bitmap de 180×180. Playwright headless, scripts `hostile-ui` e `headless_shell` não foram usados.
- **Branch:** `swarm/riftbomb/landing` sobre `813f420`; nenhum merge, push, PR ou deploy foi realizado.
- **Próximo passo:** quando `online/app/page.tsx` e `online/app/globals.css` estiverem livres, reforçar a proposta de valor e o CTA do hero, com validação desktop/mobile em navegador visível.

## 2026-07-29 20:23:34 -03:00 — precisa humano

- **Estado:** a melhoria mais recente de landing, commit `59e15e5` (`Brand iOS home screen icon`), foi avaliada na branch obrigatória `swarm/riftbomb/landing-integracao`; nenhuma integração adicional, commit, push, PR ou deploy foi realizada.
- **Evidência:** `online/public/apple-touch-icon.png` foi confirmado como PNG `180x180`, TrueColor sem alfa, 9.172 bytes e SHA-256 `05009C51FD2EC8C644E7C22FC4BD219C55732A491D99C707C13CA0CCDAAFFD49`; o hash coincide com `online/dist/client/apple-touch-icon.png`, o asset permaneceu legível em inspeção visual e `git diff-tree --check 59e15e5^ 59e15e5` passou.
- **Validações avaliadas:** o ledger da entrega registra 85/85 testes na raiz, build e 21/21 testes em `online/` e 10/10 em `online/server/`; esta coleta não repetiu as suítes porque o worktree contém WIP não relacionado e o resultado não isolaria o commit. Playwright headless, scripts `hostile-ui` e `headless_shell` não foram usados.
- **Conflito:** a história de `swarm/riftbomb/landing` desde `main` contém, antes dos quatro commits de landing, os commits de UI de partida `33e4f6a`, `00a9ec1` e `b83e28b`. Integrar a branch como está misturaria outro assunto, proibido por este coletor.
- **Precisa humano:** definir uma base limpa para `swarm/riftbomb/landing-integracao` ou autorizar a separação dos quatro commits exclusivos de landing (`dffc91e`, `a083546`, `813f420`, `59e15e5`), preservando o WIP local de outros assuntos.
- **Próximo passo:** após a separação, integrar somente esses quatro commits, rodar as três suítes exigidas em árvore limpa e manter main/produção sem alterações até aprovação explícita.

## 2026-07-29 20:33:23 -03:00 — entregue

- **Antes:** URLs inválidas caíam na resposta genérica do framework, sem identidade do Riftbomb nem caminho comercial claro de volta à partida; os arquivos centrais da landing continuavam ocupados por WIP de outros assuntos.
- **Decisão:** fazer uma única melhoria de conversão isolável: criar um 404 próprio, responsivo e acessível, usando a arte real da arena e um CTA direto para a entrada jogável, sem tocar em `page.tsx`, `globals.css` ou `layout.tsx`.
- **Depois:** qualquer rota inexistente apresenta a marca Riftbomb, explica o erro em linguagem temática e oferece `Entrar na arena` para `/`, com foco visível, feedback de interação, redução de movimento e tratamento de landscape baixo.
- **Arquivos da entrega:** `online/app/not-found.tsx`, `online/app/not-found.module.css` e `online/tests/not-found.test.mjs`; este ledger registra a rodada, mas não é contado como entrega de produto.
- **Evidência:** `npm test` na raiz passou 88/88; `npm test` em `online/` concluiu o build verificado e passou 22/22; `npm test` em `online/server/` passou 15/15. O teste novo confirma HTML semântico, CTA para `/`, asset real, `100dvh`, foco visível e redução de movimento.
- **Responsivo / screenshots:** inspeção no navegador visível confirmou 1440×900 e 390×844. No mobile, `scrollWidth=390`, sem overflow horizontal, e o CTA de 320×58 px ficou inteiro acima da dobra; o clique navegou de `/rota-inexistente` para `/`. Evidências: `artifacts/landing-404/404-desktop.jpg` e `artifacts/landing-404/404-mobile.jpg`.
- **Concorrência:** o coletor separado mudou temporariamente a branch para `swarm/riftbomb/landing-integracao` e registrou sua própria entrada no ledger durante a validação; a branch obrigatória `swarm/riftbomb/landing` foi restaurada antes do fechamento, e nenhuma mudança desse coletor foi incluída na entrega. Uma primeira suíte online encontrou o empacotador sendo alterado simultaneamente; a repetição estabilizada passou 22/22 com o artefato em 727.486 bytes.
- **Branch:** `swarm/riftbomb/landing`, commit `463ab19` (`Recover invalid landing routes`); nenhum merge, push, PR ou deploy foi realizado. Playwright headless, scripts `hostile-ui` e `headless_shell` não foram usados.
- **Próximo passo:** em uma árvore limpa, separar os commits exclusivos de landing conforme a nota do coletor de integração; depois avaliar título/description social sem tocar no WIP central.

## 2026-07-29 20:31:09 -03:00 — entregue

- **Antes:** a landing publicava o monograma Riftbomb somente em SVG e como ícone de tela inicial; navegadores, favoritos e crawlers que ainda consultam o caminho convencional `/favicon.ico` não encontravam um fallback multirresolução da marca.
- **Decisão:** fazer uma única melhoria visual isolável sem tocar no WIP central: derivar do favicon oficial um ICO sRGB com camadas próprias de 48, 32 e 16 px.
- **Depois:** `/favicon.ico` entrega o mesmo losango ciano/dourado e o monograma `R`, com leitura preservada até 16 px.
- **Arquivos da entrega:** `online/public/favicon.ico`; este ledger registra a rodada, mas não é contado como entrega de produto.
- **Evidência:** o ICO foi inspecionado visualmente nas três resoluções e identificado como `48x48`, `32x32` e `16x16`, 8-bit sRGB. Após o build, a fonte e `online/dist/client/favicon.ico` tiveram o mesmo SHA-256 `AAE59E08A37077FB5C75092720D3501992C923E71846BAB86175FE992DF10034`.
- **Validação:** `npm test` na raiz passou 99/99 na repetição final; a primeira execução teve uma falha transitória no WIP concorrente de CPU duels, cujo teste isolado passou 3/3 antes da repetição verde. `npm test` em `online/` passou build verificado e 22/22 testes; `npm test` em `online/server/` passou 18/18.
- **Responsivo / screenshots:** screenshots desktop/mobile não se aplicam a um favicon; a evidência visual foi feita no bitmap em 48, 32 e 16 px. Playwright headless, scripts `hostile-ui` e `headless_shell` não foram usados.
- **Branch / commit:** `swarm/riftbomb/landing`, commit `a17bfaa` (`Add branded legacy favicon`); nenhum merge, push, PR ou deploy foi realizado.
- **Concorrência preservada:** a entrada de coleta `2026-07-29 20:23:34 -03:00` apareceu no ledger durante esta rodada e permaneceu fora do commit do asset, sem sobrescrita.
- **Próximo passo:** humano deve separar os commits exclusivos de landing em uma base limpa; depois, quando `online/app/page.tsx` e `online/app/globals.css` estiverem livres, reforçar proposta de valor e CTA do hero com validação desktop/mobile em navegador visível.

## 2026-07-29 20:48:43 -03:00 — entregue

- **Antes:** a entrada comercial não tinha uma prévia própria para compartilhamentos no X/Twitter; `online/app/opengraph-image.png` continuava como WIP não rastreado de outro assunto e não foi tocado.
- **Decisão:** fazer uma única melhoria de prova visual e conversão, isolada em arquivos novos: transformar uma captura real da partida em um card social 2:1 com marca, copy curta e arena reconhecível, usando a convenção de metadata do Next.
- **Depois:** o build publica `/twitter-image.png` com a arte `RIFTBOMB — BOMBAS. CAMPEÕES. SOBREVIVA.` e texto alternativo em português; a imagem mantém a arena, os personagens e o HUD reais como prova do produto.
- **Arquivos da entrega:** `online/app/twitter-image.png`, `online/app/twitter-image.alt.txt` e `online/tests/social-preview.test.mjs`; este ledger registra a rodada, mas não é contado como entrega de produto.
- **Evidência:** o bitmap final foi inspecionado visualmente e validado como PNG `1774x887` (proporção exata 2:1), 1.778.133 bytes e SHA-256 `1913AB25F01B69F2931BE7C963DF1C0197F8B8F7625C78E6F910F336C883818A`. O bundle produzido contém a rota `/twitter-image.png?82dfc8aa9153039b` e o alt text esperado.
- **Validação:** `npm test` na raiz passou 99/99; `npm test` em `online/` passou build verificado e 23/23 testes; `npm test` em `online/server/` passou 21/21 testes.
- **Responsivo / screenshots:** screenshots de viewport desktop/mobile não se aplicam a um card social de proporção fixa; a evidência visual foi feita no bitmap final em resolução original. Playwright headless, scripts `hostile-ui` e `headless_shell` não foram usados.
- **Branch / commit:** `swarm/riftbomb/landing`, commit `f5c08f1` (`Publish Riftbomb social gameplay preview`); nenhum merge, push, PR ou deploy foi realizado.
- **Concorrência preservada:** o WIP preexistente nos arquivos centrais, o `opengraph-image.png` não rastreado e as entradas anteriores do coletor permaneceram fora do commit desta rodada.
- **Próximo passo:** em base limpa, separar os commits exclusivos de landing; depois completar metadata social de título/descrição ou liberar os arquivos centrais para reforçar o hero e o CTA.

## 2026-07-29 21:03:52 -03:00 — entregue

- **Antes:** o sitemap canônico anunciava somente a URL da landing; a captura real publicada na rodada anterior existia para compartilhamento, mas não era descrita aos buscadores como imagem associada à entrada comercial.
- **Decisão:** fazer uma única melhoria isolável de SEO e prova visual, sem tocar no WIP do hero: adicionar ao sitemap a extensão de imagens e associar a captura real da partida à URL `https://bombpvp.com/`.
- **Depois:** `/sitemap.xml` publica `https://bombpvp.com/twitter-image.png` com título e legenda descritivos, permitindo que crawlers descubram a prova visual do produto junto da landing.
- **Arquivos da entrega:** `online/public/sitemap.xml` e `online/tests/image-sitemap.test.mjs`; este ledger registra a rodada, mas não é contado como entrega de produto.
- **Evidência:** o XML passou no parser, o teste novo confirmou namespace, URL e bitmap PNG real, e a fonte e `online/dist/client/sitemap.xml` tiveram o mesmo SHA-256 `9FBFBE8A1986A35C7F5CE05CFA96116C65D5454EC7360F266055DF7FF323729A` após o build.
- **Validação:** `npm test` na raiz passou 105/105; `npm test` em `online/` passou build verificado e 24/24 testes; `npm test` em `online/server/` passou 21/21 testes. `git diff --check` não encontrou erros, apenas avisos LF/CRLF no WIP preexistente.
- **Responsivo / screenshots:** não aplicável, pois a mudança altera um endpoint XML e sua descoberta de imagem, sem modificar a renderização desktop ou mobile. Playwright headless, scripts `hostile-ui` e `headless_shell` não foram usados.
- **Branch / commit:** `swarm/riftbomb/landing`, commit `9507a9c` (`Expose gameplay image in sitemap`); nenhum merge, push, PR ou deploy foi realizado.
- **Próximo passo:** em base limpa, separar os commits exclusivos de landing; depois completar metadata social textual ou reforçar hero/CTA quando os arquivos centrais estiverem livres.

## 2026-07-29 21:28:16 -03:00 — entregue

- **Antes:** uma falha de execução na entrada online ainda caía no fallback genérico do framework, sem copy do Riftbomb, tentativa de reconexão ou caminho de conversão de volta à arena.
- **Decisão:** fazer uma única melhoria de recuperação comercial isolável do hero em WIP: adicionar um estado de erro próprio que reaproveita a arena real e o sistema visual do 404, com CTA primário `Tentar novamente` e link secundário `Voltar à entrada`.
- **Depois:** erros da landing preservam a identidade do produto, explicam o problema sem culpar o jogador e oferecem tanto a retomada da mesma sessão quanto o retorno imediato ao fluxo jogável. O estado inclui foco visível, feedback de interação, animação reduzível e composição específica para mobile e landscape baixo.
- **Arquivos da entrega:** `online/app/error.tsx`, `online/app/not-found.module.css` e `online/tests/error-recovery.test.mjs`; o preview temporário usado apenas na inspeção foi removido antes do commit.
- **Evidência:** o build online concluiu e o teste novo passou dentro da suíte; a validação focada do estado de erro e do 404 passou 2/2. `git diff --check` passou. A suíte raiz, depois de estabilizado o WIP concorrente do bot, passou 116/116; `online/server/` passou 21/21.
- **Pendência concorrente:** `online/` ficou 24/25 porque `online/public/riftbomb-parts/part-00` está com 754.865 bytes contra o teto preexistente de 750.000 em `pvp-source.test.mjs`; o teste isolado repetiu a mesma falha. Nenhum arquivo do empacotamento ou do jogo foi alterado nesta rodada.
- **Responsivo / screenshots:** Chrome oficial em modo visível confirmou desktop 1920×911 e mobile 390×844. No mobile, `scrollWidth=390`, sem overflow horizontal; o CTA primário mede 320×58 px e termina em 581 px, inteiro acima da dobra. Evidências: `artifacts/landing-error/error-desktop.png` e `artifacts/landing-error/error-mobile.png`.
- **Branch / commit:** `swarm/riftbomb/landing`, commit `1d71d50` (`Recover landing runtime failures`); nenhum merge, push, PR ou deploy foi realizado. Playwright headless, scripts `hostile-ui` e `headless_shell` não foram usados.
- **Próximo passo:** humano deve separar os commits exclusivos de landing em uma base limpa; quando `online/app/page.tsx` e `online/app/globals.css` estiverem livres, reforçar a proposta de valor e o CTA do hero.

## 2026-07-29 21:49:03 -03:00 — entregue

- **Antes:** durante a preparação inicial da rota, a entrada dependia do fallback vazio do framework; em conexões lentas, a primeira impressão não preservava marca, cenário nem proposta comercial enquanto o cliente era carregado.
- **Decisão:** fazer uma única melhoria visível e isolável do hero em WIP: adicionar um estado de carregamento próprio, responsivo e acessível, usando a arena real `lattice.webp`, copy curta e a prova `PvP em tempo real · sem download`.
- **Depois:** a entrada mantém a identidade Riftbomb desde o primeiro quadro, explica o que está sendo preparado e evita uma tela genérica antes do shell jogável. O estado usa `role="status"`, anúncio educado, `100dvh`, composição específica para mobile/landscape e alternativa sem animação.
- **Arquivos da entrega:** `online/app/loading.tsx`, `online/app/loading.module.css` e `online/tests/loading-state.test.mjs`; a rota temporária de inspeção foi removida antes do commit.
- **Evidência:** o teste focado passou 2/2; o build online concluiu e incluiu o estado novo. A suíte raiz passou 116/116 e `online/server/` passou 21/21. A suíte `online/` ficou 26/27 apenas pelo teto preexistente de 750.000 bytes: o WIP concorrente produziu `online/public/riftbomb-parts/part-00` com 756.696 bytes; os dois testes novos e os demais 24 testes passaram.
- **Responsivo / screenshots:** navegador visível confirmou desktop 1440×900 e mobile 390×844, ambos com `scrollWidth` igual ao viewport e sem overflow. No mobile, o bloco principal mede 350 px e termina em 593 px, inteiro acima da dobra. Evidências: `artifacts/landing-loading/loading-desktop.png` e `artifacts/landing-loading/loading-mobile.png`.
- **Branch / commit:** `swarm/riftbomb/landing`, commit `3684e7e` (`Brand the landing load state`); nenhum merge, push, PR ou deploy foi realizado. Playwright headless, scripts `hostile-ui` e `headless_shell` não foram usados.
- **Próximo passo:** humano deve separar os commits exclusivos de landing em uma base limpa; quando `online/app/page.tsx` e `online/app/globals.css` estiverem livres, reforçar proposta de valor e CTA do hero.

## 2026-07-29 22:12:43 -03:00 — entregue

- **Antes:** falhas dentro da rota já tinham recuperação própria, mas uma exceção no layout raiz ainda podia substituir toda a entrada pelo fallback genérico do framework, sem identidade do Riftbomb nem caminho claro de volta ao produto.
- **Decisão:** fazer uma única melhoria de conversão isolável do hero em WIP: adicionar um `global-error` próprio que mantém arena real, marca, copy direta e dois caminhos de recuperação mesmo quando o erro ocorre acima do layout principal.
- **Depois:** a falha raiz apresenta `Recarregar arena` via `reset()` e `Voltar ao início` para `/`, com documento `pt-BR`, foco visível, feedback de interação, redução de movimento e composição responsiva. O fallback usa navegação interna do Next e continua funcional sem depender dos estilos do layout que falhou.
- **Arquivos da entrega:** `online/app/global-error.tsx`, `online/app/not-found.module.css` e `online/tests/error-recovery.test.mjs`; a rota temporária usada apenas para inspeção foi removida antes do commit.
- **Evidência:** o teste focado passou 1/1; o lint local dos arquivos finais passou; `git diff --check` não encontrou erros; o build online final concluiu e o bundle gerado contém o componente `global-error` e sua copy.
- **Validação:** `npm test` na raiz passou 116/116; `npm test` em `online/server/` passou 21/21; `npm test` em `online/` concluiu build verificado e passou 26/27. A única falha é o teto preexistente do pacote: `online/public/riftbomb-parts/part-00` com 758.681 bytes contra 750.000, fora desta entrega.
- **Responsivo / screenshots:** navegador visível confirmou 1440×900 e 390×844, ambos sem overflow. No mobile, `scrollWidth=390`, o CTA mede 320×58 px e termina em 593 px, inteiro acima da dobra. Evidências: `artifacts/landing-global-error/global-error-desktop.png` e `artifacts/landing-global-error/global-error-mobile.png`.
- **Branch / commit:** `swarm/riftbomb/landing`, commit `908f73d` (`Recover root landing failures`); nenhum merge, push, PR ou deploy foi realizado. Playwright headless, scripts `hostile-ui` e `headless_shell` não foram usados.
- **Concorrência preservada:** o WIP preexistente de bot, jogo, hero, cliente, empacotamento e modelos jogáveis permaneceu fora do commit; somente os três arquivos da entrega foram incluídos.
- **Próximo passo:** humano deve separar os commits exclusivos de landing em uma base limpa; quando `online/app/page.tsx` e `online/app/globals.css` estiverem livres, reforçar a proposta de valor e o CTA principal do hero.

## 2026-07-29 22:29:42 -03:00 — entregue

- **Antes:** o `robots.txt` já anunciava a landing e seu sitemap, mas também permitia que crawlers percorressem o runtime legado `/riftbomb.html` e os fragmentos internos em `/riftbomb-parts/`, diluindo o foco da única URL comercial canônica.
- **Decisão:** fazer uma única melhoria isolável de SEO básico sem tocar no hero em WIP: manter `/` rastreável e bloquear somente as duas rotas de implementação, preservando o bloqueio existente de `/api/`.
- **Depois:** crawlers recebem uma política explícita que concentra a descoberta em `https://bombpvp.com/` e no sitemap publicado, sem gastar crawl no documento de jogo incorporado ou em seus fragmentos binários.
- **Arquivos da entrega:** `online/public/robots.txt` e `online/tests/robots-policy.test.mjs`; este ledger registra a rodada, mas não é contado como entrega de produto.
- **Evidência:** o teste novo passou isoladamente e dentro da suíte online; após o build, fonte e `online/dist/client/robots.txt` tinham 132 bytes e o mesmo SHA-256 `68AA1D164E8FFA51BD98DD05DB65E856CAB061C77F8FA0130B98A6018D16B639`. `git diff --cached --check` passou antes do commit.
- **Validação:** `npm test` na raiz passou 117/117; `npm test` em `online/server/` passou 21/21. `npm test` em `online/` concluiu o build verificado e passou 27/28; a única falha continua sendo o teto preexistente do pacote, com `online/public/riftbomb-parts/part-00` em 758.681 bytes contra 750.000, fora desta entrega.
- **Responsivo / screenshots:** não aplicável, pois a mudança altera apenas a resposta textual para crawlers e não modifica a renderização desktop ou mobile. Playwright headless, scripts `hostile-ui` e `headless_shell` não foram usados.
- **Branch / commit:** `swarm/riftbomb/landing`, commit `02aab95` (`Focus crawlers on canonical landing`); nenhum merge, push, PR ou deploy foi realizado.
- **Concorrência preservada:** o WIP preexistente em bot, modelos, jogo, hero, cliente e empacotamento permaneceu fora do commit; somente os dois arquivos da entrega foram incluídos.
- **Próximo passo:** humano deve separar os commits exclusivos de landing em uma base limpa; quando `online/app/page.tsx` e `online/app/globals.css` estiverem livres, reforçar a proposta de valor e o CTA principal do hero.

## 2026-07-29 22:53:14 -03:00 — entregue

- **Antes:** os CTAs dos estados de recuperação 404, erro de rota e erro global reduziam apenas para `scale(0.99)` ao pressionar, uma variação praticamente imperceptível.
- **Decisão:** fazer uma única melhoria de microinteração isolada do hero concorrente: adotar `scale(0.96)` no estado ativo compartilhado e proteger esse contrato com uma asserção de regressão.
- **Depois:** `Entrar na arena`, `Tentar novamente` e `Recarregar arena` oferecem feedback tátil claro no pressionamento, preservando o deslocamento vertical de 1 px, foco visível e demais estados existentes.
- **Arquivos da entrega:** `online/app/not-found.module.css` e `online/tests/not-found.test.mjs`; este ledger registra a rodada, mas não é contado como entrega de produto.
- **Evidência:** a validação em navegador visível mediu `transform: matrix(0.96, 0, 0, 0.96, 0, 1)` no CTA pressionado em desktop e mobile. Em 390×844, `scrollWidth=390`, o CTA mede 320×58 px e termina em 604 px, inteiro acima da dobra. Capturas: `artifacts/landing-cta-press/404-desktop.png`, `artifacts/landing-cta-press/404-desktop-pressed.png` e `artifacts/landing-cta-press/404-mobile.png`.
- **Validação:** teste focado passou 2/2; `npm test` na raiz passou 117/117; `npm test` em `online/server/` passou 21/21. `npm test` em `online/` concluiu o build verificado e passou 27/28; a única falha continua sendo o teto preexistente do pacote, com `online/public/riftbomb-parts/part-00` em 766.175 bytes contra 750.000, fora desta entrega. O navegador não registrou erros ou avisos.
- **Branch / commit:** `swarm/riftbomb/landing`, commit `9016445` (`Make recovery CTAs feel tactile`); nenhum merge, push, PR ou deploy foi realizado. Playwright headless, scripts `hostile-ui` e `headless_shell` não foram usados.
- **Concorrência preservada:** o WIP preexistente em bot, jogo, documentação e artefatos permaneceu fora do commit; somente os dois arquivos da entrega foram incluídos.
- **Próximo passo:** humano deve separar os commits exclusivos de landing em uma base limpa; quando os arquivos centrais estiverem livres, reforçar a proposta de valor e o CTA principal do hero.

## 2026-07-29 23:12:35 -03:00 — entregue

- **Antes:** em celulares em retrato, o breakpoint ocultava todo o `.client-hero-copy`; a entrada mostrava modos e configuração, mas removia o nome, a descrição e a prova comercial do modo selecionado.
- **Decisão:** fazer uma única melhoria visível de hero e conversão: restaurar a proposta do modo em um card compacto acima da configuração e tornar a prova online direta — `PvP em tempo real · São Paulo · sem download` — sem alterar a lógica da partida.
- **Depois:** o hero mobile exibe eyebrow, título, descrição e prova em composição própria de duas colunas; a configuração permanece rolável abaixo dele e o CTA fixo continua sempre alcançável. Em desktop, a prova comercial substitui a copy técnica anterior do servidor.
- **Arquivos da entrega:** `online/app/page.tsx`, `online/app/globals.css` e `online/tests/client-shell.test.mjs`; este ledger registra a rodada, mas permaneceu fora do commit por conter histórico compartilhado.
- **Evidência responsiva:** navegador visível confirmou 390×844 e 1440×900. No mobile, `scrollWidth=390`, o hero mede 374×104 px, a prova mede 140×46 px e o CTA fixo preserva 390×58 px; no desktop, `scrollWidth=1440` e a hierarquia do hero permaneceu íntegra. Capturas: `artifacts/landing-mobile-hero/before-mobile.png`, `artifacts/landing-mobile-hero/after-mobile.png` e `artifacts/landing-mobile-hero/after-desktop.png`.
- **Validação:** teste focado passou 5/5, ESLint local passou e `git diff --check` passou. `npm test` na raiz fez build e passou 124/125; a única falha é o WIP concorrente `docs/qa/comparar-qa`, que contém só um arquivo. `npm test` em `online/` fez build verificado e passou 28/29; a única falha continua sendo o teto preexistente do pacote, com `online/public/riftbomb-parts/part-00` em 766.175 bytes contra 750.000. `npm test` em `online/server/` passou 21/21.
- **Observação de navegador:** o bootstrap da arena registrou um `TypeError` de `MutationObserver.observe` durante a inspeção; ele não nasce nos três arquivos da entrega e não foi misturado a esta rodada.
- **Branch / commit:** `swarm/riftbomb/landing`, commit `4321df0` (`Restore the mobile landing promise`); nenhum merge, push, PR ou deploy foi realizado. Playwright headless, scripts `hostile-ui` e `headless_shell` não foram usados.
- **Concorrência preservada:** o WIP preexistente de bot, jogo, documentação e artefatos permaneceu fora do commit; somente os três arquivos da entrega foram incluídos.
- **Próximo passo:** separar os commits exclusivos de landing em uma base limpa; depois, avaliar a copy e o estado inicial do CTA principal sem misturar a falha concorrente do runtime.

## 2026-07-29 23:28:21 -03:00 — entregue

- **Antes:** o Quick Match era o modo inicial e recomendado, mas seu CTA dizia `BUSCAR PARTIDA`, uma instrução genérica que não expressava a entrada imediata no produto; a nota abaixo também falava apenas de controles e regras.
- **Decisão:** fazer uma única melhoria de conversão no CTA inicial: trocar o rótulo por `JOGAR AGORA` e explicar o resultado imediato com `Encontre um rival online sem criar sala.` sem alterar a ação de matchmaking.
- **Depois:** desktop e mobile apresentam uma chamada direta e a expectativa correta do Quick Match, enquanto os demais modos preservam seus rótulos e avisos próprios.
- **Arquivos da entrega:** `online/app/page.tsx` e `online/tests/client-shell.test.mjs`; este ledger registra a rodada, mas permaneceu fora do commit por conter histórico compartilhado.
- **Evidência responsiva:** navegador visível confirmou desktop 1440×900 sem overflow, CTA ativo de 279×48 px e microcopy de 279 px logo abaixo. Em mobile 390×844, `scrollWidth=390`, hero de 374×104 px e CTA fixo ativo de 372,4×42,4 px, inteiro na viewport. Capturas: `artifacts/landing-quick-cta/cta-desktop.png` e `artifacts/landing-quick-cta/cta-mobile.png`; não houve erros nem avisos no console.
- **Validação:** teste focado passou 6/6, ESLint local dos dois arquivos passou e `git diff --check` passou. `npm test` na raiz passou 129/129; `npm test` em `online/server/` passou 21/21. `npm test` em `online/` fez build verificado e passou 29/30; a única falha continua sendo o teto preexistente do pacote, com `online/public/riftbomb-parts/part-00` em 766.175 bytes contra 750.000.
- **Branch / commit:** `swarm/riftbomb/landing`, commit `d4258a8` (`Clarify the Quick Match CTA`); nenhum merge, push, PR ou deploy foi realizado. Playwright headless, scripts `hostile-ui` e `headless_shell` não foram usados.
- **Concorrência preservada:** o WIP preexistente de bot, modelos jogáveis, jogo, documentação e artefatos permaneceu fora do commit; somente os dois arquivos da entrega foram incluídos.
- **Próximo passo:** em uma rodada futura, testar feedback tátil e foco do CTA principal ou separar os commits exclusivos de landing em uma base limpa antes de integração humana.

## 2026-07-29 23:53:26 -03:00 — precisa humano

- **Antes:** a rodada anterior tornou o CTA inicial direto com `JOGAR AGORA`, mas o botão principal não tinha um foco de teclado próprio e não oferecia compressão tátil ao pressionar; desktop e mobile dependiam apenas do hover para comunicar interação.
- **Decisão:** fazer uma única melhoria de conversão e acabamento: compartilhar entre o CTA desktop e o CTA fixo mobile um anel interno branco de foco e o feedback `translateY(1px) scale(0.97)` no pressionamento, sem alterar copy ou matchmaking.
- **Depois:** `JOGAR AGORA` comunica foco de teclado de forma inequívoca e responde ao toque/clique com movimento curto de 140 ms; o estado desabilitado continua excluído da microinteração.
- **Arquivos da entrega:** `online/app/globals.css` e `online/tests/client-shell.test.mjs`; este ledger registra a rodada, mas permaneceu fora do commit por conter histórico compartilhado.
- **Evidência responsiva:** navegador visível confirmou desktop 1440×900 com CTA de 279×48 px e mobile 390×844 com CTA de 372,4×42,4 px, ambos com `outline: 3px solid white` e `outline-offset: -6px`. No mobile, `scrollWidth=390` e o CTA termina em 836,8 px, inteiro na viewport. Capturas: `artifacts/landing-primary-cta/cta-desktop-focus.png` e `artifacts/landing-primary-cta/cta-mobile-focus.png`.
- **Validação:** teste focado passou 7/7, ESLint focado e `git diff --check` passaram; `npm test` na raiz passou 137/137 e `npm test` em `online/server/` passou 21/21. `npm test` em `online/` concluiu o build verificado e passou 30/31; a única falha é o teto preexistente do pacote, com `online/public/riftbomb-parts/part-00` em 776.391 bytes contra 750.000, fora desta entrega.
- **Observação de navegador:** a instância correta em `127.0.0.1:4174` carregou a arena e o CTA; o runtime registrou o `TypeError` preexistente de `MutationObserver.observe` já documentado na rodada de 23:12, sem origem nos dois arquivos da entrega. A instância antiga em 4173 foi deixada intacta.
- **Branch / commit:** o commit limpo original foi `ad0ea03` (`Make the primary CTA tactile`), com somente os dois arquivos da entrega. Às 23:53:55 outro processo executou `commit (amend)` e moveu o HEAD da branch para `286865b`, acrescentando a alteração alheia `.gitattributes` (`*.sh text eol=lf`) ao mesmo commit. Nenhum merge, push, PR ou deploy foi realizado. Playwright headless, scripts `hostile-ui` e `headless_shell` não foram usados.
- **Precisa humano:** separar a alteração concorrente de `.gitattributes` do commit de landing ou recuperar o objeto limpo `ad0ea03` em uma base autorizada; não foi feito reset, novo amend ou reversão porque isso apagaria trabalho simultâneo de outro assunto.
- **Concorrência preservada:** o WIP preexistente em bot, jogo, documentação, pacote raiz e artefatos permaneceu intacto no working tree. A entrega foi inicialmente commitada isolada, mas o amend externo posterior misturou `.gitattributes` ao commit atual.
- **Próximo passo:** humano deve separar `ad0ea03` ou a alteração de `.gitattributes`; depois avaliar a prova visual do hero ou o estado de espera do Quick Match sem misturar o runtime concorrente.
