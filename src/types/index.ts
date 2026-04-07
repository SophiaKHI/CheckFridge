export type ItemStatus = 'active' | 'used' | 'trashed';

export interface FridgeItem {
  id: string;
  user_id: string;
  name: string;
  icon: string;       // emoji
  expiry_date: string; // ISO date string YYYY-MM-DD
  added_at: string;
  status: ItemStatus;
}

export interface FridgeItemDraft {
  name: string;
  icon: string;
  expiry_date: string;
}

export type ExpiryBand = 'expired' | 'today' | 'soon' | 'fresh';

export interface ExpiryStyle {
  bg: string;
  border: string;
  text: string;
  band: ExpiryBand;
}

export interface Recipe {
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
  usesItems: string[]; // fridge item names used
}

export interface User {
  id: string;
  email: string;
}
