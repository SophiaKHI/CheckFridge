// ============================================================
// CheckFridge — Daily Expiry Check (Supabase Edge Function)
//
// Triggered by pg_cron every day at 9:00 AM UTC.
// Sends Expo push notifications to users whose items expire
// in exactly 1 or 2 days.
//
// ANNA: Deploy with:
//   supabase functions deploy check-expiry
//
// Set the cron secret (must match setup_cron_jobs.sql):
//   supabase secrets set CRON_SECRET=<your-random-string>
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getRecipeHint(itemName: string): string {
  const n = itemName.toLowerCase();
  if (n.includes('chicken')) return 'Quick idea: stir-fry or a simple soup';
  if (n.includes('beef') || n.includes('steak') || n.includes('mince')) return 'Quick idea: bolognese, stir-fry, or burgers';
  if (n.includes('pork') || n.includes('sausage') || n.includes('bacon')) return 'Quick idea: quick fry-up or pasta';
  if (n.includes('fish') || n.includes('salmon') || n.includes('tuna')) return 'Quick idea: pan-fry with lemon & herbs';
  if (n.includes('milk') || n.includes('cream')) return 'Great for pancakes, oatmeal, or a smoothie';
  if (n.includes('egg')) return 'Quick idea: omelette, frittata, or fried rice';
  if (n.includes('bread')) return 'Perfect for French toast, croutons, or a toastie';
  if (n.includes('tomato')) return 'Quick idea: pasta sauce or bruschetta';
  if (n.includes('spinach') || n.includes('lettuce') || n.includes('salad')) return 'Quick idea: wilted greens or a fresh salad';
  if (n.includes('apple') || n.includes('banana') || n.includes('berry') || n.includes('peach')) return 'Great in a smoothie or crumble';
  if (n.includes('cheese')) return 'Quick idea: toastie, omelette, or pasta bake';
  if (n.includes('yogurt') || n.includes('yoghurt')) return 'Great with granola or as a sauce base';
  if (n.includes('mushroom')) return 'Quick idea: stir-fry, omelette, or pasta';
  if (n.includes('pepper') || n.includes('courgette') || n.includes('zucchini')) return 'Quick idea: roasted veggies or stir-fry';
  if (n.includes('avocado')) return 'Quick idea: avocado toast or a smoothie bowl';
  if (n.includes('butter')) return 'Great for baking, pan sauces, or garlic bread';
  return 'Use it today before it expires!';
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
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── 1. Calculate dates: tomorrow and the day after ────────────────────
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const d1 = new Date(today); d1.setUTCDate(d1.getUTCDate() + 1);
    const d2 = new Date(today); d2.setUTCDate(d2.getUTCDate() + 2);
    const d1Str = d1.toISOString().split('T')[0]; // tomorrow
    const d2Str = d2.toISOString().split('T')[0]; // day after tomorrow

    // ── 2. Query active items expiring in 1 or 2 days ────────────────────
    const { data: items, error: itemsError } = await adminClient
      .from('fridge_items')
      .select('user_id, name, expiry_date')
      .eq('status', 'active')
      .in('expiry_date', [d1Str, d2Str]);

    if (itemsError) throw itemsError;
    if (!items || items.length === 0) return json({ sent: 0, message: 'No items expiring in 1–2 days' });

    // ── 3. Group items by user ────────────────────────────────────────────
    const userItems: Record<string, Array<{ name: string; daysLeft: number }>> = {};
    for (const item of items) {
      const daysLeft = item.expiry_date === d1Str ? 1 : 2;
      (userItems[item.user_id] ??= []).push({ name: item.name, daysLeft });
    }

    // ── 4. Get push tokens for affected users ─────────────────────────────
    const { data: profiles } = await adminClient
      .from('profiles')
      .select('user_id, push_token')
      .in('user_id', Object.keys(userItems))
      .not('push_token', 'is', null);

    // ── 5. Build Expo push messages ───────────────────────────────────────
    const messages: object[] = [];
    for (const profile of profiles ?? []) {
      if (!profile.push_token) continue;
      for (const item of userItems[profile.user_id] ?? []) {
        if (item.daysLeft === 2) {
          messages.push({
            to: profile.push_token,
            sound: 'default',
            title: `⏰ ${item.name} expires in 2 days`,
            body: getRecipeHint(item.name),
          });
        } else {
          messages.push({
            to: profile.push_token,
            sound: 'default',
            title: `🚨 ${item.name} expires tomorrow!`,
            body: "Use it today — don't let it go to waste.",
          });
        }
      }
    }

    if (messages.length === 0) return json({ sent: 0, message: 'No users with push tokens enabled' });

    // ── 6. Send to Expo push service ──────────────────────────────────────
    await sendToBatchExpoAPI(messages);

    console.log(`check-expiry: sent ${messages.length} notifications`);
    return json({ sent: messages.length });

  } catch (err) {
    console.error('check-expiry error:', err);
    return json({ error: (err as Error).message ?? 'Unexpected error' }, 500);
  }
});
