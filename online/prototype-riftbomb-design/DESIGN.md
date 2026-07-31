---
name: Riftbomb War Table
version: 0.4.0-prototype
status: experimental
description: Contrato visual descartável para a War Table pré-partida do Riftbomb.
references:
  primary: https://designmd.ai/chef/esportsarena
  primary_preview_api: https://designmd.ai/api/v1/previews/653ee8c0-0c96-411a-9a0a-c99c4b814413/hero-light.png
  format: https://designmd.ai/what-is-design-md
license_notes: Princípios abstratos adaptados de referências MIT; nenhum código, logo ou asset externo foi copiado.
colors:
  primary: "#8DF2EA"
  secondary: "#D8B96E"
  canvas: "#05090C"
  canvasSoft: "#071015"
  surface: "#0A1419"
  surfaceSoft: "#0D1A20"
  surfaceRaised: "#122229"
  text: "#F1F6F6"
  textSoft: "#C4D1D3"
  textMuted: "#91A8AD"
  brandRift: "#8DF2EA"
  brandAlloy: "#D8B96E"
  participantSelf: "#62AFFF"
  participantRival: "#FF7479"
  success: "#86E8A4"
  warning: "#F0C961"
  danger: "#FF8589"
  focus: "#FFF0A8"
typography:
  display:
    fontFamily: "Bahnschrift Condensed, Arial Narrow, sans-serif"
    fontSize: 48px
    fontWeight: 700
    lineHeight: 0.9
    letterSpacing: -0.02em
  body:
    fontFamily: "Segoe UI Variable, Segoe UI, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0em
  data:
    fontFamily: "Cascadia Mono, Consolas, monospace"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: 0.04em
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
rounded:
  none: 0px
  sm: 2px
  md: 4px
---

# Riftbomb War Table

## Overview

**Pergunta:** como montar protocolo, arena e formação antes da partida sem competir visualmente com a arena?

O laboratório é deliberadamente isolado e descartável. A War Table é sua única direção ativa. O produto continua sendo uma **arena tática competitiva no navegador**. Sua expressão deve ser fantástica nos mundos e precisa nas ações, regras e estados.

**Atmosfera canônica:** noturna, industrial e concentrada. A interface lembra uma mesa de comando construída em liga escura: densa para decisões rápidas, silenciosa ao redor da arte e sem excesso ornamental.

Princípios:

1. **A arena é o palco.** Arte autoral recebe área, contraste e silêncio visual.
2. **O chrome é instrumento.** Todo ornamento deve ajudar orientação, comparação ou decisão.
3. **Identidade não inventa regra.** Rift e liga identificam o produto; a interface diferencia participantes sem criar “bases” que não existem na arena.
4. **Uma ação, uma consequência.** Estado pressionado, carregando, sucesso e falha são explícitos.
5. **Densidade com legibilidade.** Nenhum texto funcional abaixo de 12px; nenhum alvo abaixo de 44px.
6. **Uma superfície, uma linguagem.** O produto fala pt-BR; “War Table” é o nome próprio desta composição, não um segundo idioma para microcopy.

### Auditoria da referência profissional

