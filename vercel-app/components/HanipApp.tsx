"use client";

import Image from "next/image";
import Papa from "papaparse";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Check, ChevronLeft, ChevronRight, Languages, LocateFixed, MapPin, Menu as MenuIcon, Search, SlidersHorizontal, Trash2, UtensilsCrossed, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ALLERGENS, BRAND_CATEGORIES, BRAND_CATEGORY_ORDER, BRAND_COLORS, BRAND_DISPLAY_ORDER_BY_CATEGORY, BRAND_LOGOS } from "@/lib/brands";
import { mergeAdminPrices } from "@/lib/merge-admin-prices";
import { inferMenuSection, menuSectionRank as catalogSectionRank } from "@/lib/menu-catalog";
import { allergenLabel, categoryLabel, formatNumber, formatPrice, menuSectionLabel, tr, type Language } from "@/lib/i18n";
import type { Menu, Place, PriceRecord, Store } from "@/lib/types";
import KakaoMap from "./KakaoMap";
import { FloatingFoodHero, type FloatingFoodImage } from "./ui/floating-food-hero";

type Tab = "menus" | "cart" | "map" | "compare" | "about";
type Cart = Record<number, number>;

function normalizeCart(value: unknown): Cart {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.entries(value as Record<string, unknown>).reduce<Cart>((next, [rawId, rawValue]) => {
    const id = Number(rawId);
    const legacyQuantity = rawValue && typeof rawValue === "object" && "quantity" in rawValue
      ? (rawValue as { quantity?: unknown }).quantity
      : rawValue;
    const quantity = Number(legacyQuantity);

    if (Number.isInteger(id) && Number.isFinite(quantity) && quantity > 0) {
      next[id] = Math.min(10, Math.floor(quantity));
    }
    return next;
  }, {});
}
type SafetyMode = "all" | "danger" | "safe";
type SortMode = "recommended" | "protein" | "calories" | "sodium";
type NutritionRange = [number, number];
const parseNumber = (value: unknown) => Number(value || 0);
const hasNumericValue = (value: unknown) => {
  if (value === null || value === undefined) return false;
  const normalized = String(value).replace(/,/g, "").trim();
  return normalized !== "" && Number.isFinite(Number(normalized));
};
const calorieLabel = (menu: Menu, language: Language) => menu.caloriesKnown ? `${menu.calories.toFixed(0)} kcal` : tr(language, "칼로리 정보 없음", "Calories unavailable");
const BRAND_ALIASES: Record<string, string> = {
  "서브웨이": "써브웨이",
  "베스킨라빈스": "배스킨라빈스",
  "파리바게트": "파리바게뜨",
};
const normalizeBrand = (brand: string) => BRAND_ALIASES[brand?.trim()] || brand?.trim();
const mealFactor: Record<string, number> = { "감량": .8, "유지": 1, "증량": 1.12 };
const EXCLUDED_BRANDS = new Set(["스타벅스"]);
const roundedLimit = (values: number[], step: number, fallback: number) => Math.max(fallback, Math.ceil(Math.max(...values, 0) / step) * step);
const matchesNutritionRange = (value: number, known: boolean, [minimum, maximum]: NutritionRange, limit: number) => known
  ? value >= minimum && value <= maximum
  : minimum === 0 && maximum === limit;
const HERO_IMAGES: FloatingFoodImage[] = [
  { src: "/images/wellness-salad-hero.png", alt: "", position: "salad" },
  { src: "/images/wellness-yogurt-hero.png", alt: "", position: "yogurt" },
  { src: "/images/wellness-toast-hero.png", alt: "", position: "toast" },
  { src: "/images/floating-chicken-hero-v2.png", alt: "", position: "hero-chicken" },
  { src: "/images/floating-burger-hero-v2.png", alt: "", position: "hero-burger" },
  { src: "/images/floating-pizza-hero-v2.png", alt: "", position: "hero-pizza" },
];
const NUTRIENT_FILTER_COUNT = 10;

const menuSection = inferMenuSection;
function menuSectionRank(_brand: string, section: string) { return catalogSectionRank(section); }
function compareBrandDisplayOrder(category: string, a: string, b: string) {
  const displayOrder = BRAND_DISPLAY_ORDER_BY_CATEGORY[category] || [];
  const aRank = displayOrder.indexOf(a);
  const bRank = displayOrder.indexOf(b);
  return (aRank < 0 ? Number.MAX_SAFE_INTEGER : aRank) - (bRank < 0 ? Number.MAX_SAFE_INTEGER : bRank)
    || a.localeCompare(b, "ko");
}
function menuName(menu: Menu, language: Language) { return language === "en" ? menu.menuEn || menu.menu : menu.menu; }
function menuDescription(menu: Menu, language: Language) {
  const description = language === "en" ? menu.descriptionEn || menu.description : menu.description;
  if (description) return description.length > 72 ? `${description.slice(0, 72).trim()}…` : description;
  return "";
}

function MenuDescription({ menu, language }: { menu: Menu; language: Language }) {
  const [expanded, setExpanded] = useState(false);
  const description = language === "en" ? menu.descriptionEn || menu.description : menu.description;
  if (!description) return null;
  const isLong = description.length > 72;
  const text = expanded || !isLong ? description : menuDescription(menu, language);
  return <div className="menu-description" title={description}>{text}{isLong && <button className="description-more" onClick={() => setExpanded((current) => !current)}>{expanded ? tr(language, "접기", "Less") : tr(language, "더보기", "More")}</button>}</div>;
}

function MenuNutrition({ menu, language }: { menu: Menu; language: Language }) {
  const facts = [
    { key: "calories", known: menu.caloriesKnown, label: tr(language, "열량", "Calories"), value: `${menu.calories.toFixed(0)} kcal` },
    { key: "protein", known: menu.proteinKnown, label: tr(language, "단백질", "Protein"), value: `${menu.protein.toFixed(1)} g` },
    { key: "sat-fat", known: menu.fatKnown, label: tr(language, "포화지방", "Saturated fat"), value: `${menu.fat.toFixed(1)} g` },
    { key: "sugars", known: menu.carbsKnown, label: tr(language, "당류", "Sugars"), value: `${menu.carbs.toFixed(1)} g` },
    { key: "sodium", known: menu.sodiumKnown, label: tr(language, "나트륨", "Sodium"), value: `${menu.sodium.toFixed(0)} mg` },
    { key: "total-carbs", known: menu.totalCarbsKnown, label: tr(language, "총탄수화물", "Total carbs"), value: `${menu.totalCarbs.toFixed(1)} g` },
    { key: "total-fat", known: menu.totalFatKnown, label: tr(language, "총지방", "Total fat"), value: `${menu.totalFat.toFixed(1)} g` },
    { key: "trans-fat", known: menu.transFatKnown, label: tr(language, "트랜스지방", "Trans fat"), value: `${menu.transFat.toFixed(1)} g` },
    { key: "cholesterol", known: menu.cholesterolKnown, label: tr(language, "콜레스테롤", "Cholesterol"), value: `${menu.cholesterol.toFixed(1)} mg` },
    { key: "caffeine", known: menu.caffeineKnown, label: tr(language, "카페인", "Caffeine"), value: `${menu.caffeine.toFixed(1)} mg` },
  ].filter((fact) => fact.known);

  const basis = nutritionBasisLabel(menu, language);
  const weight = menu.weightText || (menu.weight ? `${formatNumber(language, menu.weight)} g` : "");
  const metadata = (basis || weight) && <div className="nutrition-metadata">{basis && <span><small>{tr(language, "영양정보 기준", "Nutrition basis")}</small><b>{basis}</b></span>}{weight && <span><small>{tr(language, "총중량·표기중량", "Listed weight")}</small><b>{weight}</b></span>}</div>;

  if (!facts.length) return <>{metadata}<p className="nutrition-unavailable">{tr(language, "확인된 영양성분 정보가 없어요.", "No confirmed nutrition data available.")}</p></>;
  return <>{metadata}<div className="menu-nutrition">{facts.map((fact) => <span key={fact.key}><small>{fact.label}</small><b>{fact.value}</b></span>)}</div></>;
}

function nutritionBasisLabel(menu: Menu, language: Language) {
  const basis = menu.nutritionBasis || menu.nutritionServingText || "";
  if (!basis || language === "ko") return basis;
  const pieceMatch = basis.match(/판매\s*(\d+)조각\s*기준/);
  if (pieceMatch) return `Per ${pieceMatch[1]} sold pieces`;
  if (/100\s*g/i.test(basis)) return "Per 100 g";
  if (/1\s*조각|한\s*조각/.test(basis)) return "Per piece";
  if (/제공량/.test(basis)) return "Per serving";
  if (/세트/.test(basis)) return "Whole set";
  if (/총량|전체/.test(basis)) return "Whole item";
  return "As published";
}

function servingLabel(menu: Menu, language: Language) {
  if (menu.brand === "써브웨이" && menuSection(menu) === "샌드위치") return tr(language, "15cm · 기본 레시피 기준", "15 cm · Standard recipe");
  if (menu.brand === "배스킨라빈스") return tr(language, "싱글레귤러 115g 기준", "Single Regular · 115 g");
  return "";
}

