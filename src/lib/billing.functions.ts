/** Checkout server functions. Staged OFF: every path requires DB live config + server env go-live + webhook secret. */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { checkoutEnvReady } from './sepay';

type Offer = { price_vnd: number; duration_months: number; terms_version: string; terms_url: string | null; offer_version: string };
export type CheckoutAvailability = { available: boolean; offer: Offer | null };

const envState = () => checkoutEnvReady({ secret: process.env['SEPAY_WEBHOOK_SECRET'], goLive: process.env['CHECKOUT_GO_LIVE'] });

export const getCheckoutAvailability = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CheckoutAvailability> => {
    const { data, error } = await context.supabase.rpc('billing_offer_status');
    if (error) throw new Error('availability failed');
    const s = (data ?? {}) as Record<string, unknown>;
    const env = envState();
    const available = s['live'] === true && env.goLive && env.webhookSecret;
    if (!available) return { available: false, offer: null };
    return { available: true, offer: { price_vnd: Number(s['price_vnd']), duration_months: 36, terms_version: String(s['terms_version']), terms_url: (s['terms_url'] as string) ?? null, offer_version: String(s['offer_version']) } };
  });

export const createCheckoutOrder = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ weddingId: z.string().uuid(), acceptTermsVersion: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const env = envState();
    if (!env.goLive || !env.webhookSecret) throw new Error('checkout unavailable');
    const { data: isMgr } = await context.supabase.rpc('is_wedding_manager', { _wedding_id: data.weddingId });
    if (!isMgr) throw new Error('forbidden');
    const status = (await context.supabase.rpc('billing_offer_status')).data as Record<string, unknown> | null;
    if (!status || status['live'] !== true) throw new Error('checkout unavailable');
    if (status['terms_version'] !== data.acceptTermsVersion) throw new Error('terms changed');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: r, error } = await supabaseAdmin.rpc('create_billing_order', { p_wedding_id: data.weddingId, p_user_id: context.userId });
    if (error) throw new Error(error.message.includes('already entitled') ? 'already entitled' : error.message.includes('unavailable') ? 'checkout unavailable' : 'order failed');
    return r as { order_id: string; reused: boolean };
  });

async function requireAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
  if (data !== true) throw new Error('forbidden');
}

export const getBillingAdminOverview = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const env = envState();
    const s = (await supabaseAdmin.from('billing_settings').select('*').maybeSingle()).data;
    const tx = (await supabaseAdmin.from('sepay_transactions').select('id, sepay_id, transaction_date, transfer_amount, transfer_type, code, content, unmatched_reason, received_at, match_status').neq('match_status', 'matched').order('received_at', { ascending: false }).limit(50)).data ?? [];
    const orders = (await supabaseAdmin.from('billing_orders').select('id, code, status, amount_vnd, created_at, paid_at, expires_at').order('created_at', { ascending: false }).limit(50)).data ?? [];
    return {
      checklist: {
        offerInstalled: !!s, termsApproved: !!s?.terms_approved_at, accountEnabled: !!s?.account_enabled, sandboxVerified: !!s?.sandbox_verified_at,
        accountLast4: s?.bank_account_number ? s.bank_account_number.slice(-4) : null, liveEnabled: !!s?.live_enabled,
        webhookSecret: env.webhookSecret, goLive: env.goLive,
      },
      offer: s ? { price_vnd: s.price_vnd, terms_version: s.terms_version, offer_version: s.offer_version } : null,
      unmatched: tx, orders,
    };
  });

export const reconcileSepayTransaction = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ txId: z.number().int().positive(), orderCode: z.string().regex(/^TCO[A-Z0-9]{8}$/), note: z.string().trim().min(5).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const o = (await supabaseAdmin.from('billing_orders').select('id').eq('code', data.orderCode).maybeSingle()).data;
    if (!o) throw new Error('order not found');
    const { data: r, error } = await supabaseAdmin.rpc('match_sepay_transaction', { p_tx: data.txId, p_order_id: o.id, p_actor: context.userId, p_note: data.note });
    if (error) throw new Error('reconcile failed');
    return r as { result: string; reason?: string };
  });
