import { resolveAppOrigin } from './app-origin';
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

/** True when the signed-in account has the admin role (for showing the admin entry point only; server still re-checks). */
export const getIsAdmin = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    return data === true;
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
        appOrigin: !!resolveAppOrigin({ APP_ORIGIN: process.env['APP_ORIGIN'], APP_ORIGIN_ALLOWLIST: process.env['APP_ORIGIN_ALLOWLIST'] }),
      },
      offer: s ? { price_vnd: s.price_vnd, terms_version: s.terms_version, offer_version: s.offer_version } : null,
      settings: s ? { offerVersion: s.offer_version, priceVnd: Number(s.price_vnd), termsVersion: s.terms_version, termsUrl: s.terms_url, bankGateway: s.bank_gateway, bankAccountNumber: s.bank_account_number, bankAccountName: s.bank_account_name, accountEnabled: s.account_enabled } : null,
      unmatched: tx, orders,
    };
  });

export const reconcileSepayTransaction = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ txId: z.number().int().positive(), orderCode: z.string().regex(/^TCO[A-Z0-9]{8}$/), note: z.string().trim().min(15).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const o = (await supabaseAdmin.from('billing_orders').select('id').eq('code', data.orderCode).maybeSingle()).data;
    if (!o) throw new Error('order not found');
    const { data: r, error } = await supabaseAdmin.rpc('match_sepay_transaction', { p_tx: data.txId, p_order_id: o.id, p_actor: context.userId, p_note: data.note });
    if (error) throw new Error('reconcile failed');
    return r as { result: string; reason?: string };
  });

const settingsSchema = z.object({
  offerVersion: z.string().regex(/^[a-z0-9_.-]{3,40}$/),
  priceVnd: z.number().int().positive().max(100000000),
  termsVersion: z.string().trim().min(1).max(40),
  termsUrl: z.string().trim().regex(/^https:\/\//).max(500).nullable(),
  bankGateway: z.string().trim().min(2).max(40).nullable(),
  bankAccountNumber: z.string().regex(/^[0-9A-Za-z]{4,30}$/).nullable(),
  bankAccountName: z.string().trim().min(2).max(120).nullable(),
  accountEnabled: z.boolean(),
});

/** Admin-only save of SePay offer/account settings. Never turns live sale on; any material change
 *  also clears terms approval / sandbox verification so they must be re-done by the operator. */
export const saveBillingSettings = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => settingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    if (data.accountEnabled && (!data.bankGateway || !data.bankAccountNumber || !data.bankAccountName)) throw new Error('account incomplete');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const cur = (await supabaseAdmin.from('billing_settings').select('*').maybeSingle()).data;
    const termsChanged = !cur || cur.terms_version !== data.termsVersion || (cur.terms_url ?? null) !== data.termsUrl || Number(cur.price_vnd) !== data.priceVnd || cur.offer_version !== data.offerVersion;
    const payChanged = !cur || cur.bank_gateway !== data.bankGateway || cur.bank_account_number !== data.bankAccountNumber || cur.bank_account_name !== data.bankAccountName || Number(cur.price_vnd) !== data.priceVnd;
    const row = {
      id: true, offer_version: data.offerVersion, price_vnd: data.priceVnd, terms_version: data.termsVersion, terms_url: data.termsUrl,
      bank_gateway: data.bankGateway, bank_account_number: data.bankAccountNumber, bank_account_name: data.bankAccountName,
      account_enabled: data.accountEnabled, live_enabled: false, updated_at: new Date().toISOString(),
      terms_approved_at: termsChanged ? null : cur!.terms_approved_at, terms_approved_by: termsChanged ? null : cur!.terms_approved_by,
      sandbox_verified_at: payChanged || termsChanged ? null : cur!.sandbox_verified_at,
    };
    const { error } = await supabaseAdmin.from('billing_settings').upsert(row);
    if (error) throw new Error('save failed');
    return { ok: true, clearedApproval: termsChanged && !!cur?.terms_approved_at, clearedSandbox: (payChanged || termsChanged) && !!cur?.sandbox_verified_at };
  });
