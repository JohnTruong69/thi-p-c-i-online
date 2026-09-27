/** New-customer presale (pay before account). Public, no auth; every mutating path requires DB live + server go-live + webhook secret. */
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';
import { z } from 'zod';
import { checkoutEnvReady } from './sepay';
import { PRESALE_PRICE_VND, maskEmail, presaleLive, sepayQrUrl } from './presale';

const envState = () => checkoutEnvReady({ secret: process.env['SEPAY_WEBHOOK_SECRET'], goLive: process.env['CHECKOUT_GO_LIVE'] });

async function sha256Hex(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
}

async function liveSettings() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const s = (await supabaseAdmin.from('billing_settings').select('live_enabled, terms_version, terms_url, price_vnd, plan_version, terms_approved_at').maybeSingle()).data;
  const env = envState();
  return { s, live: presaleLive(s, env) };
}

export const getPublicOffer = createServerFn({ method: 'GET' }).handler(async () => {
  const { s, live } = await liveSettings();
  return { priceVnd: PRESALE_PRICE_VND, months: 36, live, termsVersion: live ? s!.terms_version : null, termsUrl: live ? s!.terms_url : null };
});

export const createPresaleOrder = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().email().max(255), termsVersion: z.string().min(1).max(40), acceptTerms: z.literal(true) }).parse(d))
  .handler(async ({ data }) => {
    const { live } = await liveSettings();
    if (!live) return { ok: false as const, error: 'unavailable' };
    const ip = getRequestHeader('cf-connecting-ip') ?? getRequestHeader('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const ipHash = await sha256Hex(`${process.env['SEPAY_WEBHOOK_SECRET']}|ip|${ip}`);
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.rpc('create_presale_order', { p_email: data.email, p_terms_version: data.termsVersion, p_ip_hash: ipHash, p_token: token });
    if (error) {
      const m = error.message;
      return { ok: false as const, error: m.includes('rate limited') ? 'rate_limited' : m.includes('terms changed') ? 'terms_changed' : m.includes('unavailable') ? 'unavailable' : 'failed' };
    }
    return { ok: true as const, token };
  });

export const getPresaleStatus = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const o = (await supabaseAdmin.from('presale_orders').select('code, email, status, amount_vnd, expires_at, paid_at, claim_expires_at, bank_gateway, bank_account_number, bank_account_name').eq('token_hash', await sha256Hex(data.token)).maybeSingle()).data;
    if (!o) return { found: false as const };
    const { live } = await liveSettings();
    const expired = o.status === 'expired' || (o.status === 'pending' && new Date(o.expires_at) <= new Date());
    const status = expired ? 'expired' : o.status;
    const showPayment = status === 'pending' && live && Number(o.amount_vnd) === PRESALE_PRICE_VND;
    return {
      found: true as const, status, maskedEmail: maskEmail(o.email), amountVnd: Number(o.amount_vnd), expiresAt: o.expires_at, paidAt: o.paid_at, claimExpiresAt: o.claim_expires_at,
      payment: showPayment ? { code: o.code, bank: o.bank_gateway, account: o.bank_account_number, accountName: o.bank_account_name, qr: sepayQrUrl(o.bank_account_number, o.bank_gateway, Number(o.amount_vnd), o.code) } : null,
    };
  });
