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
  restoreItem: (item: FridgeItem) => Promise<void>;
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
    // 1. Optimistic remove — happens instantly so the bubble vanishes immediately
    set(state => ({
      items: state.items.filter(item => item.id !== id),
      removing: new Set([...state.removing, id]),
    }));

    // 2. Short delay before the DB write — gives UNDO a clean cancellation window.
    //    restoreItem() removes the id from `removing`, so the check below aborts.
    await new Promise(r => setTimeout(r, 600));
    if (!get().removing.has(id)) return; // UNDO was called — skip the write

    // 3. Write to Supabase (only `status` — status_changed_at needs a migration first)
    const { error } = await supabase
      .from('fridge_items')
      .update({ status })
      .eq('id', id);

    if (error) {
      console.error('[FridgeStore] setStatus error:', error.message);
    }

    // 4. Release lock
    set(state => {
      const removing = new Set(state.removing);
      removing.delete(id);
      return { removing };
    });
  },

  restoreItem: async (item: FridgeItem) => {
    // Remove from `removing` first — this cancels any pending setStatus DB write
    set(state => {
      const removing = new Set(state.removing);
      removing.delete(item.id);
      return { removing };
    });

    // Update DB back to active (handles the case where 600ms already passed)
    const { error } = await supabase
      .from('fridge_items')
      .update({ status: 'active' })
      .eq('id', item.id);

    if (error) {
      console.error('[FridgeStore] restoreItem error:', error.message);
      return;
    }

    // Re-insert into local state, sorted by expiry_date
    const restored: FridgeItem = { ...item, status: 'active' };
    set(state => ({
      items: [...state.items, restored].sort((a, b) =>
        a.expiry_date.localeCompare(b.expiry_date)
      ),
    }));
  },

  deleteItem: async (id) => {
    await supabase.from('fridge_items').delete().eq('id', id);
    set(state => ({ items: state.items.filter(item => item.id !== id) }));
  },
}));
