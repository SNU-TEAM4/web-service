# 한입안심 Apple 참고 Vercel UI 시각 QA

## 기준과 범위

- 디자인 참고: Apple Korea 홈페이지의 타이포 위계, 여백, 반투명 내비게이션, pill CTA, 밝고 어두운 표면 대비.
- 콘텐츠/기능 기준: 한입안심 공식 데이터와 기존 추천·장바구니·지도·비교·출처 기능.
- 권리 확인: Apple 로고·제품 이미지·카피·전용 글꼴 파일은 제품에 포함하지 않았다.

## 화면 증거

| 파일 | 확인 내용 | 결과 |
|---|---|---|
| `source/streamlit-current-desktop.png` | 기존 공개 Streamlit의 정보 구조와 시작 상태 | 기준 확보 |
| `../apple-reference/source/apple-home-desktop.png` | Apple Korea의 큰 타이포·섹션 여백·카드 리듬 | 참고 확보 |
| `local/vercel-apple-reference-desktop.png` | 631개 메뉴·9개 브랜드, 4개 핵심 수치, 큰 히어로, 제품형 탭과 브랜드 카드 | PASS |
| `local/vercel-filter-drawer.png` | 데스크톱 drawer, backdrop, 네 조건 그룹, 닫기 컨트롤 | PASS |
| `local/vercel-cart.png` | 장바구니 한 건과 5개 영양 기준치 진행률 | PASS |
| `local/vercel-map-missing-key.png` | 카카오 키 누락 위험을 별도 오류 상태로 표시 | PASS |
| `local/vercel-mobile-390.png` | 390×844 iframe viewport에서 16:9가 아닌 실제 웹 반응형 1열 히어로·수치 카드 | PASS |

## 실제 Chrome 상호작용

- 조건 drawer 열기: `.filter-drawer open`, `aria-hidden=false`, body scroll lock 확인.
- Escape 닫기: `.filter-drawer`, body scroll lock 해제 확인.
- `우유` 선택: 추천 521개 → 131개, 선택 알레르기 1개로 즉시 갱신.
- 메뉴 담기: 장바구니 탭 0 → 1, `담았어요!` 확인 상태 노출.
- 장바구니 계산: 545kcal, 단백질 31g, 포화지방 7g, 당류 1g, 나트륨 1398mg 표시.
- 지도 키 누락: `카카오 REST API 키가 설정되지 않았습니다. Vercel 환경변수를 확인해 주세요.` 표시.

## 레이아웃 판정

- 데스크톱: 겹침·가로 overflow·잘린 제목을 발견하지 못했다.
- 모바일 390px: 전역 내비게이션, 히어로, 신뢰 배지, 4개 수치 카드가 1열로 정렬됐다.
- 필터 drawer: 데스크톱에서도 닫힘 기본이며 backdrop 위에 나타난다.
- 카드와 버튼: Apple 자산 없이 한입안심의 파랑 행동색과 초록 안전색으로 구분된다.

## 남은 외부 의존성

- 실제 카카오 지도와 매장 검색 성공 경로는 두 API 키와 배포 도메인 allowlist가 필요하다.
- 실제 Vercel 공개 URL은 CLI 승인·로그인 전까지 확인할 수 없다.
