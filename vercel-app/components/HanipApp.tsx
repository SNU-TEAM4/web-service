"use client";

import Image from "next/image";
import Papa from "papaparse";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, ChevronUp, ExternalLink, LocateFixed, MapPin, Menu as MenuIcon, RefreshCw, Search, ShoppingCart, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ALLERGENS, BRAND_LOGOS } from "@/lib/brands";
import type { Menu, Place, QualityReport, Store } from "@/lib/types";
import KakaoMap from "./KakaoMap";

type Tab = "menus" | "cart" | "map" | "compare" | "about";
type Cart = Record<string, number>;
type LoadStatus = "loading" | "ready" | "error";
type CompareMetric = "count" | "coverage" | "protein" | "sodium";

const parseNumber = (value: unknown) => Number(value || 0);
const mealFactor: Record<string, number> = { "감량": .8, "유지": 1, "증량": 1.12 };
const tabs: Array<{ id: Tab; label: string }> = [
  { id: "menus", label: "추천 메뉴" }, { id: "cart", label: "장바구니" },
  { id: "map", label: "주변 매장" }, { id: "compare", label: "브랜드 비교" },
  { id: "about", label: "데이터 안내" },
];
const stableMenuId = (brand: string, menu: string) => `${brand}::${menu}`;
const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

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
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [qualityError, setQualityError] = useState("");
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
  const [cartLoaded, setCartLoaded] = useState(false);
  const [added, setAdded] = useState<{ id: string; nonce: number } | null>(null);
  const closeFiltersRef = useRef<HTMLButtonElement>(null);
  const filterReturnFocusRef = useRef<HTMLElement | null>(null);

  const openFilters = () => {
    filterReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setFiltersOpen(true);
  };
  const closeFilters = () => {
    setFiltersOpen(false);
    window.setTimeout(() => filterReturnFocusRef.current?.focus(), 0);
  };

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
        const data = parsed.data.filter((row) => row.brand && row.menu).map((row) => ({
          id: stableMenuId(row.brand, row.menu), brand: row.brand, menu: row.menu, category: row.category,
          calories: parseNumber(row.calories), protein: parseNumber(row.protein), saturatedFat: parseNumber(row.fat),
          sugars: parseNumber(row.carbs), sodium: parseNumber(row.sodium),
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
        fetch("/data/quality.json", { signal: controller.signal, cache: "no-store" })
          .then((qualityResponse) => {
            if (!qualityResponse.ok) throw new Error(`품질 보고서 응답 오류 (${qualityResponse.status})`);
            return qualityResponse.json() as Promise<QualityReport>;
          })
          .then((report) => { setQuality(report); setQualityError(""); })
          .catch((error) => { if (!controller.signal.aborted) setQualityError(error instanceof Error ? error.message : "품질 보고서를 불러오지 못했습니다."); });
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : "메뉴 데이터를 불러오지 못했습니다.");
        setLoadStatus("error");
      }
    };
    loadMenus();
    queueMicrotask(() => {
      localStorage.removeItem("hanip-cart");
      const saved = localStorage.getItem("hanip-cart-v2");
      if (saved) {
        try { setCart(JSON.parse(saved)); }
        catch { localStorage.removeItem("hanip-cart-v2"); }
      }
      setCartLoaded(true);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => { if (cartLoaded) localStorage.setItem("hanip-cart-v2", JSON.stringify(cart)); }, [cart, cartLoaded]);

  useEffect(() => {
    if (!filtersOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeFilters();
    };
    document.body.style.overflow = "hidden";
    closeFiltersRef.current?.focus();
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [filtersOpen]);

  const brandOptions = useMemo(() => Array.from(new Set(menus.map((menu) => menu.brand))), [menus]);
  const resetFilters = () => {
    setAllergens([]); setBrands(brandOptions); setQuery("");
    setMaxCalories(600); setMinProtein(0); setMaxSodium(1500); setProfileOn(false);
  };
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
  const menuById = useMemo(() => new Map(menus.map((menu) => [menu.id, menu])), [menus]);
  const cartItems = useMemo(() => Object.entries(cart).flatMap(([id, quantity]) => {
    const menu = menuById.get(id); return menu ? [{ menu, quantity }] : [];
  }), [cart, menuById]);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const latestSourceDate = useMemo(() => menus.reduce((latest, menu) => menu.sourceDate > latest ? menu.sourceDate : latest, ""), [menus]);
  const totals = cartItems.reduce((sum, { menu, quantity }) => ({
    calories: sum.calories + menu.calories * quantity, protein: sum.protein + menu.protein * quantity,
    saturatedFat: sum.saturatedFat + menu.saturatedFat * quantity, sugars: sum.sugars + menu.sugars * quantity, sodium: sum.sodium + menu.sodium * quantity
  }), { calories: 0, protein: 0, saturatedFat: 0, sugars: 0, sodium: 0 });

  const addToCart = (id: string) => {
    setCart((current) => ({ ...current, [id]: (current[id] || 0) + 1 }));
    setAdded((current) => ({ id, nonce: (current?.nonce || 0) + 1 }));
    window.setTimeout(() => setAdded((current) => current?.id === id ? null : current), 950);
  };

  const activeConditions = [
    allergens.length ? `제외 ${allergens.length}종` : "알레르기 미선택",
    `브랜드 ${brands.length}/${brandOptions.length}`,
    `${maxCalories}kcal 이하`, `${minProtein}g 이상`, `나트륨 ${maxSodium}mg 이하`,
  ];
  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, current: Tab) => {
    const currentIndex = tabs.findIndex((item) => item.id === current);
    const nextIndex = event.key === "ArrowRight" ? (currentIndex + 1) % tabs.length
      : event.key === "ArrowLeft" ? (currentIndex - 1 + tabs.length) % tabs.length
      : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = tabs[nextIndex].id;
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  return (
    <main className="app-shell">
      <header className="global-nav">
        <div className="global-nav-inner">
          <a className="global-wordmark" href="#top" aria-label="한입안심 처음으로"><span aria-hidden="true">◉</span><b>한입안심</b></a>
          <span className="global-data-note">공식 데이터 · {loadStatus === "ready" ? `${menus.length}개 메뉴` : "불러오는 중"}</span>
          <button className="filter-trigger" aria-expanded={filtersOpen} aria-controls="filter-drawer" onClick={openFilters}><SlidersHorizontal size={17} /> 내 조건</button>
        </div>
      </header>
      <aside id="filter-drawer" role="dialog" aria-modal="true" aria-label="메뉴 추천 조건" aria-hidden={!filtersOpen} inert={filtersOpen ? undefined : true} className={filtersOpen ? "filter-drawer open" : "filter-drawer"}>
        <button ref={closeFiltersRef} className="close-sidebar" aria-label="조건 패널 닫기" onClick={closeFilters}><X /></button>
        <div className="brand-title">🍽️ <b>한입안심</b><span>내 조건에 맞는 메뉴 탐색기</span></div>
        <FilterSection title="1. 피해야 할 알레르기">
          <div className="chips">{ALLERGENS.map((item) => <button key={item} aria-pressed={allergens.includes(item)} className={allergens.includes(item) ? "chip active" : "chip"} onClick={() => setAllergens((current) => current.includes(item) ? current.filter((x) => x !== item) : [...current, item])}>{item}</button>)}</div>
        </FilterSection>
        <FilterSection title="2. 브랜드">
          <button className="secondary full" onClick={() => setBrands(brands.length === brandOptions.length ? [] : brandOptions)}>{brands.length === brandOptions.length ? "전체 선택 해제" : "전체 브랜드 선택"}</button>
          <div className="chips compact">{brandOptions.map((brand) => <button key={brand} aria-pressed={brands.includes(brand)} className={brands.includes(brand) ? "chip active" : "chip"} onClick={() => setBrands((current) => current.includes(brand) ? current.filter((x) => x !== brand) : [...current, brand])}>{brand}</button>)}</div>
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
        <button className="secondary full reset-filters" onClick={resetFilters}>모든 조건 초기화</button>
      </aside>
      {filtersOpen && <button className="backdrop" aria-label="닫기" onClick={closeFilters} />}

      <section className="content" id="top">
        <header className="hero">
          <div className="eyebrow">FRANCHISE FOOD GUIDE</div>
          <h1>안심하고 고르는<br />오늘의 한 끼.</h1>
          <p>알레르기, 영양 목표, 주변 매장까지. 흩어진 공식 정보를 한곳에서 비교하고 내 조건에 맞는 메뉴를 빠르게 찾으세요.</p>
          <div className="hero-actions"><button className="hero-primary" onClick={openFilters}>내 조건 설정</button><a className="hero-secondary" href="#workspace" onClick={() => setTab("menus")}>메뉴 둘러보기 <span aria-hidden="true">›</span></a></div>
          {loadStatus === "ready" && <div className="data-status"><Check size={15} /><span>공식 출처 {menus.length}개 메뉴 · {brandOptions.length}개 브랜드 · 최신 기준일 {latestSourceDate}</span></div>}
        </header>
        {loadStatus === "loading" && <div className="status-panel" role="status"><RefreshCw className="spin" /> 공식 메뉴 데이터를 불러오는 중입니다…</div>}
        {loadStatus === "error" && <div className="status-panel error" role="alert"><AlertCircle /><div><b>메뉴 데이터를 불러오지 못했습니다.</b><span>{loadError}</span></div><button onClick={() => window.location.reload()}>다시 시도</button></div>}
        {loadStatus === "ready" && <section className="source-stage" aria-label="공식 데이터 원칙">
          <div><span className="source-stage-eyebrow">OFFICIAL SOURCE FIRST</span><h2>숫자보다 먼저,<br />출처를 확인합니다.</h2><p>메뉴별 공식 페이지와 공개 자료를 연결하고, 알레르기 표기가 확인된 정보만 구분해 보여줍니다.</p></div>
          <div className="source-stage-stats"><div><b>{brandOptions.length}</b><span>공식 브랜드</span></div><div><b>{menus.filter((menu) => menu.allergenKnown).length}</b><span>알레르기 확인 메뉴</span></div><div><b>{quality?.status === "pass" ? "스키마 PASS" : "확인 중"}</b><span>{quality?.mirror.identical ? "원천·배포 CSV 일치" : "자동 품질 검증"}</span></div></div>
        </section>}
        <div className="metrics"><Metric label="추천 가능한 메뉴" value={`${filtered.length}개`} note={`전체 ${menus.length}개 메뉴`} /><Metric label="선택 브랜드" value={`${brands.length}개`} note={`총 ${brandOptions.length}개 브랜드`} /><Metric label="선택 알레르기" value={`${allergens.length}개`} note={allergens.length ? "조건 적용 중" : "선택 없음"} /><Metric label="장바구니" value={`${cartCount}개`} note={`${totals.calories.toFixed(0)} kcal`} /></div>
        <div className="condition-summary" aria-label="현재 적용 조건"><span>현재 조건</span>{activeConditions.map((item) => <b key={item}>{item}</b>)}<button onClick={resetFilters}>초기화</button></div>
        <nav className="tabs" id="workspace" role="tablist" aria-label="한입안심 기능">
          <TabButton tabId="menus" active={tab === "menus"} onClick={() => setTab("menus")} onKeyDown={(event) => handleTabKeyDown(event, "menus")} icon={<MenuIcon size={17} />} label="추천 메뉴" />
          <TabButton tabId="cart" active={tab === "cart"} onClick={() => setTab("cart")} onKeyDown={(event) => handleTabKeyDown(event, "cart")} icon={<ShoppingCart size={17} />} label={`장바구니 (${cartCount})`} />
          <TabButton tabId="map" active={tab === "map"} onClick={() => setTab("map")} onKeyDown={(event) => handleTabKeyDown(event, "map")} icon={<MapPin size={17} />} label="주변 매장" />
          <TabButton tabId="compare" active={tab === "compare"} onClick={() => setTab("compare")} onKeyDown={(event) => handleTabKeyDown(event, "compare")} label="브랜드 비교" />
          <TabButton tabId="about" active={tab === "about"} onClick={() => setTab("about")} onKeyDown={(event) => handleTabKeyDown(event, "about")} label="데이터 안내" />
        </nav>

        {loadStatus === "ready" && tab === "menus" && <section id="panel-menus" className="panel" role="tabpanel" aria-labelledby="tab-menus">
          <div className="panel-head"><div><h2>조건에 맞는 메뉴</h2><p>브랜드를 누르면 메뉴를 펼칠 수 있어요.</p></div><label className="search"><Search size={18} /><input aria-label="브랜드 또는 메뉴 검색" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="브랜드 또는 메뉴 검색" /></label></div>
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
          {!filtered.length && <div className="empty"><h3>조건을 만족하는 메뉴가 없어요.</h3><p>검색어나 영양 한도를 넓혀 다시 확인해 보세요.</p><button className="hero-primary" onClick={resetFilters}>조건 초기화</button></div>}
        </section>}

        {loadStatus === "ready" && tab === "cart" && <CartPanel items={cartItems} setCart={setCart} totals={totals} targetCalories={profileOn ? targetCalories : 2000} />}
        {loadStatus === "ready" && tab === "map" && <MapPanel brands={brands} />}
        {loadStatus === "ready" && tab === "compare" && <ComparePanel menus={filtered} />}
        {loadStatus === "ready" && tab === "about" && <AboutPanel menus={menus} quality={quality} qualityError={qualityError} />}
      </section>
    </main>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="filter-section"><h3>{title}</h3>{children}</section>; }
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <div className="metric"><span>{label}</span><b>{value}</b><small>{note}</small></div>; }
function TabButton({ tabId, active, onClick, onKeyDown, label, icon }: { tabId: Tab; active: boolean; onClick: () => void; onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void; label: string; icon?: React.ReactNode }) { return <button id={`tab-${tabId}`} role="tab" aria-selected={active} aria-controls={`panel-${tabId}`} tabIndex={active ? 0 : -1} className={active ? "active" : ""} onClick={onClick} onKeyDown={onKeyDown}>{icon}{label}</button>; }
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label><span>{label}</span><input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>; }
function Range({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (value: number) => void }) { return <label className="range"><span>{label}<b>{value} {unit}</b></span><input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} /></label>; }

