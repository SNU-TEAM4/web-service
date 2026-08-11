# Implementation record

## Apple-source translation

- Centered, high-whitespace hero with a single large promise.
- Two short actions matching the official homepage's paired action rhythm.
- 44 px translucent global navigation retained.
- White presentation stage followed by a black proof stage, then quiet white metric promos.
- Apple assets, logos, product photography, and copy were not reused.

## Logo collision fix

- Replaced `84px 1fr auto` with `88px minmax(0, 1fr) 24px`.
- Added a dedicated 72 px logo frame and hard image bounds.
- Added `min-width: 0` and `overflow-wrap: anywhere` to copy.
- Reserved a fixed chevron track.
- Added a truthful brand-initial fallback for CSV brands without a mapped image. Kyochon renders this path.
- Mobile rules reserve `56px minmax(0, 1fr) 22px` with a 48 px logo frame.

## Data integration

- Added the Kyochon official chicken list/detail collector.
- Collector accepts only rows with all five displayed values, an explicit basis, and an exact normalized current-menu/allergen-table mapping.
- All accepted Kyochon rows label the values as official 100 g basis.
- Unmapped products are omitted instead of treating an unknown allergen list as empty.
- Fixed the unavailable `streamlit-searchbox==0.1.24` requirement to the published `0.1.23` release and verified full installation.