function BrandLogo({ brand, size = 44, language = "ko" }: { brand: string; size?: number; language?: Language }) {
  const logo = BRAND_LOGOS[brand];
  if (logo) return <Image src={logo} alt={`${brand} ${tr(language, "로고", "logo")}`} width={size} height={size} />;
  const color = BRAND_COLORS[brand] || "#287653";
  return (
    <span
      className="brand-initial"
      style={{
        width: size,
        height: size,
        color,
        borderColor: color,
        background: `color-mix(in srgb, ${color} 10%, white)`
      }}
      aria-label={`${brand} ${tr(language, "대표색 배지", "brand color badge")}`}
    >
      {brand.slice(0, 2)}
    </span>
  );
}

function brandFallbackImage(brand: string) {
  if (BRAND_LOGOS[brand]) return BRAND_LOGOS[brand];
  const label = encodeURIComponent(brand.slice(0, 2));
  return `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Crect width='180' height='180' rx='36' fill='%23edf3eb'/%3E%3Ctext x='90' y='104' text-anchor='middle' font-family='Arial,sans-serif' font-size='48' font-weight='700' fill='%23287653'%3E${label}%3C/text%3E%3C/svg%3E`;
}

export default function HanipApp() {
  const [language, setLanguage] = useState<Language>("ko");
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
  const tabContentRef = useRef<HTMLDivElement>(null);
  const brandMenuRef = useRef<HTMLDivElement>(null);
  const menuGridRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recommended");
  const [menuSectionFilter, setMenuSectionFilter] = useState("전체");
  // 각 영양성분의 최소·최대 범위를 함께 관리한다. 초기 범위는 전체 데이터를 포함한다.
  const [calorieRange, setCalorieRange] = useState<NutritionRange>([0, 3700]);
  const [proteinRange, setProteinRange] = useState<NutritionRange>([0, 120]);
  const [fatRange, setFatRange] = useState<NutritionRange>([0, 130]);
  const [sugarRange, setSugarRange] = useState<NutritionRange>([0, 240]);
  const [sodiumRange, setSodiumRange] = useState<NutritionRange>([0, 5000]);
  const [totalCarbsRange, setTotalCarbsRange] = useState<NutritionRange>([0, 200]);
  const [totalFatRange, setTotalFatRange] = useState<NutritionRange>([0, 100]);
  const [transFatRange, setTransFatRange] = useState<NutritionRange>([0, 2]);
  const [cholesterolRange, setCholesterolRange] = useState<NutritionRange>([0, 500]);
  const [caffeineRange, setCaffeineRange] = useState<NutritionRange>([0, 1000]);
  const [profileOn, setProfileOn] = useState(false);
  const [profile, setProfile] = useState({ sex: "여성", age: 25, height: 165, weight: 60, goal: "감량" });
  const [openBrands, setOpenBrands] = useState<Record<string, boolean>>({});
  const [cart, setCart] = useState<Cart>({});
  const [added, setAdded] = useState<{ id: number; nonce: number } | null>(null);
  const [detailSelection, setDetailSelection] = useState<number[]>([]);
  const [mealFlight, setMealFlight] = useState<{ x: number; y: number; dx: number; dy: number; nonce: number } | null>(null);

  useEffect(() => {
    const savedLanguage = localStorage.getItem("hanip-language");
    if (savedLanguage === "ko" || savedLanguage === "en") setLanguage(savedLanguage);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    Promise.all([
      fetch("/data/menus.csv").then((response) => response.text()),
      fetch("/api/prices", { cache: "no-store" })
        .then((response) => response.ok ? response.json() as Promise<PriceRecord[]> : [])
        .catch(() => [] as PriceRecord[]),
    ]).then(([csv, managedPrices]) => {
      const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data;
      const data = parsed.map((row, id) => {
        const flagColumnsPresent = ALLERGENS.some((allergen) => `al_${allergen}` in row);
        const flaggedAllergens = ALLERGENS.filter(
          (allergen) => row[`al_${allergen}`]?.trim().toLowerCase() === "true",
        );
        const listedAllergens = (row.allergens || "")
          .split(/[|,]/)
          .map((item) => item.trim())
          .filter(Boolean);
        const explicitAllergenKnown = row.allergen_known?.trim().toLowerCase();

        return {
          id, brand: normalizeBrand(row.brand), brandEn: row.brand_en || "", menu: row.menu, menuEn: row.menu_en || "", category: row.category,
          yogiyoCategory: row.yogiyo_category || "",
          calories: parseNumber(row.calories), caloriesKnown: hasNumericValue(row.calories),
          protein: parseNumber(row.protein), proteinKnown: hasNumericValue(row.protein), fat: parseNumber(row.fat), fatKnown: hasNumericValue(row.fat),
          carbs: parseNumber(row.carbs), carbsKnown: hasNumericValue(row.carbs), sodium: parseNumber(row.sodium), sodiumKnown: hasNumericValue(row.sodium),
          totalCarbs: parseNumber(row.total_carbs_g), totalCarbsKnown: hasNumericValue(row.total_carbs_g),
          totalFat: parseNumber(row.total_fat_g), totalFatKnown: hasNumericValue(row.total_fat_g),
          transFat: parseNumber(row.trans_fat_g), transFatKnown: hasNumericValue(row.trans_fat_g),
          cholesterol: parseNumber(row.cholesterol_mg), cholesterolKnown: hasNumericValue(row.cholesterol_mg),
          caffeine: parseNumber(row.caffeine_mg), caffeineKnown: hasNumericValue(row.caffeine_mg),
          nutritionMatch: row._nutrition_match || "",
          nutritionBasis: row.nutrition_basis || "", nutritionServingText: row.nutrition_serving_text || "",
          weight: row.weight_g ? parseNumber(row.weight_g) : undefined, weightText: row.weight_text || "",
          allergens: flagColumnsPresent ? flaggedAllergens : listedAllergens,
          allergenKnown: explicitAllergenKnown
            ? explicitAllergenKnown === "true"
            : flagColumnsPresent,
          verified: row.verified?.trim().toLowerCase() === "true",
          sourceUrl: row.source_url,
          imageUrl: row.image_url || "", description: row.description || "", descriptionEn: row.description_en || "",
          price: row.price ? parseNumber(row.price) : undefined, priceNote: row.price_note || "매장별 확인",
          priceSourceUrl: row.price_source_url || "", priceCheckedAt: row.price_checked_at || "",
          mediaSourceUrl: row.media_source_url || "", mediaCheckedAt: row.media_checked_at || ""
        };
      });
      const merged = mergeAdminPrices(data, managedPrices).filter((menu) => !EXCLUDED_BRANDS.has(menu.brand));
      setMenus(merged);
      setBrands(Array.from(new Set(data.map((menu) => menu.brand).filter((brand) => !EXCLUDED_BRANDS.has(brand)))));
    });
    const saved = localStorage.getItem("hanip-cart");
    if (saved) {
      try {
        const normalized = normalizeCart(JSON.parse(saved));
        setCart(normalized);
        localStorage.setItem("hanip-cart", JSON.stringify(normalized));
      } catch {
        localStorage.removeItem("hanip-cart");
      }
    }
  }, []);

  useEffect(() => { localStorage.setItem("hanip-cart", JSON.stringify(cart)); }, [cart]);

  useEffect(() => {
    if (!allergens.length && safetyMode !== "all") setSafetyMode("all");
  }, [allergens.length, safetyMode]);

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

  // 실제 최종 데이터셋에 메뉴가 있는 브랜드만 노출한다. 관리자 가격만 있는 임시 항목은 목록을 늘리지 않는다.
  const brandOptions = useMemo(() => Array.from(new Set(menus.filter((menu) => !menu.catalogOnly).map((menu) => menu.brand))), [menus]);
  const brandEnglishNames = useMemo(() => Object.fromEntries(menus.flatMap((menu) => menu.brandEn ? [[menu.brand, menu.brandEn]] : [])), [menus]);
  const displayBrand = (brand: string) => language === "en" ? brandEnglishNames[brand] || brand : brand;
  const displayedBrandOptions = useMemo(() => brandOptions
    .filter((brand) => brandCategory === "전체" || BRAND_CATEGORIES[brand]?.includes(brandCategory))
    .sort((a, b) => compareBrandDisplayOrder(brandCategory, a, b)), [brandOptions, brandCategory]);
  const targetCalories = useMemo(() => {
    const bmr = profile.sex === "남성"
      ? 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5
      : 10 * profile.weight + 6.25 * profile.height - 5 * profile.age - 161;
    return Math.round(bmr * 1.35 * mealFactor[profile.goal]);
  }, [profile]);
  const dataMenus = useMemo(() => menus.filter((menu) => !menu.catalogOnly), [menus]);
  // 새 CSV가 들어와도 슬라이더 상한과 기본값이 실제 데이터 범위를 항상 포함하도록 계산한다.
  const nutritionLimits = useMemo(() => ({
    calories: roundedLimit(dataMenus.filter((menu) => menu.caloriesKnown).map((menu) => menu.calories), 100, 1200),
    protein: roundedLimit(dataMenus.filter((menu) => menu.proteinKnown).map((menu) => menu.protein), 5, 60),
    fat: roundedLimit(dataMenus.filter((menu) => menu.fatKnown).map((menu) => menu.fat), 10, 50),
    carbs: roundedLimit(dataMenus.filter((menu) => menu.carbsKnown).map((menu) => menu.carbs), 10, 100),
    sodium: roundedLimit(dataMenus.filter((menu) => menu.sodiumKnown).map((menu) => menu.sodium), 250, 2000),
    totalCarbs: roundedLimit(dataMenus.filter((menu) => menu.totalCarbsKnown).map((menu) => menu.totalCarbs), 10, 200),
    totalFat: roundedLimit(dataMenus.filter((menu) => menu.totalFatKnown).map((menu) => menu.totalFat), 10, 100),
    transFat: roundedLimit(dataMenus.filter((menu) => menu.transFatKnown).map((menu) => menu.transFat), .1, 2),
    cholesterol: roundedLimit(dataMenus.filter((menu) => menu.cholesterolKnown).map((menu) => menu.cholesterol), 50, 500),
    caffeine: roundedLimit(dataMenus.filter((menu) => menu.caffeineKnown).map((menu) => menu.caffeine), 50, 600),
  }), [dataMenus]);

  const compareMenus = (a: Menu, b: Menu) => {
    if (sortMode === "protein") return b.protein - a.protein;
    if (sortMode === "calories") return Number(b.caloriesKnown) - Number(a.caloriesKnown) || a.calories - b.calories;
    if (sortMode === "sodium") return a.sodium - b.sodium;

    const brandPriority = Number(a.brand === "백억커피") - Number(b.brand === "백억커피");
    if (brandPriority) return brandPriority;
    return profileOn
      ? Number(b.caloriesKnown) - Number(a.caloriesKnown) || Math.abs(a.calories - targetCalories * .32) - Math.abs(b.calories - targetCalories * .32) || b.protein - a.protein
      : b.protein - a.protein;
  };
  const filtered = useMemo(() => menus.filter((menu) => {
    const danger = allergens.length > 0 && allergens.some((item) => menu.allergens.includes(item));
    const safetyMatch = safetyMode === "all" || (safetyMode === "danger" ? danger : menu.allergenKnown && !danger);
    const categoryMatch = brandCategory === "전체" || BRAND_CATEGORIES[menu.brand]?.includes(brandCategory);
    const nutritionMatch = menu.catalogOnly || (
      matchesNutritionRange(menu.calories, menu.caloriesKnown, calorieRange, nutritionLimits.calories)
      && matchesNutritionRange(menu.protein, menu.proteinKnown, proteinRange, nutritionLimits.protein)
      && matchesNutritionRange(menu.fat, menu.fatKnown, fatRange, nutritionLimits.fat)
      && matchesNutritionRange(menu.carbs, menu.carbsKnown, sugarRange, nutritionLimits.carbs)
      && matchesNutritionRange(menu.sodium, menu.sodiumKnown, sodiumRange, nutritionLimits.sodium)
      && matchesNutritionRange(menu.totalCarbs, menu.totalCarbsKnown, totalCarbsRange, nutritionLimits.totalCarbs)
      && matchesNutritionRange(menu.totalFat, menu.totalFatKnown, totalFatRange, nutritionLimits.totalFat)
      && matchesNutritionRange(menu.transFat, menu.transFatKnown, transFatRange, nutritionLimits.transFat)
      && matchesNutritionRange(menu.cholesterol, menu.cholesterolKnown, cholesterolRange, nutritionLimits.cholesterol)
      && matchesNutritionRange(menu.caffeine, menu.caffeineKnown, caffeineRange, nutritionLimits.caffeine)
    );
    return brands.includes(menu.brand) && categoryMatch && safetyMatch && nutritionMatch
      && (!query.trim() || menu.brand.toLowerCase().includes(query.trim().toLowerCase()) || menu.menu.toLowerCase().includes(query.trim().toLowerCase()) || menu.menuEn?.toLowerCase().includes(query.trim().toLowerCase()));
  }).sort(compareMenus), [menus, allergens, brands, brandCategory, safetyMode, calorieRange, proteinRange, fatRange, sugarRange, sodiumRange, totalCarbsRange, totalFatRange, transFatRange, cholesterolRange, caffeineRange, nutritionLimits, query, profileOn, targetCalories, sortMode]);

  const grouped = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return brandOptions
      .filter((brand) => brands.includes(brand))
      .filter((brand) => brandCategory === "전체" || BRAND_CATEGORIES[brand]?.includes(brandCategory))
      .map((brand) => [brand, filtered.filter((menu) => menu.brand === brand).sort(compareMenus)] as [string, Menu[]])
      .filter(([brand, items]) => !normalizedQuery || brand.toLowerCase().includes(normalizedQuery) || items.length > 0)
      .sort(([brandA], [brandB]) => compareBrandDisplayOrder(brandCategory, brandA, brandB));
  }, [brandOptions, brands, brandCategory, filtered, query, sortMode, profileOn, targetCalories]);
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
  const menuById = useMemo(() => new Map(menus.map((menu) => [menu.id, menu])), [menus]);
  const cartItems = useMemo(() => Object.entries(cart).flatMap(([id, quantity]) => {
    const menu = menuById.get(Number(id)); return menu ? [{ menu, quantity }] : [];
  }), [cart, menuById]);
  const cartMenuIds = useMemo(() => cartItems.map(({ menu }) => menu.id), [cartItems]);
  useEffect(() => {
    setDetailSelection(cartMenuIds.slice(0, 4));
  }, [cartMenuIds]);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totals = cartItems.reduce((sum, { menu, quantity }) => ({
    calories: sum.calories + menu.calories * quantity, protein: sum.protein + menu.protein * quantity,
    fat: sum.fat + menu.fat * quantity, carbs: sum.carbs + menu.carbs * quantity, sodium: sum.sodium + menu.sodium * quantity
  }), { calories: 0, protein: 0, fat: 0, carbs: 0, sodium: 0 });

  useEffect(() => {
    if (!dataMenus.length) return;
    setCalorieRange([0, nutritionLimits.calories]);
    setProteinRange([0, nutritionLimits.protein]);
    setFatRange([0, nutritionLimits.fat]);
    setSugarRange([0, nutritionLimits.carbs]);
    setSodiumRange([0, nutritionLimits.sodium]);
    setTotalCarbsRange([0, nutritionLimits.totalCarbs]);
    setTotalFatRange([0, nutritionLimits.totalFat]);
    setTransFatRange([0, nutritionLimits.transFat]);
    setCholesterolRange([0, nutritionLimits.cholesterol]);
    setCaffeineRange([0, nutritionLimits.caffeine]);
  }, [dataMenus.length, nutritionLimits]);
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

  const changeTab = (nextTab: Tab) => {
    setTab(nextTab);
    window.requestAnimationFrame(() => tabContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const changeMenuSection = (section: string) => {
    setMenuSectionFilter(section);
    menuGridRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    window.requestAnimationFrame(() => brandMenuRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const changeLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    localStorage.setItem("hanip-language", nextLanguage);
  };

  return (
    <main lang={language}>
      <div className="language-switcher" role="group" aria-label={tr(language, "언어 선택", "Select language")}><Languages size={17} aria-hidden="true" /><button className={language === "ko" ? "active" : ""} onClick={() => changeLanguage("ko")} lang="ko">한국어</button><button className={language === "en" ? "active" : ""} onClick={() => changeLanguage("en")} lang="en">English</button></div>
      <button className={`quick-filter-trigger ${showQuickFilters ? "visible" : ""} ${quickFiltersMinimized ? "minimized" : ""}`} onClick={() => { setQuickFiltersOpen(true); setQuickFiltersMinimized(false); }}><SlidersHorizontal size={17} /> {tr(language, "조건 열기", "Filters")}</button>
      <aside className={`quick-filter-panel ${showQuickFilters && !quickFiltersMinimized ? "visible" : ""} ${quickFiltersOpen ? "open" : ""}`}>
        <button className="quick-filter-close" onClick={() => setQuickFiltersOpen(false)} aria-label={tr(language, "조건 패널 닫기", "Close filters")}><X size={20} /></button>
        <button className="quick-filter-minimize" onClick={() => setQuickFiltersMinimized(true)} aria-label={tr(language, "조건 패널 접기", "Minimize filters")}><ChevronLeft size={18} /><span>{tr(language, "접기", "Minimize")}</span></button>
        <div className="quick-filter-title"><span>QUICK FILTER</span><b>{tr(language, "조건 바로 바꾸기", "Adjust filters")}</b></div>
        <div className="quick-group"><h3>{tr(language, "알레르기", "Allergens")}</h3><div className="chips"><button className={allergens.length === 0 ? "chip active no-allergy" : "chip no-allergy"} onClick={() => setAllergens([])}>{tr(language, "알레르기 없음", "No allergens")}</button>{ALLERGENS.map((item) => <button key={item} className={allergens.includes(item) ? "chip active" : "chip"} onClick={() => setAllergens((current) => current.includes(item) ? current.filter((x) => x !== item) : [...current, item])}>{allergenLabel(language, item)}</button>)}</div></div>
        <div className="quick-group"><h3>{tr(language, "안전 상태", "Allergen status")}</h3><div className="quick-safety"><button className={safetyMode === "all" ? "active" : ""} onClick={() => setSafetyMode("all")}>{tr(language, "모두", "All")}</button><button disabled={!allergens.length} className={safetyMode === "safe" ? "active safe" : ""} onClick={() => setSafetyMode("safe")}>{tr(language, "안전", "No match")}</button><button disabled={!allergens.length} className={safetyMode === "danger" ? "active danger" : ""} onClick={() => setSafetyMode("danger")}>{tr(language, "위험", "Contains")}</button></div></div>
        <div className="quick-group"><h3>{tr(language, "카테고리", "Category")}</h3><select value={brandCategory} onChange={(e) => setBrandCategory(e.target.value)}>{BRAND_CATEGORY_ORDER.map((item) => <option key={item} value={item}>{categoryLabel(language, item)}</option>)}</select></div>
        <div className="quick-group quick-ranges">
          <h3>{tr(language, "주요 영양조건", "Main nutrition filters")}</h3>
          <Range label={tr(language, "칼로리", "Calories")} value={calorieRange} min={0} max={nutritionLimits.calories} step={100} unit="kcal" onChange={setCalorieRange} />
          <Range label={tr(language, "단백질", "Protein")} value={proteinRange} min={0} max={nutritionLimits.protein} step={5} unit="g" onChange={setProteinRange} />
          <Range label={tr(language, "나트륨", "Sodium")} value={sodiumRange} min={0} max={nutritionLimits.sodium} step={250} unit="mg" onChange={setSodiumRange} />
          <details className="nutrition-options quick-nutrition-options">
            <summary>{tr(language, "추가 영양조건", "More nutrition filters")} <small>7</small></summary>
            <div className="nutrition-option-grid">
              <Range label={tr(language, "포화지방", "Saturated fat")} value={fatRange} min={0} max={nutritionLimits.fat} step={10} unit="g" onChange={setFatRange} />
              <Range label={tr(language, "당류", "Sugars")} value={sugarRange} min={0} max={nutritionLimits.carbs} step={10} unit="g" onChange={setSugarRange} />
              <Range label={tr(language, "총탄수화물", "Total carbs")} value={totalCarbsRange} min={0} max={nutritionLimits.totalCarbs} step={10} unit="g" onChange={setTotalCarbsRange} />
              <Range label={tr(language, "총지방", "Total fat")} value={totalFatRange} min={0} max={nutritionLimits.totalFat} step={10} unit="g" onChange={setTotalFatRange} />
              <Range label={tr(language, "트랜스지방", "Trans fat")} value={transFatRange} min={0} max={nutritionLimits.transFat} step={.1} unit="g" onChange={setTransFatRange} />
              <Range label={tr(language, "콜레스테롤", "Cholesterol")} value={cholesterolRange} min={0} max={nutritionLimits.cholesterol} step={50} unit="mg" onChange={setCholesterolRange} />
              <Range label={tr(language, "카페인", "Caffeine")} value={caffeineRange} min={0} max={nutritionLimits.caffeine} step={50} unit="mg" onChange={setCaffeineRange} />
            </div>
          </details>
        </div>
      </aside>
      {showQuickFilters && quickFiltersOpen && <button className="quick-filter-backdrop" aria-label={tr(language, "닫기", "Close")} onClick={() => setQuickFiltersOpen(false)} />}
      {mealFlight && <div key={mealFlight.nonce} className="meal-flight" style={{ left: mealFlight.x, top: mealFlight.y, "--flight-x": `${mealFlight.dx}px`, "--flight-y": `${mealFlight.dy}px` } as React.CSSProperties}><UtensilsCrossed size={16} /><span>+1</span></div>}
      <FloatingFoodHero images={HERO_IMAGES}>
        <div className="landing-orb orb-one" /><div className="landing-orb orb-two" />
        <div className="landing-copy"><div className="eyebrow">FRANCHISE FOOD GUIDE</div><p className="landing-brand">🍽️ {tr(language, "한입안심", "Hanip Ansim")}</p><h1>{tr(language, "오늘의 한 끼,", "Choose your meal,")}<br />{tr(language, "안심하고 고르세요.", "with confidence.")}</h1><p>{tr(language, "알레르기와 영양 목표를 한 번 설정하면", "Set your allergens and nutrition goals once,")}<br />{tr(language, "여러 프랜차이즈 메뉴를 한곳에서 찾아드려요.", "then explore franchise menus all in one place.")}</p><a href="#explorer">{tr(language, "내 메뉴 찾아보기", "Find my menu")} <ArrowDown size={18} /></a></div>
        <div className="landing-note"><span>ALLERGY</span><span>NUTRITION</span><span>NEARBY</span></div>
      </FloatingFoodHero>

      <section className="trust-shell">
        <Reveal><section className="data-trust" id="trust" aria-labelledby="trust-title">
          <div className="trust-copy">
            <span>{tr(language, "숫자로 증명하는 한입안심", "HANIP ANSIM, BY THE NUMBERS")}</span>
            <h2 id="trust-title">{tr(language, "알레르기 정보를 한눈에,", "Allergen information at a glance,")}<br />{tr(language, "더 안심되는 메뉴 선택.", "for more confident menu choices.")}</h2>
            <p>{tr(language, "흩어진 프랜차이즈 메뉴 정보를 한곳에서 비교하고, 알레르기·영양·가격 조건에 맞춰 바로 걸러볼 수 있어요.", "Compare franchise menus in one place, then narrow them down by allergen, nutrition, and price information.")}</p>
            <button onClick={() => changeTab("about")}>{tr(language, "데이터 기준 자세히 보기", "Explore our data standards")} <ChevronRight size={16} /></button>
          </div>
          <div className="trust-dashboard">
            <div className="trust-highlights">
              <div><strong>{formatNumber(language, brandOptions.length)}<b>{tr(language, "개", "")}</b></strong><span>{tr(language, "프랜차이즈 브랜드", "franchise brands")}</span></div>
              <div><strong>{formatNumber(language, dataMenus.length)}<b>{tr(language, "개", "")}</b></strong><span>{tr(language, "메뉴 비교", "menus to compare")}</span></div>
              <div><strong>{ALLERGENS.length}<b>{tr(language, "종", "")}</b></strong><span>{tr(language, "알레르기 정보", "allergen categories")}</span></div>
              <div><strong>{NUTRIENT_FILTER_COUNT}<b>{tr(language, "가지", "")}</b></strong><span>{tr(language, "영양성분", "nutrition nutrients")}</span></div>
            </div>
            <p className="trust-dashboard-note">{tr(language, "하나의 화면에서 메뉴를 비교하고, 내 조건에 맞는 선택지만 빠르게 확인하세요.", "Compare menus on one screen and quickly focus on the options that fit your needs.")}</p>
          </div>
        </section></Reveal>
      </section>

      <section className="content" id="explorer">
        <Reveal><header className="section-intro"><span>{tr(language, "01 · 내 조건", "01 · MY PREFERENCES")}</span><h2>{tr(language, "나에게 맞는 기준부터 선택해요", "Start with what works for you")}</h2><p>{tr(language, "선택한 정보는 브라우저 안에서 메뉴를 찾는 데만 사용됩니다.", "Your selections are used only in this browser to find matching menus.")}</p></header></Reveal>
        <div ref={filtersAnchorRef}><Reveal><section className="horizontal-filters">
          <div className="filter-block allergy-block"><h3>{tr(language, "피해야 할 알레르기", "Allergens to avoid")}</h3><p>{tr(language, "대한민국 의무표시 대상 기준", "Based on South Korean mandatory labeling")}</p><div className="chips"><button className={allergens.length === 0 ? "chip active no-allergy" : "chip no-allergy"} onClick={() => setAllergens([])}>{tr(language, "알레르기 없음", "No allergens")}</button>{ALLERGENS.map((item) => <button key={item} className={allergens.includes(item) ? "chip active" : "chip"} onClick={() => setAllergens((current) => current.includes(item) ? current.filter((x) => x !== item) : [...current, item])}>{allergenLabel(language, item)}</button>)}</div></div>
          <div className="filter-block"><h3>{tr(language, "메뉴 안전 상태", "Allergen match")}</h3><p>{allergens.length ? tr(language, "선택한 알레르기 기준", "Based on selected allergens") : tr(language, "표시 성분 유무 기준", "Select allergens to compare")}</p><div className="safety-options">
            <button className={`all-option ${safetyMode === "all" ? "active" : ""}`} onClick={() => setSafetyMode("all")}>{tr(language, "모두 보기", "Show all")}</button>
            <button disabled={!allergens.length} className={`safe-option ${safetyMode === "safe" ? "active" : ""}`} onClick={() => setSafetyMode("safe")}>{tr(language, "안전한 것만", "No match")}</button>
            <button disabled={!allergens.length} className={`danger-option ${safetyMode === "danger" ? "active" : ""}`} onClick={() => setSafetyMode("danger")}>{tr(language, "위험한 것만", "Contains selected")}</button>
          </div></div>
          <div className="filter-block profile-block"><h3>{tr(language, "맞춤 프로필", "Personal profile")}</h3><label className="toggle-row"><input type="checkbox" checked={profileOn} onChange={(event) => setProfileOn(event.target.checked)} /> {tr(language, "신체·다이어트 목표 반영", "Use body profile and goal")}</label><div className={`profile-grid profile-preview ${profileOn ? "enabled" : "disabled"}`}><select disabled={!profileOn} value={profile.sex} onChange={(e) => setProfile({ ...profile, sex: e.target.value })}><option value="여성">{tr(language, "여성", "Female")}</option><option value="남성">{tr(language, "남성", "Male")}</option></select><select disabled={!profileOn} value={profile.goal} onChange={(e) => setProfile({ ...profile, goal: e.target.value })}><option value="감량">{tr(language, "감량", "Lose weight")}</option><option value="유지">{tr(language, "유지", "Maintain")}</option><option value="증량">{tr(language, "증량", "Gain weight")}</option></select><NumberField disabled={!profileOn} label={tr(language, "나이", "Age")} value={profile.age} onChange={(age) => setProfile({ ...profile, age })} /><NumberField disabled={!profileOn} label={tr(language, "키(cm)", "Height (cm)")} value={profile.height} onChange={(height) => setProfile({ ...profile, height })} /><NumberField disabled={!profileOn} label={tr(language, "체중(kg)", "Weight (kg)")} value={profile.weight} onChange={(weight) => setProfile({ ...profile, weight })} /><div className="target-calorie">{tr(language, "하루 참고 목표", "Daily reference")} <b>{formatNumber(language, targetCalories)} kcal</b></div></div>{!profileOn && <button className="profile-enable-hint" onClick={() => setProfileOn(true)}>{tr(language, "체크하고 맞춤 추천 사용하기 →", "Enable personalized recommendations →")}</button>}</div>
          <div className="filter-block nutrition-block"><h3>{tr(language, "영양 조건", "Nutrition filters")}</h3><p className="nutrition-main-note">{tr(language, "각 영양성분의 최소값과 최대값을 정하면 해당 범위 안의 메뉴만 보여드려요.", "Set a minimum and maximum for each nutrient to see menus within that range.")}</p><div className="nutrition-filter-grid nutrition-primary-grid">
            <Range label={tr(language, "칼로리", "Calories")} value={calorieRange} min={0} max={nutritionLimits.calories} step={100} unit="kcal" onChange={setCalorieRange} />
            <Range label={tr(language, "단백질", "Protein")} value={proteinRange} min={0} max={nutritionLimits.protein} step={5} unit="g" onChange={setProteinRange} />
            <Range label={tr(language, "나트륨", "Sodium")} value={sodiumRange} min={0} max={nutritionLimits.sodium} step={250} unit="mg" onChange={setSodiumRange} />
          </div><details className="nutrition-options"><summary>{tr(language, "추가 영양조건", "More nutrition filters")} <small>{tr(language, "7가지 옵션", "7 options")}</small></summary><div className="nutrition-filter-grid nutrition-option-grid">
            <Range label={tr(language, "포화지방", "Saturated fat")} value={fatRange} min={0} max={nutritionLimits.fat} step={10} unit="g" onChange={setFatRange} />
            <Range label={tr(language, "당류", "Sugars")} value={sugarRange} min={0} max={nutritionLimits.carbs} step={10} unit="g" onChange={setSugarRange} />
            <Range label={tr(language, "총탄수화물", "Total carbs")} value={totalCarbsRange} min={0} max={nutritionLimits.totalCarbs} step={10} unit="g" onChange={setTotalCarbsRange} />
            <Range label={tr(language, "총지방", "Total fat")} value={totalFatRange} min={0} max={nutritionLimits.totalFat} step={10} unit="g" onChange={setTotalFatRange} />
            <Range label={tr(language, "트랜스지방", "Trans fat")} value={transFatRange} min={0} max={nutritionLimits.transFat} step={.1} unit="g" onChange={setTransFatRange} />
            <Range label={tr(language, "콜레스테롤", "Cholesterol")} value={cholesterolRange} min={0} max={nutritionLimits.cholesterol} step={50} unit="mg" onChange={setCholesterolRange} />
            <Range label={tr(language, "카페인", "Caffeine")} value={caffeineRange} min={0} max={nutritionLimits.caffeine} step={50} unit="mg" onChange={setCaffeineRange} />
          </div></details></div>
        </section></Reveal></div>

        <Reveal><section className="category-section"><div className="section-intro compact"><span>{tr(language, "02 · 카테고리", "02 · CATEGORY")}</span><h2>{tr(language, "어떤 종류를 찾고 있나요?", "What are you looking for?")}</h2></div><div className="category-grid">{BRAND_CATEGORY_ORDER.map((category) => <button className={brandCategory === category ? "active" : ""} key={category} onClick={() => setBrandCategory(category)}><b>{categoryLabel(language, category)}</b><small>{category === "전체" ? tr(language, "모든 브랜드", "All brands") : `${brandOptions.filter((brand) => BRAND_CATEGORIES[brand]?.includes(category)).length} ${tr(language, "개 브랜드", "brands")}`}</small></button>)}</div><div className="brand-picker">{displayedBrandOptions.map((brand) => <button key={brand} className={brands.includes(brand) ? "active" : ""} onClick={() => setBrands((current) => current.includes(brand) ? current.filter((x) => x !== brand) : [...current, brand])}><BrandLogo brand={brand} language={language} /><span>{displayBrand(brand)}</span></button>)}</div></section></Reveal>

        <nav className="tabs">
          <TabButton active={tab === "menus"} onClick={() => changeTab("menus")} icon={<MenuIcon size={17} />} label={tr(language, "추천 메뉴", "Menus")} />
          <TabButton mealTarget receiving={Boolean(mealFlight)} active={tab === "cart"} onClick={() => changeTab("cart")} icon={<UtensilsCrossed size={17} />} label={`${tr(language, "나의 한 끼", "My Meal")} (${cartCount})`} />
          <TabButton active={tab === "map"} onClick={() => changeTab("map")} icon={<MapPin size={17} />} label={tr(language, "주변 매장", "Nearby Stores")} />
          <TabButton active={tab === "compare"} onClick={() => changeTab("compare")} label={tr(language, "브랜드 비교", "Compare Brands")} />
          <TabButton active={tab === "about"} onClick={() => changeTab("about")} label={tr(language, "데이터 안내", "Data Guide")} />
        </nav>
        <div ref={tabContentRef} className="tab-content-anchor" />

        {tab === "menus" && <Reveal><section className="panel">
          <div className="panel-head"><div><h2>{tr(language, "조건에 맞는 메뉴", "Menus that match")}</h2><p>{tr(language, "브랜드와 메뉴 종류를 고르면 오늘의 한 끼를 빠르게 찾을 수 있어요.", "Choose brands and menu types to find your meal faster.")}</p></div><div className="menu-tools"><label className="sort-select"><span>{tr(language, "정렬", "Sort")}</span><select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}><option value="recommended">{tr(language, "맞춤 추천순", "Recommended")}</option><option value="protein">{tr(language, "단백질 높은 순", "Highest protein")}</option><option value="calories">{tr(language, "열량 낮은 순", "Lowest calories")}</option><option value="sodium">{tr(language, "나트륨 낮은 순", "Lowest sodium")}</option></select></label><label className="search"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr(language, "브랜드 또는 메뉴 검색", "Search brands or menus")} /></label></div></div>
          <div className="brand-browser"><div className="brand-folders">{grouped.map(([brand, items]) => { const safeCount = items.filter((menu) => !menu.catalogOnly && menu.allergenKnown && allergens.every((item) => !menu.allergens.includes(item))).length; const dangerCount = allergens.length ? items.filter((menu) => menu.allergenKnown && allergens.some((item) => menu.allergens.includes(item))).length : 0; return <button className={`brand-tile ${activeBrand === brand ? "selected" : ""} ${items.length ? "" : "data-pending"}`} key={brand} onClick={() => { setOpenBrands(activeBrand === brand ? {} : { [brand]: true }); setMenuSectionFilter("전체"); }}>
            <BrandLogo brand={brand} size={78} language={language} /><span><b>{displayBrand(brand)}</b>{items.length > 0 && <small><em className="safe-count">{tr(language, `안전 ${safeCount}개`, `${safeCount} no match`)}</em>{dangerCount > 0 && <em className="danger-count">{tr(language, `위험 ${dangerCount}개`, `${dangerCount} contain selected`)}</em>}</small>}</span>{activeBrand === brand ? <Check /> : <ChevronRight />}
          </button>; })}</div>
          {activeBrand ? <div ref={brandMenuRef} className="brand-menu-panel" key={activeBrand}><div className="brand-menu-head"><div><span>SELECTED BRAND</span><h3>{displayBrand(activeBrand)} {tr(language, "메뉴", "menus")}</h3><p>{activeItems.length ? tr(language, `조건에 맞는 ${activeItems.length}개 메뉴를 종류별로 확인하세요.`, `Browse ${activeItems.length} matching menus by type.`) : tr(language, "메뉴·영양·알레르기 데이터를 준비하고 있어요.", "Menu, nutrition, and allergen data are being prepared.")}</p></div><button onClick={() => setOpenBrands({})}><X size={18} /> {tr(language, "닫기", "Close")}</button></div>{activeItems.length > 0 ? <><div className="menu-section-tabs">{menuSections.map((section) => <button key={section} className={menuSectionFilter === section ? "active" : ""} onClick={() => changeMenuSection(section)}><b>{menuSectionLabel(language, section)}</b><small>{section === "전체" ? activeItems.length : activeItems.filter((menu) => menuSection(menu) === section).length}</small></button>)}</div><div ref={menuGridRef} className="menu-grid">{visibleActiveItems.map((menu) => { const danger = allergens.length > 0 && allergens.some((item) => menu.allergens.includes(item)); const pending = menu.catalogOnly || !menu.allergenKnown; return <article className={`menu-card ${pending ? "unknown-card" : danger ? "risk-card" : "safe-card"}`} key={menu.id}>
            <div className={`menu-image ${menu.imageUrl ? "official" : "fallback"}`}><img src={menu.imageUrl || brandFallbackImage(menu.brand)} alt={menu.imageUrl ? `${menuName(menu, language)} ${tr(language, "공식 메뉴 이미지", "official menu image")}` : `${menu.brand} ${tr(language, "로고", "logo")}`} loading="lazy" onError={(event) => { event.currentTarget.src = brandFallbackImage(menu.brand); event.currentTarget.closest(".menu-image")?.classList.add("fallback"); }} />{menu.imageUrl && <span>{tr(language, "공식 이미지", "Official image")}</span>}</div><span className="category">{menuSectionLabel(language, menuSection(menu))}{menu.category !== menuSection(menu) ? ` · ${categoryLabel(language, menu.category)}` : ""}</span><h3>{menuName(menu, language)}</h3>{servingLabel(menu, language) && <span className="serving-label">{servingLabel(menu, language)}</span>}<MenuDescription menu={menu} language={language} /><div className="menu-price"><b>{menu.price ? formatPrice(language, menu.price) : tr(language, "가격은 매장별 확인", "Check price by store")}</b><small>{menu.price ? tr(language, menu.priceNote || "기준 가격", "Reference price") : tr(language, "매장·주문 채널에 따라 달라질 수 있어요", "May vary by store and order channel")}{menu.priceCheckedAt ? ` · ${menu.priceCheckedAt} ${tr(language, "확인", "checked")}` : menu.mediaCheckedAt ? ` · ${menu.mediaCheckedAt} ${tr(language, "확인", "checked")}` : ""}</small>{menu.priceSourceUrl && <a href={menu.priceSourceUrl} target="_blank" rel="noreferrer">{tr(language, "가격 출처 보기", "View price source")}</a>}</div>{menu.catalogOnly ? <p className="pending-copy">{tr(language, "영양·알레르기 정보 확인 중", "Nutrition and allergen data pending")}</p> : <MenuNutrition menu={menu} language={language} />}<div className="allergen-row">{menu.allergenKnown ? (menu.allergens.length ? menu.allergens.map((item) => <span key={item}>{allergenLabel(language, item)}</span>) : <span className="safe">{tr(language, "표시 알레르기 없음", "No listed allergens")}</span>) : <span>{tr(language, "알레르기 정보 미표기", "Allergen data not listed")}</span>}</div>{menu.catalogOnly ? <button className="add-button" disabled>{tr(language, "정보 확인 후 담기 가능", "Available after data review")}</button> : <button key={added?.id === menu.id ? added.nonce : menu.id} className={added?.id === menu.id ? "add-button confirmed" : "add-button"} onClick={(event) => addToCart(menu.id, event)}>{added?.id === menu.id ? <><Check size={18} /> {tr(language, "담았어요!", "Added!")}</> : <><UtensilsCrossed size={18} /> {tr(language, "한 끼에 담기", "Add to my meal")}</>}</button>}
          </article>; })}</div></> : <div className="brand-menu-placeholder"><MenuIcon size={34} /><h3>{tr(language, "메뉴 데이터 준비 중", "Menu data pending")}</h3><p>{tr(language, "브랜드는 추가됐지만 메뉴·영양·알레르기 정보는 아직 등록되지 않았어요.", "This brand is listed, but its menu, nutrition, and allergen data have not been added yet.")}</p></div>}</div> : <div className="brand-menu-placeholder"><MenuIcon size={34} /><h3>{tr(language, "브랜드를 선택해 주세요", "Select a brand")}</h3><p>{tr(language, "왼쪽 카드를 누르면 이곳에서 메뉴를 바로 비교할 수 있어요.", "Choose a card on the left to compare its menus here.")}</p></div>}</div>
          {!filtered.length && grouped.every(([, items]) => items.length === 0) && <div className="empty">{tr(language, "현재 조건에 맞는 등록 메뉴가 없어요. 데이터 준비 중인 브랜드는 위 목록에서 확인할 수 있어요.", "No registered menus match the current filters. Brands with pending data remain visible above.")}</div>}
        </section></Reveal>}

        {tab === "cart" && <div className="meal-workspace"><CartPanel items={cartItems} cart={cart} setCart={setCart} totals={totals} targetCalories={profileOn ? targetCalories : 2000} allergens={allergens} language={language} /><DetailComparePanel menus={menus} selection={detailSelection} setSelection={setDetailSelection} cartIds={cartMenuIds} language={language} /></div>}
        {tab === "map" && <MapPanel brands={brands} language={language} />}
        {tab === "compare" && <ComparePanel menus={filtered} brands={brandOptions} allergens={allergens} language={language} />}
        {tab === "about" && <section className="panel prose"><h2>{tr(language, "알레르기 표시 기준과 데이터 안내", "Allergen labeling and data guide")}</h2><div className="law-card"><b>{tr(language, "대한민국 · 의무표시", "South Korea · Mandatory labeling")}</b><p><strong>{tr(language, "근거법령", "Legal basis")}</strong> {tr(language, "식품 등의 표시·광고에 관한 법률 시행규칙", "Enforcement Rule of the Act on Labeling and Advertising of Foods")}</p><p><strong>{tr(language, "소관기관", "Authority")}</strong> {tr(language, "식품의약품안전처", "Ministry of Food and Drug Safety")}</p><p><strong>{tr(language, "표시 대상", "Covered allergens")}</strong> {tr(language, "알류(가금류), 우유, 메밀, 땅콩, 대두, 밀, 고등어, 게, 새우, 돼지고기, 복숭아, 토마토, 아황산류(최종제품 이산화황 10mg/kg 이상), 호두, 닭고기, 쇠고기, 오징어, 조개류(굴·전복·홍합 포함), 잣 및 이들 식품에서 추출한 성분을 원재료로 사용한 식품(젤라틴·새우엑기스 등)", "Eggs (poultry), milk, buckwheat, peanuts, soybeans, wheat, mackerel, crab, shrimp, pork, peaches, tomatoes, sulfites (at least 10 mg/kg of sulfur dioxide in the final product), walnuts, chicken, beef, squid, shellfish (including oysters, abalone, and mussels), pine nuts, and ingredients derived from these foods.")}</p><p><strong>{tr(language, "혼입 우려 표시 예시", "Cross-contact statement example")}</strong> {tr(language, "“○○ 혼입 가능”", "May contain ○○")}</p></div><p>{tr(language, "영양·알레르기 정보는 각 브랜드 공식 자료를 기반으로 정리했습니다. ‘표시 알레르기 없음’은 알레르기 위험이 절대 없다는 뜻이 아닙니다. 교차오염 가능성과 원재료 변경이 있으므로 심한 알레르기가 있다면 반드시 주문 전 매장에 확인하세요.", "Nutrition and allergen information is compiled from each brand's official materials. ‘No listed allergens’ does not guarantee the absence of allergen risk. Cross-contact and ingredient changes are possible, so contact the store before ordering if you have a severe allergy.")}</p><p>{tr(language, "매장 위치·검색은 카카오맵과 카카오 로컬 API를 사용합니다. 가격은 매장·배달 채널별로 달라질 수 있어 실시간 가격으로 제공하지 않습니다.", "Store search and locations use Kakao Map and the Kakao Local API. Prices may vary by store and delivery channel and are not provided as live prices.")}</p></section>}
      </section>
    </main>
  );
}

