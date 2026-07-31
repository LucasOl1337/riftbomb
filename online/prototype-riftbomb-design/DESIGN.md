---
name: Riftbomb Design Lab
version: 0.1.0-prototype
status: experimental
description: Contrato visual descartável para comparar três shells pré-partida do Riftbomb.
references:
  primary: https://designmd.ai/chef/esportsarena
  artwork_pattern: https://designmd.ai/chef/red-cinema
  format: https://designmd.ai/what-is-design-md
license_notes: Princípios abstratos adaptados de referências MIT; nenhum código, logo ou asset externo foi copiado.
colors:
  primary: "#8DF2EA"
  secondary: "#D8B96E"
  canvas: "#05090C"
  surface: "#0B141A"
  surfaceRaised: "#101D24"
  text: "#F2F7F7"
  textMuted: "#9AB0B6"
  brandRift: "#8DF2EA"
  brandAlloy: "#D8B96E"
  sideBlue: "#55A8FF"
  sideRed: "#FF6468"
  success: "#7FE69E"
  warning: "#FFD166"
  danger: "#FF7B7F"
  focus: "#FFF1AD"
typography:
  display:
    fontFamily: "Bahnschrift Condensed, Arial Narrow, sans-serif"
    fontSize: 48px
    fontWeight: 700
    lineHeight: 0.9
    letterSpacing: -0.02em
  body:
    fontFamily: "Inter, Segoe UI, sans-serif"
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

# Riftbomb Design Lab

## Overview

**Pergunta:** como o shell de entrada do Riftbomb deve parecer e organizar decisões antes da partida?

O laboratório é deliberadamente isolado e descartável. Ele compara três arquiteturas de informação sobre o mesmo estado local. O produto continua sendo uma **arena tática competitiva no navegador**. Sua expressão deve ser fantástica nos mundos e precisa nas ações, regras e estados.

Princípios:

1. **A arena é o palco.** Arte autoral recebe área, contraste e silêncio visual.
2. **O chrome é instrumento.** Todo ornamento deve ajudar orientação, comparação ou decisão.
3. **Identidade não é semântica competitiva.** Rift e liga identificam o produto; azul e vermelho identificam lados.
4. **Uma ação, uma consequência.** Estado pressionado, carregando, sucesso e falha são explícitos.
5. **Densidade com legibilidade.** Nenhum texto funcional abaixo de 12px; nenhum alvo abaixo de 44px.

## Colors

- **Canvas** (`{colors.canvas}`): vazio ao redor da arena e fundo estrutural.
- **Surface** (`{colors.surface}`): painéis principais.
- **Surface Raised** (`{colors.surfaceRaised}`): seleção ativa e overlays necessários.
- **Text** (`{colors.text}`): informação primária.
- **Text Muted** (`{colors.textMuted}`): metadados e instruções secundárias; nunca informação crítica.
- **Brand Rift** (`{colors.brandRift}`): marca, foco de navegação e energia do rift.
- **Brand Alloy** (`{colors.brandAlloy}`): ação primária, seleção confirmada e detalhes metálicos.
- **Side Blue** (`{colors.sideBlue}`): exclusivamente jogador/lado azul.
- **Side Red** (`{colors.sideRed}`): exclusivamente rival/lado vermelho.
- **Success** (`{colors.success}`): conectado, pronto, vitória ou confirmação.
- **Warning** (`{colors.warning}`): espera, pareamento e ação pendente.
- **Danger** (`{colors.danger}`): erro, desconexão e ação destrutiva; não usar como cor do lado vermelho em texto de sistema.
- **Focus** (`{colors.focus}`): foco visível de teclado.

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
- Desktop: três regiões podem coexistir quando há 1100px ou mais.
- Tablet: duas regiões e um dock horizontal.
- Mobile: uma coluna; decisões aparecem antes de telemetria; arte mantém proporção sem esconder controles.
- Safe areas são obrigatórias no chrome fixo.

As três variantes devem discordar sobre hierarquia:

- **Command Deck:** modo → arena → formação → iniciar.
- **Rift Cinema:** arena → promessa → escolha → iniciar.
- **War Table:** confronto → mapa → briefing → confirmar.

## Elevation & Depth

- Profundidade vem primeiro de sobreposição, contraste e recorte, não de sombras difusas.
- Painéis usam borda de 1px com baixa opacidade.
- Glow de rift só sinaliza seleção/foco; nunca preenche todos os painéis.
- Arte pode receber fade direcional até `{colors.canvas}` para acomodar texto.
- O switcher do protótipo é deliberadamente elevado e visualmente externo ao produto.

## Shapes

- Raio padrão: `{rounded.sm}`; máximo `{rounded.md}`.
- Painéis de destaque usam cantos chanfrados de 8–16px.
- Círculos são reservados a estado online, controles diretos, bombas e marcadores de arena.
- Lados azul/vermelho usam borda, rótulo e posição além da cor.
- Uma linha diagonal representa fenda/rift; não usar hexágonos como decoração universal.

## Components

### Brand lockup

Marca textual `RIFT/BOMB`, bomb mark abstrato e descritor “arena tática”. O slash recebe `{colors.brandRift}`; o restante permanece neutro.

### Mode selector

Seleção exclusiva com nome, consequência e estado. Estados: default, hover, focus-visible, selected e disabled. A seleção nunca depende apenas de cor.

### Champion selector

Retrato compacto, nome e função. O escolhido recebe borda dupla/indicador, não aumento que altere o layout.

### Arena selector

Arte é dominante. Sempre mostrar nome completo, característica tática e posição no conjunto. O thumbnail não recebe borda ornamental quando não selecionado.

### Match assembly

Resume modo, Champion, arena, formato, região e estado de conexão antes do CTA. Dados são projeção do estado, nunca uma fonte paralela.

### Primary action

Fundo `{colors.brandAlloy}`, texto `{colors.canvas}`, altura mínima 52px e formato angular. Estados: idle, pressed, searching, found, ready e disabled. Nunca usa side blue/red.

### System status

Combina ícone/forma, texto e tom. `aria-live="polite"` para transições esperadas; `assertive` somente para falha que bloqueia progresso.

### Prototype switcher

Chrome externo ao produto. Exibe variante, setas, URL estável e atalho de teclado. Não deve ser confundido com navegação final.

## Do's and Don'ts

### Do

- Deixe a arena ocupar a maior área visual disponível.
- Use escala de 4px, bordas finas e geometria angular.
- Mantenha transições de feedback em 120ms ou menos e navegação em até 220ms.
- Exiba a consequência de cada modo antes da ação principal.
- Preserve foco visível, semântica nativa, reduced motion e leitura em 320px.
- Use azul/vermelho com forma, posição e rótulo.
- Faça o estado completo aparecer no monitor do protótipo após toda interação.

### Don't

- Não misture marca ciano/dourada com codificação de times.
- Não use vermelho como erro e time no mesmo elemento.
- Não crie uma grade de cards genérica para todas as escolhas.
- Não aplique blur, glow, gradiente ou animação sem função clara.
- Não use texto funcional abaixo de 12px ou alvo abaixo de 44px.
- Não esconda controles por breakpoint sem alternativa.
- Não conecte este protótipo ao WebSocket, D1 ou runtime do jogo.
