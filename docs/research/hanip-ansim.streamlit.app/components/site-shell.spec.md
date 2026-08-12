# Site Shell Component Spec

## Overview

- Target: `vercel-app/components/HanipApp.tsx`, `vercel-app/app/globals.css`
- Source URL: https://hanip-ansim.streamlit.app/
- Design reference: https://www.apple.com/kr/
- Interaction model: sticky navigation + click-driven filter drawer + tab navigation.

## DOM Structure

`main.app-shell > header.global-nav + aside.filter-drawer + section.content > header.hero + metrics + nav.tabs + panel`

## Computed Styles

- Reference navigation: fixed, 44px, `rgba(250,250,252,.8)`, z-index 9999.
- Reference hero heading: 56px, weight 600, line-height about 66px.
- Target canvas `#f5f5f7`, ink `#1d1d1f`, max content width 1180px.
- Drawer width 360px desktop, min(92vw, 380px) mobile.

## States and Behaviors

- Filter trigger opens drawer and backdrop; close button, backdrop and Escape close it.
- Active tab uses high-contrast filled pill and `aria-selected=true`.
- Global nav remains readable over scrolling content with blur.

## Per-State Content

- Closed drawer: service title, data freshness, filter CTA visible.
- Open drawer: four filter groups and current selection summary.

## Assets

No Apple assets. Existing project logo emoji/icon and repository brand logos only.

## Text Content

Keep Korean service copy and official-data status. No Apple product copy.

## Responsive Behavior

- Desktop/tablet/mobile all use drawer rather than a permanently occupied sidebar.
- At 520px, nav labels may reduce but controls remain 44px minimum hit targets.

## Original Implementation Inventory

Current fixed 290px sidebar, margin-left content, state `filtersOpen`, `tab`, filters and cart. No custom JS driver beyond React state.

## Parity Decision

`approved reimplementation`: the user explicitly requested Apple-referenced design for the existing group project, not an Apple clone.