function Reveal({ children }: { children: React.ReactNode }) { const ref = useRef<HTMLDivElement>(null); useEffect(() => { const node = ref.current; if (!node) return; const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && node.classList.add("visible"), { threshold: .12 }); observer.observe(node); return () => observer.disconnect(); }, []); return <div ref={ref} className="reveal">{children}</div>; }
function TabButton({ active, onClick, label, icon, mealTarget = false, receiving = false }: { active: boolean; onClick: () => void; label: string; icon?: React.ReactNode; mealTarget?: boolean; receiving?: boolean }) { return <button data-meal-tab={mealTarget ? "true" : undefined} className={`${active ? "active" : ""} ${receiving ? "meal-tab-receiving" : ""}`} onClick={onClick}>{icon}{label}</button>; }
function NumberField({ label, value, onChange, disabled = false }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean }) { return <label><span>{label}</span><input disabled={disabled} type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>; }
function Range({ label, value, min, max, step, unit, onChange }: { label: string; value: NutritionRange; min: number; max: number; step: number; unit: string; onChange: (value: NutritionRange) => void }) {
  const [minimum, maximum] = value;
  const clamp = (next: number) => Math.max(min, Math.min(max, Number.isFinite(next) ? next : min));
  const updateMinimum = (next: number) => onChange([Math.min(clamp(next), maximum), maximum]);
  const updateMaximum = (next: number) => onChange([minimum, Math.max(clamp(next), minimum)]);
  const spread = Math.max(max - min, 1);
  const rangeStyle = {
    "--range-start": `${((minimum - min) / spread) * 100}%`,
    "--range-end": `${((maximum - min) / spread) * 100}%`,
  } as React.CSSProperties;

  return <div className="range"><span><i>{label}</i><b className="range-values"><input aria-label={`${label} minimum`} type="number" value={minimum} min={min} max={maximum} step={step} onChange={(e) => updateMinimum(Number(e.target.value))} /><em>~</em><input aria-label={`${label} maximum`} type="number" value={maximum} min={minimum} max={max} step={step} onChange={(e) => updateMaximum(Number(e.target.value))} /><small>{unit}</small></b></span><div className="range-double-control" style={rangeStyle}><input aria-label={`${label} minimum slider`} type="range" value={minimum} min={min} max={max} step={step} onChange={(e) => updateMinimum(Number(e.target.value))} /><input aria-label={`${label} maximum slider`} type="range" value={maximum} min={min} max={max} step={step} onChange={(e) => updateMaximum(Number(e.target.value))} /></div></div>;
}

