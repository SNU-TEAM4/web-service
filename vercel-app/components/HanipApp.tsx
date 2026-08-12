"use client";

import Image from "next/image";
import Papa from "papaparse";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, ChevronUp, ExternalLink, ImageIcon, LocateFixed, MapPin, Maximize2, Menu as MenuIcon, RefreshCw, Search, ShoppingCart, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { ALLERGENS, BRAND_LOGOS } from "@/lib/brands";
import { getMenuImage, isExactMenuImage, MENU_IMAGE_MANIFEST, type MenuImageAsset } from "@/lib/menu-images";
import type { Menu, Place, QualityReport, Store } from "@/lib/types";
import KakaoMap from "./KakaoMap";

type Tab = "menus" | "cart" | "map" | "compare" | "about";
type Cart = Record<string, number>;
type LoadStatus = "loading" | "ready" | "error";
type CompareMetric = "count" | "coverage" | "protein" | "sodium";
type CompareView = "brand" | "menu";
type NutritionPreset = "default" | "light" | "protein" | "sodium" | "custom";

const DEFAULT_MAP_CENTER: Place = {
  id: "seoul-city-hall",
  name: "서울시청",
  address: "기본 지도 중심",
  lat: 37.5665,
  lon: 126.978,
};

const parseNumber = (value: unknown) => Number(value || 0);
const parsePrice = (value: unknown) => String(value || "").trim() ? Number(value) : null;
const formatPrice = (value: number) => `${value.toLocaleString("ko-KR")}원`;
const mealFactor: Record<string, number> = { "감량": .8, "유지": 1, "증량": 1.12 };
const tabs: Array<{ id: Tab; label: string }> = [
  { id: "menus", label: "추천 메뉴" }, { id: "cart", label: "장바구니" },
  { id: "map", label: "주변 매장" }, { id: "compare", label: "브랜드 비교" },
  { id: "about", label: "데이터 안내" },
];
const stableMenuId = (brand: string, menu: string) => `${brand}::${menu}`;
const nutritionPresets: Array<{ id: Exclude<NutritionPreset, "custom">; label: string; description: string; maxCalories: number; minProtein: number; maxSodium: number }> = [
  { id: "default", label: "기본 균형", description: "600kcal · 나트륨 1,500mg 이하", maxCalories: 600, minProtein: 0, maxSodium: 1500 },
  { id: "light", label: "가벼운 한 끼", description: "450kcal · 단백질 10g 이상", maxCalories: 450, minProtein: 10, maxSodium: 1000 },
  { id: "protein", label: "고단백 탐색", description: "단백질 20g · 700kcal 이하", maxCalories: 700, minProtein: 20, maxSodium: 1800 },
  { id: "sodium", label: "저나트륨 우선", description: "나트륨 600mg 이하", maxCalories: 700, minProtein: 0, maxSodium: 600 },
];
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
  const [nutritionPreset, setNutritionPreset] = useState<NutritionPreset>("default");
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [photoOnly, setPhotoOnly] = useState(false);
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
          priceKrw: parsePrice(row.price_krw),
          priceType: row.price_type === "official_online_reference" ? "official_online_reference" as const : "unavailable" as const,
          priceSourceUrl: row.price_source_url || "", priceSourceDate: row.price_source_date || "",
          priceNote: row.price_note || "공식 단일 가격 미확인",
        }));
        if (!data.length) throw new Error("사용 가능한 메뉴 행이 없습니다.");
        setMenus(data);
        setBrands(Array.from(new Set(data.map((menu) => menu.brand))));
        setOpenBrands((current) => Object.keys(current).length ? current : { KFC: true });
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
    setNutritionPreset("default"); setSpotlightIndex(0); setPhotoOnly(false);
  };
  const applyNutritionPreset = (presetId: Exclude<NutritionPreset, "custom">) => {
    const preset = nutritionPresets.find((item) => item.id === presetId);
    if (!preset) return;
    setMaxCalories(preset.maxCalories); setMinProtein(preset.minProtein); setMaxSodium(preset.maxSodium);
    setNutritionPreset(presetId); setSpotlightIndex(0);
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

  const imageBackedFiltered = useMemo(() => filtered.filter((menu) => Boolean(getMenuImage(menu.id))), [filtered]);
  const exactImageFiltered = useMemo(() => filtered.filter((menu) => isExactMenuImage(getMenuImage(menu.id))), [filtered]);
  const displayedMenus = photoOnly ? exactImageFiltered : filtered;
  const grouped = useMemo(() => Object.entries(displayedMenus.reduce<Record<string, Menu[]>>((groups, menu) => {
    (groups[menu.brand] ||= []).push(menu);
    return groups;
  }, {})), [displayedMenus]);
  const menuById = useMemo(() => new Map(menus.map((menu) => [menu.id, menu])), [menus]);
  const cartItems = useMemo(() => Object.entries(cart).flatMap(([id, quantity]) => {
    const menu = menuById.get(id); return menu ? [{ menu, quantity }] : [];
  }), [cart, menuById]);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const spotlightMenu = filtered.length ? filtered[spotlightIndex % filtered.length] : null;
  const spotlightImage = spotlightMenu ? getMenuImage(spotlightMenu.id) : null;
  const spotlightImagePosition = spotlightMenu ? imageBackedFiltered.findIndex((menu) => menu.id === spotlightMenu.id) : -1;
  const latestSourceDate = useMemo(() => menus.reduce((latest, menu) => menu.sourceDate > latest ? menu.sourceDate : latest, ""), [menus]);
  const sourceLinkedCount = useMemo(() => menus.filter((menu) => Boolean(menu.sourceUrl)).length, [menus]);
  const allergenKnownCount = useMemo(() => menus.filter((menu) => menu.allergenKnown).length, [menus]);
  const priceKnownCount = useMemo(() => menus.filter((menu) => menu.priceKrw !== null).length, [menus]);
  const allergenCoverage = menus.length ? Math.round(allergenKnownCount / menus.length * 100) : 0;
  const sourceCoverage = menus.length ? Math.round(sourceLinkedCount / menus.length * 100) : 0;
  const priceCoverage = menus.length ? Math.round(priceKnownCount / menus.length * 100) : 0;
  const totals = cartItems.reduce((sum, { menu, quantity }) => ({
    calories: sum.calories + menu.calories * quantity, protein: sum.protein + menu.protein * quantity,
    saturatedFat: sum.saturatedFat + menu.saturatedFat * quantity, sugars: sum.sugars + menu.sugars * quantity, sodium: sum.sodium + menu.sodium * quantity,
    priceKrw: sum.priceKrw + (menu.priceKrw ?? 0) * quantity,
    priceKnownQuantity: sum.priceKnownQuantity + (menu.priceKrw === null ? 0 : quantity),
    priceMissingQuantity: sum.priceMissingQuantity + (menu.priceKrw === null ? quantity : 0),
  }), { calories: 0, protein: 0, saturatedFat: 0, sugars: 0, sodium: 0, priceKrw: 0, priceKnownQuantity: 0, priceMissingQuantity: 0 });

  const addToCart = (id: string) => {
    setCart((current) => ({ ...current, [id]: (current[id] || 0) + 1 }));
    setAdded((current) => ({ id, nonce: (current?.nonce || 0) + 1 }));
    window.setTimeout(() => setAdded((current) => current?.id === id ? null : current), 950);
  };

  const showNextImageMenu = () => {
    if (!imageBackedFiltered.length) return;
    const nextImageIndex = (spotlightImagePosition + 1) % imageBackedFiltered.length;
    const nextFilteredIndex = filtered.findIndex((menu) => menu.id === imageBackedFiltered[nextImageIndex].id);
    setSpotlightIndex(Math.max(0, nextFilteredIndex));
  };
  const showMenuInSpotlight = (menu: Menu) => {
    const index = filtered.findIndex((item) => item.id === menu.id);
    if (index < 0) return;
    setSpotlightIndex(index);
    window.requestAnimationFrame(() => document.getElementById("dynamic-pick")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
    }));
  };
  const togglePhotoOnly = () => {
    const next = !photoOnly;
    setPhotoOnly(next);
    if (next) setOpenBrands((open) => ({ ...open, ...Object.fromEntries(exactImageFiltered.map((menu) => [menu.brand, true])) }));
  };
  const showDataGuide = () => {
    setTab("about");
    window.requestAnimationFrame(() => {
      const aboutTab = document.getElementById("tab-about");
      aboutTab?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      aboutTab?.focus();
    });
  };

  const activeConditions = [
    nutritionPreset === "custom" ? "직접 조정" : nutritionPresets.find((item) => item.id === nutritionPreset)?.label || "기본 균형",
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
          <Range label="최대 칼로리" value={maxCalories} min={100} max={1200} step={50} unit="kcal" onChange={(value) => { setMaxCalories(value); setNutritionPreset("custom"); setSpotlightIndex(0); }} />
          <Range label="최소 단백질" value={minProtein} min={0} max={60} step={5} unit="g" onChange={(value) => { setMinProtein(value); setNutritionPreset("custom"); setSpotlightIndex(0); }} />
          <Range label="최대 나트륨" value={maxSodium} min={100} max={3000} step={100} unit="mg" onChange={(value) => { setMaxSodium(value); setNutritionPreset("custom"); setSpotlightIndex(0); }} />
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
        {loadStatus === "ready" && <section className="source-stage" aria-labelledby="coverage-title">
          <div className="source-stage-copy">
            <span className="source-stage-eyebrow">WHAT YOU CAN TRUST</span>
            <h2 id="coverage-title">확인된 범위를,<br />한눈에.</h2>
            <p>전체 {menus.length.toLocaleString("ko-KR")}개 메뉴 중 {allergenKnownCount.toLocaleString("ko-KR")}개는 공식 알레르기 정보를 확인했습니다. 확인되지 않은 정보와 공개되지 않은 가격은 추정하지 않고 그대로 알려드립니다.</p>
            <button className="source-stage-link" onClick={showDataGuide}>데이터 기준 자세히 보기 <span aria-hidden="true">›</span></button>
          </div>
          <div className="coverage-visual">
            <div className="coverage-ring" role="img" aria-label={`전체 메뉴 중 알레르기 정보 확인 가능 ${allergenCoverage}퍼센트, ${allergenKnownCount}개`}>
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle className="coverage-ring-track" cx="60" cy="60" r="52" pathLength="100" />
                <circle className="coverage-ring-value" cx="60" cy="60" r="52" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - allergenCoverage} />
              </svg>
              <div><strong>{allergenCoverage}%</strong><span>알레르기 정보<br />확인 가능</span><small>{allergenKnownCount.toLocaleString("ko-KR")} / {menus.length.toLocaleString("ko-KR")}개 메뉴</small></div>
            </div>
            <div className="coverage-breakdown">
              <CoverageBar label="공식 출처 연결" value={sourceCoverage} detail={`${sourceLinkedCount.toLocaleString("ko-KR")} / ${menus.length.toLocaleString("ko-KR")}개`} tone="blue" />
              <CoverageBar label="가격 확인 가능" value={priceCoverage} detail={`${priceKnownCount.toLocaleString("ko-KR")} / ${menus.length.toLocaleString("ko-KR")}개`} tone="amber" />
            </div>
            <div className={quality?.status === "pass" ? "coverage-quality pass" : "coverage-quality"} role="status">
              {quality?.status === "pass" ? <Check size={15} /> : <RefreshCw size={15} />}
              <span>{quality?.status === "pass" && quality.mirror.identical ? "원천·배포 데이터 자동 검증 완료" : "데이터 품질 보고서 확인 중"}</span>
            </div>
          </div>
        </section>}
        <div className="metrics"><Metric label="추천 가능한 메뉴" value={`${filtered.length}개`} note={`전체 ${menus.length}개 메뉴`} /><Metric label="선택 브랜드" value={`${brands.length}개`} note={`총 ${brandOptions.length}개 브랜드`} /><Metric label="선택 알레르기" value={`${allergens.length}개`} note={allergens.length ? "조건 적용 중" : "선택 없음"} /><Metric label="장바구니" value={`${cartCount}개`} note={`${totals.calories.toFixed(0)} kcal`} /></div>
        {loadStatus === "ready" && <section className="decision-stage" aria-labelledby="quick-preset-title">
          <div className="decision-copy">
            <span className="section-kicker">QUICK DECISION</span>
            <h2 id="quick-preset-title">한 번 눌러 조건을 바꾸고,<br />결과를 바로 확인하세요.</h2>
            <p>빠른 조건은 영양 범위만 바꿉니다. 선택한 브랜드와 알레르기 제외 조건은 그대로 유지됩니다.</p>
            <div className="preset-grid" aria-label="빠른 영양 조건">
              {nutritionPresets.map((preset) => <button key={preset.id} aria-pressed={nutritionPreset === preset.id} className={nutritionPreset === preset.id ? "preset-card active" : "preset-card"} onClick={() => applyNutritionPreset(preset.id)}><b>{preset.label}</b><span>{preset.description}</span></button>)}
            </div>
          </div>
          <article id="dynamic-pick" key={spotlightMenu ? `${spotlightMenu.id}-${spotlightIndex}` : "empty"} className="spotlight-card">
            {spotlightMenu ? <>
              <div className="spotlight-main">
                <div className="spotlight-content" aria-live="polite" aria-atomic="true">
                  <div className="spotlight-meta"><span>{spotlightMenu.brand} · {spotlightMenu.category}</span><b>{spotlightIndex % filtered.length + 1}/{filtered.length}</b></div>
                  <h3>{spotlightMenu.menu}</h3>
                  <p>{spotlightMenu.protein >= 20 ? `단백질 ${spotlightMenu.protein.toFixed(0)}g을 포함해 현재 조건을 통과했습니다.` : spotlightMenu.sodium <= 600 ? `나트륨 ${spotlightMenu.sodium.toFixed(0)}mg으로 현재 조건을 통과했습니다.` : "선택한 영양·브랜드 조건을 통과한 공식 메뉴입니다."}</p>
                  <div className="spotlight-nutrients"><span><b>{spotlightMenu.calories.toFixed(0)}</b>kcal</span><span><b>{spotlightMenu.protein.toFixed(0)}</b>단백질 g</span><span><b>{spotlightMenu.sodium.toFixed(0)}</b>나트륨 mg</span></div>
                  <div className={spotlightMenu.priceKrw === null ? "spotlight-price unavailable" : "spotlight-price"}>{spotlightMenu.priceKrw === null ? "공식 단일 가격 미확인" : <><b>{formatPrice(spotlightMenu.priceKrw)}</b><span>공식 온라인 주문 기준가 · 변동 가능</span></>}</div>
                  <div className={spotlightMenu.allergenKnown ? "spotlight-safety known" : "spotlight-safety unknown"}>{spotlightMenu.allergenKnown ? <><Check size={15} /> 공식 알레르기 정보 확인</> : <><AlertCircle size={15} /> 알레르기 정보 미확인</>}</div>
                </div>
                <SpotlightMedia menu={spotlightMenu} asset={spotlightImage} />
              </div>
              <div className="spotlight-actions">
                <button className="spotlight-next" disabled={filtered.length < 2} onClick={() => setSpotlightIndex((current) => current + 1)}><RefreshCw size={16} /> 다른 메뉴</button>
                <button className="spotlight-photo-next" disabled={!imageBackedFiltered.length} onClick={showNextImageMenu}><ImageIcon size={16} /> 사진 메뉴 {spotlightImagePosition >= 0 ? spotlightImagePosition + 1 : 0}/{imageBackedFiltered.length}</button>
                <button className={added?.id === spotlightMenu.id ? "spotlight-add confirmed" : "spotlight-add"} onClick={() => addToCart(spotlightMenu.id)}>{added?.id === spotlightMenu.id ? <><Check size={16} /> 담았어요</> : <><ShoppingCart size={16} /> 장바구니 담기</>}</button>
                <a href={spotlightMenu.allergySourceUrl || spotlightMenu.sourceUrl}><ExternalLink size={15} /> 공식 정보</a>
              </div>
            </> : <div className="spotlight-empty"><AlertCircle size={24} /><h3>현재 조건을 통과한 메뉴가 없습니다.</h3><p>빠른 조건을 바꾸거나 전체 조건을 초기화해 보세요.</p><button onClick={resetFilters}>기본 조건으로 돌아가기</button></div>}
          </article>
        </section>}
        <div className="condition-summary" aria-label="현재 적용 조건"><span>현재 조건</span>{activeConditions.map((item) => <b key={item}>{item}</b>)}<button onClick={resetFilters}>초기화</button></div>
        <nav className="tabs" id="workspace" role="tablist" aria-label="한입안심 기능">
          <TabButton tabId="menus" active={tab === "menus"} onClick={() => setTab("menus")} onKeyDown={(event) => handleTabKeyDown(event, "menus")} icon={<MenuIcon size={17} />} label="추천 메뉴" />
          <TabButton tabId="cart" active={tab === "cart"} onClick={() => setTab("cart")} onKeyDown={(event) => handleTabKeyDown(event, "cart")} icon={<ShoppingCart size={17} />} label={`장바구니 (${cartCount})`} />
          <TabButton tabId="map" active={tab === "map"} onClick={() => setTab("map")} onKeyDown={(event) => handleTabKeyDown(event, "map")} icon={<MapPin size={17} />} label="주변 매장" />
          <TabButton tabId="compare" active={tab === "compare"} onClick={() => setTab("compare")} onKeyDown={(event) => handleTabKeyDown(event, "compare")} label="브랜드 비교" />
          <TabButton tabId="about" active={tab === "about"} onClick={() => setTab("about")} onKeyDown={(event) => handleTabKeyDown(event, "about")} label="데이터 안내" />
        </nav>

        {loadStatus === "ready" && tab === "menus" && <section id="panel-menus" className="panel" role="tabpanel" aria-labelledby="tab-menus">
          <div className="panel-head"><div><h2>조건에 맞는 메뉴</h2><p>모든 메뉴에 공식 이미지가 연결되며, 대표 이미지는 정확 일치와 구분해 표시합니다.</p></div><div className="menu-tools"><button className={photoOnly ? "photo-filter active" : "photo-filter"} aria-pressed={photoOnly} onClick={togglePhotoOnly}><ImageIcon size={16} /> 정확 일치 사진만 <b>{exactImageFiltered.length}</b></button><label className="search"><Search size={18} /><input aria-label="브랜드 또는 메뉴 검색" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="브랜드 또는 메뉴 검색" /></label></div></div>
          <div className="brand-folders">{grouped.map(([brand, items]) => {
            const logo = BRAND_LOGOS[brand];
            return <div className="brand-folder" key={brand}>
            <button className="brand-folder-head" aria-expanded={Boolean(openBrands[brand])} onClick={() => setOpenBrands((current) => ({ ...current, [brand]: !current[brand] }))}>
              <span className="brand-logo-frame">{logo ? <Image src={logo} alt={`${brand} 로고`} width={72} height={72} /> : <span className="brand-logo-fallback" aria-hidden="true">{brand.slice(0, 1)}</span>}</span>
              <span className="brand-copy"><b>{brand}</b><small>추천 가능 {items.length}개</small></span>
              <span className="brand-chevron" aria-hidden="true">{openBrands[brand] ? <ChevronUp /> : <ChevronDown />}</span>
            </button>
            {openBrands[brand] && <div className="menu-grid">{items.map((menu) => {
              const menuImage = getMenuImage(menu.id);
              return <article className={menuImage ? `menu-card has-image${isExactMenuImage(menuImage) ? "" : " representative"}` : "menu-card"} key={menu.id}>
                <MenuCardVisual menu={menu} asset={menuImage} onShow={() => showMenuInSpotlight(menu)} />
                <div className="menu-card-body">
                  <span className="category">{menu.category}</span><h3>{menu.menu}</h3>
                  <p>{menu.calories.toFixed(0)} kcal · 단백질 {menu.protein.toFixed(0)}g · 나트륨 {menu.sodium.toFixed(0)}mg</p>
                  {menu.priceKrw === null
                    ? <div className="menu-price unavailable">공식 단일 가격 미확인</div>
                    : <a className="menu-price" href={menu.priceSourceUrl} aria-label={`${menu.menu} 공식 가격 출처`}><b>{formatPrice(menu.priceKrw)}</b><span>공식 온라인 기준 · 변동 가능</span></a>}
                  <div className="allergen-row">{menu.allergenKnown ? (menu.allergens.length ? menu.allergens.map((item) => <span key={item}>{item}</span>) : <span className="safe">표시 알레르기 없음</span>) : <span>알레르기 정보 미표기</span>}</div>
                  <a className="source-link" href={menu.allergySourceUrl || menu.sourceUrl}><ExternalLink size={13} /> 공식 출처 · {menu.sourceDate}</a>
                  <button key={added?.id === menu.id ? added.nonce : menu.id} className={added?.id === menu.id ? "add-button confirmed" : "add-button"} onClick={() => addToCart(menu.id)}>{added?.id === menu.id ? <><Check size={18} /> 담았어요!</> : <><ShoppingCart size={18} /> 담기</>}</button>
                </div>
              </article>;
            })}</div>}
          </div>})}</div>
          {!displayedMenus.length && <div className="empty"><ImageIcon size={28} /><h3>{photoOnly ? "현재 조건에서 이름이 정확히 일치한 사진이 없어요." : "조건을 만족하는 메뉴가 없어요."}</h3><p>{photoOnly ? "필터를 해제하면 공식 제품군 대표 이미지가 연결된 메뉴도 함께 볼 수 있어요." : "검색어나 영양 한도를 넓혀 다시 확인해 보세요."}</p><button className="hero-primary" onClick={photoOnly ? togglePhotoOnly : resetFilters}>{photoOnly ? "전체 이미지 메뉴 보기" : "조건 초기화"}</button></div>}
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
function CoverageBar({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: "blue" | "amber" }) {
  return <div className={`coverage-bar ${tone}`} role="progressbar" aria-label={`${label} ${value}퍼센트, ${detail}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
    <div className="coverage-bar-label"><b>{label}</b><span>{value}%</span></div>
    <div className="coverage-bar-track"><i style={{ width: `${value}%` }} /></div>
    <small>{detail}</small>
  </div>;
}
function TabButton({ tabId, active, onClick, onKeyDown, label, icon }: { tabId: Tab; active: boolean; onClick: () => void; onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void; label: string; icon?: React.ReactNode }) { return <button id={`tab-${tabId}`} role="tab" aria-selected={active} aria-controls={`panel-${tabId}`} tabIndex={active ? 0 : -1} className={active ? "active" : ""} onClick={onClick} onKeyDown={onKeyDown}>{icon}{label}</button>; }
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label><span>{label}</span><input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>; }
function Range({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (value: number) => void }) { return <label className="range"><span>{label}<b>{value} {unit}</b></span><input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} /></label>; }

function SpotlightMedia({ menu, asset }: { menu: Menu; asset: MenuImageAsset | null }) {
  const brandLogo = BRAND_LOGOS[menu.brand];
  const exact = isExactMenuImage(asset);
  const alt = asset ? (exact ? `${menu.menu} 공식 제품 이미지` : `${asset.officialMenuName} 공식 대표 이미지, ${menu.menu} 메뉴에 연결`) : "";
  return <figure className={asset ? `spotlight-media verified${exact ? "" : " representative"}` : "spotlight-media unverified"}>
    <div className="spotlight-image-stage">
      {asset
        ? <Image src={asset.src} alt={alt} fill priority sizes="(max-width: 900px) 82vw, 360px" />
        : brandLogo
          ? <Image className="spotlight-brand-logo" src={brandLogo} alt="" width={132} height={132} />
          : <span className="spotlight-brand-fallback" aria-hidden="true">{menu.brand.slice(0, 1)}</span>}
    </div>
    <figcaption>
      {asset ? <><span><Check size={13} /> {exact ? "공식 제품 이미지" : "공식 제품군 대표 이미지"}</span><a href={asset.pageSourceUrl}>이미지 출처 <ExternalLink size={11} /></a><small>{exact ? `${MENU_IMAGE_MANIFEST.verifiedAt.slice(0, 10)} 확인` : `대표 제품: ${asset.officialMenuName}`}</small></> : <><span><AlertCircle size={13} /> 공식 제품 이미지 미확인</span><small>영양·알레르기 출처와 별도 상태입니다.</small></>}
    </figcaption>
  </figure>;
}

function MenuCardVisual({ menu, asset, onShow }: { menu: Menu; asset: MenuImageAsset | null; onShow: () => void }) {
  const brandLogo = BRAND_LOGOS[menu.brand];
  const exact = isExactMenuImage(asset);
  if (asset) return <button type="button" className={`menu-card-visual verified${exact ? "" : " representative"}`} onClick={onShow} aria-label={`${menu.menu} 제품을 추천 카드에서 크게 보기`}>
    <Image src={asset.src} alt={exact ? `${menu.menu} 공식 제품 이미지` : `${asset.officialMenuName} 공식 대표 이미지, ${menu.menu} 메뉴에 연결`} fill sizes="(max-width: 900px) calc(100vw - 66px), 36vw" />
    <span className="menu-visual-status"><Check size={13} /> {exact ? "공식 제품 이미지" : "공식 제품군 대표"}</span>
    <span className="menu-visual-action"><Maximize2 size={13} /> 크게 보기</span>
  </button>;
  return <div className="menu-card-visual unverified" aria-label={`${menu.menu} 공식 제품 이미지 미확인`}>
    {brandLogo ? <Image src={brandLogo} alt="" width={76} height={76} /> : <span className="menu-card-brand-fallback" aria-hidden="true">{menu.brand.slice(0, 1)}</span>}
    <span className="menu-visual-status"><AlertCircle size={13} /> 공식 제품 이미지 미확인</span>
  </div>;
}

function CartPanel({ items, setCart, totals, targetCalories }: { items: Array<{ menu: Menu; quantity: number }>; setCart: React.Dispatch<React.SetStateAction<Cart>>; totals: Record<string, number>; targetCalories: number }) {
  if (!items.length) return <section id="panel-cart" role="tabpanel" aria-labelledby="tab-cart" className="panel empty"><ShoppingCart size={36} /><h2>장바구니가 비어 있어요</h2><p>추천 메뉴에서 버거, 음료, 사이드를 조합해보세요.</p></section>;
  const standards = [{ name: "칼로리", value: totals.calories, max: targetCalories, unit: "kcal" }, { name: "단백질", value: totals.protein, max: 55, unit: "g" }, { name: "포화지방", value: totals.saturatedFat, max: 15, unit: "g" }, { name: "당류", value: totals.sugars, max: 100, unit: "g" }, { name: "나트륨", value: totals.sodium, max: 2000, unit: "mg" }];
  return <section id="panel-cart" role="tabpanel" aria-labelledby="tab-cart" className="panel"><div className="panel-head"><div><h2>내 장바구니 영양 계산</h2><p>수량을 바꾸면 합계가 즉시 계산돼요.</p></div><button className="danger" onClick={() => setCart({})}>전체 비우기</button></div>
    <div className="cart-price-summary"><span>공식 기준가 합계</span><b>{totals.priceKnownQuantity ? formatPrice(totals.priceKrw) : "확인 가능한 가격 없음"}</b><small>{totals.priceMissingQuantity ? `${totals.priceMissingQuantity}개 상품은 공식 단일 가격 미확인 · 실제 결제가는 매장·채널별로 달라질 수 있음` : "모든 상품은 공식 온라인 주문 기준가 · 실제 결제가는 달라질 수 있음"}</small></div>
    <div className="cart-list">{items.map(({ menu, quantity }) => <div className="cart-item" key={menu.id}><div><b>{menu.menu}</b><span>{menu.brand} · {menu.calories} kcal · {menu.priceKrw === null ? "가격 미확인" : formatPrice(menu.priceKrw)}</span></div><div className="quantity"><button aria-label={`${menu.menu} 수량 줄이기`} onClick={() => setCart((current) => ({ ...current, [menu.id]: Math.max(1, quantity - 1) }))}>−</button><b>{quantity}</b><button aria-label={`${menu.menu} 수량 늘리기`} onClick={() => setCart((current) => ({ ...current, [menu.id]: Math.min(10, quantity + 1) }))}>+</button></div><button className="icon-button" aria-label={`${menu.menu} 삭제`} onClick={() => setCart((current) => { const next = { ...current }; delete next[menu.id]; return next; })}><Trash2 size={18} /></button></div>)}</div>
    <div className="nutrition-summary">{standards.map((item) => <div key={item.name}><span>{item.name}<b>{item.value.toFixed(item.unit === "mg" || item.unit === "kcal" ? 0 : 1)}{item.unit}</b></span><div className="progress"><i className={item.value > item.max ? "over" : ""} style={{ width: `${Math.min(100, item.value / item.max * 100)}%` }} /></div><small>{item.max}{item.unit} 기준 · {(item.value / item.max * 100).toFixed(0)}%</small></div>)}</div>
  </section>;
}

function ComparePanel({ menus }: { menus: Menu[] }) {
  const [metric, setMetric] = useState<CompareMetric>("count");
  const [view, setView] = useState<CompareView>("brand");
  const [scatterBrand, setScatterBrand] = useState("전체 브랜드");
  const [selectedMenuId, setSelectedMenuId] = useState("");
  const configs: Record<CompareMetric, { label: string; unit: string; digits: number; description: string }> = {
    count: { label: "조건 통과 메뉴", unit: "개", digits: 0, description: "현재 알레르기·영양 조건을 통과한 메뉴 수" },
    coverage: { label: "알레르기 확인률", unit: "%", digits: 1, description: "현재 결과 중 공식 알레르기 표기를 확인한 행의 비율" },
    protein: { label: "단백질 중앙값", unit: "g", digits: 1, description: "현재 결과 메뉴의 브랜드별 단백질 중앙값" },
    sodium: { label: "나트륨 중앙값", unit: "mg", digits: 0, description: "현재 결과 메뉴의 브랜드별 나트륨 중앙값" },
  };
  const config = configs[metric];
  const brandOptions = Array.from(new Set(menus.map((menu) => menu.brand))).sort((a, b) => a.localeCompare(b, "ko"));
  const scatterMenus = menus.filter((menu) => scatterBrand === "전체 브랜드" || menu.brand === scatterBrand);
  const activeScatterMenu = scatterMenus.find((menu) => menu.id === selectedMenuId) || scatterMenus[0] || null;
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
    <div className="mode-switch compare-view-switch" aria-label="시각화 보기"><button aria-pressed={view === "brand"} className={view === "brand" ? "active" : ""} onClick={() => setView("brand")}>브랜드 요약</button><button aria-pressed={view === "menu"} className={view === "menu" ? "active" : ""} onClick={() => setView("menu")}>메뉴 분포</button></div>
    {view === "brand" && <>
      <div className="metric-switch" aria-label="비교 지표">{(Object.keys(configs) as CompareMetric[]).map((key) => <button key={key} aria-pressed={metric === key} className={metric === key ? "active" : ""} onClick={() => setMetric(key)}>{configs[key].label}</button>)}</div>
      {grouped.length ? <><figure className="chart-card" aria-labelledby="compare-chart-title"><figcaption id="compare-chart-title"><b>{config.label}</b><span>단위 {config.unit} · 0 기준 · 값 내림차순</span></figcaption><div className="chart"><ResponsiveContainer width="100%" height={Math.max(360, grouped.length * 46)}><BarChart data={grouped} layout="vertical" margin={{ left: 18, right: 34 }}><CartesianGrid stroke="#e2e2e7" horizontal={false} /><XAxis type="number" domain={[0, "auto"]} allowDecimals={metric !== "count" && metric !== "sodium"} tickLine={false} axisLine={false} /><YAxis type="category" dataKey="brand" width={92} tickLine={false} axisLine={false} /><Tooltip cursor={{ fill: "rgba(0,113,227,.05)" }} formatter={(value) => [`${Number(value).toLocaleString("ko-KR", { maximumFractionDigits: config.digits })}${config.unit}`, config.label]} /><Bar dataKey="value" name={config.label} fill="#0071e3" radius={[0, 7, 7, 0]} /></BarChart></ResponsiveContainer></div></figure><div className="table-scroll"><table className="data-table compare-table"><caption>차트의 정확한 값과 표본</caption><thead><tr><th>브랜드</th><th>{config.label}</th><th>표본</th><th>알레르기 확인</th></tr></thead><tbody>{grouped.map((row) => <tr key={row.brand}><td>{row.brand}</td><td>{row.value.toLocaleString("ko-KR", { maximumFractionDigits: config.digits })}{config.unit}</td><td>{row.rows}개</td><td>{row.known}/{row.rows}</td></tr>)}</tbody></table></div></> : <div className="empty"><h3>비교할 메뉴가 없습니다.</h3><p>추천 메뉴 탭에서 조건을 초기화하거나 범위를 넓혀보세요.</p></div>}
    </>}
    {view === "menu" && <>
      <div className="scatter-controls">
        <label><span>브랜드 범위</span><select value={scatterBrand} onChange={(event) => { setScatterBrand(event.target.value); setSelectedMenuId(""); }}><option>전체 브랜드</option>{brandOptions.map((brand) => <option key={brand}>{brand}</option>)}</select></label>
        <label><span>메뉴 상세 선택</span><select value={activeScatterMenu?.id || ""} onChange={(event) => setSelectedMenuId(event.target.value)} disabled={!scatterMenus.length}>{scatterMenus.map((menu) => <option value={menu.id} key={menu.id}>{menu.brand} · {menu.menu}</option>)}</select></label>
        <strong>{scatterMenus.length}개 점</strong>
      </div>
      {scatterMenus.length ? <><figure className="chart-card scatter-card" aria-labelledby="scatter-chart-title"><figcaption id="scatter-chart-title"><b>메뉴별 칼로리 × 단백질 분포</b><span>가로 kcal · 세로 단백질 g · 점을 눌러 상세 확인</span></figcaption><div className="chart"><ResponsiveContainer width="100%" height={430}><ScatterChart margin={{ top: 20, right: 24, bottom: 18, left: 8 }}><CartesianGrid stroke="#e2e2e7" strokeDasharray="3 3" /><XAxis type="number" dataKey="calories" name="칼로리" unit="kcal" domain={[0, "auto"]} tickLine={false} /><YAxis type="number" dataKey="protein" name="단백질" unit="g" domain={[0, "auto"]} tickLine={false} /><Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => { const point = payload?.[0]?.payload as Menu | undefined; return active && point ? <div className="chart-tooltip"><b>{point.menu}</b><span>{point.brand}</span><small>{point.calories.toFixed(0)}kcal · 단백질 {point.protein.toFixed(0)}g · 나트륨 {point.sodium.toFixed(0)}mg</small></div> : null; }} /><Scatter name="메뉴" data={scatterMenus} fill="#0071e3" fillOpacity={.58} onClick={(entry) => setSelectedMenuId((entry as unknown as Menu).id)} /></ScatterChart></ResponsiveContainer></div></figure>
        {activeScatterMenu && <article className="scatter-detail" aria-live="polite"><div><span>{activeScatterMenu.brand} · {activeScatterMenu.category}</span><h3>{activeScatterMenu.menu}</h3><p>점과 메뉴 선택 상자는 같은 상세 정보를 엽니다. 키보드로도 모든 메뉴를 선택할 수 있습니다.</p></div><dl><div><dt>칼로리</dt><dd>{activeScatterMenu.calories.toFixed(0)} kcal</dd></div><div><dt>단백질</dt><dd>{activeScatterMenu.protein.toFixed(0)} g</dd></div><div><dt>나트륨</dt><dd>{activeScatterMenu.sodium.toFixed(0)} mg</dd></div></dl><a href={activeScatterMenu.allergySourceUrl || activeScatterMenu.sourceUrl}><ExternalLink size={14} /> 공식 정보 확인</a></article>}</> : <div className="empty"><h3>표시할 메뉴가 없습니다.</h3><p>브랜드 범위를 전체로 바꾸거나 조건을 넓혀보세요.</p></div>}
    </>}
  </section>;
}

function AboutPanel({ menus, quality, qualityError }: { menus: Menu[]; quality: QualityReport | null; qualityError: string }) {
  const exactImageCount = MENU_IMAGE_MANIFEST.items.filter((item) => item.matchMethod === "normalized_exact" || item.matchMethod === "high_confidence_name").length;
  const uniqueImageCount = new Set(MENU_IMAGE_MANIFEST.items.map((item) => item.src)).size;
  const rows = Array.from(new Set(menus.map((menu) => menu.brand))).map((brand) => {
    const items = menus.filter((menu) => menu.brand === brand);
    const known = items.filter((menu) => menu.allergenKnown).length;
    const priced = items.filter((menu) => menu.priceKrw !== null).length;
    return { brand, count: items.length, known, priced, rate: Math.round(known / items.length * 100), date: items.reduce((latest, menu) => menu.sourceDate > latest ? menu.sourceDate : latest, ""), source: items[0]?.sourceUrl };
  }).sort((a, b) => b.count - a.count);
  const summary = quality?.summary;
  return <section id="panel-about" role="tabpanel" aria-labelledby="tab-about" className="panel prose about-panel">
    <div className="about-hero"><span className="section-kicker">EVIDENCE, NOT A SCORE</span><h2>평가 기준을 결과물 안에서 증명합니다.</h2><p>점수를 꾸미지 않고, 공식 출처·자동 검증·인터랙션·실제 배포로 확인 가능한 근거를 남겼습니다.</p></div>
    {qualityError && <div className="inline-error" role="status"><AlertCircle size={18} /> 메뉴 탐색은 사용할 수 있지만 품질 요약을 불러오지 못했습니다: {qualityError}</div>}
    <div className="evidence-grid">
      <article><span>01 · 데이터·주제</span><b>{summary ? `${summary.rows}행 · ${summary.brands}브랜드` : `${menus.length}행`}</b><p>공식 API·HTML·공식 이미지에서 수집하고 출처 URL, 기준일, 수집법을 행 단위로 보존했습니다.</p><small>{summary ? `검증 ${summary.verified_rows}/${summary.rows} · 오류 ${summary.errors} · 중복 ${summary.duplicate_brand_menu}` : "품질 보고서 확인 중"}</small></article>
      <article><span>02 · 시각화 완성도</span><b>{MENU_IMAGE_MANIFEST.coverage.mapped}개 메뉴 이미지</b><p>모든 메뉴 카드에서 사진 확대·추천 전환·장바구니 연결이 동작하며, 정확 사진과 제품군 대표 사진을 구분합니다.</p><small>정확 일치 {exactImageCount}개 · 공식 최적화 자산 {uniqueImageCount}개 · 차트 키보드 대안</small></article>
      <article><span>03 · 웹 구현·배포</span><b>Vercel Preview 배포</b><p>Next.js 반응형 UI, 오류·빈 상태, 키보드 탭 이동, 안정적인 장바구니 저장을 구현했습니다.</p><small>Production 반영은 PR 병합 뒤 · 카카오 상태 별도 공개</small></article>
      <article><span>04 · AI 활용·발표</span><b>4단계 검증 루프</b><p>AI가 구조 분석·수집기 보완·코드 구현·검증을 보조하고, 공식 원문과 Chrome 결과를 사람이 확인했습니다.</p><small>분석 → 대안 → 적용 → 브라우저 QA</small></article>
    </div>
    <div className="notice"><b>안전 안내</b><p>공식 알레르기 정보가 미표기된 메뉴는 알레르기 필터를 선택하면 추천에서 제외합니다. ‘미표기’를 ‘없음’으로 해석하지 않습니다. 심한 알레르기가 있다면 주문 전 공식 원문과 매장에 다시 확인하세요.</p></div>
    <section className="method-stage"><div><span className="section-kicker">AI + HUMAN VERIFICATION</span><h3>구현 과정도 재현 가능하게.</h3><p>AI는 반복 수집과 코드·QA 보조에 사용했고, 최종 사실 판단은 공식 자료와 실제 브라우저 결과로 검증했습니다.</p></div><ol><li><b>구조 파악</b><span>기존 앱·CSV·배포 경로와 실패 지점을 감사</span></li><li><b>공식 자료 수집</b><span>브랜드 공개 자료만 파싱하고 원문 URL·확인일 기록</span></li><li><b>자동 검증</b><span>스키마·범위·중복·날짜·미러 해시·빌드를 CI에서 검사</span></li><li><b>사람의 확인</b><span>Chrome에서 필터·차트·반응형·Vercel 배포를 직접 확인</span></li></ol></section>
    <div className="data-section-head"><div><h3>수집 범위와 최신성</h3><p>기준일은 공식 표기일이 없을 때 수집 확인일을 사용하며, 유형을 데이터에 함께 기록합니다.</p></div>{quality && <span className={quality.status === "pass" ? "quality-pass" : "quality-fail"}>{quality.status.toUpperCase()} · {quality.mirror.identical ? "CSV 일치" : "CSV 확인 필요"}</span>}</div>
    <div className="table-scroll"><table className="data-table"><thead><tr><th>브랜드</th><th>메뉴 수</th><th>알레르기 확인</th><th>가격 확인</th><th>최신 기준일</th><th>출처</th></tr></thead><tbody>{rows.map((row) => <tr key={row.brand}><td>{row.brand}</td><td>{row.count}</td><td>{row.known}/{row.count} ({row.rate}%)</td><td>{row.priced}/{row.count}</td><td>{row.date}</td><td><a href={row.source}>공식 원문</a></td></tr>)}</tbody></table></div>
    <div className="caveat-grid"><p><b>현재 한계</b><br />파리바게뜨는 공식 형식으로 확인된 1개 행만 포함합니다. 스타벅스·써브웨이의 알레르기 정보는 미확인으로 분리해 필터 선택 시 제외합니다.</p><p><b>영양 필드 의미</b><br />공식 라벨의 포화지방과 당류를 표시합니다. 제품 구성과 수치는 브랜드 업데이트에 따라 달라질 수 있습니다.</p><p><b>가격·매장 데이터</b><br />가격은 BBQ 공식 온라인 주문 기준가가 확인된 행만 표시하며 매장·지역·채널에 따라 달라질 수 있습니다. 주변 매장 검색은 Kakao 키 연결 시 활성화됩니다.</p></div>
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
      return { status: "error", rest: false, javascript: false, message: error instanceof Error ? error.message : "배포 상태를 확인하지 못했습니다." };
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void readIntegration(controller.signal).then((next) => { if (!controller.signal.aborted) setIntegration(next); }).catch(() => undefined);
    return () => controller.abort();
  }, [readIntegration]);

  const restUnavailable = !integration.rest;
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
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const place = { id: "gps", name: "현재 위치", address: `정확도 약 ${Math.round(position.coords.accuracy)}m`, lat: position.coords.latitude, lon: position.coords.longitude };
        if (restUnavailable || !brands.length) {
          setCenter(place); setStores([]); setSearchedRadius(null); setSearchedBrands("");
          setMapError(restUnavailable
            ? "현재 위치는 지도에 표시했습니다. 주변 프랜차이즈 검색은 Kakao REST API 키를 연결하면 활성화됩니다."
            : "현재 위치는 지도에 표시했습니다. 주변 매장을 찾으려면 브랜드를 한 개 이상 선택해 주세요.");
          return;
        }
        void findStores(place);
      },
      () => setMapError("브라우저 위치 권한이 필요합니다. 장소 검색을 이용하거나 권한을 허용해 주세요."),
      { enableHighAccuracy: true },
    );
  };
  const resultsStale = Boolean(center && (searchedRadius !== radius || searchedBrands !== brandSignature));
  const searchDisabled = integration.status === "checking" || restUnavailable || !brands.length;
  const gpsDisabled = integration.status === "checking";
  const activeCenter = center ?? DEFAULT_MAP_CENTER;

  return <section id="panel-map" role="tabpanel" aria-labelledby="tab-map" className="panel"><div className="panel-head map-panel-head"><div><h2>내 주변 매장</h2><p>카카오맵에서 선택한 {brands.length}개 브랜드의 매장을 찾아요.</p></div><label className="radius-slider"><span>검색 반경 <b>{radius} km</b></span><input aria-label="매장 검색 반경" type="range" min="1" max="10" step="1" value={radius} onChange={(e) => setRadius(Number(e.target.value))} /><small><i>1km</i><i>10km</i></small></label></div>
    <div className={`map-integration-status ${integration.status}`} role="status"><span aria-hidden="true">{integration.status === "ready" ? "✓" : "!"}</span><div><b>{integration.status === "ready" ? "카카오 지도 연결 준비 완료" : "지도 미리보기 사용 가능"}</b><small>{integration.status === "incomplete" ? `${integration.message}. 현재 위치와 대체 지도는 바로 사용할 수 있습니다.` : integration.message}</small></div>{integration.status === "error" && <button onClick={() => { setIntegration((current) => ({ ...current, status: "checking", message: "카카오 연결 상태를 확인하고 있어요…" })); void readIntegration().then(setIntegration); }}>다시 확인</button>}</div>
    {!brands.length && <div className="inline-error" role="alert"><AlertCircle size={18} /> 내 조건에서 주변 매장을 찾을 브랜드를 한 개 이상 선택해 주세요.</div>}
    <div className="mode-switch"><button aria-pressed={mode === "search"} className={mode === "search" ? "active" : ""} onClick={() => setMode("search")}><Search size={17} />장소 검색</button><button disabled={gpsDisabled} aria-pressed={mode === "gps"} className={mode === "gps" ? "active" : ""} onClick={() => { setMode("gps"); locate(); }}><LocateFixed size={17} />현재 위치</button></div>
    {mode === "search" && <div className="location-search"><label className="search"><Search size={18} /><input disabled={searchDisabled} aria-label="장소 검색" value={term} onChange={(e) => { const value = e.target.value; setTerm(value); if (value.trim().length < 2) { setPlaces([]); setMapError(""); } }} placeholder={restUnavailable ? "Kakao REST 키 연결 후 장소 검색 가능" : "성수역, 서울시청처럼 입력하세요"} /></label>{places.length > 0 && <div className="suggestions" aria-label="장소 검색 결과">{places.map((place) => <button key={place.id} onClick={() => { setTerm(place.name); setPlaces([]); void findStores(place); }}><MapPin size={17} /><span><b>{place.name}</b><small>{place.address}</small></span></button>)}</div>}</div>}
    {mapError && <div className="inline-error" role="alert"><AlertCircle size={18} /> {mapError}</div>}
    {loading && <div className="map-loading" role="status">주변 매장을 찾고 있어요…</div>}
    <KakaoMap center={activeCenter} radiusKm={searchedRadius ?? radius} stores={center ? stores : []} />
    <div className="store-summary"><b>{activeCenter.name}</b> · {center ? `${searchedRadius ?? radius}km 기준 ${stores.length}개 매장` : "기본 지도 미리보기"}</div>
    {center && <>{resultsStale && !restUnavailable && <div className="map-stale" role="status"><span>반경 또는 브랜드 조건이 바뀌었습니다. 현재 지도는 이전 검색 결과입니다.</span><button onClick={() => void findStores(center)} disabled={loading}>변경 조건으로 다시 검색</button></div>}{!stores.length && !loading && <div className="empty compact-empty">{restUnavailable ? "지도 위치는 확인할 수 있습니다. Kakao REST 키를 연결하면 선택한 반경의 프랜차이즈 매장 목록도 표시됩니다." : "선택한 반경에서 확인된 매장이 없습니다. 반경이나 브랜드를 바꿔보세요."}</div>}<div className="store-list">{stores.slice(0, 20).map((store) => { const logo = BRAND_LOGOS[store.brand]; const content = <>{logo ? <Image src={logo} alt="" width={34} height={34} /> : <span className="store-logo-fallback" aria-hidden="true">{store.brand.slice(0, 1)}</span>}<span><b>{store.name}</b><small>{store.distance.toFixed(2)}km · 도보 약 {Math.ceil(store.distance * 1.25 / 4.5 * 60)}분 · {store.address}</small></span></>; return store.placeUrl ? <a href={store.placeUrl} key={store.id}>{content}</a> : <div className="store-list-item" key={store.id}>{content}</div>; })}</div></>}
  </section>;
}
