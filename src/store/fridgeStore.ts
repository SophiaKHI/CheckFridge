import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { FridgeItem, FridgeItemDraft, ItemStatus } from '../types';
import type { RealtimeChannel } from '@supabase/supabase-js';

let _channel: RealtimeChannel | null = null;

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
  subscribeRealtime: () => void;
  unsubscribeRealtime: () => void;
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
      .select();

    if (error) {
      console.error('[FridgeStore] updateItem error:', error.message);
    } else if (data?.[0]) {
      set(state => ({
        items: state.items.map(item => item.id === id ? data[0] : item),
      }));
    }
  },

  setStatus: async (id, status) => {
    // 1. Optimistic remove — instant
    set(state => ({
      items: state.items.filter(item => item.id !== id),
      removing: new Set([...state.removing, id]),
    }));

    // 2. Write to DB immediately — no delay, so the change survives an app reload.
    //    Undo is handled by restoreItem(), which writes 'active' back to the DB.
    const { error } = await supabase
      .from('fridge_items')
      .update({ status, status_changed_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[FridgeStore] setStatus error:', error.message);
    }

    // 3. Hold id in `removing` for the full 5s undo window so delayed realtime
    //    events (reconnect snapshots, late echoes) can't re-add this item.
    //    restoreItem() clears it immediately when undo is pressed.
    setTimeout(() => {
      set(state => {
        const removing = new Set(state.removing);
        removing.delete(id);
        return { removing };
      });
    }, 5000);
  },

  restoreItem: async (item: FridgeItem) => {
    // Clear from `removing` first so realtime treats this item as active again
    set(state => {
      const removing = new Set(state.removing);
      removing.delete(item.id);
      return { removing };
    });

    const { error } = await supabase
      .from('fridge_items')
      .update({ status: 'active', status_changed_at: null })
      .eq('id', item.id);

    if (error) {
      console.error('[FridgeStore] restoreItem error:', error.message);
      return;
    }

    const restored: FridgeItem = { ...item, status: 'active' };
    set(state => ({
      items: [...state.items.filter(i => i.id !== restored.id), restored]
        .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date)),
    }));
  },

  deleteItem: async (id) => {
    await supabase.from('fridge_items').delete().eq('id', id);
    set(state => ({ items: state.items.filter(item => item.id !== id) }));
  },

  subscribeRealtime: () => {
    if (_channel) { supabase.removeChannel(_channel); _channel = null; }

    _channel = supabase
      .channel('fridge_items_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fridge_items' },
        (payload) => {
          const { removing } = get();

          if (payload.eventType === 'INSERT') {
            const item = payload.new as FridgeItem;
            if (item.status !== 'active' || removing.has(item.id)) return;
            set(state => {
              if (state.items.find(i => i.id === item.id)) return state;
              return {
                items: [...state.items, item].sort((a, b) =>
                  a.expiry_date.localeCompare(b.expiry_date)
                ),
              };
            });
          } else if (payload.eventType === 'UPDATE') {
            const item = payload.new as FridgeItem;
            if (item.status !== 'active' || removing.has(item.id)) {
              set(state => ({ items: state.items.filter(i => i.id !== item.id) }));
            } else {
              set(state => ({
                items: [...state.items.filter(i => i.id !== item.id), item]
                  .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date)),
              }));
            }
          } else if (payload.eventType === 'DELETE') {
            const id = (payload.old as Partial<FridgeItem>).id;
            if (id) set(state => ({ items: state.items.filter(i => i.id !== id) }));
          }
        }
      )
      .subscribe();
  },

  unsubscribeRealtime: () => {
    if (_channel) { supabase.removeChannel(_channel); _channel = null; }
  },
}));
