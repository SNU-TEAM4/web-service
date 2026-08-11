"use client";

import Image from "next/image";
import Papa from "papaparse";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Check, ChevronLeft, ChevronRight, LocateFixed, MapPin, Menu as MenuIcon, Search, SlidersHorizontal, Trash2, UtensilsCrossed, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ALLERGENS, BRAND_CATEGORIES, BRAND_CATEGORY_ORDER, BRAND_LOGOS } from "@/lib/brands";
import type { Menu, Place, Store } from "@/lib/types";
import KakaoMap from "./KakaoMap";

type Tab = "menus" | "cart" | "map" | "compare" | "about";
type Cart = Record<number, number>;
type SafetyMode = "all" | "danger" | "safe";
type SortMode = "recommended" | "protein" | "calories" | "sodium";

const parseNumber = (value: unknown) => Number(value || 0);
const mealFactor: Record<string, number> = { "감량": .8, "유지": 1, "증량": 1.12 };

function menuSection(menu: Menu) {
  const category = menu.category.trim();
  const name = menu.menu.trim();

  // 공통 키워드 추측보다 브랜드가 공개한 원본 카테고리를 먼저 사용한다.
  if (menu.brand === "써브웨이") {
    if (/샌드위치|아침메뉴/.test(category)) return "샌드위치";
    if (/샐러드/.test(category)) return "샐러드";
    if (/랩/.test(category)) return "랩";
    if (/커피|아메리카노|라떼|콜라|사이다|주스|음료/.test(name)) return "음료";
    return "사이드";
  }
  if (menu.brand === "맥도날드") {
    if (category === "버거") return "버거";
    if (category === "단품") return "맥모닝";
    if (category === "음료") return "음료";
    return "사이드·디저트";
  }
  if (menu.brand === "롯데리아") {
    if (category === "버거메뉴") return "버거";
    if (category === "드링크 메뉴") return "음료";
    if (category === "아이스샷") return "사이드·디저트";
    if (/소스|토핑/.test(category)) return "소스·추가";
    return "사이드·디저트";
  }
  if (menu.brand === "KFC") {
    if (category === "추가 메뉴") return "소스·추가";
    return category || "기타";
  }
  if (menu.brand === "이디야") return category === "음료" ? "음료" : "베이커리·푸드";
  if (menu.brand === "스타벅스") {
    return category || "기타 음료";
  }
  if (menu.brand === "배스킨라빈스") return "아이스크림";
  if (menu.brand === "파리바게뜨") return category || "기타";
  if (menu.brand === "버거킹") {
    if (/추가|시즈닝|패티|^슬라이스치즈|^롱베이컨/.test(name) || (/소스$/.test(name) && !/[+&]/.test(name))) return "소스·추가";
    if (/버거|와퍼|스태커/.test(name)) return "버거";
    if (/콜라|사이다|환타|주스|아메리카노|커피|라떼|에이드|미닛메이드|아이스초코|핫초코/.test(name)) return "음료";
    return "사이드·디저트";
  }
  return category || "기타";
}

const DEFAULT_MENU_SECTION_ORDER = ["버거", "치킨", "샌드위치", "샐러드", "랩", "맥모닝", "빵", "케이크", "사이드", "사이드·디저트", "디저트·스낵", "베이커리·푸드", "음료", "소스·추가", "기타"];
const BRAND_MENU_SECTION_ORDER: Record<string, string[]> = {
  "써브웨이": ["샌드위치", "샐러드", "랩", "사이드"],
  "맥도날드": ["버거", "맥모닝", "사이드·디저트", "음료"],
  "롯데리아": ["버거", "사이드·디저트", "음료", "소스·추가"],
  "버거킹": ["버거", "사이드·디저트", "음료", "소스·추가"],
  "KFC": ["치킨", "버거", "사이드", "음료", "소스", "소스·추가", "기타"],
  "이디야": ["음료", "베이커리·푸드"],
  "스타벅스": ["에스프레소", "콜드 브루", "브루드 커피", "프라푸치노", "블렌디드", "리프레셔", "피지오", "티", "기타 음료", "병음료"],
  "배스킨라빈스": ["아이스크림"],
  "파리바게뜨": ["빵", "케이크", "샌드위치·샐러드", "디저트·스낵", "간편식", "커피·음료", "선물", "기타"]
};

function menuSectionRank(brand: string, section: string) {
  const order = BRAND_MENU_SECTION_ORDER[brand] || DEFAULT_MENU_SECTION_ORDER;
  const rank = order.indexOf(section);
  return rank < 0 ? 999 : rank;
}

function menuDescription(menu: Menu) {
  if (menu.description) return menu.description.length > 72 ? `${menu.description.slice(0, 72).trim()}…` : menu.description;
  return "";
}

function MenuDescription({ menu }: { menu: Menu }) {
  const [expanded, setExpanded] = useState(false);
  if (!menu.description) return null;
  const isLong = menu.description.length > 72;
  const text = expanded || !isLong ? menu.description : menuDescription(menu);
  return <div className="menu-description" title={menu.description}>{text}{isLong && <button className="description-more" onClick={() => setExpanded((current) => !current)}>{expanded ? "접기" : "더보기"}</button>}</div>;
}

function servingLabel(menu: Menu) {
  if (menu.brand === "써브웨이" && menuSection(menu) === "샌드위치") return "15cm · 기본 레시피 기준";
  if (menu.brand === "배스킨라빈스") return "싱글레귤러 115g 기준";
  return "";
}

