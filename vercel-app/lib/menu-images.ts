import manifest from "@/public/menu-images/manifest.json";

export type MenuImageAsset = {
  id: string;
  brand: string;
  menu: string;
  officialMenuName: string;
  src: string;
  assetSourceUrl: string;
  pageSourceUrl: string;
  sourceMethod: string;
  matchMethod: "normalized_exact" | "high_confidence_name" | "official_family_representative" | "official_catalog_representative";
  matchScore: number;
};

export const MENU_IMAGE_MANIFEST = manifest;
export const MENU_IMAGE_BY_ID = new Map(
  (manifest.items as MenuImageAsset[]).map((item) => [item.id, item]),
);

export const getMenuImage = (menuId: string) => MENU_IMAGE_BY_ID.get(menuId) ?? null;
export const isExactMenuImage = (asset: MenuImageAsset | null) => Boolean(asset && (
  asset.matchMethod === "normalized_exact" || asset.matchMethod === "high_confidence_name"
));
