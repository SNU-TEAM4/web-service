# Vercel 배포 준비 조사

## 확인된 구성

- 프로젝트 루트: `vercel-app`
- 프레임워크: Next.js 16
- 설치/빌드: `npm ci`, `npm run build`
- 서버 환경변수: `KAKAO_REST_API_KEY`
- 브라우저 환경변수: `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY`
- 메뉴 데이터: `vercel-app/public/data/menus.csv`
- 지도/검색 API: `vercel-app/app/api/places/route.ts`, `vercel-app/app/api/stores/route.ts`

## 배포 전 필요한 외부 설정

1. Vercel 프로젝트를 `vercel-app` 루트로 연결한다.
2. 두 카카오 키를 Preview와 Production 환경에 등록한다.
3. 생성된 Vercel 도메인을 카카오 JavaScript SDK 허용 도메인에 추가한다.
4. `/api/health`에서 앱과 키 설정 여부를 확인한다.

## 현재 제한

로컬 저장소에는 실제 카카오 키가 없으며 Vercel CLI도 설치되어 있지 않다. 키가 없더라도 추천·장바구니·차트·데이터 안내는 동작하지만 지도와 장소 검색은 명시적인 설정 오류 상태를 보여준다.