export default function HanipApp() {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [tab, setTab] = useState<Tab>("menus");
  const [allergens, setAllergens] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [brandCategory, setBrandCategory] = useState("전체");
  const [safetyMode, setSafetyMode] = useState<SafetyMode>("all");
  const [showQuickFilters, setShowQuickFilters] = useState(false);
  const [quickFiltersOpen, setQuickFiltersOpen] = useState(false);
  const [quickFiltersMinimized, setQuickFiltersMinimized] = useState(false);
  const filtersAnchorRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recommended");
  const [menuSectionFilter, setMenuSectionFilter] = useState("전체");
  const [maxCalories, setMaxCalories] = useState(600);
  const [minProtein, setMinProtein] = useState(0);
  const [maxSodium, setMaxSodium] = useState(1500);
  const [profileOn, setProfileOn] = useState(false);
  const [profile, setProfile] = useState({ sex: "여성", age: 25, height: 165, weight: 60, goal: "감량" });
  const [openBrands, setOpenBrands] = useState<Record<string, boolean>>({});
  const [cart, setCart] = useState<Cart>({});
  const [added, setAdded] = useState<{ id: number; nonce: number } | null>(null);
  const [detailSelection, setDetailSelection] = useState<number[]>([]);
  const [mealFlight, setMealFlight] = useState<{ x: number; y: number; dx: number; dy: number; nonce: number } | null>(null);

  useEffect(() => {
    fetch("/data/menus.csv").then((response) => response.text()).then((csv) => {
      const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data;
      const data = parsed.map((row, id) => ({
        id, brand: row.brand, menu: row.menu, category: row.category,
        calories: parseNumber(row.calories), protein: parseNumber(row.protein), fat: parseNumber(row.fat),
        carbs: parseNumber(row.carbs), sodium: parseNumber(row.sodium),
        allergens: (row.allergens || "").split("|").map((item) => item.trim()).filter(Boolean),
        allergenKnown: row.allergen_known?.toLowerCase() === "true", sourceUrl: row.source_url,
        imageUrl: row.image_url || "", description: row.description || "",
        price: row.price ? parseNumber(row.price) : undefined, priceNote: row.price_note || "매장별 확인",
        priceSourceUrl: row.price_source_url || "", priceCheckedAt: row.price_checked_at || "",
        mediaSourceUrl: row.media_source_url || "", mediaCheckedAt: row.media_checked_at || ""
      }));
      setMenus(data);
      setBrands(Array.from(new Set(data.map((menu) => menu.brand))));
    });
    const saved = localStorage.getItem("hanip-cart");
    if (saved) setCart(JSON.parse(saved));
  }, []);

  useEffect(() => { localStorage.setItem("hanip-cart", JSON.stringify(cart)); }, [cart]);

  useEffect(() => {
    const anchor = filtersAnchorRef.current;
    if (!anchor) return;
    // 패널이 나타나며 본문 폭이 바뀌어도 판정점이 흔들리지 않도록 문서상의 고정 Y값을 사용한다.
    const boundary = anchor.getBoundingClientRect().bottom + window.scrollY - 90;
    const update = () => {
      const passed = window.scrollY >= boundary;
      setShowQuickFilters(passed);
      if (!passed) setQuickFiltersOpen(false);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  const brandOptions = useMemo(() => Array.from(new Set(menus.map((menu) => menu.brand))), [menus]);
  const targetCalories = useMemo(() => {
    const bmr = profile.sex === "남성"
      ? 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5
      : 10 * profile.weight + 6.25 * profile.height - 5 * profile.age - 161;
    return Math.round(bmr * 1.35 * mealFactor[profile.goal]);
  }, [profile]);

  const compareMenus = (a: Menu, b: Menu) => sortMode === "protein" ? b.protein - a.protein
    : sortMode === "calories" ? a.calories - b.calories
    : sortMode === "sodium" ? a.sodium - b.sodium
    : profileOn ? Math.abs(a.calories - targetCalories * .32) - Math.abs(b.calories - targetCalories * .32) || b.protein - a.protein
    : b.protein - a.protein;
  const filtered = useMemo(() => menus.filter((menu) => {
    const danger = allergens.length ? allergens.some((item) => menu.allergens.includes(item)) : menu.allergens.length > 0;
    const safetyMatch = safetyMode === "all" || (safetyMode === "danger" ? danger : menu.allergenKnown && !danger);
    const categoryMatch = brandCategory === "전체" || BRAND_CATEGORIES[menu.brand]?.includes(brandCategory);
    return brands.includes(menu.brand) && categoryMatch && safetyMatch && menu.calories <= maxCalories && menu.protein >= minProtein && menu.sodium <= maxSodium
      && (!query.trim() || menu.brand.toLowerCase().includes(query.trim().toLowerCase()) || menu.menu.toLowerCase().includes(query.trim().toLowerCase()));
  }).sort(compareMenus), [menus, allergens, brands, brandCategory, safetyMode, maxCalories, minProtein, maxSodium, query, profileOn, targetCalories, sortMode]);

  const grouped = useMemo(() => Object.entries(filtered.reduce<Record<string, Menu[]>>((groups, menu) => {
    (groups[menu.brand] ||= []).push(menu);
    return groups;
  }, {})).map(([brand, items]) => [brand, [...items].sort(compareMenus)] as [string, Menu[]])
    .sort(([, a], [, b]) => a.length && b.length ? compareMenus(a[0], b[0]) : b.length - a.length), [filtered, sortMode, profileOn, targetCalories]);
  const activeBrand = Object.keys(openBrands).find((brand) => openBrands[brand]) || "";
  const activeItems = grouped.find(([brand]) => brand === activeBrand)?.[1] || [];
  const menuSections = useMemo(() => ["전체", ...Array.from(new Set(activeItems.map(menuSection))).sort((a, b) => {
    return menuSectionRank(activeBrand, a) - menuSectionRank(activeBrand, b) || a.localeCompare(b, "ko");
  })], [activeBrand, activeItems]);
  const visibleActiveItems = useMemo(() => activeItems
    .filter((menu) => menuSectionFilter === "전체" || menuSection(menu) === menuSectionFilter)
    .sort((a, b) => menuSectionFilter === "전체"
      ? menuSectionRank(activeBrand, menuSection(a)) - menuSectionRank(activeBrand, menuSection(b)) || compareMenus(a, b)
      : compareMenus(a, b)), [activeBrand, activeItems, menuSectionFilter, sortMode, profileOn, targetCalories]);
  const cartItems = useMemo(() => Object.entries(cart).flatMap(([id, quantity]) => {
    const menu = menus[Number(id)]; return menu ? [{ menu, quantity }] : [];
  }), [cart, menus]);
  const cartMenuIds = useMemo(() => cartItems.map(({ menu }) => menu.id), [cartItems]);
  useEffect(() => {
    setDetailSelection(cartMenuIds.slice(0, 4));
  }, [cartMenuIds]);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totals = cartItems.reduce((sum, { menu, quantity }) => ({
    calories: sum.calories + menu.calories * quantity, protein: sum.protein + menu.protein * quantity,
    fat: sum.fat + menu.fat * quantity, carbs: sum.carbs + menu.carbs * quantity, sodium: sum.sodium + menu.sodium * quantity
  }), { calories: 0, protein: 0, fat: 0, carbs: 0, sodium: 0 });

  const addToCart = (id: number, event: React.MouseEvent<HTMLButtonElement>) => {
    setCart((current) => ({ ...current, [id]: (current[id] || 0) + 1 }));
    setAdded({ id, nonce: Date.now() });
    const start = event.currentTarget.getBoundingClientRect();
    const target = document.querySelector<HTMLElement>("[data-meal-tab]")?.getBoundingClientRect();
    if (target) {
      const x = start.left + start.width / 2; const y = start.top + start.height / 2;
      setMealFlight({ x, y, dx: target.left + target.width / 2 - x, dy: target.top + target.height / 2 - y, nonce: Date.now() });
      window.setTimeout(() => setMealFlight(null), 820);
    }
    window.setTimeout(() => setAdded((current) => current?.id === id ? null : current), 950);
  };

  return (
    <main>
      <button className={`quick-filter-trigger ${showQuickFilters ? "visible" : ""} ${quickFiltersMinimized ? "minimized" : ""}`} onClick={() => { setQuickFiltersOpen(true); setQuickFiltersMinimized(false); }}><SlidersHorizontal size={17} /> 조건 열기</button>
      <aside className={`quick-filter-panel ${showQuickFilters && !quickFiltersMinimized ? "visible" : ""} ${quickFiltersOpen ? "open" : ""}`}>
        <button className="quick-filter-close" onClick={() => setQuickFiltersOpen(false)} aria-label="조건 패널 닫기"><X size={20} /></button>
        <button className="quick-filter-minimize" onClick={() => setQuickFiltersMinimized(true)} aria-label="조건 패널 접기"><ChevronLeft size={18} /><span>접기</span></button>
        <div className="quick-filter-title"><span>QUICK FILTER</span><b>조건 바로 바꾸기</b></div>
        <div className="quick-group"><h3>알레르기</h3><div className="chips"><button className={allergens.length === 0 ? "chip active no-allergy" : "chip no-allergy"} onClick={() => setAllergens([])}>알레르기 없음</button>{ALLERGENS.map((item) => <button key={item} className={allergens.includes(item) ? "chip active" : "chip"} onClick={() => setAllergens((current) => current.includes(item) ? current.filter((x) => x !== item) : [...current, item])}>{item}</button>)}</div></div>
        <div className="quick-group"><h3>안전 상태</h3><div className="quick-safety"><button className={safetyMode === "all" ? "active" : ""} onClick={() => setSafetyMode("all")}>모두</button><button className={safetyMode === "safe" ? "active safe" : ""} onClick={() => setSafetyMode("safe")}>안전</button><button className={safetyMode === "danger" ? "active danger" : ""} onClick={() => setSafetyMode("danger")}>위험</button></div></div>
        <div className="quick-group"><h3>카테고리</h3><select value={brandCategory} onChange={(e) => setBrandCategory(e.target.value)}>{BRAND_CATEGORY_ORDER.map((item) => <option key={item}>{item}</option>)}</select></div>
        <div className="quick-group quick-ranges"><Range label="최대 칼로리" value={maxCalories} min={100} max={1200} step={50} unit="kcal" onChange={setMaxCalories} /><Range label="최소 단백질" value={minProtein} min={0} max={60} step={5} unit="g" onChange={setMinProtein} /><Range label="최대 나트륨" value={maxSodium} min={100} max={3000} step={100} unit="mg" onChange={setMaxSodium} /></div>
      </aside>
      {showQuickFilters && quickFiltersOpen && <button className="quick-filter-backdrop" aria-label="닫기" onClick={() => setQuickFiltersOpen(false)} />}
      {mealFlight && <div key={mealFlight.nonce} className="meal-flight" style={{ left: mealFlight.x, top: mealFlight.y, "--flight-x": `${mealFlight.dx}px`, "--flight-y": `${mealFlight.dy}px` } as React.CSSProperties}><UtensilsCrossed size={16} /><span>+1</span></div>}
      <header className="landing">
        <div className="landing-orb orb-one" /><div className="landing-orb orb-two" />
        <div className="landing-copy"><div className="eyebrow">FRANCHISE FOOD GUIDE</div><p className="landing-brand">🍽️ 한입안심</p><h1>오늘의 한 끼,<br />안심하고 고르세요.</h1><p>알레르기와 영양 목표를 한 번 설정하면<br />여러 프랜차이즈 메뉴를 한곳에서 찾아드려요.</p><a href="#explorer">내 메뉴 찾아보기 <ArrowDown size={18} /></a></div>
        <div className="landing-note"><span>ALLERGY</span><span>NUTRITION</span><span>NEARBY</span></div>
      </header>

      <section className="content" id="explorer">
        <Reveal><header className="section-intro"><span>01 · 내 조건</span><h2>나에게 맞는 기준부터 선택해요</h2><p>선택한 정보는 브라우저 안에서 메뉴를 찾는 데만 사용됩니다.</p></header></Reveal>
        <div ref={filtersAnchorRef}><Reveal><section className="horizontal-filters">
          <div className="filter-block allergy-block"><h3>피해야 할 알레르기</h3><p>대한민국 의무표시 대상 기준</p><div className="chips"><button className={allergens.length === 0 ? "chip active no-allergy" : "chip no-allergy"} onClick={() => setAllergens([])}>알레르기 없음</button>{ALLERGENS.map((item) => <button key={item} className={allergens.includes(item) ? "chip active" : "chip"} onClick={() => setAllergens((current) => current.includes(item) ? current.filter((x) => x !== item) : [...current, item])}>{item}</button>)}</div></div>
          <div className="filter-block"><h3>메뉴 안전 상태</h3><p>{allergens.length ? "선택한 알레르기 기준" : "표시 성분 유무 기준"}</p><div className="safety-options">
            <button className={`all-option ${safetyMode === "all" ? "active" : ""}`} onClick={() => setSafetyMode("all")}>모두 보기</button>
            <button className={`safe-option ${safetyMode === "safe" ? "active" : ""}`} onClick={() => setSafetyMode("safe")}>안전한 것만</button>
            <button className={`danger-option ${safetyMode === "danger" ? "active" : ""}`} onClick={() => setSafetyMode("danger")}>위험한 것만</button>
          </div></div>
          <div className="filter-block profile-block"><h3>맞춤 프로필</h3><label className="toggle-row"><input type="checkbox" checked={profileOn} onChange={(event) => setProfileOn(event.target.checked)} /> 신체·다이어트 목표 반영</label><div className={`profile-grid profile-preview ${profileOn ? "enabled" : "disabled"}`}><select disabled={!profileOn} value={profile.sex} onChange={(e) => setProfile({ ...profile, sex: e.target.value })}><option>여성</option><option>남성</option></select><select disabled={!profileOn} value={profile.goal} onChange={(e) => setProfile({ ...profile, goal: e.target.value })}><option>감량</option><option>유지</option><option>증량</option></select><NumberField disabled={!profileOn} label="나이" value={profile.age} onChange={(age) => setProfile({ ...profile, age })} /><NumberField disabled={!profileOn} label="키(cm)" value={profile.height} onChange={(height) => setProfile({ ...profile, height })} /><NumberField disabled={!profileOn} label="체중(kg)" value={profile.weight} onChange={(weight) => setProfile({ ...profile, weight })} /><div className="target-calorie">하루 참고 목표 <b>{targetCalories.toLocaleString()} kcal</b></div></div>{!profileOn && <button className="profile-enable-hint" onClick={() => setProfileOn(true)}>체크하고 맞춤 추천 사용하기 →</button>}</div>
          <div className="filter-block nutrition-block"><h3>영양 조건</h3><Range label="최대 칼로리" value={maxCalories} min={100} max={1200} step={50} unit="kcal" onChange={setMaxCalories} /><Range label="최소 단백질" value={minProtein} min={0} max={60} step={5} unit="g" onChange={setMinProtein} /><Range label="최대 나트륨" value={maxSodium} min={100} max={3000} step={100} unit="mg" onChange={setMaxSodium} /></div>
        </section></Reveal></div>

        <Reveal><section className="category-section"><div className="section-intro compact"><span>02 · 카테고리</span><h2>어떤 종류를 찾고 있나요?</h2></div><div className="category-grid">{BRAND_CATEGORY_ORDER.map((category) => <button className={brandCategory === category ? "active" : ""} key={category} onClick={() => setBrandCategory(category)}><b>{category}</b><small>{category === "전체" ? "모든 브랜드" : `${brandOptions.filter((brand) => BRAND_CATEGORIES[brand]?.includes(category)).length}개 브랜드`}</small></button>)}</div><div className="brand-picker">{brandOptions.filter((brand) => brandCategory === "전체" || BRAND_CATEGORIES[brand]?.includes(brandCategory)).map((brand) => <button key={brand} className={brands.includes(brand) ? "active" : ""} onClick={() => setBrands((current) => current.includes(brand) ? current.filter((x) => x !== brand) : [...current, brand])}><Image src={BRAND_LOGOS[brand]} alt="" width={44} height={44} /><span>{brand}</span></button>)}</div></section></Reveal>

        <nav className="tabs">
          <TabButton active={tab === "menus"} onClick={() => setTab("menus")} icon={<MenuIcon size={17} />} label="추천 메뉴" />
          <TabButton mealTarget receiving={Boolean(mealFlight)} active={tab === "cart"} onClick={() => setTab("cart")} icon={<UtensilsCrossed size={17} />} label={`나의 한 끼 (${cartCount})`} />
          <TabButton active={tab === "map"} onClick={() => setTab("map")} icon={<MapPin size={17} />} label="주변 매장" />
          <TabButton active={tab === "compare"} onClick={() => setTab("compare")} label="브랜드 비교" />
          <TabButton active={tab === "about"} onClick={() => setTab("about")} label="데이터 안내" />
        </nav>

        {tab === "menus" && <Reveal><section className="panel">
          <div className="panel-head"><div><h2>조건에 맞는 메뉴</h2><p>브랜드와 메뉴 종류를 고르면 오늘의 한 끼를 빠르게 찾을 수 있어요.</p></div><div className="menu-tools"><label className="sort-select"><span>정렬</span><select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}><option value="recommended">맞춤 추천순</option><option value="protein">단백질 높은 순</option><option value="calories">열량 낮은 순</option><option value="sodium">나트륨 낮은 순</option></select></label><label className="search"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="브랜드 또는 메뉴 검색" /></label></div></div>
          <div className="brand-browser"><div className="brand-folders">{grouped.map(([brand, items]) => { if (!items) return null; const safeCount = allergens.length ? items.filter((menu) => menu.allergenKnown && allergens.every((item) => !menu.allergens.includes(item))).length : items.length; const dangerCount = allergens.length ? items.filter((menu) => allergens.some((item) => menu.allergens.includes(item))).length : 0; return <button className={`brand-tile ${activeBrand === brand ? "selected" : ""}`} key={brand} onClick={() => { setOpenBrands(activeBrand === brand ? {} : { [brand]: true }); setMenuSectionFilter("전체"); }}>
            <Image src={BRAND_LOGOS[brand]} alt={brand} width={78} height={78} /><span><b>{brand}</b><small><strong>안전 추천 {safeCount}개</strong>{allergens.length > 0 && dangerCount > 0 && <em>위험 {dangerCount}개</em>}</small></span>{activeBrand === brand ? <Check /> : <ChevronRight />}
          </button>; })}</div>
          {activeBrand ? <div className="brand-menu-panel" key={activeBrand}><div className="brand-menu-head"><div><span>SELECTED BRAND</span><h3>{activeBrand} 메뉴</h3><p>조건에 맞는 {activeItems.length}개 메뉴를 종류별로 확인하세요.</p></div><button onClick={() => setOpenBrands({})}><X size={18} /> 닫기</button></div><div className="menu-section-tabs">{menuSections.map((section) => <button key={section} className={menuSectionFilter === section ? "active" : ""} onClick={() => setMenuSectionFilter(section)}><b>{section}</b><small>{section === "전체" ? activeItems.length : activeItems.filter((menu) => menuSection(menu) === section).length}</small></button>)}</div><div className="menu-grid">{visibleActiveItems.map((menu) => { const danger = allergens.length ? allergens.some((item) => menu.allergens.includes(item)) : menu.allergens.length > 0; return <article className={`menu-card ${danger ? "risk-card" : "safe-card"}`} key={menu.id}>
            <div className={`menu-image ${menu.imageUrl ? "official" : "fallback"}`}><img src={menu.imageUrl || BRAND_LOGOS[menu.brand]} alt={menu.imageUrl ? `${menu.menu} 공식 메뉴 이미지` : `${menu.brand} 로고`} loading="lazy" onError={(event) => { event.currentTarget.src = BRAND_LOGOS[menu.brand]; event.currentTarget.closest(".menu-image")?.classList.add("fallback"); }} />{menu.imageUrl && <span>공식 이미지</span>}</div><span className="category">{menuSection(menu)} · {menu.category}</span><h3>{menu.menu}</h3>{servingLabel(menu) && <span className="serving-label">{servingLabel(menu)}</span>}<MenuDescription menu={menu} /><div className="menu-price"><b>{menu.price ? `${menu.price.toLocaleString()}원` : "가격은 매장별 확인"}</b><small>{menu.price ? menu.priceNote : "매장·주문 채널에 따라 달라질 수 있어요"}{menu.priceCheckedAt ? ` · ${menu.priceCheckedAt} 확인` : menu.mediaCheckedAt ? ` · ${menu.mediaCheckedAt} 확인` : ""}</small>{menu.priceSourceUrl && <a href={menu.priceSourceUrl} target="_blank" rel="noreferrer">가격 출처 보기</a>}</div><p>{menu.calories.toFixed(0)} kcal · 단백질 {menu.protein.toFixed(0)}g · 나트륨 {menu.sodium.toFixed(0)}mg</p><div className="allergen-row">{menu.allergenKnown ? (menu.allergens.length ? menu.allergens.map((item) => <span key={item}>{item}</span>) : <span className="safe">표시 알레르기 없음</span>) : <span>알레르기 정보 미표기</span>}</div><button key={added?.id === menu.id ? added.nonce : menu.id} className={added?.id === menu.id ? "add-button confirmed" : "add-button"} onClick={(event) => addToCart(menu.id, event)}>{added?.id === menu.id ? <><Check size={18} /> 담았어요!</> : <><UtensilsCrossed size={18} /> 한 끼에 담기</>}</button>
          </article>; })}</div></div> : <div className="brand-menu-placeholder"><MenuIcon size={34} /><h3>브랜드를 선택해 주세요</h3><p>왼쪽 카드를 누르면 이곳에서 메뉴를 바로 비교할 수 있어요.</p></div>}</div>
          {!filtered.length && <div className="empty">조건을 만족하는 메뉴가 없어요. 조건을 조금 넓혀보세요.</div>}
        </section></Reveal>}

        {tab === "cart" && <div className="meal-workspace"><CartPanel items={cartItems} cart={cart} setCart={setCart} totals={totals} targetCalories={profileOn ? targetCalories : 2000} allergens={allergens} /><DetailComparePanel menus={menus} selection={detailSelection} setSelection={setDetailSelection} cartIds={cartMenuIds} /></div>}
        {tab === "map" && <MapPanel brands={brands} />}
        {tab === "compare" && <ComparePanel menus={filtered} brands={brandOptions} />}
        {tab === "about" && <section className="panel prose"><h2>알레르기 표시 기준과 데이터 안내</h2><div className="law-card"><b>대한민국 · 의무표시</b><p><strong>근거법령</strong> 식품 등의 표시·광고에 관한 법률 시행규칙</p><p><strong>소관기관</strong> 식품의약품안전처</p><p><strong>표시 대상</strong> 알류(가금류), 우유, 메밀, 땅콩, 대두, 밀, 고등어, 게, 새우, 돼지고기, 복숭아, 토마토, 아황산류(최종제품 이산화황 10mg/kg 이상), 호두, 닭고기, 쇠고기, 오징어, 조개류(굴·전복·홍합 포함), 잣 및 이들 식품에서 추출한 성분을 원재료로 사용한 식품(젤라틴·새우엑기스 등)</p><p><strong>혼입 우려 표시 예시</strong> “○○ 혼입 가능”</p></div><p>영양·알레르기 정보는 각 브랜드 공식 자료를 기반으로 정리했습니다. ‘표시 알레르기 없음’은 알레르기 위험이 절대 없다는 뜻이 아닙니다. 교차오염 가능성과 원재료 변경이 있으므로 심한 알레르기가 있다면 반드시 주문 전 매장에 확인하세요.</p><p>매장 위치·검색은 카카오맵과 카카오 로컬 API를 사용합니다. 가격은 매장·배달 채널별로 달라질 수 있어 실시간 가격으로 제공하지 않습니다.</p></section>}
      </section>
    </main>
  );
}

function Reveal({ children }: { children: React.ReactNode }) { const ref = useRef<HTMLDivElement>(null); useEffect(() => { const node = ref.current; if (!node) return; const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && node.classList.add("visible"), { threshold: .12 }); observer.observe(node); return () => observer.disconnect(); }, []); return <div ref={ref} className="reveal">{children}</div>; }
function TabButton({ active, onClick, label, icon, mealTarget = false, receiving = false }: { active: boolean; onClick: () => void; label: string; icon?: React.ReactNode; mealTarget?: boolean; receiving?: boolean }) { return <button data-meal-tab={mealTarget ? "true" : undefined} className={`${active ? "active" : ""} ${receiving ? "meal-tab-receiving" : ""}`} onClick={onClick}>{icon}{label}</button>; }
function NumberField({ label, value, onChange, disabled = false }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean }) { return <label><span>{label}</span><input disabled={disabled} type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>; }
function Range({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (value: number) => void }) { return <label className="range"><span>{label}<b>{value} {unit}</b></span><input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} /></label>; }

