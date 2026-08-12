# Wave 1 — burger and chicken official sources

## Digest

- Immediate adopter: Kyochon. Its official menu detail pages expose menu name, calories, sugar, protein, saturated fat, sodium, allergens, serving basis, and weight in HTML.
- Conditional adopter: BBQ. A sampled official mobile detail contains the required five values and allergens, but a complete product-ID enumeration endpoint was not established in this wave.
- Mom's Touch uses per-product images for nutrition/allergens, which introduces OCR and pairing risk; BHC returns an empty client-rendered shell to a normal fetch.
- No Brand Burger, Frank Burger, Shake Shack Korea, and Goobne were rejected for this iteration because a current official, complete, machine-verifiable source was not obtained.

## Decision

Adopt Kyochon first. Preserve the official `100g` basis in the category label and use only currently reachable detail pages with complete numeric fields and an allergen statement. Quarantine any incomplete page instead of inventing zeroes.

## EXPAND

- LEAD: BBQ mobile product ID enumeration — WHY: a sampled detail satisfies the schema — ANGLE: discover the menu list endpoint before collection.
- LEAD: BHC client API — WHY: its UI advertises the target fields — ANGLE: capture the XHR endpoint from the live menu route.
- LEAD: Mom's Touch official images — WHY: official but image-only — ANGLE: validate OCR on a reviewed sample before any row is trusted.
- DEAD END: Candidates without a complete official source are excluded from the current release.

## SOURCES

- SOURCE: https://www.kyochon.com/menu/view.asp?id=41184 — GRADE: B — FETCH: ok — OBSERVED: 2026-08-11 — AS-OF: unknown
- SOURCE: https://www.kyochon.com/menu/chicken.asp — GRADE: B — FETCH: ok — OBSERVED: 2026-08-11 — AS-OF: unknown
- SOURCE: https://mt.bbq.co.kr/menu/menuView.asp?midx=977 — GRADE: B — FETCH: ok — OBSERVED: 2026-08-11 — AS-OF: unknown
- SOURCE: https://www.momstouch.co.kr/menu/view.php?idx=231 — GRADE: B — FETCH: ok — OBSERVED: 2026-08-11 — AS-OF: unknown
- SOURCE: https://www.momstouch.co.kr/menu/new.php?s_sect1=CG0005 — GRADE: B — FETCH: ok — OBSERVED: 2026-08-11 — AS-OF: unknown
- SOURCE: https://www.bhc.co.kr/menu/1 — GRADE: B — FETCH: partial — OBSERVED: 2026-08-11 — AS-OF: unknown
- SOURCE: https://shinsegaefood.co.kr/nobrandburger/index.sf — GRADE: B — FETCH: blocked — OBSERVED: 2026-08-11 — AS-OF: unknown
- SOURCE: https://www.frankburger.co.kr/ — GRADE: B — FETCH: ok — OBSERVED: 2026-08-11 — AS-OF: unknown
- SOURCE: https://www.shakeshack.kr/ — GRADE: B — FETCH: error — OBSERVED: 2026-08-11 — AS-OF: unknown
- SOURCE: https://www.goobne.co.kr/sitemap.xml — GRADE: B — FETCH: ok — OBSERVED: 2026-08-11 — AS-OF: 2022-02-24
