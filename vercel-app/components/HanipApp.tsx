"use client";

import Image from "next/image";
import Papa from "papaparse";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, ChevronDown, ChevronUp, ExternalLink, LocateFixed, MapPin, Menu as MenuIcon, RefreshCw, Search, ShoppingCart, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ALLERGENS, BRAND_LOGOS } from "@/lib/brands";
import type { Menu, Place, Store } from "@/lib/types";
import KakaoMap from "./KakaoMap";

type Tab = "menus" | "cart" | "map" | "compare" | "about";
type Cart = Record<number, number>;
type LoadStatus = "loading" | "ready" | "error";

const parseNumber = (value: unknown) => Number(value || 0);
const mealFactor: Record<string, number> = { "감량": .8, "유지": 1, "증량": 1.12 };

async function readJsonResponse<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null) as { error?: string } | T | null;
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload ? payload.error : null;
    throw new Error(message || fallback);
  }
  return payload as T;
}

export default function HanipApp() {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [loadError, setLoadError] = useState("");
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
    const controller = new AbortController();
    const loadMenus = async () => {
      setLoadStatus("loading");
      setLoadError("");
      try {
        const response = await fetch("/data/menus.csv", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`메뉴 데이터 응답 오류 (${response.status})`);
        const csv = await response.text();
        const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
        if (parsed.errors.length) throw new Error(`CSV 해석 오류: ${parsed.errors[0].message}`);
        const data = parsed.data.filter((row) => row.brand && row.menu).map((row, id) => ({
          id, brand: row.brand, menu: row.menu, category: row.category,
          calories: parseNumber(row.calories), protein: parseNumber(row.protein), fat: parseNumber(row.fat),
          carbs: parseNumber(row.carbs), sodium: parseNumber(row.sodium),
          allergens: (row.allergens || "").split("|").filter(Boolean),
          allergenKnown: row.allergen_known?.toLowerCase() === "true", sourceUrl: row.source_url,
          sourceDate: row.source_date, sourceDateType: row.source_date_type,
          verified: row.verified?.toLowerCase() === "true", allergySourceUrl: row.allergy_source_url,
          collectedAt: row.collected_at, collectionMethod: row.collection_method,
        }));
        if (!data.length) throw new Error("사용 가능한 메뉴 행이 없습니다.");
        setMenus(data);
        setBrands(Array.from(new Set(data.map((menu) => menu.brand))));
        setLoadStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : "메뉴 데이터를 불러오지 못했습니다.");
        setLoadStatus("error");
      }
    };
    loadMenus();
    const saved = localStorage.getItem("hanip-cart");
    if (saved) queueMicrotask(() => {
      try { setCart(JSON.parse(saved)); }
      catch { localStorage.removeItem("hanip-cart"); }
    });
    return () => controller.abort();
  }, []);

  useEffect(() => { localStorage.setItem("hanip-cart", JSON.stringify(cart)); }, [cart]);

  useEffect(() => {
    if (!filtersOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [filtersOpen]);

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
  const latestSourceDate = useMemo(() => menus.reduce((latest, menu) => menu.sourceDate > latest ? menu.sourceDate : latest, ""), [menus]);
  const totals = cartItems.reduce((sum, { menu, quantity }) => ({
    calories: sum.calories + menu.calories * quantity, protein: sum.protein + menu.protein * quantity,
    fat: sum.fat + menu.fat * quantity, carbs: sum.carbs + menu.carbs * quantity, sodium: sum.sodium + menu.sodium * quantity
  }), { calories: 0, protein: 0, fat: 0, carbs: 0, sodium: 0 });

  const addToCart = (id: number) => {
    setCart((current) => ({ ...current, [id]: (current[id] || 0) + 1 }));
    setAdded((current) => ({ id, nonce: (current?.nonce || 0) + 1 }));
    window.setTimeout(() => setAdded((current) => current?.id === id ? null : current), 950);
  };

  return (
    <main className="app-shell">
      <header className="global-nav">
        <div className="global-nav-inner">
          <a className="global-wordmark" href="#top" aria-label="한입안심 처음으로"><span aria-hidden="true">◉</span><b>한입안심</b></a>
          <span className="global-data-note">공식 데이터 · {loadStatus === "ready" ? `${menus.length}개 메뉴` : "불러오는 중"}</span>
          <button className="filter-trigger" aria-expanded={filtersOpen} aria-controls="filter-drawer" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={17} /> 내 조건</button>
        </div>
      </header>
      <aside id="filter-drawer" role="dialog" aria-modal="true" aria-label="메뉴 추천 조건" aria-hidden={!filtersOpen} inert={filtersOpen ? undefined : true} className={filtersOpen ? "filter-drawer open" : "filter-drawer"}>
        <button className="close-sidebar" aria-label="조건 패널 닫기" onClick={() => setFiltersOpen(false)}><X /></button>
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

      <section className="content" id="top">
        <header className="hero">
          <div className="eyebrow">FRANCHISE FOOD GUIDE</div>
          <h1>안심하고 고르는<br />오늘의 한 끼.</h1>
          <p>알레르기, 영양 목표, 주변 매장까지. 흩어진 공식 정보를 한곳에서 비교하고 내 조건에 맞는 메뉴를 빠르게 찾으세요.</p>
          <div className="hero-actions"><button className="hero-primary" onClick={() => setFiltersOpen(true)}>내 조건 설정</button><a className="hero-secondary" href="#workspace" onClick={() => setTab("menus")}>메뉴 둘러보기 <span aria-hidden="true">›</span></a></div>
          {loadStatus === "ready" && <div className="data-status"><Check size={15} /> 공식 출처 {menus.length}개 메뉴 · {brandOptions.length}개 브랜드 · 최신 기준일 {latestSourceDate}</div>}
        </header>
        {loadStatus === "loading" && <div className="status-panel" role="status"><RefreshCw className="spin" /> 공식 메뉴 데이터를 불러오는 중입니다…</div>}
        {loadStatus === "error" && <div className="status-panel error" role="alert"><AlertCircle /><div><b>메뉴 데이터를 불러오지 못했습니다.</b><span>{loadError}</span></div><button onClick={() => window.location.reload()}>다시 시도</button></div>}
        {loadStatus === "ready" && <section className="source-stage" aria-label="공식 데이터 원칙">
          <div><span className="source-stage-eyebrow">OFFICIAL SOURCE FIRST</span><h2>숫자보다 먼저,<br />출처를 확인합니다.</h2><p>메뉴별 공식 페이지와 공개 자료를 연결하고, 알레르기 표기가 확인된 정보만 구분해 보여줍니다.</p></div>
          <div className="source-stage-stats"><div><b>{brandOptions.length}</b><span>공식 브랜드</span></div><div><b>{menus.filter((menu) => menu.allergenKnown).length}</b><span>알레르기 확인 메뉴</span></div><div><b>2</b><span>동일 CSV 검증본</span></div></div>
        </section>}
        <div className="metrics"><Metric label="추천 가능한 메뉴" value={`${filtered.length}개`} note={`전체 ${menus.length}개 메뉴`} /><Metric label="선택 브랜드" value={`${brands.length}개`} note={`총 ${brandOptions.length}개 브랜드`} /><Metric label="선택 알레르기" value={`${allergens.length}개`} note={allergens.length ? "조건 적용 중" : "선택 없음"} /><Metric label="장바구니" value={`${cartCount}개`} note={`${totals.calories.toFixed(0)} kcal`} /></div>
        <nav className="tabs" id="workspace" role="tablist" aria-label="한입안심 기능">
          <TabButton active={tab === "menus"} onClick={() => setTab("menus")} icon={<MenuIcon size={17} />} label="추천 메뉴" />
          <TabButton active={tab === "cart"} onClick={() => setTab("cart")} icon={<ShoppingCart size={17} />} label={`장바구니 (${cartCount})`} />
          <TabButton active={tab === "map"} onClick={() => setTab("map")} icon={<MapPin size={17} />} label="주변 매장" />
          <TabButton active={tab === "compare"} onClick={() => setTab("compare")} label="브랜드 비교" />
          <TabButton active={tab === "about"} onClick={() => setTab("about")} label="데이터 안내" />
        </nav>

        {loadStatus === "ready" && tab === "menus" && <section className="panel" role="tabpanel" aria-label="추천 메뉴">
          <div className="panel-head"><div><h2>조건에 맞는 메뉴</h2><p>브랜드를 누르면 메뉴를 펼칠 수 있어요.</p></div><label className="search"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="브랜드 또는 메뉴 검색" /></label></div>
          <div className="brand-folders">{grouped.map(([brand, items]) => {
            const logo = BRAND_LOGOS[brand];
            return <div className="brand-folder" key={brand}>
            <button className="brand-folder-head" aria-expanded={Boolean(openBrands[brand])} onClick={() => setOpenBrands((current) => ({ ...current, [brand]: !current[brand] }))}>
              <span className="brand-logo-frame">{logo ? <Image src={logo} alt={`${brand} 로고`} width={72} height={72} /> : <span className="brand-logo-fallback" aria-hidden="true">{brand.slice(0, 1)}</span>}</span>
              <span className="brand-copy"><b>{brand}</b><small>추천 가능 {items.length}개</small></span>
              <span className="brand-chevron" aria-hidden="true">{openBrands[brand] ? <ChevronUp /> : <ChevronDown />}</span>
            </button>
            {openBrands[brand] && <div className="menu-grid">{items.map((menu) => <article className="menu-card" key={menu.id}>
              <span className="category">{menu.category}</span><h3>{menu.menu}</h3>
              <p>{menu.calories.toFixed(0)} kcal · 단백질 {menu.protein.toFixed(0)}g · 나트륨 {menu.sodium.toFixed(0)}mg</p>
              <div className="allergen-row">{menu.allergenKnown ? (menu.allergens.length ? menu.allergens.map((item) => <span key={item}>{item}</span>) : <span className="safe">표시 알레르기 없음</span>) : <span>알레르기 정보 미표기</span>}</div>
              <a className="source-link" href={menu.allergySourceUrl || menu.sourceUrl}><ExternalLink size={13} /> 공식 출처 · {menu.sourceDate}</a>
              <button key={added?.id === menu.id ? added.nonce : menu.id} className={added?.id === menu.id ? "add-button confirmed" : "add-button"} onClick={() => addToCart(menu.id)}>{added?.id === menu.id ? <><Check size={18} /> 담았어요!</> : <><ShoppingCart size={18} /> 담기</>}</button>
            </article>)}</div>}
          </div>})}</div>
          {!filtered.length && <div className="empty">조건을 만족하는 메뉴가 없어요. 조건을 조금 넓혀보세요.</div>}
        </section>}

        {loadStatus === "ready" && tab === "cart" && <CartPanel items={cartItems} setCart={setCart} totals={totals} targetCalories={profileOn ? targetCalories : 2000} />}
        {loadStatus === "ready" && tab === "map" && <MapPanel brands={brands} />}
        {loadStatus === "ready" && tab === "compare" && <ComparePanel menus={filtered} brands={brandOptions} />}
        {loadStatus === "ready" && tab === "about" && <AboutPanel menus={menus} />}
      </section>
    </main>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="filter-section"><h3>{title}</h3>{children}</section>; }
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <div className="metric"><span>{label}</span><b>{value}</b><small>{note}</small></div>; }
function TabButton({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon?: React.ReactNode }) { return <button role="tab" aria-selected={active} className={active ? "active" : ""} onClick={onClick}>{icon}{label}</button>; }
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label><span>{label}</span><input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>; }
function Range({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (value: number) => void }) { return <label className="range"><span>{label}<b>{value} {unit}</b></span><input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} /></label>; }

