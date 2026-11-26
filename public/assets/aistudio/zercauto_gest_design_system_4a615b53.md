---
name: "ZercAuto Gest — Workshop Precision"
description: "Sharp utilitarian automotive workshop design system in Portuguese (PT) built on racing crimson, carbon graphite, and high-legibility tabular data."
---

## Overview

ZercAuto Gest é uma aplicação web progressiva (PWA) offline-first para gestão integral de oficinas automóveis, desenhada para balcões de receção, chefes de oficina e técnicos em contexto real de trabalho. A interface privilegia clareza operacional imediata, contraste elevado sob iluminação de oficina e densidade controlada para leitura rápida de matrículas, estados de folhas de obra, alertas de stock e faturação em AOA (Kz) ou EUR (€).

O estilo segue uma abordagem **Sharp Utilitarian**: superfícies limpas em camadas tonais neutras, bordas estruturais nítidas sem sombras decorativas, acentos em carmesim técnico apenas para ações primárias e estados críticos, e tipografia tabular para números, matrículas e valores financeiros.

## Colors

A paleta combina **Crimson Torque** (`#760009` / `#991B1B`) para ações principais e identidade Zerca com **Gunmetal & Brushed Steel** (`#1E293B` / `#E5E7EB` / `#EFF1F5`) nos fundos e estruturas para simbolizar o metal da oficina, mantendo contraste elevado e legibilidade contínua. Cores semânticas (`success`, `warning`, `error`) comunicam exclusivamente estado operacional (sincronização, stock baixo, pagamentos pendentes/liquidados).

```yaml
colors:
  accent: "#1E293B"
  on-accent: "#FFFFFF"
  success: "#15803D"
  on-success: "#FFFFFF"
  success-container: "#DCFCE7"
  on-success-container: "#14532D"
  warning: "#B45309"
  on-warning: "#FFFFFF"
  warning-container: "#FEF3C7"
  on-warning-container: "#78350F"
  light:
    primary: "#760009"
    on-primary: "#FFFFFF"
    primary-container: "#991B1B"
    on-primary-container: "#FFFFFF"
    secondary: "#475569"
    on-secondary: "#FFFFFF"
    secondary-container: "#DAE2FD"
    on-secondary-container: "#131B2E"
    tertiary: "#003A5C"
    on-tertiary: "#FFFFFF"
    tertiary-container: "#00527F"
    on-tertiary-container: "#FFFFFF"
    error: "#BA1A1A"
    on-error: "#FFFFFF"
    error-container: "#FFDAD6"
    on-error-container: "#93000A"
    background: "#E5E7EB"
    on-background: "#0F172A"
    surface: "#E5E7EB"
    surface-dim: "#CBD5E1"
    surface-bright: "#FFFFFF"
    surface-container-lowest: "#F8FAFC"
    surface-container-low: "#EFF1F5"
    surface-container: "#E2E8F0"
    surface-container-high: "#CBD5E1"
    surface-container-highest: "#B8C2CC"
    on-surface: "#0F172A"
    surface-variant: "#E2E8F0"
    on-surface-variant: "#334155"
    outline: "#64748B"
    outline-variant: "#CBD5E1"
    inverse-surface: "#1E293B"
    inverse-on-surface: "#F1F5F9"
    inverse-primary: "#FFB4AC"
```

## Typography

A hierarquia tipográfica usa **Sora** para títulos de secção e métricas principais, **Inter** para texto funcional, tabelas e formulários, e **Fira Code** para matrículas, referências de folhas de obra (`FO-2026-0142`), códigos SKU e valores numéricos tabulares.

```yaml
typography:
  display-lg:
    fontFamily: "Sora"
    fontSize: 36px
    fontWeight: 700
    lineHeight: 44px
    letterSpacing: -0.5px
  display-lg-mobile:
    fontFamily: "Sora"
    fontSize: 28px
    fontWeight: 700
    lineHeight: 34px
    letterSpacing: -0.25px
  headline-lg:
    fontFamily: "Sora"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
    letterSpacing: -0.25px
  headline-md:
    fontFamily: "Sora"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 24px
    letterSpacing: 0px
  title-md:
    fontFamily: "Inter"
    fontSize: 15px
    fontWeight: 600
    lineHeight: 22px
    letterSpacing: 0px
  body-md:
    fontFamily: "Inter"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0px
  body-sm:
    fontFamily: "Inter"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 18px
    letterSpacing: 0px
  label-lg:
    fontFamily: "Inter"
    fontSize: 13px
    fontWeight: 600
    lineHeight: 18px
    letterSpacing: 0.1px
  label-sm:
    fontFamily: "Inter"
    fontSize: 11px
    fontWeight: 600
    lineHeight: 16px
    letterSpacing: 0.3px
  mono-md:
    fontFamily: "Fira Code"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 18px
    letterSpacing: 0px
  mono-sm:
    fontFamily: "Fira Code"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0px
```

