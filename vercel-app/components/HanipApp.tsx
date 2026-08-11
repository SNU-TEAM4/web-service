"use client";

import Image from "next/image";
import Papa from "papaparse";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Check, ChevronDown, ChevronUp, LocateFixed, MapPin, Menu as MenuIcon, Search, ShoppingCart, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ALLERGENS, BRAND_CATEGORIES, BRAND_CATEGORY_ORDER, BRAND_LOGOS } from "@/lib/brands";
import type { Menu, Place, Store } from "@/lib/types";
import KakaoMap from "./KakaoMap";

type Tab = "menus" | "cart" | "map" | "compare" | "detail" | "about";
type Cart = Record<number, number>;
type SafetyMode = "all" | "danger" | "safe";

const parseNumber = (value: unknown) => Number(value || 0);
const mealFactor: Record<string, number> = { "감량": .8, "유지": 1, "증량": 1.12 };

export default function HanipApp() {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [tab, setTab] = useState<Tab>("menus");
  const [allergens, setAllergens] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [brandCategory, setBrandCategory] = useState("전체");
  const [safetyMode, setSafetyMode] = useState<SafetyMode>("all");
  const [showQuickFilters, setShowQuickFilters] = useState(false);
  const [quickFiltersOpen, setQuickFiltersOpen] = useState(false);
  const filtersAnchorRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [maxCalories, setMaxCalories] = useState(600);
  const [minProtein, setMinProtein] = useState(0);
  const [maxSodium, setMaxSodium] = useState(1500);
  const [profileOn, setProfileOn] = useState(false);
  const [profile, setProfile] = useState({ sex: "여성", age: 25, height: 165, weight: 60, goal: "감량" });
  const [openBrands, setOpenBrands] = useState<Record<string, boolean>>({});
  const [cart, setCart] = useState<Cart>({});
  const [added, setAdded] = useState<{ id: number; nonce: number } | null>(null);
  const [detailSelection, setDetailSelection] = useState<number[]>([]);

  useEffect(() => {
    fetch("/data/menus.csv").then((response) => response.text()).then((csv) => {
      const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data;
      const data = parsed.map((row, id) => ({
        id, brand: row.brand, menu: row.menu, category: row.category,
        calories: parseNumber(row.calories), protein: parseNumber(row.protein), fat: parseNumber(row.fat),
        carbs: parseNumber(row.carbs), sodium: parseNumber(row.sodium),
        allergens: (row.allergens || "").split("|").filter(Boolean),
        allergenKnown: row.allergen_known?.toLowerCase() === "true", sourceUrl: row.source_url
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
    const observer = new IntersectionObserver(([entry]) => {
      const passed = !entry.isIntersecting && entry.boundingClientRect.bottom < 80;
      setShowQuickFilters(passed);
      if (!passed) setQuickFiltersOpen(false);
    }, { rootMargin: "-70px 0px 0px" });
    observer.observe(anchor);
    return () => observer.disconnect();
  }, []);

  const brandOptions = useMemo(() => Array.from(new Set(menus.map((menu) => menu.brand))), [menus]);
  const targetCalories = useMemo(() => {
    const bmr = profile.sex === "남성"
      ? 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5
      : 10 * profile.weight + 6.25 * profile.height - 5 * profile.age - 161;
    return Math.round(bmr * 1.35 * mealFactor[profile.goal]);
  }, [profile]);

  const filtered = useMemo(() => menus.filter((menu) => {
    const danger = allergens.length ? allergens.some((item) => menu.allergens.includes(item)) : menu.allergens.length > 0;
    const safetyMatch = safetyMode === "all" || (safetyMode === "danger" ? danger : menu.allergenKnown && !danger);
    const categoryMatch = brandCategory === "전체" || BRAND_CATEGORIES[menu.brand] === brandCategory;
    return brands.includes(menu.brand) && categoryMatch && safetyMatch && menu.calories <= maxCalories && menu.protein >= minProtein && menu.sodium <= maxSodium
      && (!query.trim() || menu.brand.toLowerCase().includes(query.trim().toLowerCase()) || menu.menu.toLowerCase().includes(query.trim().toLowerCase()));
  }).sort((a, b) => profileOn
    ? Math.abs(a.calories - targetCalories * .32) - Math.abs(b.calories - targetCalories * .32) || b.protein - a.protein
    : b.protein - a.protein), [menus, allergens, brands, brandCategory, safetyMode, maxCalories, minProtein, maxSodium, query, profileOn, targetCalories]);

  const grouped = useMemo(() => Object.entries(filtered.reduce<Record<string, Menu[]>>((groups, menu) => {
    (groups[menu.brand] ||= []).push(menu);
    return groups;
  }, {})), [filtered]);
  const cartItems = useMemo(() => Object.entries(cart).flatMap(([id, quantity]) => {
    const menu = menus[Number(id)]; return menu ? [{ menu, quantity }] : [];
  }), [cart, menus]);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totals = cartItems.reduce((sum, { menu, quantity }) => ({
    calories: sum.calories + menu.calories * quantity, protein: sum.protein + menu.protein * quantity,
    fat: sum.fat + menu.fat * quantity, carbs: sum.carbs + menu.carbs * quantity, sodium: sum.sodium + menu.sodium * quantity
  }), { calories: 0, protein: 0, fat: 0, carbs: 0, sodium: 0 });

  const addToCart = (id: number) => {
    setCart((current) => ({ ...current, [id]: (current[id] || 0) + 1 }));
    setAdded({ id, nonce: Date.now() });
    window.setTimeout(() => setAdded((current) => current?.id === id ? null : current), 950);
  };

  return (
    <main>
      <button className={`quick-filter-trigger ${showQuickFilters ? "visible" : ""}`} onClick={() => setQuickFiltersOpen(true)}><SlidersHorizontal size={17} /> 조건 바꾸기</button>
      <aside className={`quick-filter-panel ${showQuickFilters ? "visible" : ""} ${quickFiltersOpen ? "open" : ""}`}>
        <button className="quick-filter-close" onClick={() => setQuickFiltersOpen(false)} aria-label="조건 패널 닫기"><X size={20} /></button>
        <div className="quick-filter-title"><span>QUICK FILTER</span><b>조건 바로 바꾸기</b></div>
        <div className="quick-group"><h3>알레르기</h3><div className="chips">{ALLERGENS.map((item) => <button key={item} className={allergens.includes(item) ? "chip active" : "chip"} onClick={() => setAllergens((current) => current.includes(item) ? current.filter((x) => x !== item) : [...current, item])}>{item}</button>)}</div></div>
        <div className="quick-group"><h3>안전 상태</h3><div className="quick-safety"><button className={safetyMode === "all" ? "active" : ""} onClick={() => setSafetyMode("all")}>모두</button><button className={safetyMode === "danger" ? "active danger" : ""} onClick={() => setSafetyMode("danger")}>위험</button><button className={safetyMode === "safe" ? "active safe" : ""} onClick={() => setSafetyMode("safe")}>안전</button></div></div>
        <div className="quick-group"><h3>카테고리</h3><select value={brandCategory} onChange={(e) => setBrandCategory(e.target.value)}>{BRAND_CATEGORY_ORDER.map((item) => <option key={item}>{item}</option>)}</select></div>
        <div className="quick-group quick-ranges"><Range label="최대 칼로리" value={maxCalories} min={100} max={1200} step={50} unit="kcal" onChange={setMaxCalories} /><Range label="최소 단백질" value={minProtein} min={0} max={60} step={5} unit="g" onChange={setMinProtein} /><Range label="최대 나트륨" value={maxSodium} min={100} max={3000} step={100} unit="mg" onChange={setMaxSodium} /></div>
      </aside>
      {showQuickFilters && quickFiltersOpen && <button className="quick-filter-backdrop" aria-label="닫기" onClick={() => setQuickFiltersOpen(false)} />}
      <header className="landing">
        <div className="landing-orb orb-one" /><div className="landing-orb orb-two" />
        <div className="landing-copy"><div className="eyebrow">FRANCHISE FOOD GUIDE</div><p className="landing-brand">🍽️ 한입안심</p><h1>오늘의 한 끼,<br />안심하고 고르세요.</h1><p>알레르기와 영양 목표를 한 번 설정하면<br />여러 프랜차이즈 메뉴를 한곳에서 찾아드려요.</p><a href="#explorer">내 메뉴 찾아보기 <ArrowDown size={18} /></a></div>
        <div className="landing-note"><span>ALLERGY</span><span>NUTRITION</span><span>NEARBY</span></div>
      </header>

      <section className="content" id="explorer">
        <Reveal><header className="section-intro"><span>01 · 내 조건</span><h2>나에게 맞는 기준부터 선택해요</h2><p>선택한 정보는 브라우저 안에서 메뉴를 찾는 데만 사용됩니다.</p></header></Reveal>
        <div ref={filtersAnchorRef}><Reveal><section className="horizontal-filters">
          <div className="filter-block allergy-block"><h3>피해야 할 알레르기</h3><p>대한민국 의무표시 대상 기준</p><div className="chips">{ALLERGENS.map((item) => <button key={item} className={allergens.includes(item) ? "chip active" : "chip"} onClick={() => setAllergens((current) => current.includes(item) ? current.filter((x) => x !== item) : [...current, item])}>{item}</button>)}</div></div>
          <div className="filter-block"><h3>메뉴 안전 상태</h3><p>{allergens.length ? "선택한 알레르기 기준" : "표시 성분 유무 기준"}</p><div className="safety-options">
            <label><input type="radio" name="safety" checked={safetyMode === "all"} onChange={() => setSafetyMode("all")} /> 모두 보기</label>
            <label className="danger-option"><input type="radio" name="safety" checked={safetyMode === "danger"} onChange={() => setSafetyMode("danger")} /> 위험한 것만</label>
            <label className="safe-option"><input type="radio" name="safety" checked={safetyMode === "safe"} onChange={() => setSafetyMode("safe")} /> 위험하지 않은 것만</label>
          </div></div>
          <div className="filter-block"><h3>맞춤 프로필</h3><label className="toggle-row"><input type="checkbox" checked={profileOn} onChange={(event) => setProfileOn(event.target.checked)} /> 신체·다이어트 목표 반영</label>{profileOn && <div className="profile-grid"><select value={profile.sex} onChange={(e) => setProfile({ ...profile, sex: e.target.value })}><option>여성</option><option>남성</option></select><select value={profile.goal} onChange={(e) => setProfile({ ...profile, goal: e.target.value })}><option>감량</option><option>유지</option><option>증량</option></select><NumberField label="나이" value={profile.age} onChange={(age) => setProfile({ ...profile, age })} /><NumberField label="키(cm)" value={profile.height} onChange={(height) => setProfile({ ...profile, height })} /><NumberField label="체중(kg)" value={profile.weight} onChange={(weight) => setProfile({ ...profile, weight })} /><div className="target-calorie">하루 참고 목표 <b>{targetCalories.toLocaleString()} kcal</b></div></div>}</div>
          <div className="filter-block nutrition-block"><h3>영양 조건</h3><Range label="최대 칼로리" value={maxCalories} min={100} max={1200} step={50} unit="kcal" onChange={setMaxCalories} /><Range label="최소 단백질" value={minProtein} min={0} max={60} step={5} unit="g" onChange={setMinProtein} /><Range label="최대 나트륨" value={maxSodium} min={100} max={3000} step={100} unit="mg" onChange={setMaxSodium} /></div>
        </section></Reveal></div>

        <Reveal><section className="category-section"><div className="section-intro compact"><span>02 · 카테고리</span><h2>어떤 종류를 찾고 있나요?</h2></div><div className="category-grid">{BRAND_CATEGORY_ORDER.map((category) => <button className={brandCategory === category ? "active" : ""} key={category} onClick={() => setBrandCategory(category)}><b>{category}</b><small>{category === "전체" ? "모든 브랜드" : `${brandOptions.filter((brand) => BRAND_CATEGORIES[brand] === category).length}개 브랜드`}</small></button>)}</div><div className="brand-picker">{brandOptions.filter((brand) => brandCategory === "전체" || BRAND_CATEGORIES[brand] === brandCategory).map((brand) => <button key={brand} className={brands.includes(brand) ? "active" : ""} onClick={() => setBrands((current) => current.includes(brand) ? current.filter((x) => x !== brand) : [...current, brand])}><Image src={BRAND_LOGOS[brand]} alt="" width={44} height={44} /><span>{brand}</span></button>)}</div></section></Reveal>

        <nav className="tabs">
          <TabButton active={tab === "menus"} onClick={() => setTab("menus")} icon={<MenuIcon size={17} />} label="추천 메뉴" />
          <TabButton active={tab === "cart"} onClick={() => setTab("cart")} icon={<ShoppingCart size={17} />} label={`장바구니 (${cartCount})`} />
          <TabButton active={tab === "map"} onClick={() => setTab("map")} icon={<MapPin size={17} />} label="주변 매장" />
          <TabButton active={tab === "compare"} onClick={() => setTab("compare")} label="브랜드 비교" />
          <TabButton active={tab === "detail"} onClick={() => setTab("detail")} label="메뉴 상세 비교" />
          <TabButton active={tab === "about"} onClick={() => setTab("about")} label="데이터 안내" />
        </nav>

        {tab === "menus" && <Reveal><section className="panel">
          <div className="panel-head"><div><h2>조건에 맞는 메뉴</h2><p>브랜드를 누르면 메뉴를 펼칠 수 있어요.</p></div><label className="search"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="브랜드 또는 메뉴 검색" /></label></div>
          <div className="brand-folders">{grouped.map(([brand, items]) => items && <div className="brand-folder" key={brand}>
            <button className="brand-folder-head" onClick={() => setOpenBrands((current) => ({ ...current, [brand]: !current[brand] }))}>
              <Image src={BRAND_LOGOS[brand]} alt={brand} width={86} height={86} /><span><b>{brand}</b><small>추천 가능 {items.length}개</small></span>{openBrands[brand] ? <ChevronUp /> : <ChevronDown />}
            </button>
            {openBrands[brand] && <div className="menu-grid">{items.map((menu) => { const danger = allergens.length ? allergens.some((item) => menu.allergens.includes(item)) : menu.allergens.length > 0; return <article className={`menu-card ${danger ? "risk-card" : "safe-card"}`} key={menu.id}>
              <span className="category">{menu.category}</span><h3>{menu.menu}</h3>
              <p>{menu.calories.toFixed(0)} kcal · 단백질 {menu.protein.toFixed(0)}g · 나트륨 {menu.sodium.toFixed(0)}mg</p>
              <div className="allergen-row">{menu.allergenKnown ? (menu.allergens.length ? menu.allergens.map((item) => <span key={item}>{item}</span>) : <span className="safe">표시 알레르기 없음</span>) : <span>알레르기 정보 미표기</span>}</div>
              <button key={added?.id === menu.id ? added.nonce : menu.id} className={added?.id === menu.id ? "add-button confirmed" : "add-button"} onClick={() => addToCart(menu.id)}>{added?.id === menu.id ? <><Check size={18} /> 담았어요!</> : <><ShoppingCart size={18} /> 담기</>}</button>
            </article>; })}</div>}
          </div>)}</div>
          {!filtered.length && <div className="empty">조건을 만족하는 메뉴가 없어요. 조건을 조금 넓혀보세요.</div>}
        </section></Reveal>}

        {tab === "cart" && <CartPanel items={cartItems} cart={cart} setCart={setCart} totals={totals} targetCalories={profileOn ? targetCalories : 2000} />}
        {tab === "map" && <MapPanel brands={brands} />}
        {tab === "compare" && <ComparePanel menus={filtered} brands={brandOptions} />}
        {tab === "detail" && <DetailComparePanel menus={menus} selection={detailSelection} setSelection={setDetailSelection} cartIds={cartItems.map(({ menu }) => menu.id)} />}
        {tab === "about" && <section className="panel prose"><h2>알레르기 표시 기준과 데이터 안내</h2><div className="law-card"><b>대한민국 · 의무표시</b><p><strong>근거법령</strong> 식품 등의 표시·광고에 관한 법률 시행규칙</p><p><strong>소관기관</strong> 식품의약품안전처</p><p><strong>표시 대상</strong> 알류(가금류), 우유, 메밀, 땅콩, 대두, 밀, 고등어, 게, 새우, 돼지고기, 복숭아, 토마토, 아황산류(최종제품 이산화황 10mg/kg 이상), 호두, 닭고기, 쇠고기, 오징어, 조개류(굴·전복·홍합 포함), 잣 및 이들 식품에서 추출한 성분을 원재료로 사용한 식품(젤라틴·새우엑기스 등)</p><p><strong>혼입 우려 표시 예시</strong> “○○ 혼입 가능”</p></div><p>영양·알레르기 정보는 각 브랜드 공식 자료를 기반으로 정리했습니다. ‘표시 알레르기 없음’은 알레르기 위험이 절대 없다는 뜻이 아닙니다. 교차오염 가능성과 원재료 변경이 있으므로 심한 알레르기가 있다면 반드시 주문 전 매장에 확인하세요.</p><p>매장 위치·검색은 카카오맵과 카카오 로컬 API를 사용합니다. 가격은 매장·배달 채널별로 달라질 수 있어 실시간 가격으로 제공하지 않습니다.</p></section>}
      </section>
    </main>
  );
}

function Reveal({ children }: { children: React.ReactNode }) { const ref = useRef<HTMLDivElement>(null); useEffect(() => { const node = ref.current; if (!node) return; const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && node.classList.add("visible"), { threshold: .12 }); observer.observe(node); return () => observer.disconnect(); }, []); return <div ref={ref} className="reveal">{children}</div>; }
function TabButton({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon?: React.ReactNode }) { return <button className={active ? "active" : ""} onClick={onClick}>{icon}{label}</button>; }
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label><span>{label}</span><input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>; }
function Range({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (value: number) => void }) { return <label className="range"><span>{label}<b>{value} {unit}</b></span><input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} /></label>; }

function CartPanel({ items, cart, setCart, totals, targetCalories }: { items: Array<{ menu: Menu; quantity: number }>; cart: Cart; setCart: React.Dispatch<React.SetStateAction<Cart>>; totals: Record<string, number>; targetCalories: number }) {
  if (!items.length) return <section className="panel empty"><ShoppingCart size={36} /><h2>장바구니가 비어 있어요</h2><p>추천 메뉴에서 버거, 음료, 사이드를 조합해보세요.</p></section>;
  const standards = [{ name: "칼로리", value: totals.calories, max: targetCalories, unit: "kcal" }, { name: "단백질", value: totals.protein, max: 55, unit: "g" }, { name: "포화지방", value: totals.fat, max: 15, unit: "g" }, { name: "당류", value: totals.carbs, max: 100, unit: "g" }, { name: "나트륨", value: totals.sodium, max: 2000, unit: "mg" }];
  return <section className="panel"><div className="panel-head"><div><h2>내 장바구니 영양 계산</h2><p>수량을 바꾸면 합계가 즉시 계산돼요.</p></div><button className="danger" onClick={() => setCart({})}>전체 비우기</button></div>
    <div className="cart-list">{items.map(({ menu, quantity }) => <div className="cart-item" key={menu.id}><div><b>{menu.menu}</b><span>{menu.brand} · {menu.calories} kcal</span></div><div className="quantity"><button onClick={() => setCart((current) => ({ ...current, [menu.id]: Math.max(1, quantity - 1) }))}>−</button><b>{quantity}</b><button onClick={() => setCart((current) => ({ ...current, [menu.id]: Math.min(10, quantity + 1) }))}>+</button></div><button className="icon-button" onClick={() => setCart((current) => { const next = { ...current }; delete next[menu.id]; return next; })}><Trash2 size={18} /></button></div>)}</div>
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
  return <section className="panel detail-compare"><div className="panel-head"><div><h2>메뉴 영양성분 비교</h2><p>최대 4개 메뉴의 영양 균형을 같은 기준으로 비교해요.</p></div><button className="secondary" disabled={!cartIds.length} onClick={() => setSelection(Array.from(new Set(cartIds)).slice(0, 4))}>🛒 장바구니 메뉴 불러오기</button></div>
    <div className="detail-picker"><label className="search"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="비교할 메뉴 검색" /></label><select value="" disabled={selection.length >= 4} onChange={(e) => { addMenu(Number(e.target.value)); setSearch(""); }}><option value="">{selection.length >= 4 ? "최대 4개까지 선택할 수 있어요" : "검색 결과에서 메뉴 선택"}</option>{choices.map((menu) => <option key={menu.id} value={menu.id}>{menu.brand} · {menu.menu}</option>)}</select></div>
    <div className="selected-menu-chips">{selected.map((menu, index) => <button style={{ borderColor: DETAIL_COLORS[index] }} key={menu.id} onClick={() => setSelection((current) => current.filter((id) => id !== menu.id))}><i style={{ background: DETAIL_COLORS[index] }} />{menu.brand} · {menu.menu}<X size={14} /></button>)}</div>
    {!selected.length ? <div className="empty"><h3>비교할 메뉴를 선택해 주세요</h3><p>검색하거나 장바구니에 담은 메뉴를 한 번에 불러올 수 있어요.</p></div> : <>
      <div className="detail-radar"><ResponsiveContainer width="100%" height={430}><RadarChart data={radarData} outerRadius="72%"><PolarGrid /><PolarAngleAxis dataKey="subject" /><PolarRadiusAxis angle={90} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />{selected.map((menu, index) => <Radar key={menu.id} name={`${menu.brand} · ${menu.menu}`} dataKey={`menu${menu.id}`} stroke={DETAIL_COLORS[index]} fill={DETAIL_COLORS[index]} fillOpacity={.13} strokeWidth={2} />)}<Legend /><Tooltip formatter={(value) => `${Number(value).toFixed(0)}%`} /></RadarChart></ResponsiveContainer></div>
      <div className="detail-table-wrap"><table className="detail-table"><thead><tr><th>메뉴</th><th>가격</th><th>칼로리</th><th>단백질</th><th>포화지방</th><th>당류</th><th>나트륨</th></tr></thead><tbody>{selected.map((menu) => <tr key={menu.id}><td><b>{menu.brand}</b><span>{menu.menu}</span></td><td>매장별 확인</td><td>{menu.calories.toFixed(0)} kcal</td><td>{menu.protein.toFixed(1)} g</td><td>{menu.fat.toFixed(1)} g</td><td>{menu.carbs.toFixed(1)} g</td><td>{menu.sodium.toFixed(0)} mg</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}

function MapPanel({ brands }: { brands: string[] }) {
  const [mode, setMode] = useState<"search" | "gps">("search"); const [term, setTerm] = useState(""); const [places, setPlaces] = useState<Place[]>([]); const [center, setCenter] = useState<Place | null>(null); const [stores, setStores] = useState<Store[]>([]); const [radius, setRadius] = useState(3); const [loading, setLoading] = useState(false);
  useEffect(() => { if (term.trim().length < 2) { setPlaces([]); return; } const controller = new AbortController(); const timer = window.setTimeout(() => fetch(`/api/places?q=${encodeURIComponent(term)}`, { signal: controller.signal }).then((r) => r.json()).then((data) => Array.isArray(data) && setPlaces(data)).catch(() => {}), 400); return () => { window.clearTimeout(timer); controller.abort(); }; }, [term]);
  const findStores = async (place: Place) => { setCenter(place); setLoading(true); const response = await fetch(`/api/stores?lat=${place.lat}&lon=${place.lon}&radius=${radius * 1000}&brands=${encodeURIComponent(brands.join(","))}`); const data = await response.json(); setStores(Array.isArray(data) ? data : []); setLoading(false); };
  const locate = () => navigator.geolocation.getCurrentPosition((position) => findStores({ id: "gps", name: "현재 위치", address: `정확도 약 ${Math.round(position.coords.accuracy)}m`, lat: position.coords.latitude, lon: position.coords.longitude }), () => alert("브라우저 위치 권한을 허용해 주세요."), { enableHighAccuracy: true });
  return <section className="panel"><div className="panel-head map-panel-head"><div><h2>내 주변 매장</h2><p>카카오맵에서 선택한 브랜드의 매장을 찾아요.</p></div><label className="radius-slider"><span>검색 반경 <b>{radius} km</b></span><input type="range" min="1" max="10" step="1" value={radius} onChange={(e) => setRadius(Number(e.target.value))} /><small><i>1km</i><i>10km</i></small></label></div>
    <div className="mode-switch"><button className={mode === "search" ? "active" : ""} onClick={() => setMode("search")}><Search size={17} />장소 검색</button><button className={mode === "gps" ? "active" : ""} onClick={() => { setMode("gps"); locate(); }}><LocateFixed size={17} />현재 위치</button></div>
    {mode === "search" && <div className="location-search"><label className="search"><Search size={18} /><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="성수역, 서울시청처럼 입력하세요" /></label>{places.length > 0 && <div className="suggestions">{places.map((place) => <button key={place.id} onClick={() => { setTerm(place.name); setPlaces([]); findStores(place); }}><MapPin size={17} /><span><b>{place.name}</b><small>{place.address}</small></span></button>)}</div>}</div>}
    {loading && <div className="map-empty">주변 매장을 찾고 있어요…</div>}{center && !loading && <><KakaoMap center={center} radiusKm={radius} stores={stores} /><div className="store-summary"><b>{center.name}</b> 기준 {stores.length}개 매장</div><div className="store-list">{stores.slice(0, 20).map((store) => <a href={store.placeUrl || "#"} target="_blank" rel="noopener" key={store.id}><Image src={BRAND_LOGOS[store.brand]} alt="" width={34} height={34} /><span><b>{store.name}</b><small>{store.distance.toFixed(2)}km · 도보 약 {Math.ceil(store.distance * 1.25 / 4.5 * 60)}분 · {store.address}</small></span></a>)}</div></>}
  </section>;
}