function CartPanel({ items, setCart, totals, targetCalories }: { items: Array<{ menu: Menu; quantity: number }>; setCart: React.Dispatch<React.SetStateAction<Cart>>; totals: Record<string, number>; targetCalories: number }) {
  if (!items.length) return <section className="panel empty"><ShoppingCart size={36} /><h2>장바구니가 비어 있어요</h2><p>추천 메뉴에서 버거, 음료, 사이드를 조합해보세요.</p></section>;
  const standards = [{ name: "칼로리", value: totals.calories, max: targetCalories, unit: "kcal" }, { name: "단백질", value: totals.protein, max: 55, unit: "g" }, { name: "포화지방", value: totals.fat, max: 15, unit: "g" }, { name: "당류", value: totals.carbs, max: 100, unit: "g" }, { name: "나트륨", value: totals.sodium, max: 2000, unit: "mg" }];
  return <section className="panel"><div className="panel-head"><div><h2>내 장바구니 영양 계산</h2><p>수량을 바꾸면 합계가 즉시 계산돼요.</p></div><button className="danger" onClick={() => setCart({})}>전체 비우기</button></div>
    <div className="cart-list">{items.map(({ menu, quantity }) => <div className="cart-item" key={menu.id}><div><b>{menu.menu}</b><span>{menu.brand} · {menu.calories} kcal</span></div><div className="quantity"><button aria-label={`${menu.menu} 수량 줄이기`} onClick={() => setCart((current) => ({ ...current, [menu.id]: Math.max(1, quantity - 1) }))}>−</button><b>{quantity}</b><button aria-label={`${menu.menu} 수량 늘리기`} onClick={() => setCart((current) => ({ ...current, [menu.id]: Math.min(10, quantity + 1) }))}>+</button></div><button className="icon-button" aria-label={`${menu.menu} 삭제`} onClick={() => setCart((current) => { const next = { ...current }; delete next[menu.id]; return next; })}><Trash2 size={18} /></button></div>)}</div>
    <div className="nutrition-summary">{standards.map((item) => <div key={item.name}><span>{item.name}<b>{item.value.toFixed(item.unit === "mg" || item.unit === "kcal" ? 0 : 1)}{item.unit}</b></span><div className="progress"><i className={item.value > item.max ? "over" : ""} style={{ width: `${Math.min(100, item.value / item.max * 100)}%` }} /></div><small>{item.max}{item.unit} 기준 · {(item.value / item.max * 100).toFixed(0)}%</small></div>)}</div>
  </section>;
}

