/**
 * Phase 3 staged checkout / SePay — live DB verification with isolated QA accounts (qa-bill-<ts>-*@example.test).
 * Temporarily installs a QA billing_settings row (safe: the web server still refuses checkout without
 * CHECKOUT_GO_LIVE + SEPAY_WEBHOOK_SECRET), then deletes every fixture it created.
 * Run: bun supabase/tests/billing-check.ts
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!, anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!, service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
let failed = 0;
const ok = (c: boolean, label: string) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${label}`); if (!c) failed++; };
const mk = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(url, service, { auth: { persistSession: false } });
const TS = Date.now(); const PW = `Qa-bill-${TS}-pw`;
const email = (k: string) => `qa-bill-${TS}-${k}@example.test`;
const userIds: string[] = []; const weddings: string[] = []; const sepayIds: number[] = [];
const ACC = '9990001112'; const base = 9_000_000_000 + (TS % 1_000_000) * 100;
const denied = (r: { error: unknown; data: unknown }) => !!r.error || (Array.isArray(r.data) && r.data.length === 0);

async function user(k: string) {
  const { data, error } = await admin.auth.admin.createUser({ email: email(k), password: PW, email_confirm: true });
  if (error) throw error; userIds.push(data.user.id);
  const c = mk(); const r = await c.auth.signInWithPassword({ email: email(k), password: PW }); if (r.error) throw r.error;
  return { c, id: data.user.id };
}
async function draft(c: SupabaseClient, n: string) {
  const w = (await c.rpc('create_wedding_draft', { p_partner_one: n, p_partner_two: 'QA', p_planned_date: null as never, p_event_name: 'Lễ', p_event_side: 'chung', p_event_date: null as never })).data as string;
  weddings.push(w); return w;
}
const tx = (id: number, o: Record<string, unknown>) => { sepayIds.push(id); return admin.rpc('record_sepay_transaction', { p: { id, gateway: 'QA', transactionDate: '2026-09-27 10:00:00', accountNumber: ACC, code: null, content: '', transferType: 'in', transferAmount: 199000, referenceCode: 'QA', ...o } }); };
const res = (r: { data: unknown }) => r.data as { result: string; reason?: string; order_id?: string };

async function counts() {
  const c = async (t: string) => (await admin.from(t as never).select('*', { count: 'exact', head: true })).count;
  return { weddings: await c('weddings'), entitlements: await c('wedding_entitlements'), orders: await c('billing_orders'), sepay: await c('sepay_transactions'), settings: await c('billing_settings'), roles: await c('user_roles'), gates: await c('wedding_write_gate') };
}

async function main() {
  const before = await counts(); console.log('BEFORE', JSON.stringify(before));
  ok(before.settings === 0, 'no billing settings installed (checkout OFF)');
  const anon = mk();
  const A = await user('a'), B = await user('b'), L = await user('l');
  const wA = await draft(A.c, 'A'), wB = await draft(B.c, 'B'), wL = await draft(L.c, 'L');

  // Client access denied
  for (const [n, c] of [['anon', anon], ['authenticated', A.c]] as const) {
    ok(denied(await c.from('billing_settings').select('*')), `${n} cannot read billing_settings`);
    ok(denied(await c.from('sepay_transactions').select('*')), `${n} cannot read sepay_transactions`);
    ok(!!(await c.from('billing_orders').insert({ wedding_id: wA, code: 'TCOAAAAAAAA', offer_version: 'x', plan_version: 'one_payment_36m', terms_version: 'x', amount_vnd: 1, bank_gateway: 'x', bank_account_number: 'x', bank_account_name: 'x', expires_at: new Date().toISOString() } as never)).error, `${n} cannot insert orders`);
    ok(!!(await c.rpc('create_billing_order', { p_wedding_id: wA, p_user_id: A.id })).error, `${n} cannot call create_billing_order`);
    ok(!!(await c.rpc('record_sepay_transaction', { p: { id: 1 } as never })).error, `${n} cannot call record_sepay_transaction`);
    ok(!!(await c.rpc('match_sepay_transaction', { p_tx: 1, p_order_id: null as never, p_actor: null as never, p_note: null as never })).error, `${n} cannot call match_sepay_transaction`);
    ok(!!(await c.from('wedding_entitlements').insert({ wedding_id: wA, paid_at: new Date().toISOString(), expires_at: new Date(Date.now() + 1e9).toISOString(), source: 'client' } as never)).error, `${n} cannot write entitlement (no client paid flag)`);
  }
  ok(!!(await anon.rpc('billing_offer_status')).error, 'anon cannot read offer status');
  ok((await A.c.rpc('billing_offer_status')).data?.['live' as never] === false, 'offer status is not live');
  ok(/unavailable/.test((await admin.rpc('create_billing_order', { p_wedding_id: wA, p_user_id: A.id })).error?.message ?? ''), 'order creation refused without config');
  const r0 = await tx(base + 1, { content: 'TCOXXXXXXXX' });
  ok(res(r0)?.reason === 'checkout_not_live', 'signed tx stored as unmatched while not live');
  ok(res(await tx(base + 1, {}))?.result === 'duplicate', 'replay of same SePay id deduped');

  // Install QA live config
  const s = await admin.from('billing_settings').insert({ offer_version: 'qa-test', price_vnd: 199000, terms_version: 'qa-v0', terms_approved_at: new Date().toISOString(), terms_approved_by: 'qa', bank_gateway: 'QA', bank_account_number: ACC, bank_account_name: 'QA', account_enabled: true, live_enabled: true });
  ok(!s.error, 'QA settings installed');
  ok(!!(await admin.from('billing_settings').insert({ id: false } as never)).error, 'singleton settings enforced');
  ok(!!(await admin.rpc('create_billing_order', { p_wedding_id: wA, p_user_id: B.id })).error, 'cannot create order for another wedding');
  const o1 = (await admin.rpc('create_billing_order', { p_wedding_id: wA, p_user_id: A.id })).data as { order_id: string };
  const [p1, p2] = await Promise.all([admin.rpc('create_billing_order', { p_wedding_id: wA, p_user_id: A.id }), admin.rpc('create_billing_order', { p_wedding_id: wA, p_user_id: A.id })]);
  ok((p1.data as { order_id: string }).order_id === o1.order_id && (p2.data as { order_id: string }).order_id === o1.order_id, 'concurrent/retried create reuses the one pending order');
  const order = (await A.c.from('billing_orders').select('*').eq('id', o1.order_id).single()).data!;
  ok(order.status === 'pending' && order.amount_vnd === 199000, 'manager reads own pending order');
  ok(denied(await B.c.from('billing_orders').select('*').eq('id', o1.order_id)), 'other wedding cannot read order');
  ok(denied(await anon.from('billing_orders').select('*')), 'anon cannot read orders');
  ok(!!(await A.c.from('billing_orders').update({ status: 'paid' } as never).eq('id', o1.order_id)).error || (await A.c.from('billing_orders').select('status').eq('id', o1.order_id).single()).data?.status === 'pending', 'client cannot mark order paid');

  // Mismatches go to the queue
  ok(res(await tx(base + 2, { content: order.code, transferAmount: 198999 }))?.reason === 'amount_mismatch', 'amount mismatch unmatched');
  ok(res(await tx(base + 3, { content: order.code, accountNumber: '1234567' }))?.reason === 'account_mismatch', 'account mismatch unmatched');
  ok(res(await tx(base + 4, { content: order.code, transferType: 'out' }))?.reason === 'not_inbound', 'outbound unmatched');
  ok(res(await tx(base + 5, { content: 'no code here' }))?.reason === 'no_code', 'missing code unmatched');
  ok(res(await tx(base + 6, { content: 'TCOZZZZZZZZ' }))?.reason === 'unknown_code', 'unknown code unmatched');
  ok((await A.c.from('billing_orders').select('status').eq('id', o1.order_id).single()).data?.status === 'pending', 'order still pending after mismatches');

  // Exact match, concurrent duplicate delivery
  const [m1, m2] = await Promise.all([tx(base + 7, { content: `${order.code} chuyen tien` }), tx(base + 7, { content: `${order.code} chuyen tien` })]);
  const results = [res(m1)?.result, res(m2)?.result].sort();
  ok(results[0] === 'duplicate' && results[1] === 'matched', 'concurrent same-id delivery activates exactly once');
  const paid = (await A.c.from('billing_orders').select('*').eq('id', o1.order_id).single()).data!;
  const ent = (await A.c.from('wedding_entitlements').select('*').eq('wedding_id', wA).single()).data!;
  ok(paid.status === 'paid' && !!paid.paid_at && paid.entitlement_expires_at === ent.expires_at, 'order paid with receipt times from entitlement');
  ok(ent.plan_version === 'one_payment_36m' && ent.source === `sepay:${base + 7}`, 'entitlement one_payment_36m from SePay');
  ok(new Date(ent.expires_at).getTime() - new Date(ent.paid_at).getTime() > 1090 * 864e5, '~36 months duration');
  ok((await A.c.rpc('wedding_access_state', { p_wedding_id: wA })).data?.['state' as never] === 'paid_active', 'access state paid_active');
  ok(res(await tx(base + 8, { content: order.code }))?.reason === 'order_already_paid', 'second payment for paid order goes to queue');
  ok(!!(await admin.rpc('create_billing_order', { p_wedding_id: wA, p_user_id: A.id })).error, 'no new order once entitled');

  // Reconciliation path (typo'd code), exact amount required
  const oB = (await admin.rpc('create_billing_order', { p_wedding_id: wB, p_user_id: B.id })).data as { order_id: string };
  const typo = await tx(base + 9, { content: 'TCO typo khong khop' });
  ok(res(typo)?.reason === 'no_code', 'typo payment queued');
  const row = (await admin.from('sepay_transactions').select('id').eq('sepay_id', base + 9).single()).data!;
  const rc = await admin.rpc('match_sepay_transaction', { p_tx: row.id, p_order_id: oB.order_id, p_actor: userIds[0]!, p_note: 'QA reconcile' });
  ok(res(rc)?.result === 'matched', 'operator reconciliation activates order');
  const bad = (await admin.from('sepay_transactions').select('id').eq('sepay_id', base + 2).single()).data!;
  ok(res(await admin.rpc('match_sepay_transaction', { p_tx: bad.id, p_order_id: oB.order_id, p_actor: userIds[0]!, p_note: 'x' }))?.reason !== undefined, 'reconciliation still refuses wrong amount/paid order');

  // Legacy entitlement preserved
  const legacyPaid = new Date(Date.now() - 30 * 864e5); const legacyExp = new Date(legacyPaid.getTime() + 300 * 864e5);
  await admin.from('wedding_entitlements').insert({ wedding_id: wL, paid_at: legacyPaid.toISOString(), expires_at: legacyExp.toISOString(), source: 'legacy-qa', plan_version: 'legacy_wedding_24m' });
  ok(/already entitled/.test((await admin.rpc('create_billing_order', { p_wedding_id: wL, p_user_id: L.id })).error?.message ?? ''), 'legacy wedding cannot open new order');
  const le = (await admin.from('wedding_entitlements').select('*').eq('wedding_id', wL).single()).data!;
  ok(le.plan_version === 'legacy_wedding_24m' && new Date(le.expires_at).getTime() === legacyExp.getTime(), 'legacy entitlement unchanged');

  const audit = (await admin.from('audit_log').select('action').in('wedding_id', [wA, wB])).data!.map(a => a.action);
  ok(audit.includes('billing.order_created') && audit.includes('billing.order_paid') && audit.includes('billing.order_paid_reconciled') && audit.includes('billing.payment_unmatched'), 'billing actions audited');
}

async function cleanup() {
  await admin.from('billing_settings').delete().eq('offer_version', 'qa-test');
  if (weddings.length) {
    await admin.from('billing_orders').update({ sepay_transaction_id: null, status: 'cancelled', paid_at: null, entitlement_expires_at: null } as never).in('wedding_id', weddings);
  }
  if (sepayIds.length) await admin.from('sepay_transactions').delete().in('sepay_id', sepayIds);
  if (weddings.length) { await admin.from('billing_orders').delete().in('wedding_id', weddings); await admin.from('weddings').delete().in('id', weddings); }
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  console.log('AFTER', JSON.stringify(await counts()));
}

main().catch(e => { console.error(e); failed++; }).finally(async () => { await cleanup(); console.log(failed ? `FAILED ${failed}` : 'ALL PASS'); process.exit(failed ? 1 : 0); });