function CartPanel({ items, cart, setCart, totals, targetCalories, allergens, language }: { items: Array<{ menu: Menu; quantity: number }>; cart: Cart; setCart: React.Dispatch<React.SetStateAction<Cart>>; totals: Record<string, number>; targetCalories: number; allergens: string[]; language: Language }) {
  if (!items.length) return <section className="panel empty"><UtensilsCrossed size={36} /><h2>{tr(language, "나의 한 끼가 비어 있어요", "Your meal is empty")}</h2><p>{tr(language, "추천 메뉴에서 원하는 메뉴를 조합해보세요.", "Add items from the menu recommendations to build your meal.")}</p></section>;
  const standards = [
    { name: tr(language, "칼로리", "Calories"), value: totals.calories, max: targetCalories, unit: "kcal" },
    { name: tr(language, "단백질", "Protein"), value: totals.protein, max: 55, unit: "g" },
    { name: tr(language, "포화지방", "Saturated fat"), value: totals.fat, max: 15, unit: "g" },
    { name: tr(language, "당류", "Sugars"), value: totals.carbs, max: 100, unit: "g" },
    { name: tr(language, "나트륨", "Sodium"), value: totals.sodium, max: 2000, unit: "mg" },
  ];
  const knownPrice = items.reduce((sum, { menu, quantity }) => sum + (menu.price || 0) * quantity, 0);
  const unknownPriceCount = items.reduce((sum, { menu, quantity }) => sum + (menu.price ? 0 : quantity), 0);
  const unknownCalorieCount = items.reduce((sum, { menu, quantity }) => sum + (menu.caloriesKnown ? 0 : quantity), 0);
  return <section className="panel"><div className="panel-head"><div><h2>{tr(language, "나의 한 끼 영양 분석", "My meal nutrition")}</h2><p>{tr(language, "수량을 바꾸면 한 끼의 영양과 확인된 가격 합계가 즉시 계산돼요.", "Nutrition totals and confirmed prices update as quantities change.")}</p></div><button className="danger clear-cart" onClick={() => setCart({})}>{tr(language, "전체 비우기", "Clear all")}</button></div>
    <div className="meal-price-total"><span>{tr(language, "확인된 메뉴 가격 합계", "Total confirmed price")}</span><b>{formatPrice(language, knownPrice)}</b><small>{unknownPriceCount ? tr(language, `가격 미확인 메뉴 ${unknownPriceCount}개는 합계에서 제외됐어요.`, `${unknownPriceCount} item(s) without a confirmed price are excluded.`) : tr(language, "모든 메뉴 가격이 합계에 포함됐어요.", "All menu prices are included in the total.")}</small></div>
    <div className="cart-list">{items.map(({ menu, quantity }) => { const matched = allergens.filter((item) => menu.allergens.includes(item)); return <div className={`cart-item ${matched.length ? "allergy-warning" : ""}`} key={menu.id}><div><b>{menu.menu}</b><span>{menu.brand} · {calorieLabel(menu, language)} · {menu.price ? formatPrice(language, menu.price * quantity) : tr(language, "가격 미확인", "Price unconfirmed")}</span>{matched.length > 0 && <em>{tr(language, "주의 · 선택 알레르기:", "Caution · Selected allergens:")} {matched.map((item) => allergenLabel(language, item)).join(", ")}</em>}</div><div className="quantity"><button aria-label={tr(language, "수량 줄이기", "Decrease quantity")} onClick={() => setCart((current) => ({ ...current, [menu.id]: Math.max(1, quantity - 1) }))}>−</button><b>{quantity}</b><button aria-label={tr(language, "수량 늘리기", "Increase quantity")} onClick={() => setCart((current) => ({ ...current, [menu.id]: Math.min(10, quantity + 1) }))}>+</button></div><button className="icon-button" aria-label={tr(language, "메뉴 삭제", "Remove menu")} onClick={() => setCart((current) => { const next = { ...current }; delete next[menu.id]; return next; })}><Trash2 size={18} /></button></div>; })}</div>
    <div className="nutrition-summary">{standards.map((item) => <div key={item.name}><span>{item.name}<b>{item.value.toFixed(item.unit === "mg" || item.unit === "kcal" ? 0 : 1)}{item.unit}</b></span><div className="progress"><i className={item.value > item.max ? "over" : ""} style={{ width: `${Math.min(100, item.value / item.max * 100)}%` }} /></div><small>{item.max}{item.unit} {tr(language, "기준", "reference")} · {(item.value / item.max * 100).toFixed(0)}%</small></div>)}</div>
    {unknownCalorieCount > 0 && <p className="nutrition-missing-note">{tr(language, `칼로리 정보가 없는 메뉴 ${unknownCalorieCount}개는 칼로리 합계에서 제외했어요.`, `${unknownCalorieCount} item(s) without calorie data are excluded from the calorie total.`)}</p>}
  </section>;
}

