export type Menu = {
  id: number;
  brand: string;
  menu: string;
  category: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
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