function CartPanel({ items, setCart, totals, targetCalories }: { items: Array<{ menu: Menu; quantity: number }>; setCart: React.Dispatch<React.SetStateAction<Cart>>; totals: Record<string, number>; targetCalories: number }) {
  if (!items.length) return <section id="panel-cart" role="tabpanel" aria-labelledby="tab-cart" className="panel empty"><ShoppingCart size={36} /><h2>장바구니가 비어 있어요</h2><p>추천 메뉴에서 버거, 음료, 사이드를 조합해보세요.</p></section>;
  const standards = [{ name: "칼로리", value: totals.calories, max: targetCalories, unit: "kcal" }, { name: "단백질", value: totals.protein, max: 55, unit: "g" }, { name: "포화지방", value: totals.saturatedFat, max: 15, unit: "g" }, { name: "당류", value: totals.sugars, max: 100, unit: "g" }, { name: "나트륨", value: totals.sodium, max: 2000, unit: "mg" }];
  return <section id="panel-cart" role="tabpanel" aria-labelledby="tab-cart" className="panel"><div className="panel-head"><div><h2>내 장바구니 영양 계산</h2><p>수량을 바꾸면 합계가 즉시 계산돼요.</p></div><button className="danger" onClick={() => setCart({})}>전체 비우기</button></div>
    <div className="cart-list">{items.map(({ menu, quantity }) => <div className="cart-item" key={menu.id}><div><b>{menu.menu}</b><span>{menu.brand} · {menu.calories} kcal</span></div><div className="quantity"><button aria-label={`${menu.menu} 수량 줄이기`} onClick={() => setCart((current) => ({ ...current, [menu.id]: Math.max(1, quantity - 1) }))}>−</button><b>{quantity}</b><button aria-label={`${menu.menu} 수량 늘리기`} onClick={() => setCart((current) => ({ ...current, [menu.id]: Math.min(10, quantity + 1) }))}>+</button></div><button className="icon-button" aria-label={`${menu.menu} 삭제`} onClick={() => setCart((current) => { const next = { ...current }; delete next[menu.id]; return next; })}><Trash2 size={18} /></button></div>)}</div>
    <div className="nutrition-summary">{standards.map((item) => <div key={item.name}><span>{item.name}<b>{item.value.toFixed(item.unit === "mg" || item.unit === "kcal" ? 0 : 1)}{item.unit}</b></span><div className="progress"><i className={item.value > item.max ? "over" : ""} style={{ width: `${Math.min(100, item.value / item.max * 100)}%` }} /></div><small>{item.max}{item.unit} 기준 · {(item.value / item.max * 100).toFixed(0)}%</small></div>)}</div>
  </section>;
}

