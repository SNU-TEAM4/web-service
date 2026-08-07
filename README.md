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

`data/menus.csv`는 맥도날드와 롯데리아의 공식 공개 자료에서 정제했습니다. 다음 명령으로 갱신할 수 있습니다.

```bash
python scripts/update_official_data.py
```

매장 지도는 주소 검색에 Nominatim, 주변 매장 검색에 OpenStreetMap/Overpass API를 사용합니다. 공개 지도 데이터 특성상 누락되거나 오래된 매장이 있을 수 있습니다.

## Streamlit Community Cloud 배포

1. 이 폴더를 GitHub 저장소에 push합니다.
2. Streamlit Community Cloud에서 저장소를 연결합니다.
3. Main file path를 `app.py`로 지정하고 배포합니다.
