/**
 * Server-only account provisioning for the invite-only (disable_signup) mode.
 * Accounts are created ONLY for (a) a SePay-verified paid presale order or (b) a pending partner invite.
 * The target email always comes from the DB row (reserve_account_invite); callers only prove token possession.
 * Email ownership is proven when the recipient opens the invite/recovery link sent to that address.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { accountRedirectUrl } from './app-origin';

export type ProvisionKind = 'presale' | 'partner';
export type ProvisionResult =
  | { ok: true; sent: 'invite' | 'recovery'; link?: { hashed_token: string; type: 'invite' | 'recovery'; userId?: string } }
  | { ok: false; reason: 'not_found' | 'not_paid' | 'already_claimed' | 'claim_expired' | 'invite_inactive' | 'existing_account' | 'too_many' | 'wait' | 'send_failed' | 'not_configured' };

export function nextPathFor(kind: ProvisionKind, token: string) {
  return kind === 'presale' ? `/claim/${token}` : `/invite/${token}`;
}

/** mode 'email' sends the Auth email; mode 'link' (tests only) returns the hashed token instead of sending. */
export async function provisionAccount(admin: SupabaseClient, opts: { kind: ProvisionKind; token: string; origin: string; mode: 'email' | 'link'; anon?: SupabaseClient }): Promise<ProvisionResult> {
  const { data, error } = await admin.rpc('reserve_account_invite', { p_kind: opts.kind, p_token: opts.token });
  if (error) return { ok: false, reason: 'send_failed' };
  const r = data as { ok: boolean; reason?: string; email?: string; user_exists?: boolean };
  if (!r.ok) return { ok: false, reason: (r.reason ?? 'send_failed') as never };
  const email = r.email!;
  const redirectTo = accountRedirectUrl(opts.origin, nextPathFor(opts.kind, opts.token));
  // Unconfirmed existing account (e.g. self-signup before invite-only mode): invite would conflict, use a recovery link instead.
  const type: 'invite' | 'recovery' = r.user_exists ? 'recovery' : 'invite';
  if (opts.mode === 'link') {
    const g = await admin.auth.admin.generateLink({ type, email, options: { redirectTo } } as never);
    const gd = g.data as { properties?: { hashed_token?: string }; user?: { id: string } } | null;
    const ht = gd?.properties?.hashed_token;
    if (g.error || !ht) { console.error('generateLink failed', g.error?.message); return { ok: false, reason: 'send_failed' }; }
    return { ok: true, sent: type, link: { hashed_token: ht, type, ...(gd?.user?.id ? { userId: gd.user.id } : {}) } };
  }
  if (type === 'invite') {
    const inv = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (inv.error) { console.error('invite failed', inv.error.message); return { ok: false, reason: 'send_failed' }; }
    return { ok: true, sent: 'invite' };
  }
  if (!opts.anon) return { ok: false, reason: 'send_failed' };
  const rec = await opts.anon.auth.resetPasswordForEmail(email, { redirectTo });
  if (rec.error) { console.error('recovery failed', rec.error.message); return { ok: false, reason: 'send_failed' }; }
  return { ok: true, sent: 'recovery' };
}
