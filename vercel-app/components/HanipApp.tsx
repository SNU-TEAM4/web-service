"use client";

import Image from "next/image";
import Papa from "papaparse";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, LocateFixed, MapPin, Menu as MenuIcon, Search, ShoppingCart, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ALLERGENS, BRAND_LOGOS } from "@/lib/brands";
import type { Menu, Place, Store } from "@/lib/types";
import KakaoMap from "./KakaoMap";

type Tab = "menus" | "cart" | "map" | "compare" | "about";
type Cart = Record<number, number>;

const parseNumber = (value: unknown) => Number(value || 0);
const mealFactor: Record<string, number> = { "감량": .8, "유지": 1, "증량": 1.12 };

export default function HanipApp() {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [tab, setTab] = useState<Tab>("menus");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [maxCalories, setMaxCalories] = useState(600);
  const [minProtein, setMinProtein] = useState(0);
  const [maxSodium, setMaxSodium] = useState(1500);
  const [profileOn, setProfileOn] = useState(false);
  const [profile, setProfile] = useState({ sex: "여성", age: 25, height: 165, weight: 60, goal: "감량" });
  const [openBrands, setOpenBrands] = useState<Record<string, boolean>>({});
  const [cart, setCart] = useState<Cart>({});
  const [added, setAdded] = useState<{ id: number; nonce: number } | null>(null);

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

  const brandOptions = useMemo(() => Array.from(new Set(menus.map((menu) => menu.brand))), [menus]);
  const targetCalories = useMemo(() => {
    const bmr = profile.sex === "남성"
      ? 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5
      : 10 * profile.weight + 6.25 * profile.height - 5 * profile.age - 161;
    return Math.round(bmr * 1.35 * mealFactor[profile.goal]);
  }, [profile]);

  const filtered = useMemo(() => menus.filter((menu) => {
    const safe = allergens.every((item) => !menu.allergens.includes(item)) && (!allergens.length || menu.allergenKnown);
    return brands.includes(menu.brand) && safe && menu.calories <= maxCalories && menu.protein >= minProtein && menu.sodium <= maxSodium
      && (!query.trim() || menu.brand.toLowerCase().includes(query.trim().toLowerCase()) || menu.menu.toLowerCase().includes(query.trim().toLowerCase()));
  }).sort((a, b) => profileOn
    ? Math.abs(a.calories - targetCalories * .32) - Math.abs(b.calories - targetCalories * .32) || b.protein - a.protein
    : b.protein - a.protein), [menus, allergens, brands, maxCalories, minProtein, maxSodium, query, profileOn, targetCalories]);

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
      <button className="mobile-filter-button" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={18} /> CLICK! 내 조건</button>
      <aside className={filtersOpen ? "sidebar open" : "sidebar"}>
        <button className="close-sidebar" onClick={() => setFiltersOpen(false)}><X /></button>
        <div className="brand-title">🍽️ <b>한입안심</b><span>내 조건에 맞는 메뉴 탐색기</span></div>
        <FilterSection title="1. 피해야 할 알레르기">
          <div className="chips">{ALLERGENS.map((item) => <button key={item} className={allergens.includes(item) ? "chip active" : "chip"} onClick={() => setAllergens((current) => current.includes(item) ? current.filter((x) => x !== item) : [...current, item])}>{item}</button>)}</div>
        </FilterSection>
        <FilterSection title="2. 브랜드">
          <button className="secondary full" onClick={() => setBrands(brands.length === brandOptions.length ? [] : brandOptions)}>{brands.length === brandOptions.length ? "전체 선택 해제" : "전체 브랜드 선택"}</button>
          <div className="chips compact">{brandOptions.map((brand) => <button key={brand} className={brands.includes(brand) ? "chip active" : "chip"} onClick={() => setBrands((current) => current.includes(brand) ? current.filter((x) => x !== brand) : [...current, brand])}>{brand}</button>)}</div>
        </FilterSection>
        <FilterSection title="3. 맞춤 프로필">
          <label className="toggle-row"><input type="checkbox" checked={profileOn} onChange={(event) => setProfileOn(event.target.checked)} /> 신체·다이어트 목표 반영</label>
          {profileOn && <div className="profile-grid">
            <select value={profile.sex} onChange={(e) => setProfile({ ...profile, sex: e.target.value })}><option>여성</option><option>남성</option></select>
            <select value={profile.goal} onChange={(e) => setProfile({ ...profile, goal: e.target.value })}><option>감량</option><option>유지</option><option>증량</option></select>
            <NumberField label="나이" value={profile.age} onChange={(age) => setProfile({ ...profile, age })} />
            <NumberField label="키(cm)" value={profile.height} onChange={(height) => setProfile({ ...profile, height })} />
            <NumberField label="체중(kg)" value={profile.weight} onChange={(weight) => setProfile({ ...profile, weight })} />
            <div className="target-calorie">하루 참고 목표 <b>{targetCalories.toLocaleString()} kcal</b></div>
          </div>}
        </FilterSection>
        <FilterSection title="4. 영양 조건">
          <Range label="최대 칼로리" value={maxCalories} min={100} max={1200} step={50} unit="kcal" onChange={setMaxCalories} />
          <Range label="최소 단백질" value={minProtein} min={0} max={60} step={5} unit="g" onChange={setMinProtein} />
          <Range label="최대 나트륨" value={maxSodium} min={100} max={3000} step={100} unit="mg" onChange={setMaxSodium} />
        </FilterSection>
      </aside>
      {filtersOpen && <button className="backdrop" aria-label="닫기" onClick={() => setFiltersOpen(false)} />}

      <section className="content">
        <header className="hero"><div className="eyebrow">FRANCHISE FOOD GUIDE</div><h1>오늘, 내가 먹을 수 있는 메뉴</h1><p>알레르기부터 영양 목표, 주변 매장까지 한 번에 확인하세요.</p></header>
        <div className="metrics"><Metric label="추천 가능한 메뉴" value={`${filtered.length}개`} note={`전체 ${menus.length}개 메뉴`} /><Metric label="선택 브랜드" value={`${brands.length}개`} note={`총 ${brandOptions.length}개 브랜드`} /><Metric label="장바구니" value={`${cartCount}개`} note={`${totals.calories.toFixed(0)} kcal`} /></div>
        <nav className="tabs">
          <TabButton active={tab === "menus"} onClick={() => setTab("menus")} icon={<MenuIcon size={17} />} label="추천 메뉴" />
          <TabButton active={tab === "cart"} onClick={() => setTab("cart")} icon={<ShoppingCart size={17} />} label={`장바구니 (${cartCount})`} />
          <TabButton active={tab === "map"} onClick={() => setTab("map")} icon={<MapPin size={17} />} label="주변 매장" />
          <TabButton active={tab === "compare"} onClick={() => setTab("compare")} label="브랜드 비교" />
          <TabButton active={tab === "about"} onClick={() => setTab("about")} label="데이터 안내" />
        </nav>

        {tab === "menus" && <section className="panel">
          <div className="panel-head"><div><h2>조건에 맞는 메뉴</h2><p>브랜드를 누르면 메뉴를 펼칠 수 있어요.</p></div><label className="search"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="브랜드 또는 메뉴 검색" /></label></div>
          <div className="brand-folders">{grouped.map(([brand, items]) => items && <div className="brand-folder" key={brand}>
            <button className="brand-folder-head" onClick={() => setOpenBrands((current) => ({ ...current, [brand]: !current[brand] }))}>
              <Image src={BRAND_LOGOS[brand]} alt={brand} width={86} height={86} /><span><b>{brand}</b><small>추천 가능 {items.length}개</small></span>{openBrands[brand] ? <ChevronUp /> : <ChevronDown />}
            </button>
            {openBrands[brand] && <div className="menu-grid">{items.map((menu) => <article className="menu-card" key={menu.id}>
              <span className="category">{menu.category}</span><h3>{menu.menu}</h3>
              <p>{menu.calories.toFixed(0)} kcal · 단백질 {menu.protein.toFixed(0)}g · 나트륨 {menu.sodium.toFixed(0)}mg</p>
              <div className="allergen-row">{menu.allergenKnown ? (menu.allergens.length ? menu.allergens.map((item) => <span key={item}>{item}</span>) : <span className="safe">표시 알레르기 없음</span>) : <span>알레르기 정보 미표기</span>}</div>
              <button key={added?.id === menu.id ? added.nonce : menu.id} className={added?.id === menu.id ? "add-button confirmed" : "add-button"} onClick={() => addToCart(menu.id)}>{added?.id === menu.id ? <><Check size={18} /> 담았어요!</> : <><ShoppingCart size={18} /> 담기</>}</button>
            </article>)}</div>}
          </div>)}</div>
          {!filtered.length && <div className="empty">조건을 만족하는 메뉴가 없어요. 조건을 조금 넓혀보세요.</div>}
        </section>}

        {tab === "cart" && <CartPanel items={cartItems} cart={cart} setCart={setCart} totals={totals} targetCalories={profileOn ? targetCalories : 2000} />}
        {tab === "map" && <MapPanel brands={brands} />}
        {tab === "compare" && <ComparePanel menus={filtered} brands={brandOptions} />}
        {tab === "about" && <section className="panel prose"><h2>데이터 안내</h2><p>영양·알레르기 정보는 각 브랜드 공식 자료를 기반으로 정리했습니다. 메뉴 구성과 원재료는 매장 및 시기에 따라 바뀔 수 있으므로 심한 알레르기가 있다면 주문 전 매장에 다시 확인하세요.</p><p>매장 위치·검색은 카카오맵과 카카오 로컬 API를 사용합니다. 가격은 매장·배달 채널별로 달라질 수 있어 실시간 가격으로 제공하지 않습니다.</p></section>}
      </section>
    </main>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="filter-section"><h3>{title}</h3>{children}</section>; }
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <div className="metric"><span>{label}</span><b>{value}</b><small>{note}</small></div>; }
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

