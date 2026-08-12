# Chrome 시각·인터랙션 QA

검증일: 2026-08-11  
대상: `next build` 결과를 `next start`로 제공한 production UI

## 데스크톱

- `production-desktop.png`: 히어로, 공식 출처 검증 무대, 전역 내비게이션 표시
- `production-compare.png`: 알레르기 확인률 지표, 단일 파란 막대, 0 기준, 단위, 정확값 표
- `production-about.png`: 네 평가 기준과 AI+사람 검증 과정 표시
- Next 개발 오버레이 없음, 문서 제목 정상, 공개 품질 JSON의 PASS·CSV 일치 문구 확인

## 인터랙션

- 조건 서랍을 열면 `조건 패널 닫기`에 포커스, Escape 뒤 시작한 `내 조건` 버튼으로 복귀
- 우유 칩의 `aria-pressed=true` 확인
- `ArrowRight`로 브랜드 비교 → 데이터 안내 탭 이동 확인
- 메뉴 1개 담기 전후와 새로고침 뒤 모두 `장바구니 (1)` 유지 확인
- 비교 지표를 알레르기 확인률로 전환하면 `%` 단위와 정확값·표본 표가 함께 변경됨

## 실제 Vercel Preview

- URL: `https://web-service-snu-git-agent-hanip-quality-improvements-proto15.vercel.app`
- `vercel-preview-final.png`: 새 문서 제목과 PASS·원천/배포 CSV 일치 표시 확인
- `vercel-preview-about.png`: 평가 기준 증거, 검증 640/640·오류 0·중복 0 표시 확인
- 배포된 브랜드 비교에서 평균 나트륨 버튼 `aria-pressed=true`, 네 지표와 정확값 표 확인
- GitHub Actions `quality` run 8 성공, Vercel commit status 성공

## 모바일

- `mobile-cdp-390x844.png`: Chrome DevTools device metrics로 production 화면 캡처
- `mobile-cdp-metrics.json`: `innerWidth=390`, `innerHeight=844`, `scrollWidth=390`, `scrollHeight=2775`, DPR 1
- 판정: 가로 오버플로 없음. 44px 전역 내비게이션, 세로 CTA, 줄바꿈 검증 배지, 흰/검은 무대가 390px에서 유지됨

## 한계

- 카카오 외부 API 성공 경로는 로컬 환경변수 없이는 검증하지 않았다. 키 누락 시 안내 상태는 구현되어 있다.
- `mobile-390x844*.png`는 macOS headless Chrome이 CSS viewport를 최소 500px로 잡고 390px로 잘라 저장한 진단 실패본이므로 최종 증거로 사용하지 않는다. 최종 모바일 판정은 CDP metrics 파일과 `mobile-cdp-390x844.png`만 사용한다.