## Layout & Spacing

A estrutura principal utiliza uma barra lateral recolhível (`Collapsible Rail`, 240px expandida / 72px recolhida) combinada com um cabeçalho global fixo de estado de sincronização e identidade **ZercAuto Gest**, e uma área de trabalho dividida (`Split Workspace`) em grelha fluida de 12 colunas (`gap-4` = 16px) para listar Folhas de Obra à esquerda e inspecionar detalhes, pagamentos ou alertas de stock à direita. Em ecrãs menores que `lg` (tablet vertical e telemóvel), a barra lateral recolhe para gaveta e os painéis empilham em coluna única.

```yaml
spacing:
  gutter-xs: 4px
  gutter-sm: 8px
  gutter-md: 16px
  gutter-lg: 24px
  gutter-xl: 32px
  section: 40px
  page-margin: 24px
```

## Elevation & Depth

Hierarquia construída por **camadas tonais e bordas estruturais nítidas** (`1px solid outline-variant`), sem sombras projetadas (`shadow-none`). A superfície base (`#F9F9F9`) distingue-se dos cartões elevados (`surface-container-lowest: #FFFFFF`) e das áreas secundárias ou cabeçalhos de tabela (`surface-container-low: #F3F3F3`).

## Shapes

Linguagem **Sharp Utilitarian** com raios de canto contidos para transmitir precisão técnica: `4px` em botões, inputs e badges; `8px` em cartões, painéis e modais; `9999px` apenas para indicadores de estado de rede/sincronização.

```yaml
rounded:
  sm: 2px
  DEFAULT: 4px
  md: 6px
  lg: 8px
  xl: 12px
  full: 9999px
```

## Motion & Micro-interaction

Transições curtas e mecânicas apenas em `transform`, `opacity` e cores. Estados de hover e alternância de separadores respondem em 120ms; painéis e inspetores laterais entram em 200ms com desaceleração linear. Sem animações em loop ou efeitos decorativos.

```yaml
motion:
  state-change:
    duration: 120ms
    delay: 0ms
    timingFunction: ease-out
  surface-enter:
    duration: 200ms
    delay: 0ms
    timingFunction: cubic-bezier(0.2, 0, 0, 1)
  surface-exit:
    duration: 150ms
    delay: 0ms
    timingFunction: cubic-bezier(0.3, 0, 1, 1)
```

## Voice & Content Strategy

- **Tom de voz:** Direto, técnico e claro em Português Europeu (PT-PT), sem floreados. Exemplo: `"3 alterações pendentes — Sincronizar Agora"` em vez de `"Os seus dados estão seguros connosco"`.
- **Capitalização:** Sentence case em botões, títulos e etiquetas; códigos de matrícula (`LD-42-88-AB`) e referências (`FO-2026-0142`) em maiúsculas com `Fira Code`.
- **Terminologia fixa:** `Folha de Obra` (nunca "Ordem de Serviço"), `Viatura` (nunca "Carro"), `Liquidado` (nunca "Pago"), `Em Execução`, `Aguarda Peças`, `Pronta para Faturar`, `Faturada`, `Terminar Sessão`.
- **Ações com verbos:** `"Nova Folha de Obra"`, `"Sincronizar Agora"`, `"Gerar Link de Pagamento"`, `"Exportar CSV"`.
- **Números e moeda:** `tabular-nums` em todos os valores monetários (`148.500,00 Kz` ou `245,00 €`), datas em formato `DD/MM/YYYY`.

## Components

Component implementations live as individual HTML sticker sheet files in
`components/`. Each file contains the canonical, styled HTML components with
`<!-- COMPONENT: name -->` comment markers. Read each file before use.

- **Badge** → `@components/badge.html` — `badge-numeric`, `badge-dot`
- **Button** → `@components/button.html` — `button-primary`, `button-icon`, `button-with-icon`
- **Card** → `@components/card.html` — `card-elevated`, `card-action`, `card-interactive`, `card-interactive-2`
- **Table** → `@components/table.html` — `table-standard`, `table-interactive`, `table-selectable`
- **Tabs** → `@components/tabs.html` — `tabs-horizontal`, `tabs-with-icon`