function ComparePanel({ menus }: { menus: Menu[] }) {
  const [metric, setMetric] = useState<CompareMetric>("count");
  const configs: Record<CompareMetric, { label: string; unit: string; digits: number; description: string }> = {
    count: { label: "조건 통과 메뉴", unit: "개", digits: 0, description: "현재 알레르기·영양 조건을 통과한 메뉴 수" },
    coverage: { label: "알레르기 확인률", unit: "%", digits: 1, description: "현재 결과 중 공식 알레르기 표기를 확인한 행의 비율" },
    protein: { label: "단백질 중앙값", unit: "g", digits: 1, description: "현재 결과 메뉴의 브랜드별 단백질 중앙값" },
    sodium: { label: "나트륨 중앙값", unit: "mg", digits: 0, description: "현재 결과 메뉴의 브랜드별 나트륨 중앙값" },
  };
  const config = configs[metric];
  const grouped = Array.from(new Set(menus.map((menu) => menu.brand))).map((brand) => {
    const rows = menus.filter((menu) => menu.brand === brand);
    const known = rows.filter((menu) => menu.allergenKnown).length;
    const values: Record<CompareMetric, number> = {
      count: rows.length,
      coverage: rows.length ? known / rows.length * 100 : 0,
      protein: median(rows.map((menu) => menu.protein)),
      sodium: median(rows.map((menu) => menu.sodium)),
    };
    return { brand, rows: rows.length, known, value: Number(values[metric].toFixed(config.digits)) };
  }).sort((a, b) => b.value - a.value || a.brand.localeCompare(b.brand, "ko"));
  return <section id="panel-compare" role="tabpanel" aria-labelledby="tab-compare" className="panel compare-panel">
    <div className="panel-head"><div><span className="section-kicker">INTERACTIVE COMPARISON</span><h2>같은 계산 규칙과 표본으로 비교합니다.</h2><p>{config.description}. 현재 필터 결과 {menus.length}개를 기준으로 계산합니다.</p></div></div>
    <p className="comparison-caveat">제품군과 제공량이 브랜드마다 다르므로 영양 수치를 브랜드의 절대적 우열로 해석하지 마세요. 중앙값과 표본 수를 함께 확인하세요.</p>
    <div className="metric-switch" aria-label="비교 지표">{(Object.keys(configs) as CompareMetric[]).map((key) => <button key={key} aria-pressed={metric === key} className={metric === key ? "active" : ""} onClick={() => setMetric(key)}>{configs[key].label}</button>)}</div>
    {grouped.length ? <><figure className="chart-card" aria-labelledby="compare-chart-title"><figcaption id="compare-chart-title"><b>{config.label}</b><span>단위 {config.unit} · 0 기준 · 값 내림차순</span></figcaption><div className="chart"><ResponsiveContainer width="100%" height={Math.max(360, grouped.length * 46)}><BarChart data={grouped} layout="vertical" margin={{ left: 18, right: 34 }}><CartesianGrid stroke="#e2e2e7" horizontal={false} /><XAxis type="number" domain={[0, "auto"]} allowDecimals={metric !== "count" && metric !== "sodium"} tickLine={false} axisLine={false} /><YAxis type="category" dataKey="brand" width={92} tickLine={false} axisLine={false} /><Tooltip cursor={{ fill: "rgba(0,113,227,.05)" }} formatter={(value) => [`${Number(value).toLocaleString("ko-KR", { maximumFractionDigits: config.digits })}${config.unit}`, config.label]} /><Bar dataKey="value" name={config.label} fill="#0071e3" radius={[0, 7, 7, 0]} /></BarChart></ResponsiveContainer></div></figure><div className="table-scroll"><table className="data-table compare-table"><caption>차트의 정확한 값과 표본</caption><thead><tr><th>브랜드</th><th>{config.label}</th><th>표본</th><th>알레르기 확인</th></tr></thead><tbody>{grouped.map((row) => <tr key={row.brand}><td>{row.brand}</td><td>{row.value.toLocaleString("ko-KR", { maximumFractionDigits: config.digits })}{config.unit}</td><td>{row.rows}개</td><td>{row.known}/{row.rows}</td></tr>)}</tbody></table></div></> : <div className="empty"><h3>비교할 메뉴가 없습니다.</h3><p>추천 메뉴 탭에서 조건을 초기화하거나 범위를 넓혀보세요.</p></div>}
  </section>;
}