function CartPanel({ items, cart, setCart, totals, targetCalories, allergens }: { items: Array<{ menu: Menu; quantity: number }>; cart: Cart; setCart: React.Dispatch<React.SetStateAction<Cart>>; totals: Record<string, number>; targetCalories: number; allergens: string[] }) {
  if (!items.length) return <section className="panel empty"><UtensilsCrossed size={36} /><h2>나의 한 끼가 비어 있어요</h2><p>추천 메뉴에서 버거, 음료, 사이드를 조합해보세요.</p></section>;
  const standards = [{ name: "칼로리", value: totals.calories, max: targetCalories, unit: "kcal" }, { name: "단백질", value: totals.protein, max: 55, unit: "g" }, { name: "포화지방", value: totals.fat, max: 15, unit: "g" }, { name: "당류", value: totals.carbs, max: 100, unit: "g" }, { name: "나트륨", value: totals.sodium, max: 2000, unit: "mg" }];
  const knownPrice = items.reduce((sum, { menu, quantity }) => sum + (menu.price || 0) * quantity, 0);
  const unknownPriceCount = items.reduce((sum, { menu, quantity }) => sum + (menu.price ? 0 : quantity), 0);
  return <section className="panel"><div className="panel-head"><div><h2>나의 한 끼 영양 분석</h2><p>수량을 바꾸면 한 끼의 영양과 확인된 가격 합계가 즉시 계산돼요.</p></div><button className="danger" onClick={() => setCart({})}>전체 비우기</button></div>
    <div className="meal-price-total"><span>확인된 메뉴 가격 합계</span><b>{knownPrice.toLocaleString()}원</b><small>{unknownPriceCount ? `가격 미확인 메뉴 ${unknownPriceCount}개는 합계에서 제외됐어요.` : "모든 메뉴 가격이 합계에 포함됐어요."}</small></div>
    <div className="cart-list">{items.map(({ menu, quantity }) => { const matched = allergens.filter((item) => menu.allergens.includes(item)); return <div className={`cart-item ${matched.length ? "allergy-warning" : ""}`} key={menu.id}><div><b>{menu.menu}</b><span>{menu.brand} · {menu.calories} kcal · {menu.price ? `${(menu.price * quantity).toLocaleString()}원` : "가격 미확인"}</span>{matched.length > 0 && <em>주의 · 선택 알레르기: {matched.join(", ")}</em>}</div><div className="quantity"><button onClick={() => setCart((current) => ({ ...current, [menu.id]: Math.max(1, quantity - 1) }))}>−</button><b>{quantity}</b><button onClick={() => setCart((current) => ({ ...current, [menu.id]: Math.min(10, quantity + 1) }))}>+</button></div><button className="icon-button" onClick={() => setCart((current) => { const next = { ...current }; delete next[menu.id]; return next; })}><Trash2 size={18} /></button></div>; })}</div>
    <div className="nutrition-summary">{standards.map((item) => <div key={item.name}><span>{item.name}<b>{item.value.toFixed(item.unit === "mg" || item.unit === "kcal" ? 0 : 1)}{item.unit}</b></span><div className="progress"><i className={item.value > item.max ? "over" : ""} style={{ width: `${Math.min(100, item.value / item.max * 100)}%` }} /></div><small>{item.max}{item.unit} 기준 · {(item.value / item.max * 100).toFixed(0)}%</small></div>)}</div>
  </section>;
}

