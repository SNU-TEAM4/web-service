import type { Menu, PriceRecord } from "@/lib/types";
import { canonicalBrandName, inferMenuSection } from "@/lib/menu-catalog";

function menuKey(brand: string, menu: string) {
  return `${canonicalBrandName(brand)}\u0000${menu.trim()}`;
}

export function mergeAdminPrices(menus: Menu[], prices: PriceRecord[]): Menu[] {
  const latestByMenu = new Map<string, PriceRecord>();

  for (const candidate of prices) {
    const key = menuKey(candidate.brand, candidate.menu);
    const current = latestByMenu.get(key);
    if (!current || candidate.checkedAt > current.checkedAt ||
      (candidate.checkedAt === current.checkedAt && candidate.price < current.price)) {
      latestByMenu.set(key, candidate);
    }
  }

  const merged = menus.map((menu) => {
    const managed = latestByMenu.get(menuKey(menu.brand, menu.menu));
    if (!managed) return menu;
    return {
      ...menu,
      price: managed.price,
      priceCheckedAt: managed.checkedAt,
      priceSourceUrl: managed.sourceUrl,
      priceNote: [managed.storeName, managed.channel].filter(Boolean).join(" · ") || "관리자 확인 가격",
    };
  });

  const existing = new Set(merged.map((menu) => menuKey(menu.brand, menu.menu)));
  const catalogRows = [...latestByMenu.values()]
    .filter((record) => !existing.has(menuKey(record.brand, record.menu)))
    .sort((a, b) => menuKey(a.brand, a.menu).localeCompare(menuKey(b.brand, b.menu), "ko"));

  return [...merged, ...catalogRows.map((record, index): Menu => {
    const brand = canonicalBrandName(record.brand);
    const category = inferMenuSection({ brand, menu: record.menu, category: "" });
    return {
      id: -(index + 1), brand, menu: record.menu, category,
      calories: 0, caloriesKnown: false, protein: 0, proteinKnown: false,
      fat: 0, fatKnown: false, carbs: 0, carbsKnown: false, sodium: 0, sodiumKnown: false,
      totalCarbs: 0, totalCarbsKnown: false, totalFat: 0, totalFatKnown: false,
      transFat: 0, transFatKnown: false, cholesterol: 0, cholesterolKnown: false,
      caffeine: 0, caffeineKnown: false,
      allergens: [], allergenKnown: false, sourceUrl: record.sourceUrl,
      price: record.price, priceCheckedAt: record.checkedAt,
      priceSourceUrl: record.sourceUrl,
      priceNote: [record.storeName, record.channel].filter(Boolean).join(" · ") || "관리자 확인 가격",
      catalogOnly: true,
    };
  })];
}
