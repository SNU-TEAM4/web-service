export type Menu = {
  id: number;
  brand: string;
  menu: string;
  category: string;
  yogiyoCategory?: string;
  calories: number;
  caloriesKnown: boolean;
  protein: number;
  proteinKnown: boolean;
  fat: number;
  fatKnown: boolean;
  carbs: number;
  carbsKnown: boolean;
  sodium: number;
  sodiumKnown: boolean;
  nutritionMatch?: string;
  allergens: string[];
  allergenKnown: boolean;
  verified?: boolean;
  sourceUrl: string;
  imageUrl?: string;
  description?: string;
  price?: number;
  priceNote?: string;
  priceSourceUrl?: string;
  priceCheckedAt?: string;
  mediaSourceUrl?: string;
  mediaCheckedAt?: string;
  catalogOnly?: boolean;
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

export type PriceRecord = {
  id: string;
  brand: string;
  menu: string;
  channel: string;
  storeName: string;
  price: number;
  checkedAt: string;
  sourceUrl: string;
  memo: string;
  updatedAt: string;
};