function ComparePanel({ menus, brands }: { menus: Menu[]; brands: string[] }) {
  const data = brands.map((brand) => ({ brand, count: menus.filter((menu) => menu.brand === brand).length })).filter((row) => row.count);
  return <section className="panel"><h2>브랜드별 선택 가능한 메뉴</h2><div className="chart"><ResponsiveContainer width="100%" height={360}><BarChart data={data}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="brand" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" name="메뉴 수" fill="#287653" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div></section>;
}

const DETAIL_COLORS = ["#287653", "#2e7bd8", "#ef6552", "#a268d5"];

function DetailComparePanel({ menus, selection, setSelection, cartIds }: { menus: Menu[]; selection: number[]; setSelection: React.Dispatch<React.SetStateAction<number[]>>; cartIds: number[] }) {
  const [search, setSearch] = useState("");
  const selected = selection.flatMap((id) => menus[id] ? [menus[id]] : []);
  const choices = menus.filter((menu) => !selection.includes(menu.id) && (!search.trim() || `${menu.brand} ${menu.menu}`.toLowerCase().includes(search.trim().toLowerCase()))).slice(0, 80);
  const radarData = [
    { subject: "칼로리", max: 800, key: "calories" },
    { subject: "단백질", max: 50, key: "protein" },
    { subject: "포화지방", max: 30, key: "fat" },
    { subject: "당류", max: 100, key: "carbs" },
    { subject: "나트륨", max: 2000, key: "sodium" }
  ].map((axis) => ({ subject: axis.subject, ...Object.fromEntries(selected.map((menu) => [`menu${menu.id}`, Math.min(100, Number(menu[axis.key as keyof Menu]) / axis.max * 100)])) }));
  const addMenu = (id: number) => { if (id >= 0 && selection.length < 4 && !selection.includes(id)) setSelection((current) => [...current, id]); };
  return <section className="panel detail-compare"><div className="panel-head"><div><span className="compare-kicker">NUTRITION COMPARE</span><h2>메뉴 영양성분 비교</h2><p>최대 4개 메뉴의 영양 균형을 같은 기준으로 비교해요.</p></div></div>
    <div className={`meal-sync-card ${cartIds.length ? "active" : ""}`}><span className="meal-import-icon"><UtensilsCrossed size={25} /></span><span><b>나의 한 끼 자동 반영</b><small>{cartIds.length ? `담아둔 메뉴 ${Math.min(cartIds.length, 4)}개가 비교에 자동으로 표시됩니다` : "나의 한 끼에 메뉴를 담으면 여기에 자동으로 나타나요"}</small></span>{cartIds.length > 0 && <Check size={20} />}</div>
    <div className="selected-menu-chips">{selected.map((menu, index) => <button style={{ borderColor: DETAIL_COLORS[index] }} key={menu.id} onClick={() => setSelection((current) => current.filter((id) => id !== menu.id))}><i style={{ background: DETAIL_COLORS[index] }} />{menu.brand} · {menu.menu}<X size={14} /></button>)}</div>
    {!selected.length ? <div className="empty"><h3>비교할 메뉴를 선택해 주세요</h3><p>‘나의 한 끼’에 메뉴를 담거나 아래에서 직접 추가해 주세요.</p></div> : <div className="detail-radar"><ResponsiveContainer width="100%" height={330}><RadarChart data={radarData} outerRadius="66%"><PolarGrid /><PolarAngleAxis dataKey="subject" /><PolarRadiusAxis angle={90} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />{selected.map((menu, index) => <Radar key={menu.id} name={`${menu.brand} · ${menu.menu}`} dataKey={`menu${menu.id}`} stroke={DETAIL_COLORS[index]} fill={DETAIL_COLORS[index]} fillOpacity={.13} strokeWidth={2} />)}<Legend /><Tooltip formatter={(value) => `${Number(value).toFixed(0)}%`} /></RadarChart></ResponsiveContainer></div>}
    <div className="compare-step add-after-chart"><span>+</span><b>다른 메뉴 직접 추가</b><small>{selection.length}/4 선택</small></div>
    <div className="detail-picker"><label className="search"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="브랜드 또는 메뉴 이름 검색" /></label><select value="" disabled={selection.length >= 4} onChange={(e) => { addMenu(Number(e.target.value)); setSearch(""); }}><option value="">{selection.length >= 4 ? "최대 4개까지 선택할 수 있어요" : "검색 결과에서 메뉴 선택"}</option>{choices.map((menu) => <option key={menu.id} value={menu.id}>{menu.brand} · {menu.menu}</option>)}</select></div>
    {selected.length > 0 &&
      <div className="detail-table-wrap"><table className="detail-table"><thead><tr><th>메뉴</th><th>가격</th><th>칼로리</th><th>단백질</th><th>포화지방</th><th>당류</th><th>나트륨</th></tr></thead><tbody>{selected.map((menu) => <tr key={menu.id}><td><b>{menu.brand}</b><span>{menu.menu}</span></td><td>매장별 확인</td><td>{menu.calories.toFixed(0)} kcal</td><td>{menu.protein.toFixed(1)} g</td><td>{menu.fat.toFixed(1)} g</td><td>{menu.carbs.toFixed(1)} g</td><td>{menu.sodium.toFixed(0)} mg</td></tr>)}</tbody></table></div>
    }
  </section>;
}

