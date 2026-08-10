# 한입안심 Next.js

기존 Streamlit MVP의 메뉴 데이터와 추천 기준을 재사용해 만든 Vercel용 웹 애플리케이션입니다.

## 포함 기능

- 알레르기, 브랜드, 칼로리, 단백질, 나트륨 필터
- 성별·나이·키·체중·목표를 반영한 추천 정렬
- PC·모바일을 분리한 반응형 브랜드 폴더
- 메뉴 검색 및 클릭 애니메이션
- 수량 조절과 영양 합산이 가능한 장바구니
- 브랜드별 선택 가능 메뉴 차트
- 카카오 장소 자동완성, 현재 위치, 반경별 주변 매장 지도
- 장바구니 브라우저 저장

## 로컬 실행

```bash
cd vercel-app
cp .env.example .env.local
npm install
npm run dev
```

`.env.local`에 다음 값을 입력합니다.

```dotenv
KAKAO_REST_API_KEY=카카오_REST_API_키
NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY=카카오_JavaScript_키
```

카카오 개발자 콘솔의 JavaScript SDK 도메인에 로컬 주소와 실제 Vercel 주소를 등록해야 합니다.

- `http://localhost:3000`
- `https://배포주소.vercel.app`

## Vercel 배포

1. GitHub 저장소를 Vercel에 연결합니다.
2. 프로젝트의 **Root Directory**를 `vercel-app`으로 지정합니다.
3. Framework Preset은 `Next.js`를 선택합니다.
4. Environment Variables에 `KAKAO_REST_API_KEY`, `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY`를 등록합니다.
5. 배포 후 생성된 도메인을 카카오 JavaScript SDK 도메인에도 추가합니다.

카카오 REST 키는 서버 API에서만 사용하고, JavaScript 키만 브라우저에 공개됩니다. `.env.local`은 Git에서 제외됩니다.
