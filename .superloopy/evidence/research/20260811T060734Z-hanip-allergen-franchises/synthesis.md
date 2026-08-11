# Source-backed synthesis

## Decision

Add Kyochon only in this release. The official chicken list exposes the current product set, and the official detail pages expose the project's displayed nutrition fields (calories, sugar, protein, saturated fat, sodium), a serving basis, and the official allergen table. The collector accepted 9 current products whose names can be joined safely and rejected every ambiguous or incomplete product.

## Why the alternatives were not added

- BBQ has a positive detail sample but no verified complete product enumeration.
- Mom's Touch is image/OCR dependent; BHC requires a client endpoint.
- Compose has the best alternative schema but at least one internally impossible official seasonal value and no page date.
- Pizza and several cafe/bakery sources omit fields or expose inconsistent per-product coverage.

## Verification

- Output: 640 rows across 10 brands.
- Kyochon: 9 rows, all allergen-known, official HTML collection.
- Schema validator: 0 errors, 1 inherited warning for one-row Paris Baguette coverage.
- Duplicate `(brand, menu)`: 0.
- Primary and deployed CSV SHA-256: `3cee8709c9c82ae42fe22bd535f6d79efeeda69fc698c4f44a2ebcd04223757c` for both.

## Interpretation boundary

The project's `fat` and `carbs` columns continue their existing UI meaning of saturated fat and sugar respectively. The Kyochon category explicitly says `공식 100g 기준` so users do not mistake per-100g numbers for a whole order. This is a menu-comparison aid, not medical advice.