function MapPanel({ brands }: { brands: string[] }) {
  const [mode, setMode] = useState<"search" | "gps">("search"); const [term, setTerm] = useState(""); const [places, setPlaces] = useState<Place[]>([]); const [center, setCenter] = useState<Place | null>(null); const [stores, setStores] = useState<Store[]>([]); const [radius, setRadius] = useState(3); const [loading, setLoading] = useState(false);
  useEffect(() => { if (term.trim().length < 2) { setPlaces([]); return; } const controller = new AbortController(); const timer = window.setTimeout(() => fetch(`/api/places?q=${encodeURIComponent(term)}`, { signal: controller.signal }).then((r) => r.json()).then((data) => Array.isArray(data) && setPlaces(data)).catch(() => {}), 400); return () => { window.clearTimeout(timer); controller.abort(); }; }, [term]);
  useEffect(() => {
    if (!center) return;
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/stores?lat=${center.lat}&lon=${center.lon}&radius=${radius * 1000}&brands=${encodeURIComponent(brands.join(","))}`, { signal: controller.signal });
        const data = await response.json();
        setStores(Array.isArray(data) ? data : []);
      } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setStores([]); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 280);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [center, radius, brands]);
  const findStores = (place: Place) => setCenter(place);
  const locate = () => navigator.geolocation.getCurrentPosition((position) => findStores({ id: "gps", name: "현재 위치", address: `정확도 약 ${Math.round(position.coords.accuracy)}m`, lat: position.coords.latitude, lon: position.coords.longitude }), () => alert("브라우저 위치 권한을 허용해 주세요."), { enableHighAccuracy: true });
  return <section className="panel"><div className="panel-head map-panel-head"><div><h2>내 주변 매장</h2><p>카카오맵에서 선택한 브랜드의 매장을 찾아요.</p></div><label className="radius-slider"><span>검색 반경 <b>{radius} km</b></span><input type="range" min="1" max="10" step="1" value={radius} onChange={(e) => setRadius(Number(e.target.value))} /><small><i>1km</i><i>10km</i></small></label></div>
    <div className="mode-switch"><button className={mode === "search" ? "active" : ""} onClick={() => setMode("search")}><Search size={17} />장소 검색</button><button className={mode === "gps" ? "active" : ""} onClick={() => { setMode("gps"); locate(); }}><LocateFixed size={17} />현재 위치</button></div>
    {mode === "search" && <div className="location-search"><label className="search"><Search size={18} /><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="성수역, 서울시청처럼 입력하세요" /></label>{places.length > 0 && <div className="suggestions">{places.map((place) => <button key={place.id} onClick={() => { setTerm(place.name); setPlaces([]); findStores(place); }}><MapPin size={17} /><span><b>{place.name}</b><small>{place.address}</small></span></button>)}</div>}</div>}
    {loading && <div className="map-empty">주변 매장을 찾고 있어요…</div>}{center && !loading && <><KakaoMap center={center} radiusKm={radius} stores={stores} /><div className="store-summary"><b>{center.name}</b> 기준 {stores.length}개 매장</div><div className="store-list">{stores.slice(0, 20).map((store) => <a href={store.placeUrl || "#"} target="_blank" rel="noopener" key={store.id}><Image src={BRAND_LOGOS[store.brand]} alt="" width={34} height={34} /><span><b>{store.name}</b><small>{store.distance.toFixed(2)}km · 도보 약 {Math.ceil(store.distance * 1.25 / 4.5 * 60)}분 · {store.address}</small></span></a>)}</div></>}
  </section>;
}
