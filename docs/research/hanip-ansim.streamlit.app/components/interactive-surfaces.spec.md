# Interactive Surfaces Component Spec

## Overview

- Target: `vercel-app/components/HanipApp.tsx`, `vercel-app/app/globals.css`
- Selectors: `.metric`, `.tabs`, `.panel`, `.brand-folder`, `.menu-card`, `.nutrition-summary`, `.kakao-map`.
- Interaction model: mixed click, input, async data, map and chart.

## DOM Structure

Hero metrics feed into a tabbed set of recommendation, cart, map, comparison and provenance panels.

## Computed Styles

- Large surfaces: white or near-black, 24~32px radius, 32~48px padding.
- Menu cards: white, subtle 1px border, no heavy shadow, hover translateY(-2px).
- Primary CTA: `#0071e3`, white text, 999px radius.
- Safety badge: green; warning state: red; muted text: `#6e6e73`.

## States and Behaviors

- Loading, ready, error and empty states are distinct.
- Brand cards expand in place; add button confirms without layout shift.
- Charts retain exact values in an adjacent accessible table.
- Map/API errors remain visible and actionable.

## Per-State Content

All current Korean menu, nutrition, store and provenance content is preserved.

## Assets

Existing brand logos, menus CSV, Lucide icons, Recharts SVG and Kakao map only.

## Text Content

Do not invent menu facts, metrics or testimonials. Counts derive from the loaded CSV and current filters.

## Responsive Behavior

- Metrics: 4 columns desktop, 2 tablet, 1 mobile.
- Menu grid: 2 desktop, 1 tablet/mobile.
- Tables scroll horizontally; maps remain at least 420px high.

## Original Implementation Inventory

React components and states already implement filtering, local cart, chart, location lookup and provenance. CSS re-theme must not change data semantics or event handlers.

## Parity Decision

`framework-adapted port` for the existing interaction logic; `approved reimplementation` for layout and visual styling.
