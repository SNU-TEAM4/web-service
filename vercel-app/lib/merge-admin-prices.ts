import type { Menu, PriceRecord } from "@/lib/types";

function menuKey(brand: string, menu: string) {
  return `${brand.trim()}\u0000${menu.trim()}`;
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

  return menus.map((menu) => {
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
}