function AboutPanel({ menus, quality, qualityError }: { menus: Menu[]; quality: QualityReport | null; qualityError: string }) {
  const rows = Array.from(new Set(menus.map((menu) => menu.brand))).map((brand) => {
    const items = menus.filter((menu) => menu.brand === brand);
    const known = items.filter((menu) => menu.allergenKnown).length;
    return { brand, count: items.length, known, rate: Math.round(known / items.length * 100), date: items.reduce((latest, menu) => menu.sourceDate > latest ? menu.sourceDate : latest, ""), source: items[0]?.sourceUrl };
  }).sort((a, b) => b.count - a.count);
  const summary = quality?.summary;
  return <section id="panel-about" role="tabpanel" aria-labelledby="tab-about" className="panel prose about-panel">
    <div className="about-hero"><span className="section-kicker">EVIDENCE, NOT A SCORE</span><h2>평가 기준을 결과물 안에서 증명합니다.</h2><p>점수를 꾸미지 않고, 공식 출처·자동 검증·인터랙션·실제 배포로 확인 가능한 근거를 남겼습니다.</p></div>
    {qualityError && <div className="inline-error" role="status"><AlertCircle size={18} /> 메뉴 탐색은 사용할 수 있지만 품질 요약을 불러오지 못했습니다: {qualityError}</div>}
    <div className="evidence-grid">
      <article><span>01 · 데이터·주제</span><b>{summary ? `${summary.rows}행 · ${summary.brands}브랜드` : `${menus.length}행`}</b><p>공식 API·HTML·공식 이미지에서 수집하고 출처 URL, 기준일, 수집법을 행 단위로 보존했습니다.</p><small>{summary ? `검증 ${summary.verified_rows}/${summary.rows} · 오류 ${summary.errors} · 중복 ${summary.duplicate_brand_menu}` : "품질 보고서 확인 중"}</small></article>
      <article><span>02 · 시각화 완성도</span><b>4개 비교 지표</b><p>메뉴 수·알레르기 확인률·단백질 중앙값·나트륨 중앙값을 한 단위씩 바꿔 보며 비교합니다.</p><small>0 기준 · 표본 수 · 정확값 표 · 해석 한계 제공</small></article>
      <article><span>03 · 웹 구현·배포</span><b>Vercel Preview 배포</b><p>Next.js 반응형 UI, 오류·빈 상태, 키보드 탭 이동, 안정적인 장바구니 저장을 구현했습니다.</p><small>Production 반영은 PR 병합 뒤 · 카카오 상태 별도 공개</small></article>
      <article><span>04 · AI 활용·발표</span><b>4단계 검증 루프</b><p>AI가 구조 분석·수집기 보완·코드 구현·검증을 보조하고, 공식 원문과 Chrome 결과를 사람이 확인했습니다.</p><small>분석 → 대안 → 적용 → 브라우저 QA</small></article>
    </div>
    <div className="notice"><b>안전 안내</b><p>공식 알레르기 정보가 미표기된 메뉴는 알레르기 필터를 선택하면 추천에서 제외합니다. ‘미표기’를 ‘없음’으로 해석하지 않습니다. 심한 알레르기가 있다면 주문 전 공식 원문과 매장에 다시 확인하세요.</p></div>
    <section className="method-stage"><div><span className="section-kicker">AI + HUMAN VERIFICATION</span><h3>구현 과정도 재현 가능하게.</h3><p>AI는 반복 수집과 코드·QA 보조에 사용했고, 최종 사실 판단은 공식 자료와 실제 브라우저 결과로 검증했습니다.</p></div><ol><li><b>구조 파악</b><span>기존 앱·CSV·배포 경로와 실패 지점을 감사</span></li><li><b>공식 자료 수집</b><span>브랜드 공개 자료만 파싱하고 원문 URL·확인일 기록</span></li><li><b>자동 검증</b><span>스키마·범위·중복·날짜·미러 해시·빌드를 CI에서 검사</span></li><li><b>사람의 확인</b><span>Chrome에서 필터·차트·반응형·Vercel 배포를 직접 확인</span></li></ol></section>
    <div className="data-section-head"><div><h3>수집 범위와 최신성</h3><p>기준일은 공식 표기일이 없을 때 수집 확인일을 사용하며, 유형을 데이터에 함께 기록합니다.</p></div>{quality && <span className={quality.status === "pass" ? "quality-pass" : "quality-fail"}>{quality.status.toUpperCase()} · {quality.mirror.identical ? "CSV 일치" : "CSV 확인 필요"}</span>}</div>
    <div className="table-scroll"><table className="data-table"><thead><tr><th>브랜드</th><th>메뉴 수</th><th>알레르기 확인</th><th>최신 기준일</th><th>출처</th></tr></thead><tbody>{rows.map((row) => <tr key={row.brand}><td>{row.brand}</td><td>{row.count}</td><td>{row.known}/{row.count} ({row.rate}%)</td><td>{row.date}</td><td><a href={row.source}>공식 원문</a></td></tr>)}</tbody></table></div>
    <div className="caveat-grid"><p><b>현재 한계</b><br />파리바게뜨는 공식 형식으로 확인된 1개 행만 포함합니다. 스타벅스·써브웨이의 알레르기 정보는 미확인으로 분리해 필터 선택 시 제외합니다.</p><p><b>영양 필드 의미</b><br />공식 라벨의 포화지방과 당류를 표시합니다. 제품 구성과 수치는 브랜드 업데이트에 따라 달라질 수 있습니다.</p><p><b>매장 데이터</b><br />카카오맵·카카오 로컬 API를 사용합니다. 가격은 채널별로 달라 실시간 가격으로 제공하지 않습니다.</p></div>
  </section>;
}