function BrandAxisTick({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value?: string } }) {
  const brand = payload?.value || "";
  return <g transform={`translate(${x},${y})`}><text textAnchor="middle" fill="#626b65" fontSize={12}>{brand === "배스킨라빈스" ? <><tspan x="0" dy="16">배스킨</tspan><tspan x="0" dy="15">라빈스</tspan></> : <tspan x="0" dy="16">{brand}</tspan>}</text></g>;
}

function ComparePanel({ menus, brands, allergens, language }: { menus: Menu[]; brands: string[]; allergens: string[]; language: Language }) {
  const verifiedMenus = menus.filter((menu) => !menu.catalogOnly && menu.allergenKnown);
  const selectableMenus = allergens.length
    ? verifiedMenus.filter((menu) => !allergens.some((allergen) => menu.allergens.includes(allergen)))
    : verifiedMenus;
  const data = brands
    .map((brand) => ({ brand, count: selectableMenus.filter((menu) => menu.brand === brand).length }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand, "ko"))
    .slice(0, 10);
  return <section className="panel"><h2>{tr(language, "브랜드별 선택 가능한 메뉴", "Available menus by brand")}</h2><p>{allergens.length ? tr(language, `선택한 알레르기(${allergens.join(", ")})가 포함된 메뉴를 제외한 결과예요.`, `Menus containing your selected allergens (${allergens.map((item) => allergenLabel(language, item)).join(", ")}) are excluded.`) : tr(language, "현재 영양 조건을 만족하는 메뉴 수예요.", "Number of menus matching the current nutrition filters.")}</p><div className="chart"><ResponsiveContainer width="100%" height={370}><BarChart data={data} margin={{ bottom: 12 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="brand" interval={0} height={48} tick={<BrandAxisTick />} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" name={tr(language, "메뉴 수", "Menus")} radius={[8, 8, 0, 0]}>{data.map((row) => <Cell key={row.brand} fill={BRAND_COLORS[row.brand] || "#287653"} />)}</Bar></BarChart></ResponsiveContainer></div></section>;
}

const DETAIL_COLORS = ["#287653", "#2e7bd8", "#ef6552", "#a268d5"];

function DetailComparePanel({ menus, selection, setSelection, cartIds, language }: { menus: Menu[]; selection: number[]; setSelection: React.Dispatch<React.SetStateAction<number[]>>; cartIds: number[]; language: Language }) {
  const [search, setSearch] = useState("");
  const byId = new Map(menus.map((menu) => [menu.id, menu]));
  const selected = selection.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []);
  const choices = menus.filter((menu) => !selection.includes(menu.id) && (!search.trim() || `${menu.brand} ${menu.menu}`.toLowerCase().includes(search.trim().toLowerCase()))).slice(0, 80);
  const radarData = [
    { subject: tr(language, "칼로리", "Calories"), max: 800, key: "calories" },
    { subject: tr(language, "단백질", "Protein"), max: 50, key: "protein" },
    { subject: tr(language, "포화지방", "Sat. fat"), max: 30, key: "fat" },
    { subject: tr(language, "당류", "Sugars"), max: 100, key: "carbs" },
    { subject: tr(language, "나트륨", "Sodium"), max: 2000, key: "sodium" }
  ].map((axis) => ({ subject: axis.subject, ...Object.fromEntries(selected.map((menu) => [`menu${menu.id}`, Math.min(100, Number(menu[axis.key as keyof Menu]) / axis.max * 100)])) }));
  const addMenu = (id: number) => { if (id >= 0 && selection.length < 4 && !selection.includes(id)) setSelection((current) => [...current, id]); };
  return <section className="panel detail-compare"><div className="panel-head"><div><span className="compare-kicker">NUTRITION COMPARE</span><h2>{tr(language, "메뉴 영양성분 비교", "Compare menu nutrition")}</h2><p>{tr(language, "최대 4개 메뉴의 영양 균형을 같은 기준으로 비교해요.", "Compare up to four menus using the same nutrition scale.")}</p></div></div>
    <div className={`meal-sync-card ${cartIds.length ? "active" : ""}`}><span className="meal-import-icon"><UtensilsCrossed size={25} /></span><span><b>{tr(language, "나의 한 끼 자동 반영", "Sync with My Meal")}</b><small>{cartIds.length ? tr(language, `담아둔 메뉴 ${Math.min(cartIds.length, 4)}개가 비교에 자동으로 표시됩니다`, `${Math.min(cartIds.length, 4)} saved menu item(s) are shown automatically`) : tr(language, "나의 한 끼에 메뉴를 담으면 여기에 자동으로 나타나요", "Items added to My Meal will appear here automatically")}</small></span>{cartIds.length > 0 && <Check size={20} />}</div>
    <div className="selected-menu-chips">{selected.map((menu, index) => <button style={{ borderColor: DETAIL_COLORS[index] }} key={menu.id} onClick={() => setSelection((current) => current.filter((id) => id !== menu.id))}><i style={{ background: DETAIL_COLORS[index] }} />{menu.brand} · {menu.menu}<X size={14} /></button>)}</div>
    {!selected.length ? <div className="empty"><h3>{tr(language, "비교할 메뉴를 선택해 주세요", "Select menus to compare")}</h3><p>{tr(language, "‘나의 한 끼’에 메뉴를 담거나 아래에서 직접 추가해 주세요.", "Add menus to My Meal or select them below.")}</p></div> : <div className="detail-radar"><ResponsiveContainer width="100%" height={330}><RadarChart data={radarData} outerRadius="66%"><PolarGrid /><PolarAngleAxis dataKey="subject" /><PolarRadiusAxis angle={90} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />{selected.map((menu, index) => <Radar key={menu.id} name={`${menu.brand} · ${menu.menu}`} dataKey={`menu${menu.id}`} stroke={DETAIL_COLORS[index]} fill={DETAIL_COLORS[index]} fillOpacity={.13} strokeWidth={2} />)}<Legend /><Tooltip formatter={(value) => `${Number(value).toFixed(0)}%`} /></RadarChart></ResponsiveContainer></div>}
    <div className="compare-step add-after-chart"><span>+</span><b>{tr(language, "다른 메뉴 직접 추가", "Add another menu")}</b><small>{selection.length}/4 {tr(language, "선택", "selected")}</small></div>
    <div className="detail-picker"><label className="search"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr(language, "브랜드 또는 메뉴 이름 검색", "Search brands or menu names")} /></label><select value="" disabled={selection.length >= 4} onChange={(e) => { addMenu(Number(e.target.value)); setSearch(""); }}><option value="">{selection.length >= 4 ? tr(language, "최대 4개까지 선택할 수 있어요", "You can select up to four") : tr(language, "검색 결과에서 메뉴 선택", "Select from search results")}</option>{choices.map((menu) => <option key={menu.id} value={menu.id}>{menu.brand} · {menu.menu}</option>)}</select></div>
    {selected.length > 0 &&
      <div className="detail-table-wrap"><table className="detail-table"><thead><tr><th>{tr(language, "메뉴", "Menu")}</th><th>{tr(language, "가격", "Price")}</th><th>{tr(language, "칼로리", "Calories")}</th><th>{tr(language, "단백질", "Protein")}</th><th>{tr(language, "포화지방", "Sat. fat")}</th><th>{tr(language, "당류", "Sugars")}</th><th>{tr(language, "나트륨", "Sodium")}</th></tr></thead><tbody>{selected.map((menu) => <tr key={menu.id}><td><b>{menu.brand}</b><span>{menu.menu}</span></td><td>{menu.price ? formatPrice(language, menu.price) : tr(language, "매장별 확인", "Check by store")}</td><td>{calorieLabel(menu, language)}</td><td>{menu.protein.toFixed(1)} g</td><td>{menu.fat.toFixed(1)} g</td><td>{menu.carbs.toFixed(1)} g</td><td>{menu.sodium.toFixed(0)} mg</td></tr>)}</tbody></table></div>
    }
  </section>;
}

