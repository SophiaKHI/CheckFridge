import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthState {
  session: Session | null;
  loading: boolean;
  setSession: (session: Session | null) => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  loading: true,

  setSession: (session) => set({ session, loading: false }),

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  },

  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return error ? error.message : null;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null });
  },
}));
