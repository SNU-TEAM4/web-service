# Wave 1 — code integration

## Digest

- The collection entry point is `scripts/update_official_data.py`; a new collector must join the aggregate in `__main__` and both CSV mirrors are written from the same validated frame.
- The validator in `scripts/validate_menu_data.py` enforces the 17-field schema, numeric bounds, allowed allergen tokens, HTTPS sources, ISO dates, booleans, duplicate prevention, and mirror hash equality.
- Next.js discovers brands from CSV rows. Logo paths are optional only after the UI gains a fallback; the current implementation assumes every brand exists in `BRAND_LOGOS`.
- Root cause of the reported collision: the desktop folder header allocates an 84 px image track while the Next image requests 86 px and has no width constraint.

## Integration map

- Collector: `scripts/update_official_data.py`
- Validator: `scripts/validate_menu_data.py`
- Primary CSV: `data/menus.csv`
- Deployed CSV: `vercel-app/public/data/menus.csv`
- Next brand mapping: `vercel-app/lib/brands.ts`
- Next rendering: `vercel-app/components/HanipApp.tsx`
- Layout owner: `vercel-app/app/globals.css`
- Streamlit mappings: `app.py`, `assets/brand_logos/`

## Verdict

PASS. The collision has a code-level cause and a bounded fix: constrain the image inside a dedicated frame, use `minmax(0, 1fr)` for copy, and reserve a fixed chevron track. A text fallback is required before adding a brand without a local logo asset.

## EXPAND

- LEAD: Add one validated official collector before expanding brand mappings — WHY: CSV remains the single source of truth — ANGLE: verify rows and mirror identity before UI work.
- LEAD: Add a resilient brand mark fallback — WHY: data expansion must not make Next Image receive `undefined` — ANGLE: render an initial badge when a mapped logo is absent.
- DEAD END: Merely widening the desktop grid track would not protect long brand names, mobile layout, or future unmapped brands.

## SOURCES

- SOURCE: repo:scripts/update_official_data.py — GRADE: A — FETCH: ok — OBSERVED: 2026-08-11 — AS-OF: local branch
- SOURCE: repo:scripts/validate_menu_data.py — GRADE: A — FETCH: ok — OBSERVED: 2026-08-11 — AS-OF: local branch
- SOURCE: repo:vercel-app/components/HanipApp.tsx — GRADE: A — FETCH: ok — OBSERVED: 2026-08-11 — AS-OF: local branch
- SOURCE: repo:vercel-app/app/globals.css — GRADE: A — FETCH: ok — OBSERVED: 2026-08-11 — AS-OF: local branch
