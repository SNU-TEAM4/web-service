# 한입안심 보존형 리디자인 감사

## 모드와 대상

- 모드: Preserve. 사용자 요청은 Apple 공식 홈페이지 소스를 시각 기준으로 삼는 디자인 향상이며, 기존 한입안심의 IA·기능·브랜드명은 유지한다.
- 대상: 공개/Preview Next.js 16 DOM 웹, React 19, Chrome/macOS, 한국어, 키보드·포인터·모바일 터치.
- 영향 사용자: 프랜차이즈 메뉴를 알레르기·영양 조건으로 찾는 사용자.
- 주요 작업: 조건 설정 → 브랜드/메뉴 탐색 → 출처 확인 → 장바구니/비교.
- 인접 회귀 위험: 주변 매장·브랜드 비교·데이터 안내 탭, 모바일 390px, 로고가 없는 신규 브랜드.

## Brand tokens

- 소유자: vercel-app/app/globals.css.
- 캔버스 #f5f5f7, 잉크 #1d1d1f, muted #6e6e73, CTA #0071e3, safety #18864b, danger #b42318.
- 타입: -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo.
- 라디우스: 28px / 18px. 표면: 흰색과 반투명 흰색.
- 로고 소유: vercel-app/lib/brands.ts + vercel-app/public/logos.

## Information architecture

- 고정 상단 내비게이션: 한입안심, 데이터 수치, 내 조건.
- 히어로: 가치 제안, 공식 출처·행 수·브랜드 수·기준일.
- 핵심 수치: 추천 가능, 브랜드, 알레르기, 장바구니.
- 탭: 추천 메뉴, 장바구니, 주변 매장, 브랜드 비교, 데이터 안내.
- IA·탭 라벨·route slug 변경 없음.

## Content blocks

- 작동 중인 콘텐츠: 공식 데이터 배지, 조건 drawer, 브랜드 accordion, 메뉴 카드, 영양 비율, 지도 오류·복구, 데이터 출처 표.
- filler: 없음.
- 새 데이터가 들어오면 브랜드 그룹·수치는 CSV에서 동적으로 증가한다.

## Preserve

- “안심하고 고르는 오늘의 한 끼.” 히어로.
- 보수적 알레르기 판정.
- 탭·drawer·장바구니·검색의 기존 동작과 접근성 상태.
- 공식 원문 링크와 데이터 한계 노출.

## Retire or correct

- 브랜드 로고 86px가 84px grid track을 넘는 겹침 위험.
- 브랜드 행의 로고·텍스트 간격이 콘텐츠 길이와 로고 종횡비를 충분히 흡수하지 못하는 문제.
- Apple 참고 대비 여전히 조밀한 accordion 행과 약한 섹션별 스크롤 리듬.
- 신규 브랜드 로고가 없을 때 깨진 이미지가 노출될 위험.

## Apple source reading

- 출처: 2026-08-11 Chrome에서 캡처한 Apple Korea 홈. 44px 고정형 상단 내비게이션, 대형 히어로 타이포, 넓은 수직 여백, 밝은 canvas와 검정 프로모션 대비, 짧은 pill CTA, 반복 프로모션 그리드.
- 권위 모드: 사용자 승인 구현 참고. 시각 원리만 적용하며 Apple 로고·제품 이미지·카피·trade dress는 구현 대상이 아니다.
- 구현: 타입 계층, 여백, 표면 대비, 스크롤 리듬, CTA 강조.
- 명시적 적응: 한입안심 실제 데이터·브랜드 로고, 한국어 줄바꿈, 390/768/1280 반응형, 포커스, 오류 상태.
- 무시: Apple 제품 섹션 구조, 글로벌 내비게이션 항목, 제품 자산, 판매 카피.

## Discovery baseline

- Production: https://web-service-snu.vercel.app
- 개선 branch Preview: Vercel Ready, 로그인 보호.
- metadata: vercel-app/app/layout.tsx 소유. 제목 한입안심, 한국어 설명.
- Analytics/Search Console/랭킹 이력: unavailable and unverified. 이번 로고·디자인 개선 성공 기준을 차단하지 않으며 URL·탭 라벨·metadata는 보존한다.
