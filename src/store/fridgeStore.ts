import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { FridgeItem, FridgeItemDraft, ItemStatus } from '../types';

interface FridgeState {
  items: FridgeItem[];
  loading: boolean;
  error: string | null;
  /** IDs currently being removed — excluded from fetchItems to prevent race-condition reappearance */
  removing: Set<string>;

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
  removing: new Set(),

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
      // Never re-add items that are in the middle of being removed
      const { removing } = get();
      set({
        items: (data ?? []).filter(item => !removing.has(item.id)),
        loading: false,
      });
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

    if (error) {
      console.error('[FridgeStore] addItem error:', error.message);
    } else if (data) {
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

    if (error) {
      console.error('[FridgeStore] updateItem error:', error.message);
    } else if (data) {
      set(state => ({
        items: state.items.map(item => item.id === id ? data : item),
      }));
    }
  },

  setStatus: async (id, status) => {
    // 1. Remove from UI immediately — don't wait for the network
    set(state => ({
      items: state.items.filter(item => item.id !== id),
      removing: new Set([...state.removing, id]),
    }));

    // 2. Write only `status` to Supabase — status_changed_at requires a
    //    migration (ALTER TABLE) that may not have run yet; omitting it keeps
    //    the update safe until the column exists in the DB.
    const { error } = await supabase
      .from('fridge_items')
      .update({ status })
      .eq('id', id);

    if (error) {
      console.error('[FridgeStore] setStatus error:', error.message);
    }

    // 3. Release the removing lock regardless of success/failure
    set(state => {
      const removing = new Set(state.removing);
      removing.delete(id);
      return { removing };
    });
  },

  deleteItem: async (id) => {
    await supabase.from('fridge_items').delete().eq('id', id);
    set(state => ({ items: state.items.filter(item => item.id !== id) }));
  },
}));
