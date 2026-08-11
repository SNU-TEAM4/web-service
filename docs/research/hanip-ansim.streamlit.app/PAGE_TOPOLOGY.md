# 한입안심 페이지 토폴로지

## 원본 표면

- 현재 배포: https://hanip-ansim.streamlit.app/
- 구현 대상: `vercel-app/components/HanipApp.tsx`
- 기준 화면: `.superloopy/sessions/hanip-vercel-slides/evidence/website-clone/hanip-vercel/source/streamlit-current-desktop.png`

## 위에서 아래 순서

1. 전역 내비게이션: 서비스명, 데이터 기준일, 필터 열기.
2. 히어로: 핵심 가치 제안, 공식 데이터 상태, 네 가지 핵심 수치.
3. 기능 내비게이션: 추천 메뉴, 장바구니, 주변 매장, 브랜드 비교, 데이터 안내.
4. 추천 메뉴: 검색, 브랜드 아코디언, 메뉴 카드, 공식 출처, 장바구니 추가.
5. 장바구니: 수량 조절, 삭제, 영양 합계와 기준치 진행률.
6. 주변 매장: 장소/GPS 선택, 반경, 오류 상태, 카카오 지도, 매장 목록.
7. 브랜드 비교: 필터 통과 메뉴 수 막대그래프와 정확한 값 표.
8. 데이터 안내: 안전 안내, 브랜드별 수집 범위, 기준일, 공식 원문.

## 고정 레이어

- 상단 전역 내비게이션: `position: sticky` 또는 `fixed`, 반투명 배경과 blur.
- 필터 패널: 좌측에서 들어오는 fixed drawer, backdrop 아래/내비게이션 위 계층.
- 기능 탭: 데스크톱에서는 콘텐츠 상단 sticky, 모바일에서는 가로 스크롤.