function ComparePanel({ menus, brands }: { menus: Menu[]; brands: string[] }) {
  const data = brands.map((brand) => ({ brand, count: menus.filter((menu) => menu.brand === brand).length })).filter((row) => row.count).sort((a, b) => b.count - a.count);
  return <section className="panel"><div className="panel-head"><div><h2>브랜드별 선택 가능한 메뉴</h2><p>현재 알레르기·영양 조건을 통과한 메뉴 수를 많은 순서로 비교합니다.</p></div></div>{data.length ? <><div className="chart"><ResponsiveContainer width="100%" height={Math.max(360, data.length * 44)}><BarChart data={data} layout="vertical" margin={{ left: 18, right: 30 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="brand" width={92} /><Tooltip /><Bar dataKey="count" name="메뉴 수" fill="#287653" radius={[0, 8, 8, 0]} /></BarChart></ResponsiveContainer></div><table className="data-table"><caption>차트의 정확한 값</caption><thead><tr><th>브랜드</th><th>조건 통과 메뉴</th></tr></thead><tbody>{data.map((row) => <tr key={row.brand}><td>{row.brand}</td><td>{row.count}개</td></tr>)}</tbody></table></> : <div className="empty">현재 조건을 통과한 브랜드가 없습니다.</div>}</section>;
}

function AboutPanel({ menus }: { menus: Menu[] }) {
  const rows = Array.from(new Set(menus.map((menu) => menu.brand))).map((brand) => {
    const items = menus.filter((menu) => menu.brand === brand);
    const known = items.filter((menu) => menu.allergenKnown).length;
    return { brand, count: items.length, known, rate: Math.round(known / items.length * 100), date: items.reduce((latest, menu) => menu.sourceDate > latest ? menu.sourceDate : latest, ""), source: items[0]?.sourceUrl };
  }).sort((a, b) => b.count - a.count);
  return <section className="panel prose"><h2>데이터 안내</h2><div className="notice"><b>안전 안내</b><p>공식 알레르기 정보가 미표기된 메뉴는 알레르기 필터를 선택하면 추천에서 제외합니다. 제품 구성과 교차접촉 가능성은 바뀔 수 있으므로 심한 알레르기가 있다면 주문 전 공식 원문과 매장에 다시 확인하세요.</p></div><h3>수집 범위와 최신성</h3><p>영양·알레르기 정보는 브랜드 공식 API·웹페이지·공식 이미지 표에서 수집했습니다. 기준일은 공식 표기일이 없을 때 수집 확인일을 사용하며, 각 행의 유형을 데이터에 함께 기록합니다.</p><div className="table-scroll"><table className="data-table"><thead><tr><th>브랜드</th><th>메뉴 수</th><th>알레르기 확인</th><th>최신 기준일</th><th>출처</th></tr></thead><tbody>{rows.map((row) => <tr key={row.brand}><td>{row.brand}</td><td>{row.count}</td><td>{row.known}/{row.count} ({row.rate}%)</td><td>{row.date}</td><td><a href={row.source}>공식 원문</a></td></tr>)}</tbody></table></div><p>매장 위치·검색은 카카오맵과 카카오 로컬 API를 사용합니다. 가격은 매장·배달 채널별로 달라질 수 있어 실시간 가격으로 제공하지 않습니다.</p></section>;
}

function MapPanel({ brands }: { brands: string[] }) {
  const [mode, setMode] = useState<"search" | "gps">("search"); const [term, setTerm] = useState(""); const [places, setPlaces] = useState<Place[]>([]); const [center, setCenter] = useState<Place | null>(null); const [stores, setStores] = useState<Store[]>([]); const [radius, setRadius] = useState(3); const [loading, setLoading] = useState(false); const [mapError, setMapError] = useState("");
  useEffect(() => { if (term.trim().length < 2) return; const controller = new AbortController(); const timer = window.setTimeout(() => fetch(`/api/places?q=${encodeURIComponent(term)}`, { signal: controller.signal }).then((response) => readJsonResponse<Place[]>(response, "장소 검색에 실패했습니다.")).then((data) => { setPlaces(Array.isArray(data) ? data : []); setMapError(""); }).catch((error) => { if (!controller.signal.aborted) setMapError(error instanceof Error ? error.message : "장소 검색에 실패했습니다."); }), 400); return () => { window.clearTimeout(timer); controller.abort(); }; }, [term]);
  const findStores = async (place: Place) => { setCenter(place); setLoading(true); setMapError(""); try { const response = await fetch(`/api/stores?lat=${place.lat}&lon=${place.lon}&radius=${radius * 1000}&brands=${encodeURIComponent(brands.join(","))}`); const data = await readJsonResponse<Store[]>(response, "주변 매장 검색에 실패했습니다."); setStores(Array.isArray(data) ? data : []); } catch (error) { setStores([]); setMapError(error instanceof Error ? error.message : "주변 매장 검색에 실패했습니다."); } finally { setLoading(false); } };
  const locate = () => navigator.geolocation.getCurrentPosition((position) => findStores({ id: "gps", name: "현재 위치", address: `정확도 약 ${Math.round(position.coords.accuracy)}m`, lat: position.coords.latitude, lon: position.coords.longitude }), () => setMapError("브라우저 위치 권한이 필요합니다. 장소 검색을 이용하거나 권한을 허용해 주세요."), { enableHighAccuracy: true });
  return <section className="panel"><div className="panel-head map-panel-head"><div><h2>내 주변 매장</h2><p>카카오맵에서 선택한 브랜드의 매장을 찾아요.</p></div><label className="radius-slider"><span>검색 반경 <b>{radius} km</b></span><input type="range" min="1" max="10" step="1" value={radius} onChange={(e) => setRadius(Number(e.target.value))} /><small><i>1km</i><i>10km</i></small></label></div>
    <div className="mode-switch"><button className={mode === "search" ? "active" : ""} onClick={() => setMode("search")}><Search size={17} />장소 검색</button><button className={mode === "gps" ? "active" : ""} onClick={() => { setMode("gps"); locate(); }}><LocateFixed size={17} />현재 위치</button></div>
    {mode === "search" && <div className="location-search"><label className="search"><Search size={18} /><input value={term} onChange={(e) => { const value = e.target.value; setTerm(value); if (value.trim().length < 2) { setPlaces([]); setMapError(""); } }} placeholder="성수역, 서울시청처럼 입력하세요" /></label>{places.length > 0 && <div className="suggestions">{places.map((place) => <button key={place.id} onClick={() => { setTerm(place.name); setPlaces([]); findStores(place); }}><MapPin size={17} /><span><b>{place.name}</b><small>{place.address}</small></span></button>)}</div>}</div>}
    {mapError && <div className="inline-error" role="alert"><AlertCircle size={18} /> {mapError}</div>}{loading && <div className="map-empty">주변 매장을 찾고 있어요…</div>}{center && !loading && !mapError && <><KakaoMap center={center} radiusKm={radius} stores={stores} /><div className="store-summary"><b>{center.name}</b> 기준 {stores.length}개 매장</div>{!stores.length && <div className="empty compact-empty">선택한 반경에서 확인된 매장이 없습니다. 반경이나 브랜드를 바꿔보세요.</div>}<div className="store-list">{stores.slice(0, 20).map((store) => <a href={store.placeUrl || "#"} key={store.id}><Image src={BRAND_LOGOS[store.brand]} alt="" width={34} height={34} /><span><b>{store.name}</b><small>{store.distance.toFixed(2)}km · 도보 약 {Math.ceil(store.distance * 1.25 / 4.5 * 60)}분 · {store.address}</small></span></a>)}</div></>}
  </section>;
}
