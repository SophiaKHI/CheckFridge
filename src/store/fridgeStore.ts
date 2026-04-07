import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { FridgeItem, FridgeItemDraft, ItemStatus } from '../types';

interface FridgeState {
  items: FridgeItem[];
  loading: boolean;
  error: string | null;

  fetchItems: () => Promise<void>;
  addItem: (draft: FridgeItemDraft) => Promise<void>;
  updateItem: (id: string, updates: Partial<FridgeItem>) => Promise<void>;
  setStatus: (id: string, status: ItemStatus) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
}

export const useFridgeStore = create<FridgeState>((set, get) => ({
  items: [],
  loading: false,
  error: null,

  fetchItems: async () => {
    set({ loading: true, error: null });
    const { data, error } = await supabase
      .from('fridge_items')
      .select('*')
      .eq('status', 'active')
      .order('expiry_date', { ascending: true });

    if (error) {
      set({ error: error.message, loading: false });
    } else {
      set({ items: data ?? [], loading: false });
    }
  },

  addItem: async (draft) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('fridge_items')
      .insert({ ...draft, user_id: user.id, status: 'active' })
      .select()
      .single();

    if (!error && data) {
      set(state => ({ items: [...state.items, data] }));
    }
  },

  updateItem: async (id, updates) => {
    const { data, error } = await supabase
      .from('fridge_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (!error && data) {
      set(state => ({
        items: state.items.map(item => item.id === id ? data : item),
      }));
    }
  },

  setStatus: async (id, status) => {
    await get().updateItem(id, { status });
    // Remove from active list
    set(state => ({
      items: state.items.filter(item => item.id !== id),
    }));
  },

  deleteItem: async (id) => {
    await supabase.from('fridge_items').delete().eq('id', id);
    set(state => ({ items: state.items.filter(item => item.id !== id) }));
  },
}));
