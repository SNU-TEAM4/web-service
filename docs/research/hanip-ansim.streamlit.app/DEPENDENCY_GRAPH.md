# 의존 관계

| 화면 | DOM/컴포넌트 | 상태/이벤트 | 데이터·외부 의존성 |
|---|---|---|---|
| 앱 셸 | `HanipApp`, `.global-nav`, `.filter-drawer` | 필터 열기/닫기 | React state |
| 추천 | `.brand-folder`, `.menu-card` | 필터, 검색, 펼치기, 담기 | `public/data/menus.csv`, PapaParse |
| 장바구니 | `CartPanel` | 수량, 삭제, 전체 비우기 | localStorage |
| 매장 | `MapPanel`, `KakaoMap` | 장소 검색, GPS, 반경 | Kakao REST/JS 키 |
| 비교 | `ComparePanel` | 필터 변화 | Recharts |
| 데이터 안내 | `AboutPanel` | 공식 출처 링크 | CSV provenance fields |

## 패리티 결정

사용자 지시에 따른 `approved reimplementation`이다. 한입안심의 기능과 데이터 의미는 유지하되 Apple 홈페이지는 시각 원칙만 참고한다. Apple DOM/CSS/JS/자산은 포팅하지 않는다.
