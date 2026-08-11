# Chrome visual and interaction QA

Observed: 2026-08-11, Chrome, local Next production server and Vercel Preview commit `58fd13c`.

## Results

- PASS — hero presents a centered headline, concise copy, paired CTA, generous whitespace, and a white-to-black section transition.
- PASS — current data renders as 640 menus, 10 brands, and 415 allergen-confirmed rows.
- PASS — Kyochon appears as a missing-logo fallback with 9 accepted official rows and opens into menu cards marked `공식 100g 기준`.
- PASS — no brand header collision at the observed 1121 px viewport. Every brand measured `logoCopyGap=30px` and `copyChevronGap=14px`.
- PASS — the soy allergen filter opens in the modal drawer, becomes active, and changes recommendation count from 530 to 106 while retaining all 10 brand controls.
- PASS — production build and lint completed without app errors.
- PASS — Vercel reported success for commit `58fd13c`; the branch Preview loaded in the signed-in Chrome session with 640 menus, 10 brands, 415 allergen-confirmed rows, and the official-source proof stage.
- PASS — the deployed Kyochon folder contained 9 official rows. All 10 deployed brand headers retained `logoCopyGap=30px` and `copyChevronGap=14px`.
- EXTERNAL — a development-only hydration warning was traced to the user's HWP Chrome extension adding `data-hwp-extension` attributes to `<html>`. It disappeared from the production-mode UI and is not produced by the app markup.

## Captures

- `after-desktop.png` — top-level hierarchy.
- `after-brand-folders.png` — mapped logo, fallback logo, copy, chevron, and Kyochon menu cards.
- `filter-drawer-active.png` — active allergen filter journey.
- `vercel-preview-58fd13c.png` — deployed hero and official-source proof stage.
- `vercel-preview-kyochon-58fd13c.png` — deployed Kyochon fallback and official menu cards.

## Boundaries

- Chrome's connected window was fixed at 1121 px; the 900 px and 520 px CSS rules were code-reviewed and built, but a fresh 390 px live capture was not produced in this pass.
- Kakao API success still needs deployed environment keys and allowed-domain configuration.
