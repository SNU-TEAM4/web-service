# Visual QA

## 대상

- 기준점: 실제 배포 `https://hanip-ansim.streamlit.app/`
- 최종 Streamlit: `http://localhost:8502`
- 최종 Next.js 프로덕션 빌드: `http://localhost:3000`
- 최종 보고서: `http://127.0.0.1:8765/reports/project-evaluation.html`
- 브라우저: 사용자의 로그인된 Chrome

## 캡처

| 파일 | 의미 |
|---|---|
| `baseline-streamlit.png` | 변경 전 실제 배포 화면, 580개 메뉴 |
| `final-next-desktop.png` | 변경 후 Next.js 기본 화면, 631개 메뉴·기준일 |
| `final-next-data-guide.png` | 브랜드별 알레르기 확인율·공식 원문 |
| `final-next-comparison.png` | 토마토 필터 후 가로 브랜드 비교 |
| `final-streamlit-comparison.png` | 1일 참고치 기반 메뉴 영양 비교 |
| `final-evaluation-report.png` | 휴대형 HTML 평가 보고서 |

## 확인한 사용자 여정

1. 실제 Streamlit 배포가 Chrome에서 로드되고 580행을 표시했다.
2. 로컬 최종 Next.js가 631행·9브랜드·최신 기준일 2026-08-11을 표시했다.
3. 이전 UI에 없던 `토마토` 필터를 선택하자 추천 수가 521개에서 228개로 줄었다.
4. 알레르기 정보 미표기인 스타벅스·써브웨이는 알레르기 선택 상태의 브랜드 비교에서 보수적으로 제외됐다.
5. 데이터 안내에서 9개 브랜드의 메뉴 수·알레르기 확인율·기준일·공식 원문 링크가 표시됐다.
6. 가로 막대 차트의 값이 아래 표와 일치했다.
7. Streamlit 상세 비교에 성인 1일 참고치 점선과 해석 안내가 표시됐다.
8. HTML 보고서에서 55→87점, 631행, 오류 0건, 기준별 차트, 범위 표, 권고와 한계가 렌더링됐다.

## 반응형·한계

코드상 900px/520px 브레이크포인트와 단일 열 전환을 확인했으나, 이번 Chrome 제어 인터페이스는 창 크기 변경 기능을 제공하지 않아 모바일 픽셀 캡처는 수행하지 못했다. 데스크톱 Chrome 사용자 여정과 Next.js 프로덕션 빌드·TypeScript·ESLint 검증은 완료했다.

표준 보고서 패키저의 구조 검증은 통과했다. 설치된 일반 Chrome을 이용한 패키저 전용 headless 검증은 고정 시간 안에 끝나지 않아 `structural_only`였고, 대신 같은 HTML을 사용자의 Chrome에서 직접 열어 차트·표·본문 렌더링을 확인했다.