function MapPanel({ brands, language }: { brands: string[]; language: Language }) {
  const [mode, setMode] = useState<"search" | "gps">("search"); const [term, setTerm] = useState(""); const [places, setPlaces] = useState<Place[]>([]); const [center, setCenter] = useState<Place | null>(null); const [stores, setStores] = useState<Store[]>([]); const [radius, setRadius] = useState(1); const [loading, setLoading] = useState(false);
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
  const locate = () => navigator.geolocation.getCurrentPosition((position) => findStores({ id: "gps", name: tr(language, "현재 위치", "Current location"), address: tr(language, `정확도 약 ${Math.round(position.coords.accuracy)}m`, `Accuracy about ${Math.round(position.coords.accuracy)} m`), lat: position.coords.latitude, lon: position.coords.longitude }), () => alert(tr(language, "브라우저 위치 권한을 허용해 주세요.", "Please allow location access in your browser.")), { enableHighAccuracy: true });
  return <section className="panel"><div className="panel-head map-panel-head"><div><h2>{tr(language, "내 주변 매장", "Stores near me")}</h2><p>{tr(language, "카카오맵에서 선택한 브랜드의 매장을 찾아요.", "Find nearby stores for your selected brands on Kakao Map.")}</p></div><label className="radius-slider"><span>{tr(language, "검색 반경", "Search radius")} <b>{radius} km</b></span><input type="range" min="1" max="10" step="1" value={radius} onChange={(e) => setRadius(Number(e.target.value))} /><small><i>1km</i><i>10km</i></small></label></div>
    <div className="mode-switch"><button className={mode === "search" ? "active" : ""} onClick={() => setMode("search")}><Search size={17} />{tr(language, "장소 검색", "Search place")}</button><button className={mode === "gps" ? "active" : ""} onClick={() => { setMode("gps"); locate(); }}><LocateFixed size={17} />{tr(language, "현재 위치", "Current location")}</button></div>
    {mode === "search" && <div className="location-search"><label className="search"><Search size={18} /><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={tr(language, "성수역, 서울시청처럼 입력하세요", "Try Seongsu Station or Seoul City Hall")} /></label>{places.length > 0 && <div className="suggestions">{places.map((place) => <button key={place.id} onClick={() => { setTerm(place.name); setPlaces([]); findStores(place); }}><MapPin size={17} /><span><b>{place.name}</b><small>{place.address}</small></span></button>)}</div>}</div>}
    {loading && <div className="map-empty">{tr(language, "주변 매장을 찾고 있어요…", "Finding nearby stores…")}</div>}{center && !loading && <><KakaoMap center={center} radiusKm={radius} stores={stores} language={language} /><div className="store-summary"><b>{center.name}</b> {tr(language, `기준 ${stores.length}개 매장`, `· ${stores.length} store(s)`)}</div><div className="store-list">{stores.slice(0, 20).map((store) => <a href={store.placeUrl || "#"} target="_blank" rel="noopener" key={store.id}><BrandLogo brand={store.brand} size={34} language={language} /><span><b>{store.name}</b><small>{store.distance.toFixed(2)}km · {tr(language, `도보 약 ${Math.ceil(store.distance * 1.25 / 4.5 * 60)}분`, `About ${Math.ceil(store.distance * 1.25 / 4.5 * 60)} min walk`)} · {store.address}</small></span></a>)}</div></>}
  </section>;
}
