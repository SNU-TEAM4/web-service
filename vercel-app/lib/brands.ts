export const BRAND_LOGOS: Record<string, string> = {
  "맥도날드": "/logos/mcdonalds.png",
  "버거킹": "/logos/burgerking.png",
  "롯데리아": "/logos/lotteria.png",
  "스타벅스": "/logos/starbucks.png",
  "KFC": "/logos/kfc.png",
  "써브웨이": "/logos/subway.png",
  "이디야": "/logos/ediya.png",
  "배스킨라빈스": "/logos/baskinrobbins.png",
  "파리바게뜨": "/logos/parisbaguette.png"
};

// 국내 식품 알레르기 의무표시 대상을 앱 데이터의 표기 방식에 맞춰 정규화했습니다.
export const ALLERGENS = [
  "계란", "우유", "메밀", "땅콩", "대두", "밀", "고등어", "게", "새우",
  "돼지고기", "복숭아", "토마토", "아황산류", "호두", "닭고기", "쇠고기",
  "오징어", "조개류", "굴", "전복", "홍합", "잣"
];

export const BRAND_CATEGORIES: Record<string, string> = {
  "맥도날드": "패스트푸드", "버거킹": "패스트푸드", "롯데리아": "패스트푸드",
  "스타벅스": "카페·디저트", "이디야": "카페·디저트", "배스킨라빈스": "카페·디저트",
  "파리바게뜨": "카페·디저트", "KFC": "치킨", "써브웨이": "양식"
};

export const BRAND_CATEGORY_ORDER = ["전체", "패스트푸드", "카페·디저트", "치킨", "양식"];
