| id | expected | source | observed | status | claim |
|---|---|---|---|---|---|
| T1 | 새 브랜드 데이터는 브랜드의 공식 공개 원본에서만 수집한다. | 사용자 요청 · docs/PROJECT_EVALUATION.md | 교촌 공식 목록/상세 URL만 사용 | pass | C1 |
| T2 | 채택 브랜드는 메뉴 단위 영양 5항목과 알레르기 정보를 함께 제공한다. | scripts/validate_menu_data.py · 사용자 요청 | 교촌 9개 행만 엄격 매핑 통과 | pass | C1 |
| T3 | 새 행은 17열 스키마, 수치 범위, HTTPS, 날짜, 허용 알레르기 토큰, 미러 해시를 통과한다. | scripts/validate_menu_data.py | 640행·10브랜드·오류 0·미러 SHA-256 동일 | pass | C1 |
| T4 | 새 로고를 추가해도 로고와 브랜드명·추천 문구가 겹치지 않는다. | 사용자 요청 · vercel-app/app/globals.css | Chrome 1121px에서 모든 브랜드 logo-copy 30px, copy-chevron 14px; fallback 정상 | pass | C2 |
