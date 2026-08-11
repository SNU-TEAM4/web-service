# 메뉴 데이터 사전과 수집 정책

## 데이터 단위

한 행은 한 브랜드의 한 메뉴를 나타냅니다. `(brand, menu)`는 중복될 수 없습니다. 세트처럼 영양값이 범위로만 제공되는 항목은 단일 수치 비교에서 제외합니다.

| 열 | 의미 |
|---|---|
| `brand`, `menu`, `category` | 브랜드·메뉴명·공식 표 분류 |
| `calories` | 열량(kcal) |
| `protein` | 단백질(g) |
| `fat` | 포화지방(g) |
| `carbs` | 현재 서비스에서 비교하는 당류(g). 이름은 하위 호환을 위해 유지 |
| `sodium` | 나트륨(mg) |
| `allergens` | 표준화한 알레르기 성분. 여러 값은 `|`로 구분 |
| `source_url` | 영양정보 공식 원문 |
| `source_date` | ISO 형식의 공식 기준일 또는 수집 확인일 |
| `source_date_type` | `official_updated`, `official_published`, `official_version`, `collected_on` |
| `verified` | 공식 출처에서 수집한 행인지 여부 |
| `allergen_known` | 공식 알레르기 정보를 확인할 수 있는지 여부 |
| `allergy_source_url` | 알레르기 정보 원문. 같은 표라면 `source_url`과 같을 수 있음 |
| `collected_at` | 수집 실행 시각(UTC, ISO 8601) |
| `collection_method` | `official_api`, `official_html`, `manual_official_image` |

## 정제 규칙

1. 알레르기 명칭을 15종 표준 토큰으로 통일합니다.
2. 범위형 세트, 핵심 영양값이 없는 행, `(brand, menu)` 중복을 제외합니다.
3. 날짜를 `YYYY-MM-DD`로 정규화합니다.
4. 수치·출처·날짜·불리언·허용 토큰을 품질 게이트로 검사합니다.
5. 공식 알레르기 필드가 비어 있으면 “없음”으로 추정하지 않고 `allergen_known=false`로 둡니다.
6. Streamlit과 Next.js용 CSV가 바이트 단위로 같은지 검사합니다.

## 알려진 한계

- 파리바게뜨는 공식 페이지에서 현재 파서가 안정적으로 구조화할 수 있는 행이 1개라 범위가 매우 제한적입니다.
- 스타벅스와 써브웨이는 수집 대상 영양 페이지에 메뉴별 알레르기 필드가 없어 알레르기 선택 시 보수적으로 제외됩니다.
- `source_date_type=collected_on`은 브랜드가 공개한 개정일이 아니라 수집기가 확인한 날짜입니다.
- 값의 허용 범위 검사는 명백한 열 뒤바뀜을 차단하는 장치이며, 모든 공식 값의 의미를 보증하는 수동 영양 검수는 아닙니다.
