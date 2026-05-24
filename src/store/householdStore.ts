import { create } from 'zustand';
import { supabase } from '../lib/supabase';

// Soft palette — chosen to not clash with expiry colors (green/yellow/orange/red)
const MEMBER_COLORS = [
  '#5B8AF0', // blue
  '#A55BF0', // purple
  '#F05BA0', // pink
  '#F0B35B', // amber
  '#5BC4F0', // sky
];

function getInitials(email: string): string {
  const local = email.split('@')[0];          // 'anna.klinker'
  const parts = local.split(/[._\-+]/);       // ['anna', 'klinker']
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase(); // 'AK'
  }
  return local.slice(0, 2).toUpperCase();     // 'AN' for single-word emails
}

export interface MemberInfo {
  userId: string;
  email: string;
  initials: string;
  color: string;
}

interface HouseholdState {
  /** Empty array = solo user (not in a household) */
  members: MemberInfo[];
  householdId: string | null;
  fetchHousehold: () => Promise<void>;
}

export const useHouseholdStore = create<HouseholdState>((set) => ({
  members: [],
  householdId: null,

  fetchHousehold: async () => {
    // 1. Check if current user is in any household
    const { data: myMembership } = await supabase
      .from('household_members')
      .select('household_id')
      .maybeSingle();

    if (!myMembership) {
      set({ members: [], householdId: null });
      return;
    }

    const householdId = myMembership.household_id as string;

    // 2. Fetch all members of that household, sorted by join date (owner first)
    const { data: memberRows } = await supabase
      .from('household_members')
      .select('user_id, joined_at')
      .eq('household_id', householdId)
      .order('joined_at', { ascending: true });

    if (!memberRows || memberRows.length === 0) {
      set({ members: [], householdId });
      return;
    }

    // 3. Fetch their profiles to get emails for initials
    const userIds = memberRows.map((m: any) => m.user_id);
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('user_id, email')
      .in('user_id', userIds);

    const profileMap: Record<string, string> = {};
    (profileRows ?? []).forEach((p: any) => { profileMap[p.user_id] = p.email; });

    // 4. Build MemberInfo — color assigned by join order
    const members: MemberInfo[] = memberRows.map((m: any, i: number) => {
      const email = profileMap[m.user_id] ?? '';
      return {
        userId: m.user_id,
        email,
        initials: email ? getInitials(email) : '?',
        color: MEMBER_COLORS[i % MEMBER_COLORS.length],
      };
    });

    set({ members, householdId });
  },
}));
