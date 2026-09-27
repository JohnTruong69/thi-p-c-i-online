/**
 * Presale (pay before account) — live DB verification with isolated QA accounts (qa-pre-<ts>-*@example.test).
 * Temporarily installs a QA billing_settings row (web server still refuses without CHECKOUT_GO_LIVE + secret),
 * then deletes every fixture it created. Run: bun supabase/tests/presale-check.ts
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!, anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!, service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
let failed = 0;
const ok = (c: boolean, label: string) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${label}`); if (!c) failed++; };
const mk = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(url, service, { auth: { persistSession: false } });
const TS = Date.now(); const PW = `Qa-pre-${TS}-pw`;
const email = (k: string) => `qa-pre-${TS}-${k}@example.test`;
const userIds: string[] = []; const sepayIds: number[] = [];
const ACC = '9990002223'; const base = 8_000_000_000 + (TS % 1_000_000) * 100;
const tok = (k: string) => (`${TS}${k}`.padEnd(64, 'a')).replace(/[^0-9a-f]/g, 'b').slice(0, 64);
const msg = (r: { error: { message: string } | null }) => r.error?.message ?? '';

async function user(k: string, opts: { confirmed?: boolean; exempt?: boolean } = {}): Promise<{ c: SupabaseClient; id: string }> {
  const { data, error } = await admin.auth.admin.createUser({ email: email(k), password: PW, email_confirm: opts.confirmed ?? true, ...(opts.exempt ? { app_metadata: { presale_exempt: true } } : {}) });
  if (error) throw error; userIds.push(data.user.id);
  const c = mk();
  if (opts.confirmed !== false) { const r = await c.auth.signInWithPassword({ email: email(k), password: PW }); if (r.error) throw r.error; }
  return { c, id: data.user.id };
}
const order = (em: string, t: string, ip = `ip-${TS}`) => admin.rpc('create_presale_order', { p_email: em, p_terms_version: 'qa-terms', p_ip_hash: ip, p_token: t });
const tx = (id: number, o: Record<string, unknown>) => { sepayIds.push(id); return admin.rpc('record_sepay_transaction', { p: { id, gateway: 'QA', transactionDate: '2026-09-27 10:00:00', accountNumber: ACC, code: null, content: '', transferType: 'in', transferAmount: 199000, referenceCode: 'QA', ...o } }); };
const res = (r: { data: unknown }) => r.data as { result: string; reason?: string };
const codeOf = async (t: string) => (await admin.from('presale_orders').select('code').eq('token_hash', await sha(t)).single()).data!.code as string;
async function sha(s: string) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join(''); }
const claim = (c: SupabaseClient, t: string) => c.rpc('claim_presale_order', { p_token: t, p_partner_one: 'QA Lan', p_partner_two: 'QA Minh', p_planned_date: null as never, p_event_name: 'Lễ cưới', p_event_side: 'chung', p_event_date: null as never });
async function counts() {
  const c = async (t: string) => (await admin.from(t as never).select('*', { count: 'exact', head: true })).count;
  return { weddings: await c('weddings'), memberships: await c('wedding_memberships'), entitlements: await c('wedding_entitlements'), presale: await c('presale_orders'), sepay: await c('sepay_transactions'), settings: await c('billing_settings') };
}

async function main() {
  const before = await counts(); console.log('BEFORE', JSON.stringify(before));
  if (before.settings !== 0) { console.log('ABORT: a real billing_settings row exists; not overwriting it.'); process.exit(1); }
  const anon = mk();
  const U = await user('unpaid'), P = await user('payer'), W = await user('wrong'), X = await user('exempt', { exempt: true });

  // 1. Direct signup bypass: a fresh confirmed account without a paid claim cannot create any wedding data.
  ok(/payment required/.test(msg(await U.c.rpc('create_wedding_draft', { p_partner_one: 'a', p_partner_two: 'b', p_planned_date: null as never, p_event_name: 'c', p_event_side: 'chung', p_event_date: null as never }))), 'unpaid new account: create_wedding_draft refused');
  ok(!!(await U.c.from('weddings').insert({ created_by: U.id, partner_one_name: 'a', partner_two_name: 'b' } as never)).error, 'unpaid new account: direct wedding insert refused');
  ok((await U.c.rpc('account_can_self_create')).data === false, 'unpaid new account is not self-create');
  ok((await U.c.from('wedding_memberships').select('id')).data?.length === 0, 'unpaid account has no memberships');
  // Legacy/exempt accounts keep self-serve creation.
  const wx = (await X.c.rpc('create_wedding_draft', { p_partner_one: 'X', p_partner_two: 'Y', p_planned_date: null as never, p_event_name: 'Lễ', p_event_side: 'chung', p_event_date: null as never }));
  ok(!wx.error && typeof wx.data === 'string', 'legacy/exempt account can still create a wedding');
  const cutoff = (await admin.from('presale_policy').select('legacy_cutoff').single()).data!.legacy_cutoff as string;
  const creators = (await admin.from('weddings').select('created_by')).data!.map(r => r.created_by);
  let preCutoff = true;
  for (const id of new Set(creators)) { if (id === X.id) continue; const u = (await admin.auth.admin.getUserById(id)).data.user; if (u && new Date(u.created_at) >= new Date(cutoff)) preCutoff = false; }
  ok(preCutoff, 'every pre-existing wedding creator is a legacy account (created before cutoff)');

  // 2. Orders: service-only, gated OFF by default.
  ok(!!(await anon.rpc('create_presale_order', { p_email: email('payer'), p_terms_version: 'x', p_ip_hash: 'x', p_token: tok('z') })).error, 'anon cannot call create_presale_order');
  ok(!!(await U.c.from('presale_orders').select('id')).error || (await U.c.from('presale_orders').select('id')).data?.length === 0, 'clients cannot read presale_orders');
  ok(/unavailable/.test(msg(await order(email('payer'), tok('p')))), 'order refused while checkout not live');

  const now = new Date().toISOString();
  const ins = await admin.from('billing_settings').insert({ offer_version: 'qa-presale', price_vnd: 199000, terms_version: 'qa-terms', terms_approved_at: now, terms_approved_by: 'qa', bank_gateway: 'QA', bank_account_number: ACC, bank_account_name: 'QA', account_enabled: true, sandbox_verified_at: now, live_enabled: true } as never);
  ok(!ins.error, 'QA live settings installed');
  try {
    ok(/terms changed/.test(msg(await admin.rpc('create_presale_order', { p_email: email('payer'), p_terms_version: 'old', p_ip_hash: 'x', p_token: tok('q') }))), 'order refused for stale terms version');
    const T = tok('p'); ok(!(await order(email('payer'), T)).error, 'order created for payer');
    const T2 = tok('e'); await order(email('expired'), T2);
    for (let i = 0; i < 3; i++) await order(`qa-pre-${TS}-rl${i}@example.test`, tok(`r${i}`));
    ok(/rate limited/.test(msg(await order(`qa-pre-${TS}-rl9@example.test`, tok('r9')))), 'rate limit: 6th order from same IP within an hour refused');
    const code = await codeOf(T);

    // 3. Claim before payment is refused.
    ok(/not paid/.test(msg(await claim(P.c, T))), 'claim refused before SePay payment');

    // 4. Webhook matching.
    ok(res(await tx(base + 1, { content: `CK ${code}`, transferAmount: 190000 }))?.reason === 'amount_mismatch', 'wrong amount not accepted');
    ok(res(await tx(base + 2, { content: `CK ${code}`, accountNumber: '111' }))?.reason === 'account_mismatch', 'wrong receiving account not accepted');
    ok(res(await tx(base + 3, { content: `CK ${code}` }))?.result === 'matched', 'exact signed SePay tx marks order paid');
    ok(res(await tx(base + 3, { content: `CK ${code}` }))?.result === 'duplicate', 'duplicate SePay event is idempotent');
    ok(res(await tx(base + 4, { content: `CK ${code}` }))?.reason === 'order_already_paid', 'second transfer for same order does not double-pay');
    ok((await admin.from('wedding_entitlements').select('*', { count: 'exact', head: true })).count === before.entitlements! + 0, 'payment alone creates no entitlement until claimed');
    await admin.from('presale_orders').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('token_hash', await sha(T2));
    ok(res(await tx(base + 5, { content: await codeOf(T2) }))?.reason === 'order_expired', 'transfer to expired order not accepted');

    // 5. Claim: email ownership + token possession, single use.
    ok(/email mismatch/.test(msg(await claim(W.c, T))), 'wrong-email account cannot claim');
    ok(/invalid claim/.test(msg(await claim(P.c, tok('bogus')))), 'unknown token refused');
    await admin.auth.admin.updateUserById(P.id, { email_confirm: false } as never);
    const unconf = (await admin.auth.admin.getUserById(P.id)).data.user?.email_confirmed_at;
    if (!unconf) ok(/email not confirmed/.test(msg(await claim(P.c, T))), 'unconfirmed email cannot claim');
    else console.log('SKIP: provider did not unconfirm email');
    await admin.auth.admin.updateUserById(P.id, { email_confirm: true });
    const c1 = await claim(P.c, T);
    ok(!c1.error && typeof c1.data === 'string', 'payer with confirmed matching email claims → wedding created');
    const wid = c1.data as string;
    const ent = (await admin.from('wedding_entitlements').select('*').eq('wedding_id', wid).single()).data;
    const paid = (await admin.from('presale_orders').select('paid_at').eq('token_hash', await sha(T)).single()).data!.paid_at as string;
    ok(ent?.plan_version === 'one_payment_36m' && ent.paid_at === paid, '36-month entitlement starts at SePay paid time');
    ok(((await P.c.rpc('wedding_access_state', { p_wedding_id: wid })).data as { state: string })?.state === 'paid_active', 'claimed wedding is paid_active');
    ok((await claim(P.c, T)).data === wid, 'claim replay by same account is idempotent');
    ok(/already claimed/.test(msg(await claim(W.c, T))), 'claimed token cannot be reused by another account');
    ok(/already claimed|payment required/.test(msg(await claim(U.c, T))) , 'unpaid account cannot reuse claim');
    ok(!!(await P.c.from('tasks').insert({ wedding_id: wid, title: 'QA', status: 'todo', kind: 'standard', source: 'manual', assignee: 'both' } as never)).error === false, 'claimed owner can write planner rows');

    // 6. Partner invite: an unpaid new account joins via invite, no second charge.
    const inv = await P.c.rpc('create_partner_invite', { p_wedding_id: wid, p_email: email('unpaid') });
    const itok = (inv.data as { token: string }[] | null)?.[0]?.token;
    ok(!!itok, 'claimant can invite partner');
    const acc = await U.c.rpc('accept_partner_invite', { p_token: itok! });
    ok(!acc.error && acc.data === wid, 'unpaid partner accepts invite into paid wedding');
    ok(!(await U.c.from('events').insert({ wedding_id: wid, name: 'Tiệc', side: 'chung', status: 'tentative' } as never)).error, 'partner has equal write rights');
    ok((await admin.from('presale_orders').select('*', { count: 'exact', head: true }).eq('claimed_wedding_id', wid)).count === 1, 'no extra order/charge for partner');
    ok((await admin.from('wedding_entitlements').select('*', { count: 'exact', head: true }).eq('wedding_id', wid)).count === 1, 'one entitlement per wedding');
  } finally {
    await admin.from('billing_settings').delete().eq('id', true);
    await admin.from('presale_orders').update({ sepay_transaction_id: null, status: 'expired', paid_at: null, claim_expires_at: null, claimed_at: null } as never).like('email', `qa-pre-${TS}-%`);
    await admin.from('sepay_transactions').delete().in('sepay_id', sepayIds);
    await admin.from('presale_orders').delete().like('email', `qa-pre-${TS}-%`);
    for (const id of userIds) { const ws = (await admin.from('weddings').select('id').eq('created_by', id)).data ?? []; for (const w of ws) await admin.from('weddings').delete().eq('id', w.id); }
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  }
  const after = await counts(); console.log('AFTER', JSON.stringify(after));
  ok(JSON.stringify(before) === JSON.stringify(after), 'fixture cleanup restored counts');
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED'); process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
