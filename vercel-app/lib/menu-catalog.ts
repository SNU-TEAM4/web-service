import type { Menu } from "@/lib/types";

const BRAND_ALIASES: Record<string, string> = {
  "베스킨라빈스": "배스킨라빈스",
  "서브웨이": "써브웨이",
  "파리바게트": "파리바게뜨",
};

export function canonicalBrandName(brand: string) {
  const trimmed = brand.trim();
  return BRAND_ALIASES[trimmed] || trimmed;
}

const DRINK = /콜라|사이다|환타|탄산|생수|주스|에이드|커피|아메리카노|라떼|모카|티|차|스무디|쉐이크|프라페|프라푸치노|음료/;
const SIDE = /감자|프라이|너겟|치즈볼|떡|소스|샐러드|콘|핫도그|스낵|사이드/;
const BURGER_BRANDS = new Set(["맥도날드", "버거킹", "롯데리아", "KFC", "노브랜드버거", "맘스터치", "프랭크버거"]);
const CHICKEN_BRANDS = new Set(["KFC", "bbq", "교촌치킨", "굽네치킨", "노랑통닭", "맘스터치", "멕시카나 치킨", "자담치킨", "페리카나", "푸라닭", "후라이드 참 잘하는 집"]);
const PIZZA_BRANDS = new Set(["도미노피자", "반올림 피자", "파파존스", "피자스쿨", "피자알볼로", "피자헛"]);
const CAFE_BRANDS = new Set(["스타벅스", "이디야", "더벤티", "메가커피", "백억커피", "컴포즈 커피"]);
const BAKERY_BRANDS = new Set(["파리바게뜨", "뚜레쥬르", "던킨도너츠"]);

export function inferMenuSection(menu: Pick<Menu, "brand" | "menu" | "category" | "yogiyoCategory">) {
  const brand = canonicalBrandName(menu.brand);
  const category = (menu.category || "").trim();
  const yogiyoCategory = (menu.yogiyoCategory || "").normalize("NFKC").trim();
  const name = menu.menu.trim();
  const text = `${category} ${yogiyoCategory} ${name}`;

  if (brand === "포케올데이") {
    if (/소스/.test(yogiyoCategory) || /소스\s*$/.test(name)) return "소스";
    if (/세트/.test(yogiyoCategory) || /세트/.test(name)) return "세트";
    if (/제조음료|RTD\s*음료/.test(yogiyoCategory) || DRINK.test(name)) return "음료";
    if (/밸런스박스/.test(text)) return "밸런스박스";
    if (/덮밥/.test(name)) return "덮밥";
    if (/메밀면|샐러드/.test(text)) return "메밀면·샐러드";
    if (/랩|타코|두부볼|사이드/.test(text)) return "사이드·랩";
    if (/스프|아사이볼|디저트/.test(text)) return "수프·디저트";
    return "포케";
  }
  if (brand === "본죽&비빔밥") {
    if (/비빔밥|비빔면/.test(name)) return "비빔밥·면";
    if (/본죽반찬가게/.test(yogiyoCategory) || /장조림|젓갈|동치미/.test(name)) return "반찬";
    if (/사이드메뉴/.test(yogiyoCategory) || /계란찜|만두|철판소불고기|고추장/.test(name)) return "사이드";
    if (/음료/.test(yogiyoCategory) || DRINK.test(name)) return "음료";
    if (/뜨끈\s*뚝배기/.test(yogiyoCategory) || /뚝배기/.test(name)) return "뚝배기";
    return "죽";
  }
  if (brand === "본도시락") {
    if (/추가 메뉴|계란후라이 추가/.test(yogiyoCategory)) return "사이드";
    if (/음료|제로\s*콜라|디저트/.test(yogiyoCategory) || /콜라|사이다|생수|식혜|아이스홍시/.test(name)) return "음료·디저트";
    if (/쌈밥/.test(text)) return "쌈밥";
    if (/샐러드|스프/.test(text)) return "샐러드·스프";
    if (/찌개\s*집밥/.test(yogiyoCategory)) return "국·찌개";
    if (/한상|반상|한정식/.test(text)) return "반상·한상";
    return "도시락·덮밥";
  }

  if (brand === "써브웨이") {
    if (/샌드위치|아침메뉴/.test(text)) return "샌드위치";
    if (/샐러드/.test(text)) return "샐러드";
    if (/랩/.test(text)) return "랩";
    if (DRINK.test(text)) return "음료";
    return "사이드";
  }
  if (brand === "배스킨라빈스") return /케이크/.test(text) ? "아이스크림 케이크" : /음료|블라스트|커피/.test(text) ? "음료" : "아이스크림";
  if (BAKERY_BRANDS.has(brand)) {
    if (DRINK.test(text)) return "음료";
    if (/케이크/.test(text)) return "케이크";
    if (/샌드위치|샐러드/.test(text)) return "샌드위치·샐러드";
    if (/도넛|도너츠|디저트|쿠키|마카롱/.test(text)) return "디저트·스낵";
    return "빵";
  }
  if (PIZZA_BRANDS.has(brand)) {
    if (DRINK.test(text)) return "음료";
    if (/파스타|스파게티/.test(text)) return "파스타";
    if (SIDE.test(text)) return "사이드";
    return "피자";
  }
  if (CHICKEN_BRANDS.has(brand) && !BURGER_BRANDS.has(brand)) {
    if (DRINK.test(text)) return "음료";
    if (SIDE.test(text)) return "사이드";
    return "치킨";
  }
  if (BURGER_BRANDS.has(brand)) {
    if (DRINK.test(text)) return "음료";
    if (/버거|와퍼|징거|맥모닝/.test(text)) return /맥모닝/.test(text) ? "맥모닝" : "버거";
    if (/치킨|통다리/.test(text) && brand === "KFC") return "치킨";
    return "사이드·디저트";
  }
  if (CAFE_BRANDS.has(brand)) {
    if (/콜드.?브루/.test(text)) return "콜드 브루";
    if (/아메리카노|에스프레소|커피/.test(text)) return "커피";
    if (/라떼|모카/.test(text)) return "라떼";
    if (/티|차/.test(text)) return "티";
    if (/에이드|주스/.test(text)) return "에이드·주스";
    if (/스무디|쉐이크|프라페|프라푸치노|블렌디드/.test(text)) return "블렌디드";
    if (/빵|케이크|샌드위치|쿠키|디저트/.test(text)) return "푸드·디저트";
    return category || "기타 음료";
  }
  if (brand === "설빙") return /빙수/.test(text) ? "빙수" : DRINK.test(text) ? "음료" : "디저트·사이드";
  if (brand === "샐러디") return /랩|웜볼/.test(text) ? "랩·웜볼" : "샐러드";
  return category || "기타";
}

