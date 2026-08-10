# 한입안심

프랜차이즈 메뉴의 알레르기 유발 성분과 영양정보를 한곳에서 탐색하는 Streamlit MVP입니다.

## 실행

```bash
python -m pip install -r requirements.txt
streamlit run app.py
```

## 주요 기능

- 사용자 알레르기 성분 기준 메뉴 제외
- 칼로리·단백질·나트륨 조건 필터
- 브랜드별 추천 가능 메뉴 수 비교
- 메뉴별 영양성분 레이더 차트
- 필터 결과 CSV 다운로드

## 데이터 주의사항

`data/menus.csv`는 맥도날드, 롯데리아, 버거킹, 스타벅스, KFC, 써브웨이, 이디야,
배스킨라빈스, 파리바게뜨의 공식 공개 자료에서 정제했습니다. 공식 페이지에서 영양·알레르기
정보가 함께 확인되는 메뉴만 포함하며, 다음 명령으로 갱신할 수 있습니다.

맞춤 프로필에서는 목표 체중·기간·식사 유형·영양 우선순위를 설정해 개인화된 추천 점수와 추천 이유를 확인할 수 있습니다.

```bash
python scripts/update_official_data.py
```

매장 위치와 검색은 카카오맵·카카오 로컬 API를 우선 사용하고, 카카오 연결이 없거나 실패하면 Nominatim·OpenStreetMap/Overpass API를 예비 데이터로 사용합니다. 공개 지도 데이터는 누락되거나 오래된 매장을 포함할 수 있습니다.

## Streamlit Community Cloud 배포

1. 이 폴더를 GitHub 저장소에 push합니다.
2. Streamlit Community Cloud에서 저장소를 연결합니다.
3. Main file path를 `app.py`로 지정하고 배포합니다.
