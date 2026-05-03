// ============================================================
// CheckFridge — Accept Household Invite (Supabase Edge Function)
//
// Called by the app when a user taps an invite link.
// Validates the token, adds the user to the household,
// and marks the invite accepted.
//
// ANNA: Deploy with:
//   supabase functions deploy accept-invite
//
// No extra secrets needed — uses SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY, which Supabase injects automatically.
//
// Request (POST):
//   Authorization: Bearer <user JWT>        ← required, identifies who is accepting
//   Body: { "token": "<invite token>" }
//
// Responses:
//   200 { household_id, household_name }    ← success
//   400 { error: "..." }                    ← bad/expired/already-used token
//   401 { error: "..." }                    ← missing or invalid JWT
//   409 { error: "..." }                    ← already a member
//   500 { error: "..." }                    ← unexpected failure
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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── 1. Parse the invite token from the request body ──────────────────
    const { token } = await req.json() as { token?: string };
    if (!token) return json({ error: 'token is required' }, 400);

    // ── 2. Identify the authenticated user from their JWT ─────────────────
    //    We use the anon client + the user's JWT to do this safely.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Authorization header required' }, 401);

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) return json({ error: 'Invalid or expired session' }, 401);

    // ── 3. Use the service role client for all DB writes ──────────────────
    //    Service role bypasses RLS so we can write household_members
    //    on behalf of the invited user (who isn't the household owner).
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── 4. Look up and validate the invite token ──────────────────────────
    const { data: invite, error: inviteError } = await adminClient
      .from('household_invites')
      .select('id, household_id, invited_email, status, expires_at')
      .eq('token', token)
      .single();

    if (inviteError || !invite) {
      return json({ error: 'Invite not found. The link may be invalid.' }, 400);
    }

    if (invite.status === 'accepted') {
      return json({ error: 'This invite has already been accepted.' }, 400);
    }

    if (invite.status === 'expired' || new Date(invite.expires_at) < new Date()) {
      // Mark expired if not already
      await adminClient
        .from('household_invites')
        .update({ status: 'expired' })
        .eq('id', invite.id);
      return json({ error: 'This invite link has expired. Ask the household owner to send a new one.' }, 400);
    }

    // ── 5. Check the user isn't already in this household ─────────────────
    const { data: existingMember } = await adminClient
      .from('household_members')
      .select('id')
      .eq('household_id', invite.household_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingMember) {
      return json({ error: 'You are already a member of this household.' }, 409);
    }

    // ── 6. Add the user to the household ─────────────────────────────────
    //    The 5-member limit trigger fires here — if it throws, we catch below.
    const { error: insertError } = await adminClient
      .from('household_members')
      .insert({ household_id: invite.household_id, user_id: user.id, role: 'member' });

    if (insertError) {
      // Surface the trigger's "maximum of 5 members" message if that's what fired
      if (insertError.message?.includes('maximum of 5 members')) {
        return json({ error: 'This household is full (5 members maximum).' }, 400);
      }
      throw insertError;
    }

    // ── 7. Mark the invite as accepted ───────────────────────────────────
    await adminClient
      .from('household_invites')
      .update({ status: 'accepted' })
      .eq('id', invite.id);

    // ── 8. Return the household info so the app can navigate ──────────────
    const { data: household } = await adminClient
      .from('households')
      .select('id, name')
      .eq('id', invite.household_id)
      .single();

    return json({ household_id: household?.id, household_name: household?.name });

  } catch (err) {
    console.error('accept-invite error:', err);
    return json({ error: (err as Error).message ?? 'Unexpected error' }, 500);
  }
});
