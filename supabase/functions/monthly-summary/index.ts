// ============================================================
// CheckFridge — Monthly Summary (Supabase Edge Function)
//
// Triggered by pg_cron on the 1st of each month at 10:00 AM UTC.
// For each user, summarises last month's fridge activity and
// sends a push notification. Also expires free trials that have
// run for more than 30 days without a paid subscription.
//
// ANNA: Deploy with:
//   supabase functions deploy monthly-summary
//
// Set the cron secret (must match setup_cron_jobs.sql):
//   supabase secrets set CRON_SECRET=<your-random-string>
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Rough price per item in EUR — used for "money saved" estimate
const ITEM_PRICES: Record<string, number> = {
  chicken: 5, beef: 7, steak: 8, mince: 4, pork: 5, lamb: 8,
  sausage: 4, sausages: 4, bacon: 4, ham: 3, turkey: 6,
  salmon: 8, fish: 6, tuna: 4, prawns: 7, shrimp: 7,
  milk: 1.5, cream: 2, butter: 2.5, cheese: 3, yogurt: 1.5,
  yoghurt: 1.5, eggs: 3, egg: 3,
  bread: 2, pasta: 1.5, rice: 1, flour: 1.5,
  apple: 2, banana: 1.5, orange: 2, lemon: 1, avocado: 2,
  strawberries: 3, berries: 3, grapes: 3, mango: 2.5,
  tomato: 2, tomatoes: 2, lettuce: 1.5, spinach: 2, broccoli: 2,
  carrots: 1.5, carrot: 1.5, cucumber: 1.5, pepper: 2, peppers: 2,
  potato: 2, potatoes: 2, onion: 1, garlic: 1.5,
  mushrooms: 2, mushroom: 2, courgette: 2, zucchini: 2,
  juice: 2.5, wine: 8, beer: 3.5, soda: 1.5,
  soup: 2, salad: 2.5, sauce: 2,
};

const TRIAL_DAYS = 30;

function getItemPrice(name: string): number {
  const n = name.toLowerCase();
  for (const [key, price] of Object.entries(ITEM_PRICES)) {
    if (n.includes(key)) return price;
  }
  return 2; // default €2 for unlisted items
}

function mostFrequent(names: string[]): string | null {
  if (names.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const n of names) counts[n] = (counts[n] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

async function sendToBatchExpoAPI(messages: object[]): Promise<void> {
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(chunk),
    });
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const now = new Date();
    const firstOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const firstOfLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

    // ── 1. Items that changed status last month ───────────────────────────
    const { data: changedItems, error: itemsError } = await adminClient
      .from('fridge_items')
      .select('user_id, name, status')
      .in('status', ['used', 'trashed'])
      .gte('status_changed_at', firstOfLastMonth.toISOString())
      .lt('status_changed_at', firstOfThisMonth.toISOString());

    if (itemsError) throw itemsError;

    // ── 2. Build per-user stats ───────────────────────────────────────────
    const userStats: Record<string, {
      usedItems: string[];
      trashedItems: string[];
      moneySaved: number;
    }> = {};

    for (const item of changedItems ?? []) {
      const s = (userStats[item.user_id] ??= { usedItems: [], trashedItems: [], moneySaved: 0 });
      if (item.status === 'used') {
        s.usedItems.push(item.name);
        s.moneySaved += getItemPrice(item.name);
      } else {
        s.trashedItems.push(item.name);
      }
    }

    // ── 3. Load all profiles + all subscriptions ──────────────────────────
    const [{ data: profiles }, { data: subscriptions }] = await Promise.all([
      adminClient.from('profiles').select('user_id, push_token, trial_start'),
      adminClient.from('subscriptions').select('id, user_id, status, revenuecat_customer_id'),
    ]);

    const subByUser = Object.fromEntries(
      (subscriptions ?? []).map((s) => [s.user_id, s])
    );

    // ── 4. Process each user ──────────────────────────────────────────────
    const trialExpiryUpdates: string[] = []; // subscription IDs to mark expired
    const messages: object[] = [];

    for (const profile of profiles ?? []) {
      // --- Trial expiry check ---
      const sub = subByUser[profile.user_id];
      if (profile.trial_start && sub) {
        const trialAgeMs = now.getTime() - new Date(profile.trial_start).getTime();
        const trialAgeDays = trialAgeMs / (1000 * 60 * 60 * 24);
        const isPaid = !!sub.revenuecat_customer_id;
        const isAlreadyExpiredOrCanceled = sub.status === 'expired' || sub.status === 'canceled';

        if (trialAgeDays > TRIAL_DAYS && !isPaid && !isAlreadyExpiredOrCanceled) {
          trialExpiryUpdates.push(sub.id);
        }
      }

      // --- Monthly summary notification ---
      const stats = userStats[profile.user_id];
      if (!profile.push_token || !stats) continue;

      const usedCount = stats.usedItems.length;
      const wastedCount = stats.trashedItems.length;
      if (usedCount + wastedCount === 0) continue;

      const savedStr = stats.moneySaved.toFixed(0);
      let body = `Used ${usedCount} item${usedCount !== 1 ? 's' : ''}, wasted ${wastedCount}. Saved ~€${savedStr} this month!`;

      const mostWasted = mostFrequent(stats.trashedItems);
      const mostUsed = mostFrequent(stats.usedItems);
      if (mostWasted && wastedCount > 1) body += ` Most wasted: ${mostWasted}.`;
      if (mostUsed && usedCount > 1) body += ` Most used: ${mostUsed}.`;

      messages.push({
        to: profile.push_token,
        sound: 'default',
        title: '📊 Your monthly fridge report',
        body,
        data: { type: 'monthly_summary', usedCount, wastedCount, moneySaved: stats.moneySaved, mostWasted, mostUsed },
      });
    }

    // ── 5. Expire stale free trials ───────────────────────────────────────
    if (trialExpiryUpdates.length > 0) {
      await adminClient
        .from('subscriptions')
        .update({ status: 'expired' })
        .in('id', trialExpiryUpdates);
      console.log(`monthly-summary: expired ${trialExpiryUpdates.length} free trial(s)`);
    }

    // ── 6. Send notifications ─────────────────────────────────────────────
    if (messages.length > 0) {
      await sendToBatchExpoAPI(messages);
    }

    console.log(`monthly-summary: sent ${messages.length} notifications, expired ${trialExpiryUpdates.length} trials`);
    return new Response(
      JSON.stringify({ sent: messages.length, trialsExpired: trialExpiryUpdates.length }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('monthly-summary error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? 'Unexpected error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
