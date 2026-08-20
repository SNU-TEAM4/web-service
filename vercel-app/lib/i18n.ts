export type Language = "ko" | "en";

export function tr(language: Language, korean: string, english: string) {
  // The dataset's `carbs` compatibility field contains sugar_g, so expose its true meaning.
  if (korean === "탄수화물" && english === "Carbs") return language === "en" ? "Sugars" : "당류";
  return language === "en" ? english : korean;
}

const ALLERGEN_EN: Record<string, string> = {
  "계란": "Egg",
  "우유": "Milk",
  "메밀": "Buckwheat",
  "땅콩": "Peanuts",
  "대두": "Soybeans",
  "밀": "Wheat",
  "고등어": "Mackerel",
  "게": "Crab",
  "새우": "Shrimp",
  "돼지고기": "Pork",
  "복숭아": "Peach",
  "토마토": "Tomato",
  "아황산류": "Sulfites",
  "호두": "Walnuts",
  "닭고기": "Chicken",
  "쇠고기": "Beef",
  "오징어": "Squid",
  "조개류": "Shellfish",
  "굴": "Oyster",
  "전복": "Abalone",
  "홍합": "Mussel",
  "잣": "Pine nuts",
};

const CATEGORY_EN: Record<string, string> = {
  "전체": "All",
  "패스트푸드": "Fast Food",
  "카페·디저트": "Cafe & Dessert",
  "치킨": "Chicken",
  "피자·양식": "Pizza & Western",
  "양식": "Western",
  "한식·건강식": "Korean & Healthy",
};

const MENU_SECTION_EN: Record<string, string> = {
  "전체": "All",
  "버거": "Burgers",
  "치킨": "Chicken",
  "샌드위치": "Sandwiches",
  "샐러드": "Salads",
  "랩": "Wraps",
  "피자": "Pizza",
  "파스타": "Pasta",
  "포케": "Poke",
  "덮밥": "Rice Bowls",
  "메밀면·샐러드": "Buckwheat Noodles & Salads",
  "밸런스박스": "Balanced Boxes",
  "세트": "Sets",
  "도시락·덮밥": "Lunch Boxes & Rice Bowls",
  "쌈밥": "Korean Lettuce Wraps",
  "반상·한상": "Korean Set Meals",
  "국·찌개": "Soups & Stews",
  "죽": "Porridge",
  "비빔밥·면": "Bibimbap & Noodles",
  "뚝배기": "Hot Pot",
  "반찬": "Side Dishes",
  "샐러드·스프": "Salads & Soups",
  "사이드·랩": "Sides & Wraps",
  "수프·디저트": "Soups & Desserts",
  "맥모닝": "McMorning",
  "빵": "Bakery",
  "케이크": "Cakes",
  "아이스크림 케이크": "Ice Cream Cakes",
  "아이스크림": "Ice Cream",
  "빙수": "Shaved Ice",
  "사이드": "Sides",
  "사이드·디저트": "Sides & Desserts",
  "디저트·사이드": "Desserts & Sides",
  "디저트·스낵": "Desserts & Snacks",
  "푸드·디저트": "Food & Desserts",
  "음료·디저트": "Drinks & Desserts",
  "커피": "Coffee",
  "콜드 브루": "Cold Brew",
  "라떼": "Latte",
  "티": "Tea",
  "에이드·주스": "Lemonades & Juices",
  "블렌디드": "Blended Drinks",
  "음료": "Drinks",
  "소스": "Sauces",
  "기타 음료": "Other Drinks",
  "기타": "Other",
};

export const allergenLabel = (language: Language, value: string) => language === "en" ? ALLERGEN_EN[value] || value : value;
export const categoryLabel = (language: Language, value: string) => language === "en" ? CATEGORY_EN[value] || value : value;
export const menuSectionLabel = (language: Language, value: string) => language === "en" ? MENU_SECTION_EN[value] || value : value;

export function formatPrice(language: Language, value: number) {
  return language === "en"
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(value)
    : `${value.toLocaleString("ko-KR")}원`;
}

export function formatNumber(language: Language, value: number) {
  return value.toLocaleString(language === "en" ? "en-US" : "ko-KR");
}
