/** Public server fn: request the account email for a paid presale order or a pending partner invite. Token possession + DB-owned email only. */
import { createServerFn } from '@tanstack/react-start';
import { resolveAppOrigin } from './app-origin';
import { z } from 'zod';

export const requestAccountEmail = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => z.object({ kind: z.enum(['presale', 'partner']), token: z.string().regex(/^[0-9a-f]{64}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { provisionAccount } = await import('./account-provision.server');
    const { createClient } = await import('@supabase/supabase-js');
    const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
    const anon = createClient(process.env['SUPABASE_URL']!, key, { auth: { persistSession: false, autoRefreshToken: false } });
    // Never derive the email link from the incoming request (host and forwarding headers are caller-controlled).
    const origin = resolveAppOrigin({ APP_ORIGIN: process.env['APP_ORIGIN'], APP_ORIGIN_ALLOWLIST: process.env['APP_ORIGIN_ALLOWLIST'] });
    if (!origin) { console.error('account email refused: APP_ORIGIN missing or invalid'); return { ok: false as const, reason: 'not_configured' as const }; }
    const r = await provisionAccount(supabaseAdmin as never, { kind: data.kind, token: data.token, origin, mode: 'email', anon: anon as never });
    return r.ok ? { ok: true as const, sent: r.sent } : { ok: false as const, reason: r.reason };
  });

/** Server-side check that /register was reached from a valid paid order claim or a live partner/viewer invite. UI gate only — provider signup is still open. */
export const checkSignupContext = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => z.object({ redirect: z.string().max(200).optional(), email: z.string().max(255).optional() }).parse(d))
  .handler(async ({ data }) => {
    const m = /^\/(claim|invite|viewer-invite)\/([0-9a-f]{64})$/.exec(data.redirect ?? '');
    if (!m) return { eligible: false as const };
    const kind = m[1] as 'claim' | 'invite' | 'viewer-invite';
    const { createHash } = await import('crypto');
    const h = createHash('sha256').update(m[2]!, 'utf8').digest('hex');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const now = Date.now(); let email: string | null = null;
    if (kind === 'claim') {
      const r = await supabaseAdmin.from('presale_orders').select('email, status, claim_expires_at').eq('token_hash', h).maybeSingle();
      if (r.data && r.data.status === 'paid' && r.data.claim_expires_at && Date.parse(r.data.claim_expires_at) > now) email = r.data.email;
    } else {
      const table = kind === 'invite' ? 'wedding_invites' : 'wedding_viewer_invites';
      const r = await supabaseAdmin.from(table).select('email, status, expires_at').eq('token_hash', h).maybeSingle();
      if (r.data && r.data.status === 'pending' && Date.parse(r.data.expires_at) > now) email = r.data.email;
    }
    if (!email) return { eligible: false as const };
    const emailMatches = data.email === undefined ? null : data.email.trim().toLowerCase() === email.toLowerCase();
    return { eligible: true as const, kind, emailMatches };
  });
