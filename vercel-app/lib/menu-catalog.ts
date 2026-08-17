import type { Menu } from "@/lib/types";

const BRAND_ALIASES: Record<string, string> = {
  "베스킨라빈스": "배스킨라빈스",
  "서브웨이": "써브웨이",
  "파리바게트": "파리바게뜨",
};

export function canonicalBrandName(brand: string) {
  const trimmed = brand.normalize("NFKC").trim().replace(/\s+/g, " ");
  return BRAND_ALIASES[trimmed] || trimmed;
}

export function canonicalMenuName(menu: string) {
  return menu.normalize("NFKC").trim().replace(/\s+/g, " ");
}

// 가격 CSV에서 실수로 들어간 띄어쓰기 차이는 같은 메뉴로 취급합니다.
export function menuIdentityKey(brand: string, menu: string) {
  return `${canonicalBrandName(brand)}\u0000${canonicalMenuName(menu).replace(/\s/g, "").toLocaleLowerCase("ko")}`;
}

const DRINK = /콜라|사이다|환타|탄산|생수|주스|에이드|커피|아메리카노|라떼|모카|티|차|스무디|쉐이크|프라페|프라푸치노|음료/;
const SIDE = /감자|프라이|너겟|치즈볼|떡|소스|샐러드|콘|핫도그|스낵|사이드/;
const BURGER_BRANDS = new Set(["맥도날드", "버거킹", "롯데리아", "KFC", "노브랜드버거", "맘스터치", "프랭크버거"]);
const CHICKEN_BRANDS = new Set(["KFC", "bbq", "교촌치킨", "굽네치킨", "노랑통닭", "맘스터치", "멕시카나 치킨", "자담치킨", "페리카나", "푸라닭", "후라이드 참 잘하는 집"]);
const PIZZA_BRANDS = new Set(["도미노피자", "반올림 피자", "파파존스", "피자스쿨", "피자알볼로", "피자헛"]);
const CAFE_BRANDS = new Set(["스타벅스", "이디야", "더벤티", "메가커피", "백억커피", "컴포즈 커피"]);
const BAKERY_BRANDS = new Set(["파리바게뜨", "뚜레쥬르", "던킨도너츠"]);

export function inferMenuSection(menu: Pick<Menu, "brand" | "menu" | "category">) {
  const brand = canonicalBrandName(menu.brand);
  const category = (menu.category || "").trim();
  const name = menu.menu.trim();
  const text = `${category} ${name}`;

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
  if (brand === "본도시락") return "도시락";
  if (brand === "본죽&비빔밥") return /비빔밥/.test(text) ? "비빔밥" : "죽";
  if (brand === "샐러디") return /랩|웜볼/.test(text) ? "랩·웜볼" : "샐러드";
  if (brand === "포케올데이") return /샐러드/.test(text) ? "샐러드" : "포케";
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

// 한 끼 추천 카드에서는 식사 후보가 아닌 케이크·음료·소스류만 제외합니다.
// 전체 메뉴 탐색과 비교 데이터에는 이 항목들을 그대로 유지합니다.
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

export const DEFAULT_MENU_SECTION_ORDER = ["버거", "치킨", "샌드위치", "샐러드", "랩", "피자", "파스타", "도시락", "죽", "비빔밥", "포케", "맥모닝", "빵", "케이크", "아이스크림", "빙수", "사이드", "사이드·디저트", "디저트·스낵", "푸드·디저트", "커피", "콜드 브루", "라떼", "티", "에이드·주스", "블렌디드", "음료", "기타"];

export function menuSectionRank(section: string) {
  const rank = DEFAULT_MENU_SECTION_ORDER.indexOf(section);
  return rank < 0 ? 999 : rank;
}
