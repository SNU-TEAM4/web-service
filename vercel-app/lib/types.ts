export type Menu = {
  id: string;
  brand: string;
  menu: string;
  category: string;
  calories: number;
  protein: number;
  saturatedFat: number;
  sugars: number;
  sodium: number;
  allergens: string[];
  allergenKnown: boolean;
  sourceUrl: string;
  sourceDate: string;
  sourceDateType: string;
  verified: boolean;
  allergySourceUrl: string;
  collectedAt: string;
  collectionMethod: string;
  priceKrw: number | null;
  priceType: "official_online_reference" | "unavailable";
  priceSourceUrl: string;
  priceSourceDate: string;
  priceNote: string;
};

export type QualityReport = {
  generated_at: string;
  status: "pass" | "fail";
  summary: {
    rows: number;
    brands: number;
    errors: number;
    warnings: number;
    duplicate_brand_menu: number;
    verified_rows: number;
    allergen_known_rows: number;
    allergen_known_rate: number;
    price_known_rows: number;
    price_known_rate: number;
  };
  coverage: Record<string, { rows: number; allergen_known_rows: number; allergen_known_rate: number; price_known_rows: number; price_known_rate: number }>;
  source_dates: Record<string, number>;
  source_hosts: Record<string, number>;
  warnings: Array<{ code: string; brand?: string; rows?: number }>;
  mirror: { identical?: boolean; primary_sha256?: string; mirror_sha256?: string };
};

export type Place = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
};

export type Store = Place & {
  brand: string;
  distance: number;
  phone?: string;
  placeUrl?: string;
};
