# 한입안심

프랜차이즈 공식 영양·알레르기 자료를 수집해 사용자의 알레르기 및 영양 조건에 맞는 메뉴를 탐색하는 웹 서비스입니다.

- 실제 배포: [Streamlit Community Cloud](https://hanip-ansim.streamlit.app/)
- 반응형 웹: [`vercel-app`](./vercel-app) — Next.js 16 / Vercel용
- 4단계 평가·개선 결과: [`docs/PROJECT_EVALUATION.md`](./docs/PROJECT_EVALUATION.md)
- 발표 가이드: [`docs/PRESENTATION_GUIDE.md`](./docs/PRESENTATION_GUIDE.md)
- 데이터 사전·수집 정책: [`data/README.md`](./data/README.md)
- 재현 가능한 분석: [`analysis/data_quality_audit.ipynb`](./analysis/data_quality_audit.ipynb)
- 초기 4단계 휴대형 HTML 보고서(631행 시점): [`reports/project-evaluation.html`](./reports/project-evaluation.html)
- Apple 참고 디자인 기록: [`docs/design-references/apple.com/DESIGN_REFERENCE.md`](./docs/design-references/apple.com/DESIGN_REFERENCE.md)
- Vercel UI 컴포넌트 사양: [`docs/research/hanip-ansim.streamlit.app`](./docs/research/hanip-ansim.streamlit.app)

## 현재 범위

- 10개 브랜드, 공식 자료 기반 640개 메뉴(교촌치킨 9개 엄격 매핑 행 포함)
- 알레르기 15종 필터와 정보 미표기 행의 보수적 제외
- 칼로리·단백질·나트륨 조건, 데이터 순서가 바뀌어도 유지되는 장바구니 영양 합계
- 메뉴 수·알레르기 확인률·단백질 중앙값·나트륨 중앙값의 인터랙티브 브랜드 비교와 정확값 표
- 메뉴별 공식 출처·기준일, 브랜드별 알레르기 확인율, CI 품질 요약 표시
- 카카오맵 기반 장소·주변 매장 탐색(환경변수 필요)
- Apple Korea의 타이포·여백·표면 대비를 참고한 Vercel UI(Apple 자산·카피 미사용)

의학적 처방 서비스가 아닙니다. 제품 구성과 교차접촉 가능성은 바뀔 수 있으므로 심한 알레르기가 있다면 주문 전에 공식 원문과 매장에 재확인해야 합니다.

## 실행

Python 3.10 이상이 필요합니다.

```bash
python -m pip install -r requirements.txt
python scripts/validate_menu_data.py
streamlit run app.py
```

Next.js 버전:

```bash
cd vercel-app
npm ci
npm run lint
npm run build
npm run dev
```

## 공식 데이터 갱신

```bash
python scripts/update_official_data.py
python scripts/validate_menu_data.py
```

갱신기는 공식 API·HTML·공식 이미지 표를 수집한 뒤 스키마, 중복, 수치 범위, 날짜, HTTPS 출처를 검사합니다. 검사를 통과한 경우에만 `data/menus.csv`와 `vercel-app/public/data/menus.csv`를 같은 내용으로 저장합니다. 상세 결과는 `reports/data-quality.json`, 브라우저용 요약은 `vercel-app/public/data/quality.json`에 생성됩니다.

## 품질 게이트

Pull request와 `main` push에서 다음 항목을 자동 확인합니다.

- 데이터 검증기 단위 테스트, Python 구문 검사, 2개 CSV 해시 일치
- Next.js ESLint, 프로덕션 빌드, 높은 심각도 배포 의존성 감사

## 배포 상태

| 표면 | 상태 | 검증 범위 |
|---|---|---|
| Streamlit | 실제 공개 배포 확인 | 현재 Production은 main 기준 631개 메뉴 표시 확인 |
| Next.js | Vercel Git 연결·배포 완료 | [Production](https://web-service-snu.vercel.app)과 PR Preview 연결, 로컬 최신본 640개·10브랜드 Chrome 상호작용 확인. 카카오 키는 별도 설정 필요 |

Streamlit Community Cloud에서는 main file path를 `app.py`로 지정합니다. Next.js는 Vercel에서 GitHub 저장소를 Import하고 Root Directory를 `vercel-app`으로 지정해 배포했습니다. 2026-08-11 현재 개선 브랜치의 PR Preview가 Chrome에서 공개 접근되는 것을 확인했으며, Production 반영은 PR 병합 뒤에 이뤄집니다. 카카오 기능을 활성화하려면 `.env.example`의 두 키와 배포 도메인을 등록해야 합니다. 배포 후 `/api/health`에서 앱과 키 설정 여부를 확인합니다.