function MapPanel({ brands }: { brands: string[] }) {
  const [mode, setMode] = useState<"search" | "gps">("search"); const [term, setTerm] = useState(""); const [places, setPlaces] = useState<Place[]>([]); const [center, setCenter] = useState<Place | null>(null); const [stores, setStores] = useState<Store[]>([]); const [radius, setRadius] = useState(3); const [loading, setLoading] = useState(false);
  useEffect(() => { if (term.trim().length < 2) { setPlaces([]); return; } const controller = new AbortController(); const timer = window.setTimeout(() => fetch(`/api/places?q=${encodeURIComponent(term)}`, { signal: controller.signal }).then((r) => r.json()).then((data) => Array.isArray(data) && setPlaces(data)).catch(() => {}), 400); return () => { window.clearTimeout(timer); controller.abort(); }; }, [term]);
  const findStores = async (place: Place) => { setCenter(place); setLoading(true); const response = await fetch(`/api/stores?lat=${place.lat}&lon=${place.lon}&radius=${radius * 1000}&brands=${encodeURIComponent(brands.join(","))}`); const data = await response.json(); setStores(Array.isArray(data) ? data : []); setLoading(false); };
  const locate = () => navigator.geolocation.getCurrentPosition((position) => findStores({ id: "gps", name: "현재 위치", address: `정확도 약 ${Math.round(position.coords.accuracy)}m`, lat: position.coords.latitude, lon: position.coords.longitude }), () => alert("브라우저 위치 권한을 허용해 주세요."), { enableHighAccuracy: true });
  return <section className="panel"><div className="panel-head"><div><h2>내 주변 매장</h2><p>카카오맵에서 선택한 브랜드의 매장을 찾아요.</p></div><select value={radius} onChange={(e) => setRadius(Number(e.target.value))}>{[1,2,3,5,10].map((x) => <option key={x} value={x}>{x} km</option>)}</select></div>
    <div className="mode-switch"><button className={mode === "search" ? "active" : ""} onClick={() => setMode("search")}><Search size={17} />장소 검색</button><button className={mode === "gps" ? "active" : ""} onClick={() => { setMode("gps"); locate(); }}><LocateFixed size={17} />현재 위치</button></div>
    {mode === "search" && <div className="location-search"><label className="search"><Search size={18} /><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="성수역, 서울시청처럼 입력하세요" /></label>{places.length > 0 && <div className="suggestions">{places.map((place) => <button key={place.id} onClick={() => { setTerm(place.name); setPlaces([]); findStores(place); }}><MapPin size={17} /><span><b>{place.name}</b><small>{place.address}</small></span></button>)}</div>}</div>}
    {loading && <div className="map-empty">주변 매장을 찾고 있어요…</div>}{center && !loading && <><KakaoMap center={center} radiusKm={radius} stores={stores} /><div className="store-summary"><b>{center.name}</b> 기준 {stores.length}개 매장</div><div className="store-list">{stores.slice(0, 20).map((store) => <a href={store.placeUrl || "#"} target="_blank" rel="noopener" key={store.id}><Image src={BRAND_LOGOS[store.brand]} alt="" width={34} height={34} /><span><b>{store.name}</b><small>{store.distance.toFixed(2)}km · 도보 약 {Math.ceil(store.distance * 1.25 / 4.5 * 60)}분 · {store.address}</small></span></a>)}</div></>}
  </section>;
}
