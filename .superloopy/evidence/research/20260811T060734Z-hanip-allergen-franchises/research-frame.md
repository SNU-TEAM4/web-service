# Research frame

Core question: 현재 한입안심 9개 브랜드 외에, 한국 공식 프랜차이즈 소스에서 메뉴 단위 영양 5항목과 알레르기 정보를 안정적으로 수집해 품질 게이트를 통과시킬 수 있는 브랜드는 무엇인가?

Axes:
1. Code integration — 수집기, 17열 스키마, 로고, 미러 CSV, 품질 검사와 렌더링 경로를 추적한다.
2. Burger and chicken official sources — 맘스터치·노브랜드버거·프랭크버거·쉐이크쉑 코리아·교촌·BBQ·BHC의 공식 페이지/PDF/API를 조사한다.
3. Pizza, cafe and bakery official sources + counter-brief — 도미노피자·피자헛·미스터피자·투썸·메가MGC·컴포즈·빽다방·뚜레쥬르를 조사하고 후보 채택에 반대되는 누락·단위·날짜 문제를 찾는다.

As-of: 2026-08-11 · Locale: 대한민국/한국어

Out of scope: 비공식 영양 DB, 블로그, 배달앱, 검색 스니펫만으로 만든 수치, 공식 알레르기 자료가 없는 브랜드의 추정값.

Down-rank: 출처를 재인용하는 언론·커뮤니티·리스트형 페이지.

Minimum grade: B (브랜드 공식 사이트·공식 PDF·공식 API 또는 현재 소스 저장소)

Required measurements: 실제 수집 가능 메뉴 행 수, 메뉴명, 열량, 단백질, 포화지방, 당류, 나트륨, 알레르기 토큰, 기준일, 공식 URL, 수집 방식.

Intent authority: 사용자 요청, scripts/validate_menu_data.py의 17열·허용 토큰·범위 계약, docs/PROJECT_EVALUATION.md.

Codebase relevant: yes · External: yes · Browsing: yes · Verification likely: yes · Report requested: no

Advisory profile: mixed — workers target 8, queries target 40, waves target 3. Initial concurrency is limited to three dedicated lanes; overage or shortfall will be recorded rather than hidden.
