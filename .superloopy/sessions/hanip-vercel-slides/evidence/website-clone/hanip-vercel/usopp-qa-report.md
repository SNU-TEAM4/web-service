# 한입안심 Vercel 앱 독립 QA

검증일: 2026-08-11 (Asia/Seoul)
검증 대상: `vercel-app`의 production build를 `http://127.0.0.1:3010`에서 실행한 로컬 인스턴스. 제품 파일은 변경하지 않았다.

## 결과

| 시나리오 | 결과 | 실제 관찰 및 증거 |
| --- | --- | --- |
| 정적 품질 게이트 | PASS | `npm run lint`는 ESLint 오류 없이 종료했고, `npm run build`는 TypeScript와 production build를 성공했다. build 출력에는 `/api/health`, `/api/places`, `/api/stores`가 dynamic route로 등록됐다. |
| `/api/health` 구현 계약 | PASS | 실행 응답은 `200`이며 `status: "ok"`, `service: "hanip-ansim-web"`, `environment: "local"`, `menuData: "/data/menus.csv"`, 그리고 두 Kakao key 구성 boolean을 포함했다. 키가 없는 이 검증 환경에서는 두 boolean이 `false`였다. |
| 필터 drawer open/close 및 접근성 상태 | PASS | 실제 브라우저에서 `내 조건` 클릭 후 `aria-expanded=true`, `#filter-drawer` class=`filter-drawer open`, `aria-hidden=false`, `inert` 제거, `body.style.overflow=hidden`을 확인했다. 닫기 버튼과 Escape 각각 뒤에 `aria-expanded=false`, `aria-hidden=true`, `inert` 존재, body overflow 복원을 확인했다. 제공 캡처도 열린 drawer와 backdrop을 보인다: `local/vercel-filter-drawer.png`. |
| 알레르기 필터 흐름 | PASS | 실제 브라우저에서 `계란`을 선택하자 선택 알레르기 지표가 `1개 / 조건 적용 중`으로, 추천 메뉴가 `521개`에서 `177개`로 변했다. 이 값은 현재 `menus.csv` 데이터에 대한 실행 결과다. 구현은 선택한 알레르기가 메뉴에 포함되거나 알레르기 정보가 미확인인 행을 제외한다. |
| 장바구니 상태 흐름 | PASS | 알레르기 필터된 버거킹 메뉴 `앵그리 너겟킹 10조각`을 추가한 뒤 탭/지표가 `장바구니 (1)`, `545 kcal`가 됐다. 수량 + 후에는 `장바구니 (2)`, `1090 kcal`, 단백질 `62.0g`, 나트륨 `2796mg`으로 즉시 계산됐고, 삭제 뒤 `장바구니 (0)`와 `장바구니가 비어 있어요`가 표시됐다. 별도 화면 증거: `local/vercel-cart.png`. |
| Kakao 키 누락 안내 | PASS | `/api/places?q=서울`과 `/api/stores?...`가 모두 `503` 및 `카카오 REST API 키가 설정되지 않았습니다. Vercel 환경변수를 확인해 주세요.` JSON 오류를 반환했다. 실제 지도 탭에서 `성수역` 입력 후 같은 문구가 `role=alert`로 화면에 보였다. 제공 캡처: `local/vercel-map-missing-key.png`. JavaScript 지도 키가 없을 때도 별도의 Vercel 환경변수 안내가 구현돼 있다. |
| Apple 자산·로고·카피 미사용 | PASS | `vercel-app/public`에는 `menus.csv`와 9개 프랜차이즈 로고만 있다. 제품 소스 검색에서 Apple 관련 결과는 README의 디자인 참고 설명과 CSS의 시스템 글꼴 이름 `Apple SD Gothic Neo`뿐이며, Apple 로고/제품 이미지/사용자 노출 Apple 카피는 발견되지 않았다. 앱의 실제 데스크톱 캡처(`local/vercel-apple-reference-desktop.png`)는 한입안심 제목·카피·프랜차이즈 로고만 보이며, 비교용 원본은 `source/streamlit-current-desktop.png`이다. |

## 실행 명령과 핵심 출력

```sh
cd /Users/jayk/Downloads/Open\ Sources/web-service-SNU-/vercel-app
npm run lint
# exit 0: eslint .

npm run build
# exit 0: Compiled successfully; TypeScript finished;
# routes: /, /api/health, /api/places, /api/stores

npm start -- -H 127.0.0.1 -p 3010
curl -sS -i http://127.0.0.1:3010/api/health
# HTTP/1.1 200 OK
# {"status":"ok","service":"hanip-ansim-web","environment":"local",
#  "menuData":"/data/menus.csv","kakaoRestConfigured":false,
#  "kakaoJavascriptConfigured":false}

curl -sS -i 'http://127.0.0.1:3010/api/places?q=서울'
curl -sS -i 'http://127.0.0.1:3010/api/stores?lat=37.5665&lon=126.9780&radius=3000&brands=스타벅스'
# 각각 HTTP/1.1 503 Service Unavailable
# {"error":"카카오 REST API 키가 설정되지 않았습니다. Vercel 환경변수를 확인해 주세요."}
```

추가로 production build 인스턴스를 브라우저 자동화로 조작했다. DOM/ARIA 상태와 지표 숫자는 위 시나리오 행의 실제 실행 관찰값이다.

## 증거 경로

- `local/vercel-filter-drawer.png`
- `local/vercel-cart.png`
- `local/vercel-map-missing-key.png`
- `local/vercel-apple-reference-desktop.png`
- `source/streamlit-current-desktop.png`
- 이 보고서: `usopp-qa-report.md`

## 남은 위험

- 실제 Vercel 배포 환경과 유효한 `KAKAO_REST_API_KEY`/`NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY` 조합은 제공되지 않아, Kakao 상류 API의 성공 응답·지도 SDK 렌더링·실서비스 환경변수 주입은 검증하지 못했다.
- 현재 안전 필터는 `allergenKnown=false`인 행을 알레르기 선택 시 제외한다. 의도된 보수적 동작이지만, 원천 알레르기 데이터의 최신성·정확성 자체는 이번 UI/회귀 QA 범위를 벗어난다.

STATUS: DONE_WITH_CONCERNS
SCENARIOS: lint PASS; production build PASS; health contract PASS; drawer open/close/ARIA/inert PASS; egg-allergen filter PASS; cart add/increment/delete PASS; missing-Kakao-key API and UI message PASS; Apple asset/logo/copy exclusion PASS.
COMMANDS: `npm run lint`; `npm run build`; `npm start -- -H 127.0.0.1 -p 3010`; curl health/places/stores; browser automation against the production build; source/asset/implementation `rg` inspection.
ARTIFACTS: `local/vercel-filter-drawer.png`; `local/vercel-cart.png`; `local/vercel-map-missing-key.png`; `local/vercel-apple-reference-desktop.png`; `source/streamlit-current-desktop.png`; this report.
OBSERVED: all specified local behavior passed; missing Kakao REST key returns and renders a specific Korean Vercel-environment-variable instruction.
RISKS: live Vercel deployment, valid Kakao credentials, upstream Kakao response behavior, and actual map SDK rendering remain unverified because credentials/deployment were not provided.
RECOMMENDATION: PASS
