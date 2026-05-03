// ============================================================
// CheckFridge — RevenueCat Webhook (Supabase Edge Function)
//
// Called by RevenueCat when subscription events occur.
// Upserts the subscriptions table based on event type.
//
// ANNA: Deploy with:
//   supabase functions deploy revenuecat-webhook
//
// Set the webhook secret with:
//   supabase secrets set REVENUECAT_WEBHOOK_SECRET=<your secret>
//
// In RevenueCat dashboard: Integrations → Webhooks
//   URL: https://<your-project>.supabase.co/functions/v1/revenuecat-webhook
//   Authorization: <same value as REVENUECAT_WEBHOOK_SECRET>
//
// !! PLACEHOLDER: Update parsePlan() below once you have real
//    App Store Connect product IDs configured in RevenueCat.
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// !! PLACEHOLDER — update product ID strings to match your real RevenueCat products.
// Expected format examples:
//   com.checkfridge.solo.monthly
//   com.checkfridge.solo.annual
//   com.checkfridge.household.monthly
//   com.checkfridge.household.annual
function parsePlan(productId: string): { plan: 'solo' | 'household'; billing_interval: 'monthly' | 'annual' } | null {
  const id = productId.toLowerCase();
  const plan: 'solo' | 'household' = id.includes('household') ? 'household' : 'solo';
  const billing_interval: 'monthly' | 'annual' = id.includes('annual') ? 'annual' : 'monthly';

  // Reject anything that doesn't look like a CheckFridge product
  if (!id.includes('checkfridge')) return null;

  return { plan, billing_interval };
}

// Map RevenueCat event types → subscriptions.status values
function mapStatus(eventType: string): 'trialing' | 'active' | 'canceled' | 'expired' | 'past_due' | null {
  switch (eventType) {
    case 'TRIAL_STARTED':
      return 'trialing';
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'TRIAL_CONVERTED':
    case 'BILLING_ISSUE_RESOLVED_WITHOUT_USER_ACTION':
      return 'active';
    case 'CANCELLATION':
    case 'TRIAL_CANCELLED':
      return 'canceled';
    case 'EXPIRATION':
      return 'expired';
    case 'BILLING_ISSUES_ENTERED_GRACE_PERIOD':
      return 'past_due';
    default:
      return null; // unhandled event — acknowledge and ignore
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── 1. Verify the webhook secret ─────────────────────────────────────
    //    RevenueCat sends the secret as the raw Authorization header value
    //    (not a Bearer token — just the secret string itself).
    const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
    const authHeader = req.headers.get('Authorization');
    if (!secret || authHeader !== secret) {
      return json({ error: 'Unauthorized' }, 401);
    }

    // ── 2. Parse the RevenueCat event payload ─────────────────────────────
    const body = await req.json();
    const event = body?.event;
    if (!event) return json({ error: 'No event in payload' }, 400);

    const {
      type: eventType,
      app_user_id,
      original_app_user_id,
      product_id,
      purchased_at_ms,
      expiration_at_ms,
    } = event;

    // original_app_user_id is stable across alias changes; prefer it
    const userId = original_app_user_id ?? app_user_id;
    if (!userId) return json({ error: 'No user ID in event' }, 400);

    // ── 3. Map event type → status ────────────────────────────────────────
    const status = mapStatus(eventType);
    if (status === null) {
      // Not an event we act on — acknowledge cleanly so RevenueCat doesn't retry
      return json({ received: true, action: 'ignored', eventType });
    }

    // ── 4. Parse plan + billing interval from product ID ─────────────────
    const planInfo = parsePlan(product_id ?? '');
    if (!planInfo) {
      console.warn('revenuecat-webhook: unknown product_id:', product_id);
      return json({ received: true, action: 'ignored', reason: 'unknown product_id' });
    }

    // ── 5. Upsert subscription row via service role ───────────────────────
    //    Service role bypasses RLS — app code is read-only on this table.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check for an existing subscription row for this user
    const { data: existing } = await adminClient
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    const payload = {
      user_id: userId,
      plan: planInfo.plan,
      billing_interval: planInfo.billing_interval,
      status,
      revenuecat_customer_id: app_user_id,
      current_period_start: purchased_at_ms ? new Date(purchased_at_ms).toISOString() : null,
      current_period_end: expiration_at_ms ? new Date(expiration_at_ms).toISOString() : null,
    };

    if (existing) {
      const { error } = await adminClient
        .from('subscriptions')
        .update(payload)
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await adminClient
        .from('subscriptions')
        .insert(payload);
      if (error) throw error;
    }

    return json({ received: true, action: existing ? 'updated' : 'created', status });

  } catch (err) {
    console.error('revenuecat-webhook error:', err);
    return json({ error: (err as Error).message ?? 'Unexpected error' }, 500);
  }
});