const MEAL_RECOMMENDATION_EXCLUDED_SECTIONS = new Set([
  "케이크",
  "아이스크림 케이크",
  "커피",
  "콜드 브루",
  "라떼",
  "티",
  "에이드·주스",
  "블렌디드",
  "음료",
  "기타 음료",
]);
const CAKE_NAME = /케이크|케익/;
const DRINK_NAME = /아메리카노|에스프레소|콜드\s*브루|커피|라떼|모카|콜라|사이다|환타|탄산|생수|주스|에이드|스무디|쉐이크|프라페|프라푸치노|블라스트|밀크티|(?:티|차)\s*$/;
const NON_MEAL_CATEGORY = /케이크|케익|음료|드링크|커피|에이드|주스|스무디|쉐이크|프라페|블렌디드|소스|시즈닝|드레싱/;
const CONDIMENT_NAME = /(?:소스|시즈닝|드레싱|케첩|머스타드|디핑|딥핑)(?:\s*(?:추가|별도|단품|\d+\s*(?:g|개|ea)))?\s*$/i;

// 이 기준은 빠른 추천 카드에만 적용하며 전체 메뉴 탐색 데이터는 그대로 둡니다.
export function isMealRecommendationCandidate(menu: Pick<Menu, "brand" | "menu" | "category" | "yogiyoCategory">) {
  const section = inferMenuSection(menu);
  const category = `${menu.category} ${menu.yogiyoCategory || ""}`.normalize("NFKC").trim();
  const name = menu.menu
    .normalize("NFKC")
    .replace(/\([^)]*(?:소스|시즈닝|드레싱)[^)]*\)|\[[^\]]*(?:소스|시즈닝|드레싱)[^\]]*\]|（[^）]*(?:소스|시즈닝|드레싱)[^）]*）/g, " ")
    .trim();

  return !MEAL_RECOMMENDATION_EXCLUDED_SECTIONS.has(section)
    && !NON_MEAL_CATEGORY.test(category)
    && !CAKE_NAME.test(name)
    && !DRINK_NAME.test(name)
    && !CONDIMENT_NAME.test(name);
}

export const DEFAULT_MENU_SECTION_ORDER = ["버거", "치킨", "샌드위치", "샐러드", "랩", "피자", "파스타", "포케", "덮밥", "메밀면·샐러드", "밸런스박스", "세트", "도시락·덮밥", "쌈밥", "반상·한상", "국·찌개", "죽", "비빔밥·면", "뚝배기", "반찬", "샐러드·스프", "사이드·랩", "수프·디저트", "맥모닝", "빵", "케이크", "아이스크림", "빙수", "사이드", "사이드·디저트", "디저트·스낵", "푸드·디저트", "음료·디저트", "커피", "콜드 브루", "라떼", "티", "에이드·주스", "블렌디드", "음료", "소스", "기타"];

export function menuSectionRank(section: string) {
  const rank = DEFAULT_MENU_SECTION_ORDER.indexOf(section);
  return rank < 0 ? 999 : rank;
}
