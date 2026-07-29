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
