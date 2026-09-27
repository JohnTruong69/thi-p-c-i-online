/**
 * Phase 3 — real RSVP DB verification (gates, idempotency, edits, no auto-match, reconcile, RLS, CSV undo) as rlstest-* accounts. Self-cleaning.
 * Test-only: grants a short entitlement with the service role to reach the open state (simulates Phase 4), removed at the end.
 * Run: bun supabase/tests/rsvp-check.ts
 */
import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL!, anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!, service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
let failed = 0;
const ok = (c: boolean, label: string) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${label}`); if (!c) failed++; };
const mk = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
async function as(k: string) { const c = mk(); const { error } = await c.auth.signInWithPassword({ email: `rlstest-${k}@example.test`, password: `Test-pass-${k}-123456` }); if (error) throw error; return c; }
const admin = createClient(url, service, { auth: { persistSession: false } });
async function cleanup() {
  const ids = ((await admin.from('profiles').select('id').like('email', 'rlstest-%')).data ?? []).map(r => r.id);
  if (ids.length) await admin.from('weddings').delete().in('created_by', ids);
}
const uuid = () => crypto.randomUUID();

async function main() {
  await cleanup();
  const A = await as('a'), C = await as('c'), anon = mk();
  const wa = (await A.rpc('create_wedding_draft', { p_partner_one: 'Lan', p_partner_two: 'Minh', p_planned_date: null as never, p_event_name: 'Tiệc tối', p_event_side: 'chung', p_event_date: '2027-10-18' })).data as string;
  const wc = (await C.rpc('create_wedding_draft', { p_partner_one: 'Hoa', p_partner_two: 'Nam', p_planned_date: null as never, p_event_name: 'Tiệc', p_event_side: 'chung', p_event_date: '2027-11-01' })).data as string;
  const ev1 = (await A.from('events').select('id').eq('wedding_id', wa).single()).data!.id as string;
  const ev2 = ((await A.from('events').insert({ wedding_id: wa, name: 'Lễ vu quy', side: 'nha-gai', event_date: '2027-10-17', event_time: '09:00', venue: 'Nhà gái', address: '2 Huế' }).select('id').single()).data!).id as string;
  const evHidden = ((await A.from('events').insert({ wedding_id: wa, name: 'Riêng', side: 'nha-trai', event_date: '2027-10-19', event_time: '09:00', venue: 'X', address: 'Y' }).select('id').single()).data!).id as string;
  await A.from('events').update({ event_time: '18:00', venue: 'Nhà hàng', address: '1 Lê Lợi' }).eq('id', ev1);
  await A.rpc('ensure_invitation', { p_wedding_id: wa });
  const links = (await A.from('invitation_links').select('id,side,token').eq('wedding_id', wa)).data!;
  const chung = links.find(l => l.side === 'chung')!, trai = links.find(l => l.side === 'nha-trai')!;
  await A.from('invitation_links').update({ enabled: true, event_ids: [ev1, ev2] }).eq('id', chung.id);
  await A.from('invitation_links').update({ enabled: true, event_ids: [evHidden] }).eq('id', trai.id);
  const good = { [ev1]: { attending: true, party_size: 2 }, [ev2]: { attending: false } };
  const submit = (tok: string, key: string, answers: unknown = good, name = 'Cô Ba', code: string | null = null, phone = '') =>
    anon.rpc('submit_rsvp', { p_token: tok, p_request_key: key, p_name: name, p_phone: phone, p_note: '', p_answers: answers as never, p_edit_code: code as string });

  // Closed states
  ok(/closed/.test((await submit(chung.token, uuid())).error?.message ?? ''), 'unpublished + unpaid: RSVP rejected');
  await admin.from('wedding_entitlements').insert({ wedding_id: wa, paid_at: new Date(Date.now() - 1000).toISOString(), expires_at: new Date(Date.now() + 864e5).toISOString(), source: 'test' });
  ok(/closed/.test((await submit(chung.token, uuid())).error?.message ?? ''), 'paid but not published: rejected');
  ok(!(await A.rpc('publish_invitation', { p_wedding_id: wa })).error, 'publish with test entitlement');
  ok(/closed/.test((await submit('0'.repeat(64), uuid())).error?.message ?? ''), 'wrong token rejected');

  // Open: validation against the server-side event list
  ok(/event not on link/.test((await submit(chung.token, uuid(), { ...good, [evHidden]: { attending: true, party_size: 1 } })).error?.message ?? ''), 'event from another link rejected');
  ok(/missing answer/.test((await submit(chung.token, uuid(), { [ev1]: { attending: true, party_size: 2 } })).error?.message ?? ''), 'missing event answer rejected');
  ok(/party/.test((await submit(chung.token, uuid(), { [ev1]: { attending: true, party_size: 0 }, [ev2]: { attending: false } })).error?.message ?? ''), 'party 0 rejected');
  ok(/party/.test((await submit(chung.token, uuid(), { [ev1]: { attending: true, party_size: 1.5 }, [ev2]: { attending: false } })).error?.message ?? ''), 'fractional party rejected');
  const sn = await submit(chung.token, uuid(), { [ev1]: { attending: false, party_size: 3 }, [ev2]: { attending: false } });
  ok(!sn.error && (sn.data as { answers: { party_size: number | null }[] }).answers.every(a => a.party_size === null), 'party sent with "no" is ignored (stored as none)');
  await admin.from('rsvp_responses').delete().eq('id', sn.data!.receipt_id);
  ok(!!(await submit(chung.token, uuid(), good, ' ')).error, 'blank name rejected');
  ok(((await admin.from('rsvp_responses').select('id').eq('wedding_id', wa)).data ?? []).length === 0, 'rejected submissions left no rows');

  // Idempotency
  const key = uuid();
  const [s1, s2] = await Promise.all([submit(chung.token, key), submit(chung.token, key)]);
  ok(!s1.error && !s2.error, 'concurrent same-key submits both succeed');
  ok(s1.data?.receipt_id === s2.data?.receipt_id, 'same key returns same receipt');
  const s3 = await submit(chung.token, key);
  ok(s3.data?.replay === true && !s3.data?.edit_code, 'retry is a replay and does not re-issue the edit code');
  const code = (s1.data?.edit_code ?? s2.data?.edit_code) as string;
  ok(((await admin.from('rsvp_responses').select('id').eq('wedding_id', wa)).data ?? []).length === 1, 'one response row after retries');
  ok(!('wedding_id' in (s1.data ?? {})) && !JSON.stringify(s1.data).includes(wa), 'receipt exposes no wedding id');

  // Receipt read requires code; no guest list exposure
  ok((await anon.rpc('get_rsvp_receipt', { p_token: chung.token, p_edit_code: 'nope' })).data === null, 'receipt with wrong code returns nothing');
  const rc = (await anon.rpc('get_rsvp_receipt', { p_token: chung.token, p_edit_code: code })).data as { answers: unknown[] } | null;
  ok(rc?.answers.length === 2, 'receipt with code returns own answers');
  ok(((await anon.from('rsvp_responses').select('id')).data ?? []).length === 0, 'anon cannot list responses');
  ok(((await C.from('rsvp_responses').select('id').eq('wedding_id', wa)).data ?? []).length === 0, 'other wedding cannot read responses');
  ok(!!(await A.from('rsvp_responses').insert({ wedding_id: wa } as never)).error, 'manager cannot insert responses directly');

  // No auto-match: guest with same name+phone exists, response stays unmatched
  const g = (await A.rpc('save_guest', { p_wedding_id: wa, p_guest_id: null as never, p_guest: { name: 'Cô Ba', phone: '0901234567', side: 'chung', party_size: 2 }, p_assignments: [{ event_id: ev1 }] })).data as string;
  const s4 = await submit(chung.token, uuid(), good, 'Cô Ba', null, '0901234567');
  const r4 = (await A.from('rsvp_responses').select('guest_id').eq('id', s4.data!.receipt_id).single()).data!;
  ok(r4.guest_id === null, 'same name + phone is not auto-matched');
  const ga = (await A.from('guest_event_assignments').select('rsvp_status').eq('guest_id', g).single()).data!;
  ok(ga.rsvp_status === 'pending', 'guest book untouched by response');

  // Edit rule
  const e1 = await submit(chung.token, uuid(), { [ev1]: { attending: true, party_size: 4 }, [ev2]: { attending: true, party_size: 1 } }, 'Cô Ba', code);
  ok(!e1.error && e1.data?.edited === true, 'edit with code accepted');
  const act = (await A.from('rsvp_responses').select('id,replaces_id').eq('wedding_id', wa).is('superseded_at', null)).data!;
  ok(act.length === 2 && act.some(r => r.replaces_id === s1.data!.receipt_id), 'old response superseded, one active per guest');
  ok(/edit code/.test((await submit(chung.token, uuid(), good, 'x', 'bad-code')).error?.message ?? ''), 'bad edit code rejected');
  const trTok = trai.token;
  ok(/edit code/.test((await submit(trTok, uuid(), { [evHidden]: { attending: false } }, 'x', code)).error?.message ?? ''), 'edit code does not work on another link');

  // Reconcile
  ok(!!(await C.rpc('reconcile_rsvp', { p_response_id: s4.data!.receipt_id, p_guest_id: g, p_apply: true })).error, 'other wedding cannot reconcile');
  const gc = (await C.rpc('save_guest', { p_wedding_id: wc, p_guest_id: null as never, p_guest: { name: 'Z', phone: '', side: 'chung', party_size: 1 }, p_assignments: [] })).data as string;
  ok(!!(await A.rpc('reconcile_rsvp', { p_response_id: s4.data!.receipt_id, p_guest_id: gc, p_apply: false })).error, 'cannot link to another wedding guest');
  ok(!!(await A.rpc('reconcile_rsvp', { p_response_id: s1.data!.receipt_id, p_guest_id: g, p_apply: false })).error, 'cannot reconcile superseded response');
  const rn = await A.rpc('reconcile_rsvp', { p_response_id: s4.data!.receipt_id, p_guest_id: g, p_apply: false });
  ok(!rn.error && rn.data === 0 && (await A.from('guest_event_assignments').select('rsvp_status').eq('guest_id', g).single()).data!.rsvp_status === 'pending', 'match without apply leaves guest book');
  ok((await A.rpc('reconcile_rsvp', { p_response_id: s4.data!.receipt_id, p_guest_id: g, p_apply: true })).data === 1, 'apply updates only invited events');
  const ga2 = (await A.from('guest_event_assignments').select('rsvp_status,attending_count').eq('guest_id', g).single()).data!;
  ok(ga2.rsvp_status === 'attending' && ga2.attending_count === 2, 'apply sets status/count');
  const audit = ((await A.from('audit_log').select('action').eq('wedding_id', wa)).data ?? []).map(a => a.action);
  ok(['rsvp.received', 'rsvp.edited', 'rsvp.matched'].every(a => audit.includes(a)), 'audit has received/edited/matched');

  // CSV undo keeps reconciled guests
  const bid = uuid();
  await A.rpc('import_guest_batch', { p_batch_id: bid, p_wedding_id: wa, p_filename: 't.csv', p_event_ids: [ev1], p_rows: [{ source_row: 2, name: 'Imp 1', phone: '', side: 'chung', party_size: 1, decision: 'add' }, { source_row: 3, name: 'Imp 2', phone: '', side: 'chung', party_size: 1, decision: 'add' }], p_skipped: 0, p_invalid: 0 });
  const imp = (await A.from('guests').select('id,name').eq('wedding_id', wa).like('name', 'Imp%')).data!;
  const s5 = await submit(chung.token, uuid(), good, 'Imp 1');
  await A.rpc('reconcile_rsvp', { p_response_id: s5.data!.receipt_id, p_guest_id: imp.find(x => x.name === 'Imp 1')!.id, p_apply: false });
  const u = (await A.rpc('undo_guest_batch', { p_batch_id: bid })).data as { removed: number; kept: number };
  ok(u.removed === 1 && u.kept === 1, 'CSV undo keeps guest matched to RSVP (removed 1, kept 1)');

  // Link off / expiry close RSVP
  await A.from('invitation_links').update({ enabled: false }).eq('id', chung.id);
  ok(/closed/.test((await submit(chung.token, uuid())).error?.message ?? ''), 'link turned off: rejected');
  await A.from('invitation_links').update({ enabled: true }).eq('id', chung.id);
  await admin.from('wedding_entitlements').update({ expires_at: new Date(Date.now() - 500).toISOString(), paid_at: new Date(Date.now() - 1000).toISOString() }).eq('wedding_id', wa);
  ok(/closed/.test((await submit(chung.token, uuid())).error?.message ?? ''), 'expired entitlement: rejected');
  ok((await anon.rpc('get_rsvp_receipt', { p_token: chung.token, p_edit_code: code })).data === null, 'receipt closed after expiry');

  await cleanup();
  console.log(failed ? `${failed} FAILED` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
}
main().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