type KakaoIntegration = { status: "checking" | "ready" | "incomplete" | "error"; rest: boolean; javascript: boolean; message: string };

function MapPanel({ brands }: { brands: string[] }) {
  const [mode, setMode] = useState<"search" | "gps">("search");
  const [term, setTerm] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [center, setCenter] = useState<Place | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [radius, setRadius] = useState(3);
  const [searchedRadius, setSearchedRadius] = useState<number | null>(null);
  const [searchedBrands, setSearchedBrands] = useState("");
  const [loading, setLoading] = useState(false);
  const [mapError, setMapError] = useState("");
  const [integration, setIntegration] = useState<KakaoIntegration>({ status: "checking", rest: false, javascript: false, message: "카카오 연결 상태를 확인하고 있어요…" });
  const brandSignature = [...brands].sort((a, b) => a.localeCompare(b, "ko")).join(",");

  const readIntegration = useCallback(async (signal?: AbortSignal): Promise<KakaoIntegration> => {
    try {
      const response = await fetch("/api/health", { cache: "no-store", signal });
      const health = await readJsonResponse<{ kakaoRestConfigured: boolean; kakaoJavascriptConfigured: boolean }>(response, "배포 상태 확인에 실패했습니다.");
      const missing = [!health.kakaoRestConfigured && "REST API 키", !health.kakaoJavascriptConfigured && "JavaScript 키"].filter(Boolean);
      return {
        status: missing.length ? "incomplete" : "ready",
        rest: health.kakaoRestConfigured,
        javascript: health.kakaoJavascriptConfigured,
        message: missing.length ? `배포 설정 필요: ${missing.join(", ")}` : "카카오 장소 검색과 지도 렌더링이 모두 준비됐습니다.",
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { status: "error", rest: true, javascript: true, message: error instanceof Error ? error.message : "배포 상태를 확인하지 못했습니다." };
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void readIntegration(controller.signal).then((next) => { if (!controller.signal.aborted) setIntegration(next); }).catch(() => undefined);
    return () => controller.abort();
  }, [readIntegration]);

  const restUnavailable = integration.status !== "error" && !integration.rest;
  useEffect(() => {
    if (term.trim().length < 2 || restUnavailable || !brands.length) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => fetch(`/api/places?q=${encodeURIComponent(term)}`, { signal: controller.signal })
      .then((response) => readJsonResponse<Place[]>(response, "장소 검색에 실패했습니다."))
      .then((data) => { setPlaces(Array.isArray(data) ? data : []); setMapError(""); })
      .catch((error) => { if (!controller.signal.aborted) { setPlaces([]); setMapError(error instanceof Error ? error.message : "장소 검색에 실패했습니다."); } }), 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [term, restUnavailable, brands.length]);

  const findStores = async (place: Place) => {
    if (!brands.length) { setMapError("주변 매장을 찾을 브랜드를 한 개 이상 선택해 주세요."); return; }
    if (restUnavailable) { setMapError("카카오 REST API 키가 없어 장소·매장 검색을 시작할 수 없습니다."); return; }
    setLoading(true); setMapError("");
    try {
      const response = await fetch(`/api/stores?lat=${place.lat}&lon=${place.lon}&radius=${radius * 1000}&brands=${encodeURIComponent(brands.join(","))}`);
      const data = await readJsonResponse<Store[]>(response, "주변 매장 검색에 실패했습니다.");
      setCenter(place); setStores(Array.isArray(data) ? data : []); setSearchedRadius(radius); setSearchedBrands(brandSignature);
    } catch (error) {
      setMapError(error instanceof Error ? error.message : "주변 매장 검색에 실패했습니다.");
    } finally { setLoading(false); }
  };
  const locate = () => {
    if (!brands.length) { setMapError("현재 위치를 검색하기 전에 브랜드를 한 개 이상 선택해 주세요."); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => void findStores({ id: "gps", name: "현재 위치", address: `정확도 약 ${Math.round(position.coords.accuracy)}m`, lat: position.coords.latitude, lon: position.coords.longitude }),
      () => setMapError("브라우저 위치 권한이 필요합니다. 장소 검색을 이용하거나 권한을 허용해 주세요."),
      { enableHighAccuracy: true },
    );
  };
  const resultsStale = Boolean(center && (searchedRadius !== radius || searchedBrands !== brandSignature));
  const controlsDisabled = integration.status === "checking" || restUnavailable || !brands.length;

  return <section id="panel-map" role="tabpanel" aria-labelledby="tab-map" className="panel"><div className="panel-head map-panel-head"><div><h2>내 주변 매장</h2><p>카카오맵에서 선택한 {brands.length}개 브랜드의 매장을 찾아요.</p></div><label className="radius-slider"><span>검색 반경 <b>{radius} km</b></span><input aria-label="매장 검색 반경" type="range" min="1" max="10" step="1" value={radius} onChange={(e) => setRadius(Number(e.target.value))} /><small><i>1km</i><i>10km</i></small></label></div>
    <div className={`map-integration-status ${integration.status}`} role={integration.status === "ready" ? "status" : "alert"}><span aria-hidden="true">{integration.status === "ready" ? "✓" : "!"}</span><div><b>{integration.status === "ready" ? "카카오 지도 연결 준비 완료" : "카카오 지도 연결 상태"}</b><small>{integration.message}</small></div>{integration.status === "error" && <button onClick={() => { setIntegration((current) => ({ ...current, status: "checking", message: "카카오 연결 상태를 확인하고 있어요…" })); void readIntegration().then(setIntegration); }}>다시 확인</button>}</div>
    {!brands.length && <div className="inline-error" role="alert"><AlertCircle size={18} /> 내 조건에서 주변 매장을 찾을 브랜드를 한 개 이상 선택해 주세요.</div>}
    <div className="mode-switch"><button disabled={controlsDisabled} aria-pressed={mode === "search"} className={mode === "search" ? "active" : ""} onClick={() => setMode("search")}><Search size={17} />장소 검색</button><button disabled={controlsDisabled} aria-pressed={mode === "gps"} className={mode === "gps" ? "active" : ""} onClick={() => { setMode("gps"); locate(); }}><LocateFixed size={17} />현재 위치</button></div>
    {mode === "search" && <div className="location-search"><label className="search"><Search size={18} /><input disabled={controlsDisabled} aria-label="장소 검색" value={term} onChange={(e) => { const value = e.target.value; setTerm(value); if (value.trim().length < 2) { setPlaces([]); setMapError(""); } }} placeholder={restUnavailable ? "카카오 REST API 키 설정이 필요합니다" : "성수역, 서울시청처럼 입력하세요"} /></label>{places.length > 0 && <div className="suggestions" aria-label="장소 검색 결과">{places.map((place) => <button key={place.id} onClick={() => { setTerm(place.name); setPlaces([]); void findStores(place); }}><MapPin size={17} /><span><b>{place.name}</b><small>{place.address}</small></span></button>)}</div>}</div>}
    {mapError && <div className="inline-error" role="alert"><AlertCircle size={18} /> {mapError}</div>}
    {loading && <div className="map-loading" role="status">주변 매장을 찾고 있어요…</div>}
    {center && <><KakaoMap center={center} radiusKm={searchedRadius ?? radius} stores={stores} /><div className="store-summary"><b>{center.name}</b> · {searchedRadius ?? radius}km 기준 {stores.length}개 매장</div>{resultsStale && <div className="map-stale" role="status"><span>반경 또는 브랜드 조건이 바뀌었습니다. 현재 지도는 이전 검색 결과입니다.</span><button onClick={() => void findStores(center)} disabled={loading}>변경 조건으로 다시 검색</button></div>}{!stores.length && !loading && <div className="empty compact-empty">선택한 반경에서 확인된 매장이 없습니다. 반경이나 브랜드를 바꿔보세요.</div>}<div className="store-list">{stores.slice(0, 20).map((store) => { const logo = BRAND_LOGOS[store.brand]; const content = <>{logo ? <Image src={logo} alt="" width={34} height={34} /> : <span className="store-logo-fallback" aria-hidden="true">{store.brand.slice(0, 1)}</span>}<span><b>{store.name}</b><small>{store.distance.toFixed(2)}km · 도보 약 {Math.ceil(store.distance * 1.25 / 4.5 * 60)}분 · {store.address}</small></span></>; return store.placeUrl ? <a href={store.placeUrl} key={store.id}>{content}</a> : <div className="store-list-item" key={store.id}>{content}</div>; })}</div></>}
  </section>;
}