A referência primária é o [ESportsArena](https://designmd.ai/chef/esportsarena), id `653ee8c0-0c96-411a-9a0a-c99c4b814413`, licença MIT. Ela foi localizada em 31/07/2026 pelo CLI oficial `designmd 0.2.0`, que consulta a API `https://designmd.ai/api/v1`; o preview comparado veio diretamente do endpoint registrado no front matter. O kit fornece a gramática estrutural, não a identidade visual do Riftbomb.

| Critério observado na referência | Falha anterior da War Table | Decisão aplicada | Evidência final |
| --- | --- | --- | --- |
| Canvas amplo, porém contido | Conteúdo esticado até as bordas | Shell limitado a 1800px | 52px de margem lateral em 1920px; 20px em 1280px |
| Módulos encerram junto do conteúdo | Colunas e dock criavam grandes áreas mortas | Painéis laterais têm altura intrínseca; CTA vive no dossiê | Em 1280 por 720, protocolo 462px e dossiê compacto 638px; sem dock global |
| Um mesmo dado usa um mesmo primitivo | Katarina aparecia de corpo inteiro e os demais como ícones genéricos | Um único componente de avatar quadrado e quatro retratos 640×640 gerados com a mesma direção de arte | Lista e confronto 40×40; seleção 58×58; todos os assets carregados |
| Densidade baseada em 4px | Linhas muito altas e microcopy irregular | Ritmo 4/8/12/16; controles entre 48 e 88px | Nenhum controle funcional abaixo de 44px |
| Ação acompanha o contexto | CTA separado por uma barra vazia de largura total | Resumo, estado e CTA formam um único cluster no dossiê | Cluster de ação com 100px no desktop Full HD |
| Desktop e mobile têm composições próprias | Breakpoints apenas empilhavam painéis longos | 3 colunas, 2 colunas e fluxo de 1 coluna explícitos | Sem overflow horizontal em 1920px, 1280px, 960px, 560px e 360px; em 1280 por 720, rail termina em 703px e CTA em 706px |

## Colors

- **Obsidiana profunda, Canvas** (`{colors.canvas}`, `#05090C`): vazio ao redor da arena e fundo estrutural.
- **Fosso teal, Canvas Soft** (`{colors.canvasSoft}`, `#071015`): fundo interno de mídia, avatares e cartões técnicos.
- **Aço noturno, Surface** (`{colors.surface}`, `#0A1419`): painéis principais.
- **Liga submersa, Surface Soft** (`{colors.surfaceSoft}`, `#0D1A20`): repouso separado do canvas sem ganhar elevação.
- **Placa elevada, Surface Raised** (`{colors.surfaceRaised}`, `#122229`): seleção ativa e overlays necessários.
- **Branco mineral, Text** (`{colors.text}`, `#F1F6F6`): informação primária.
- **Névoa clara, Text Soft** (`{colors.textSoft}`, `#C4D1D3`): explicações e valores secundários ainda funcionais.
- **Cinza sonar, Text Muted** (`{colors.textMuted}`, `#91A8AD`): metadados e instruções secundárias; nunca informação crítica.
- **Ciano de fenda, Brand Rift** (`{colors.brandRift}`, `#8DF2EA`): marca, foco de navegação e energia do rift.
- **Ouro de liga, Brand Alloy** (`{colors.brandAlloy}`, `#D8B96E`): ação primária e seleção confirmada. Não sinaliza navegação ou rede.
- **Azul de leitura, Participant Self** (`{colors.participantSelf}`, `#62AFFF`): identifica o jogador sem implicar base, time ou território.
- **Coral de rival, Participant Rival** (`{colors.participantRival}`, `#FF7479`): identifica o oponente sem implicar base, time ou território.
- **Verde de prontidão, Success** (`{colors.success}`, `#86E8A4`): conectado, pronto, vitória ou confirmação.
- **Âmbar de espera, Warning** (`{colors.warning}`, `#F0C961`): espera, pareamento e ação pendente.
- **Vermelho de falha, Danger** (`{colors.danger}`, `#FF8589`): erro, desconexão e ação destrutiva; não representa o rival.
- **Marfim de foco, Focus** (`{colors.focus}`, `#FFF0A8`): foco visível de teclado.

As imagens recebem overlays de contraste somente para tornar texto legível. Cores materiais das arenas não viram tokens globais.

## Typography

- **Display XL:** `{typography.display}`, `clamp(48px, 8vw, 132px)`, peso 700, line-height 0.82, uppercase. Somente marca, arena e versus.
- **Display:** `{typography.display}`, 28–48px, peso 700, line-height 0.95.
- **Heading:** `{typography.body}`, 18–24px, peso 700, line-height 1.15.
- **Body:** `{typography.body}`, 14–16px, peso 400–600, line-height 1.5.
- **Microcopy:** `{typography.body}`, mínimo 12px, peso 650, tracking 0.08em.
- **Data:** `{typography.data}`, 12–14px, peso 500, números tabulares.

Display comunica impacto; body explica; data confirma. Não usar display condensado em parágrafos ou estados de erro.

## Layout

- Unidade-base: `{spacing.base}`.
- Margens fluidas: `clamp(16px, 3vw, 48px)`.
- Alvos: mínimo 44×44px; CTA principal mínimo 52px de altura.
- Desktop amplo: `272px / minmax(560px, 1fr) / 340px`, dentro de um shell de 1800px.
- Em desktop com altura limitada, a imagem da arena recebe orçamento vertical por `100dvh`; cabeçalho, confronto, legenda e seletor devem permanecer no primeiro quadro. Entre 641px e 1320px, thumbnails redundantes cedem espaço aos nomes completos das arenas. Até 760px de altura útil, o resumo duplicado do campeão desaparece do dossiê, pois confronto, lista e formação já preservam a mesma informação.
- Até 1180px: protocolo e arena ocupam a primeira linha; perfil + lista e resumo + CTA dividem o dossiê abaixo.
- Até 860px: fluxo de uma coluna; o dossiê ainda usa duas colunas quando houver espaço real.
- Até 640px: uma coluna; seletores de modo e arena viram rails horizontais; arte usa 4:3 sem esconder controles.
- Safe areas são obrigatórias no chrome fixo.
- Colunas laterais acompanham o próprio conteúdo; nunca são esticadas artificialmente até a altura da arte.
- O CTA segue imediatamente o resumo que o justifica, dentro do dossiê. Espaço vazio existe entre regiões, não dentro de um painel funcional.
- Passos do fluxo e índices de conteúdo usam rótulos distintos: `PASSO 02` não pode parecer o mesmo dado que `ARENA 02 / 05`.

Hierarquia canônica: protocolo → confronto → mapa → formação → confirmar. A arena recebe a maior área; a ação permanece junto da formação.

## Elevation & Depth

- Profundidade vem primeiro de sobreposição, contraste e recorte, não de sombras difusas.
- Painéis usam borda de 1px com baixa opacidade.
- Glow de rift só sinaliza seleção/foco; nunca preenche todos os painéis.
- Arte pode receber fade direcional até `{colors.canvas}` para acomodar texto.
- O switcher do protótipo é deliberadamente elevado e visualmente externo ao produto.

## Shapes

- Raio padrão: `{rounded.sm}`; máximo `{rounded.md}`.
- Painéis de destaque usam cantos chanfrados de 8–16px.
- Círculos são reservados a estado online, controles diretos e bombas.
- Jogador e oponente usam borda, rótulo e posição além da cor; nenhum marcador sugere base territorial.
- Uma linha diagonal representa fenda/rift; não usar hexágonos como decoração universal.

## Components

### Brand lockup

Marca textual `RIFT/BOMB`, bomb mark abstrato e descritor “arena tática”. O slash recebe `{colors.brandRift}`; o restante permanece neutro.

### Mode selector

Seleção exclusiva com nome, consequência e estado. O item ativo expõe sua consequência sem obrigar o usuário a procurar o CTA. Estados: default, hover, focus-visible, selected e disabled. A seleção nunca depende apenas de cor.

### Champion selector

Retrato compacto, nome sempre visível e função quando houver espaço. Imagens de origens diferentes recebem janela e enquadramento normalizados. O escolhido recebe borda dupla/indicador, não aumento que altere o layout.

### Arena selector

Arte é dominante. Sempre mostrar nome completo, característica tática e posição no conjunto. O thumbnail não recebe borda ornamental quando não selecionado.

### Match assembly

Resume modo, campeão, arena, formato, região e estado de conexão antes do CTA. Dados são projeção do estado, nunca uma fonte paralela. O dossiê tem altura intrínseca e não cria vazio estrutural entre fatos e ação.

### Training bot profile

Quando o protocolo é Treinamento, o painel de protocolo projeta a identidade canônica de `bot-opponent/v1/bot-profile.mjs`: Dominus-01, V1 Renekton, inteligência, certificação, sobrevivência e limite atual. O perfil não inventa estatísticas e o rival projetado fica travado em Renekton.

### Primary action

Fundo `{colors.brandAlloy}`, texto `{colors.canvas}`, altura mínima 52px e formato angular. Estados: idle, pressed, searching, found, ready e disabled. Nunca usa side blue/red.

### System status

Combina ícone/forma, texto e tom. `aria-live="polite"` para transições esperadas; `assertive` somente para falha que bloqueia progresso.

## Do's and Don'ts

### Do

- Deixe a arena ocupar a maior área visual disponível.
- Use escala de 4px, bordas finas e geometria angular.
- Mantenha transições de feedback em 120ms ou menos e navegação em até 220ms.
- Exiba a consequência de cada modo antes da ação principal.
- Preserve foco visível, semântica nativa, reduced motion e leitura em 320px.
- Diferencie jogador/oponente com forma, posição e rótulo, sem sugerir bases ou times permanentes.
- Faça toda interação atualizar a mesma fonte local de estado e sua representação visível.
- Use setas de avanço para ações internas e reserve `↗` a destinos externos.

### Don't

- Não misture marca ciano/dourada com codificação de times.
- Não use vermelho como erro e time no mesmo elemento.
- Não crie uma grade de cards genérica para todas as escolhas.
- Não aplique blur, glow, gradiente ou animação sem função clara.
- Não use texto funcional abaixo de 12px ou alvo abaixo de 44px.
- Não esconda controles por breakpoint sem alternativa.
- Não conecte este protótipo ao WebSocket, D1 ou runtime do jogo.
- Não estique um painel lateral apenas para igualar a altura da arena.
- Não reintroduza seletor de variantes, dock global ou heróis de Champion com escalas diferentes.
- Não reintroduza Versus local, entrada por código ou Desafio como protocolo separado; Jogar com amigo é o desafio MD10 por link direto.
- Não misture rótulos internos em inglês com a interface localizada em pt-BR.
