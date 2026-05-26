import { create } from 'zustand';
import { supabase } from '../lib/supabase';

const MEMBER_COLORS = [
  '#5B8AF0',
  '#A55BF0',
  '#F05BA0',
  '#F0B35B',
  '#5BC4F0',
];

function getInitials(email: string): string {
  const local = email.split('@')[0];
  const parts = local.split(/[._\-+]/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

function generateToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface MemberInfo {
  userId: string;
  email: string;
  initials: string;
  color: string;
}

interface HouseholdState {
  members: MemberInfo[];
  householdId: string | null;
  householdName: string | null;
  fetchHousehold: () => Promise<void>;
  createHousehold: (name: string) => Promise<string | null>;
  createInvite: (invitedEmail: string) => Promise<{ link: string } | { error: string }>;
  leaveHousehold: () => Promise<string | null>;
  acceptInvite: (token: string) => Promise<{ error: string } | { householdName: string }>;
}

export const useHouseholdStore = create<HouseholdState>((set, get) => ({
  members: [],
  householdId: null,
  householdName: null,

  fetchHousehold: async () => {
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      console.log('[fetchHousehold] no user:', userErr?.message);
      set({ members: [], householdId: null, householdName: null });
      return;
    }

    const { data: memberships, error: memErr } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false })
      .limit(1);

    if (memErr) console.log('[fetchHousehold] membership error:', memErr.message);

    const myMembership = memberships?.[0] ?? null;

    if (!myMembership) {
      set({ members: [], householdId: null, householdName: null });
      return;
    }

    const householdId = myMembership.household_id as string;

    const [{ data: household, error: hhErr }, { data: memberRows, error: mrErr }] = await Promise.all([
      supabase.from('households').select('name').eq('id', householdId).single(),
      supabase
        .from('household_members')
        .select('user_id, joined_at')
        .eq('household_id', householdId)
        .order('joined_at', { ascending: true }),
    ]);

    if (hhErr) console.log('[fetchHousehold] household error:', hhErr.message);
    if (mrErr) console.log('[fetchHousehold] members error:', mrErr.message);

    if (!memberRows || memberRows.length === 0) {
      set({ members: [], householdId, householdName: household?.name ?? null });
      return;
    }

    const userIds = memberRows.map((m: any) => m.user_id);
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('user_id, email')
      .in('user_id', userIds);

    const profileMap: Record<string, string> = {};
    (profileRows ?? []).forEach((p: any) => { profileMap[p.user_id] = p.email; });

    const members: MemberInfo[] = memberRows.map((m: any, i: number) => {
      const email = profileMap[m.user_id] ?? '';
      return {
        userId: m.user_id,
        email,
        initials: email ? getInitials(email) : '?',
        color: MEMBER_COLORS[i % MEMBER_COLORS.length],
      };
    });

    set({ members, householdId, householdName: household?.name ?? null });
  },

  createHousehold: async (name: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'Not signed in';

    const { data: household, error: hErr } = await supabase
      .from('households')
      .insert({ name, owner_id: user.id })
      .select('id')
      .single();

    console.log('[createHousehold] households insert:', household?.id ?? null, hErr?.message ?? 'ok');
    if (hErr || !household) return hErr?.message ?? 'Failed to create household';

    const { error: mErr } = await supabase
      .from('household_members')
      .insert({ household_id: household.id, user_id: user.id, role: 'owner' });

    console.log('[createHousehold] household_members insert:', mErr?.message ?? 'ok');
    if (mErr) return mErr.message;

    await get().fetchHousehold();
    return null;
  },

  createInvite: async (invitedEmail: string) => {
    const { householdId } = get();
    if (!householdId) return { error: 'Not in a household' };

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not signed in' };

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from('household_invites').insert({
      household_id: householdId,
      invited_by: user.id,
      invited_email: invitedEmail,
      token,
      status: 'pending',
      expires_at: expiresAt,
    });

    if (error) return { error: error.message };

    return { link: `checkfridge://accept-invite?token=${token}` };
  },

  leaveHousehold: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'Not signed in';

    const { error } = await supabase
      .from('household_members')
      .delete()
      .eq('user_id', user.id);

    if (error) return error.message;

    set({ members: [], householdId: null, householdName: null });
    return null;
  },

  acceptInvite: async (token: string) => {
    const { data, error } = await supabase.functions.invoke('accept-invite', {
      body: { token },
    });

    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };

    await get().fetchHousehold();
    return { householdName: data?.household_name ?? get().householdName ?? 'the household' };
  },
}));
