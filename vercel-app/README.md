# 한입안심 Next.js

기존 Streamlit MVP의 메뉴 데이터와 추천 기준을 재사용해 만든 Vercel용 웹 애플리케이션입니다.

## 포함 기능

- 알레르기, 브랜드, 칼로리, 단백질, 나트륨 필터
- 성별·나이·키·체중·목표를 반영한 추천 정렬
- PC·모바일을 분리한 반응형 브랜드 폴더
- 메뉴 검색 및 클릭 애니메이션
- 수량 조절과 영양 합산이 가능한 ‘나의 한 끼’
- 브랜드별 선택 가능 메뉴 차트
- 카카오 장소 자동완성, 현재 위치, 반경별 주변 매장 지도
- ‘나의 한 끼’ 브라우저 저장
- 관리자 로그인, 가격 단건 등록·수정·삭제
- 가격 CSV 일괄 업로드 및 Supabase 저장
- 메뉴 출처·알레르기·가격 데이터 확보율 표시

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
ADMIN_PASSWORD=관리자_로그인_비밀번호
ADMIN_SESSION_SECRET=32자_이상의_무작위_문자열
SUPABASE_URL=https://프로젝트_ID.supabase.co
SUPABASE_SECRET_KEY=sb_secret_서버_전용_키
```

`ADMIN_SESSION_SECRET`은 `openssl rand -base64 48`로 만들 수 있습니다. `SUPABASE_SECRET_KEY`는 브라우저에 노출되면 안 되므로 이름 앞에 `NEXT_PUBLIC_`을 붙이지 않습니다.

## 관리자 가격 저장소 설정

1. Supabase에서 무료 프로젝트를 만듭니다.
2. SQL Editor에서 `supabase/schema.sql`을 실행합니다.
3. Project Settings에서 Project URL과 Secret key를 복사합니다.
4. 위 네 개의 관리자·Supabase 환경변수를 Vercel에 등록합니다.
5. 환경변수 등록 후 새로 배포합니다.

관리자 화면은 `/admin/login`에서 접근합니다. CSV 형식은 `supabase/price-import-template.csv`을 참고합니다. 가격은 `브랜드+메뉴+채널+매장명` 조합으로 갱신되며, 공개 화면에서는 CSV 기본 가격과 관리자 가격 중 확인일이 더 최신인 값을 사용합니다.

카카오 개발자 콘솔의 JavaScript SDK 도메인에 로컬 주소와 실제 Vercel 주소를 등록해야 합니다.

- `http://localhost:3000`
- `https://배포주소.vercel.app`

## Vercel 배포

1. GitHub 저장소를 Vercel에 연결합니다.
2. 프로젝트의 **Root Directory**를 `vercel-app`으로 지정합니다.
3. Framework Preset은 `Next.js`를 선택합니다.
4. Environment Variables에 위의 카카오·관리자·Supabase 환경변수를 등록합니다.
5. 배포 후 생성된 도메인을 카카오 JavaScript SDK 도메인에도 추가합니다.

카카오 REST 키는 서버 API에서만 사용하고, JavaScript 키만 브라우저에 공개됩니다. `.env.local`은 Git에서 제외됩니다.
