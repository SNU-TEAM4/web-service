# UX contract — 로고 안정성과 Apple 기반 시각 향상

## Direction read

- Visitor mode: exploring and selecting. 사용자는 안전 조건을 설정하고 공식 출처를 확인하며 메뉴를 고른다.
- Promise: 안심하고 고르는 오늘의 한 끼.
- Proof sequence: 공식 데이터 배지 → 핵심 수치 → 브랜드 목록 → 메뉴·출처 → 장바구니/비교.
- Primary action: 내 조건 열기.
- Visual thesis: Apple 공식 홈페이지의 제품 발표 리듬을 안전 데이터 탐색에 맞게 번역한다. 대형 타입과 여백으로 시작하고 실제 데이터와 브랜드 목록이 아래에서 증거가 된다.
- Typography/composition: 기존 Apple 계열 시스템 폰트, 중앙 히어로와 좌측 데이터 proof stage, 넓은 section gap, 강한 밝은/어두운 대비, 한 번에 한 계층.
- Interaction character: drawer와 accordion이 상태를 명확히 바꾸며 reduced-motion에서는 의미를 유지한다.

## Spatial invariants

1. 로고는 자체 열 안에 완전히 들어가며 텍스트 열과 겹치지 않는다.
2. 브랜드명과 “추천 가능 N개”는 로고와 독립적으로 줄바꿈되고 최소 폭 0을 가진다.
3. chevron은 자체 열에 유지되고 텍스트에 밀리지 않는다.
4. 390px에서는 로고 48px, 텍스트 유연 열, chevron 20px을 유지한다.
5. 히어로·metrics·tabs·panel의 읽기 순서와 focus 순서는 DOM 순서와 일치한다.
6. drawer open/close, Escape, body scroll lock, tab selection, cart behavior는 변경하지 않는다.

## Traceability

| Contract | Owner | Acceptance | Evidence |
|---|---|---|---|
| Logo never intrudes into copy | globals.css + HanipApp.tsx | mapped logo and missing-logo fallback keep positive gaps | Chrome captures + DOM geometry |
| Apple source hierarchy without copied assets | globals.css | hero, whitespace, surface rhythm, CTA hierarchy | before/after Chrome captures |
| Missing logo remains truthful | brands.ts + HanipApp.tsx | fallback does not show broken image | browser state |
| Interactions preserved | HanipApp.tsx | filter, allergen count, cart, tabs, Escape | browser journey |
| Data additions remain validated | update_official_data.py + validate_menu_data.py | schema/range/source/date/mirror tests pass | validator + unit tests |

## Limitations

- Apple source is visual direction, not pixel-exact acceptance.
- 연결된 Chrome 창은 고정 크기여서 이번 증거 묶음에는 1121px 실제 캡처와 CSS breakpoint 정적 검토를 기록했다. 새 390px 실기 캡처는 배포 Preview 재검증에서 보강한다.
- Kakao API success remains unavailable until environment keys and domain allowlist are configured.
- Vercel Preview is protected by login; Production currently follows main.
