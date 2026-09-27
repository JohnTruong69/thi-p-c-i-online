/** Public server fn: request the account email for a paid presale order or a pending partner invite. Token possession + DB-owned email only. */
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';
import { z } from 'zod';

export const requestAccountEmail = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => z.object({ kind: z.enum(['presale', 'partner']), token: z.string().regex(/^[0-9a-f]{64}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { provisionAccount } = await import('./account-provision.server');
    const { createClient } = await import('@supabase/supabase-js');
    const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
    const anon = createClient(process.env['SUPABASE_URL']!, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const host = getRequestHeader('x-forwarded-host') ?? getRequestHeader('host');
    const proto = getRequestHeader('x-forwarded-proto') ?? 'https';
    const origin = host ? `${proto}://${host}` : '';
    if (!origin) return { ok: false as const, reason: 'send_failed' as const };
    const r = await provisionAccount(supabaseAdmin as never, { kind: data.kind, token: data.token, origin, mode: 'email', anon: anon as never });
    return r.ok ? { ok: true as const, sent: r.sent } : { ok: false as const, reason: r.reason };
  });
