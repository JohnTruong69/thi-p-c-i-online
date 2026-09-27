/**
 * Invite-only account provisioning (staged for disable_signup). Uses generateLink (mode 'link') so NO emails are sent.
 * Fixtures: qa-acc-<ts>-*@example.test, temporary QA billing_settings; all removed at the end.
 * Run: bun supabase/tests/account-provision-check.ts
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { provisionAccount } from '../../src/lib/account-provision.server';

const url = process.env.SUPABASE_URL!, anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!, service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
let failed = 0;
const ok = (c: boolean, label: string) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${label}`); if (!c) failed++; };
const mk = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(url, service, { auth: { persistSession: false } });
const TS = Date.now(); const PW = `Qa-acc-${TS}-pw`; const ORIGIN = 'http://localhost:8080';
const email = (k: string) => `qa-acc-${TS}-${k}@example.test`;
const userIds = new Set<string>(); const sepayIds: number[] = [];
const ACC = '9990003334'; const base = 8_500_000_000 + (TS % 1_000_000) * 100;
const tok = (k: string) => (`${TS}${k}`.padEnd(64, 'a')).replace(/[^0-9a-f]/g, 'b').slice(0, 64);
async function sha(s: string) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join(''); }
const order = (em: string, t: string) => admin.rpc('create_presale_order', { p_email: em, p_terms_version: 'qa-terms', p_ip_hash: `ip-${TS}-${t.slice(-4)}`, p_token: t });
const codeOf = async (t: string) => (await admin.from('presale_orders').select('code').eq('token_hash', await sha(t)).single()).data!.code as string;
const pay = async (t: string, n: number) => { sepayIds.push(base + n); return admin.rpc('record_sepay_transaction', { p: { id: base + n, gateway: 'QA', transactionDate: '2026-09-27 10:00:00', accountNumber: ACC, code: null, content: `CK ${await codeOf(t)}`, transferType: 'in', transferAmount: 199000, referenceCode: 'QA' } }); };
const prov = (kind: 'presale' | 'partner', token: string) => provisionAccount(admin, { kind, token, origin: ORIGIN, mode: 'link' });
const rewind = (table: string, t: string) => sha(t).then(h => admin.from(table as never).update({ account_invited_at: new Date(Date.now() - 120_000).toISOString() } as never).eq('token_hash', h));
const claim = (c: SupabaseClient, t: string) => c.rpc('claim_presale_order', { p_token: t, p_partner_one: 'QA Lan', p_partner_two: 'QA Minh', p_planned_date: null as never, p_event_name: 'Lễ cưới', p_event_side: 'chung', p_event_date: null as never });
async function openLink(ht: string, type: 'invite' | 'recovery') {
  const c = mk(); const r = await c.auth.verifyOtp({ token_hash: ht, type });
  return { c, user: r.data.user, error: r.error };
}
async function counts() {
  const c = async (t: string) => (await admin.from(t as never).select('*', { count: 'exact', head: true })).count;
  return { weddings: await c('weddings'), memberships: await c('wedding_memberships'), invites: await c('wedding_invites'), entitlements: await c('wedding_entitlements'), presale: await c('presale_orders'), sepay: await c('sepay_transactions'), settings: await c('billing_settings'), profiles: await c('profiles') };
}

async function main() {
  const before = await counts(); console.log('BEFORE', JSON.stringify(before));
  if (before.settings !== 0) { console.log('ABORT: real billing_settings row exists.'); process.exit(1); }
  const now = new Date().toISOString();
  await admin.from('billing_settings').insert({ offer_version: 'qa-presale', price_vnd: 199000, terms_url: 'https://example.test/terms', terms_version: 'qa-terms', terms_approved_at: now, terms_approved_by: 'qa', bank_gateway: 'QA', bank_account_number: ACC, bank_account_name: 'QA', account_enabled: true, sandbox_verified_at: now, live_enabled: true } as never);
  try {
    // Access control on the reservation function.
    ok(!!(await mk().rpc('reserve_account_invite', { p_kind: 'presale', p_token: tok('x') })).error, 'anon cannot call reserve_account_invite');
    const legacy = await admin.auth.admin.createUser({ email: email('legacy'), password: PW, email_confirm: true, app_metadata: { presale_exempt: true } });
    userIds.add(legacy.data.user!.id);
    const L = mk(); await L.auth.signInWithPassword({ email: email('legacy'), password: PW });
    ok(!!(await L.rpc('reserve_account_invite', { p_kind: 'presale', p_token: tok('x') })).error, 'signed-in user cannot call reserve_account_invite');

    // 1. Unpaid / unknown orders never create accounts.
    const T0 = tok('u'); await order(email('unpaid'), T0);
    ok((await prov('presale', T0) as { reason?: string }).reason === 'not_paid', 'pending (unpaid) order: no account email');
    ok((await prov('presale', tok('nope')) as { reason?: string }).reason === 'not_found', 'unknown token: not_found');

    // 2. Paid order → invite link creates exactly one account for the ORDER email.
    const T = tok('b'); await order(email('buyer'), T); await pay(T, 1);
    const p1 = await prov('presale', T);
    ok(p1.ok && p1.sent === 'invite', 'paid order: invite issued');
    if (p1.ok && p1.link?.userId) userIds.add(p1.link.userId);
    ok((await prov('presale', T) as { reason?: string }).reason === 'wait', 'immediate retry throttled (60s)');
    await rewind('presale_orders', T);
    const p2 = await prov('presale', T);
    ok(p2.ok && p2.sent === 'recovery', 'retry after failure/lost email: resend as recovery link for the same unconfirmed account');
    ok(p2.ok && p2.link?.userId === (p1.ok ? p1.link?.userId : 'x'), 'retry reuses the same account (idempotent, no duplicate user)');
    // Opening the link proves ownership of the order email.
    const o = await openLink(p2.ok ? p2.link!.hashed_token : '', 'recovery');
    console.log('DBG', o.error?.message, o.user?.email);
    ok(!o.error && o.user?.email === email('buyer'), 'link sign-in lands on the order email account');
    ok(!!o.user?.email_confirmed_at, 'opening the emailed link confirms email ownership');
    const stale = p1.ok ? await openLink(p1.link!.hashed_token, 'invite') : null;
    console.log('INFO: first invite link after resend ->', stale?.error ? `rejected (${stale.error.message})` : 'still valid');
    ok(!(await o.c.auth.updateUser({ password: PW })).error, 'provisioned user sets a password');
    const cl = await claim(o.c, T);
    ok(!cl.error && typeof cl.data === 'string', 'provisioned user claims wedding + entitlement');
    const wid = cl.data as string;
    ok((await prov('presale', T) as { reason?: string }).reason !== undefined && !(await prov('presale', T)).ok, 'claimed order: no further account emails');
    const again = mk(); const sg = await again.auth.signInWithPassword({ email: email('buyer'), password: PW }); console.log('DBG2', sg.error?.message); ok(!sg.error, 'provisioned user logs in with password later');

    // 3. Account recovery for a provisioned user uses the standard recovery link.
    const rec = await admin.auth.admin.generateLink({ type: 'recovery', email: email('buyer') });
    ok(!rec.error && !(await openLink((rec.data as { properties: { hashed_token: string } }).properties.hashed_token, 'recovery')).error, 'password recovery works for provisioned account');

    // 4. Already-existing confirmed email: no new user, no email; they sign in and claim.
    const TL = tok('l'); await order(email('legacy'), TL); await pay(TL, 2);
    const pl = await prov('presale', TL); console.log('DBG3', JSON.stringify(pl)); ok((pl as { reason?: string }).reason === 'existing_account', 'existing confirmed account: told to log in, nothing created');
    ok(!(await claim(L, TL)).error, 'existing account claims its paid order after normal login');

    // 5. Existing unconfirmed self-signup (legacy of open-signup era): recovery link, same account.
    const un = await admin.auth.admin.createUser({ email: email('unconf'), password: PW, email_confirm: false }); userIds.add(un.data.user!.id);
    const TU = tok('c'); await order(email('unconf'), TU); await pay(TU, 3);
    const pu = await prov('presale', TU);
    ok(pu.ok && pu.sent === 'recovery' && pu.link?.userId === un.data.user!.id, 'unconfirmed existing account gets recovery link, no duplicate');

    // 6. Partner invite (no second charge): owner invites; server provisions for the invite email only.
    const inv = await o.c.rpc('create_partner_invite', { p_wedding_id: wid, p_email: email('partner') });
    const itok = (inv.data as { token: string }[] | null)?.[0]?.token!;
    const pp = await prov('partner', itok);
    ok(pp.ok && pp.sent === 'invite', 'pending partner invite: invite issued');
    if (pp.ok && pp.link?.userId) userIds.add(pp.link.userId);
    const po = await openLink(pp.ok ? pp.link!.hashed_token : '', 'invite');
    ok(!po.error && po.user?.email === email('partner') && !!po.user?.email_confirmed_at, 'partner link confirms partner email');
    const acc = await po.c.rpc('accept_partner_invite', { p_token: itok });
    ok(!acc.error && acc.data === wid, 'provisioned partner accepts invite with equal access');
    ok((await prov('partner', itok) as { reason?: string }).reason === 'invite_inactive', 'accepted invite: no further account emails');

    // 7. Abuse cap.
    const TC = tok('d'); await order(email('cap'), TC); await pay(TC, 4);
    await admin.from('presale_orders').update({ account_invite_count: 5 } as never).eq('token_hash', await sha(TC));
    ok((await prov('presale', TC) as { reason?: string }).reason === 'too_many', 'more than 5 account emails per order refused');
  } finally {
    await admin.from('billing_settings').delete().eq('id', true);
    await admin.from('presale_orders').update({ sepay_transaction_id: null, status: 'expired', paid_at: null, claim_expires_at: null, claimed_at: null } as never).like('email', `qa-acc-${TS}-%`);
    await admin.from('sepay_transactions').delete().in('sepay_id', sepayIds);
    await admin.from('presale_orders').delete().like('email', `qa-acc-${TS}-%`);
    for (const id of userIds) { const ws = (await admin.from('weddings').select('id').eq('created_by', id)).data ?? []; for (const w of ws) await admin.from('weddings').delete().eq('id', w.id); }
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  }
  const after = await counts(); console.log('AFTER', JSON.stringify(after));
  ok(JSON.stringify(before) === JSON.stringify(after), 'fixture cleanup restored counts');
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED'); process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
