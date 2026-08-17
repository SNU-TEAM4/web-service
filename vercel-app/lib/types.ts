export type Menu = {
  id: number;
  brand: string;
  menu: string;
  category: string;
  calories: number;
  caloriesKnown: boolean;
  protein: number;
  fat: number;
  carbs: number;
  sodium: number;
  allergens: string[];
  allergenKnown: boolean;
  verified: boolean;
  sourceUrl: string;
  sourceDate?: string;
  allergySourceUrl?: string;
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
