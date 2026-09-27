/**
 * Phase 3 slice 2b — guest book + CSV import DB verification as confirmed rlstest-* accounts. Self-cleaning.
 * Run: bun supabase/tests/guests-check.ts (needs SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY).
 */
import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL!, anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!, service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
let failed = 0;
const ok = (c: boolean, label: string) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${label}`); if (!c) failed++; };
const mk = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
async function as(k: string) { const c = mk(); const { error } = await c.auth.signInWithPassword({ email: `rlstest-${k}@example.test`, password: `Test-pass-${k}-123456` }); if (error) throw error; return c; }
const admin = createClient(url, service, { auth: { persistSession: false } });
async function cleanup() { const { data } = await admin.from('profiles').select('id').like('email', 'rlstest-%'); const ids = (data ?? []).map(r => r.id); if (ids.length) await admin.from('weddings').delete().in('created_by', ids); }
const row = (i: number, o: Record<string, unknown> = {}) => ({ source_row: i + 2, name: `Khách ${i}`, phone: `09${String(i).padStart(8, '0')}`, side: 'nha-gai', party_size: 1, decision: 'add', ...o });

async function main() {
  await cleanup();
  const A = await as('a'), C = await as('c'), anon = mk();
  const draft = (c: typeof A, n: string) => c.rpc('create_wedding_draft', { p_partner_one: n, p_partner_two: 'Minh', p_planned_date: null as never, p_event_name: 'Tiệc tối', p_event_side: 'chung', p_event_date: '2027-10-18' });
  const wa = (await draft(A, 'Lan')).data as string, wc = (await draft(C, 'Hoa')).data as string;
  const ev1 = (await A.from('events').select('id').eq('wedding_id', wa).single()).data!.id;
  const ev2 = (await A.from('events').insert({ wedding_id: wa, name: 'Lễ vu quy' }).select('id').single()).data!.id;
  const evC = (await C.from('events').select('id').eq('wedding_id', wc).single()).data!.id;

  // Manual save
  const sg = (id: string | null, g: Record<string, unknown>, as_: unknown[]) => A.rpc('save_guest', { p_wedding_id: wa, p_guest_id: id as never, p_guest: { name: 'Lan', phone: '0912345678', side: 'nha-gai', party_size: 2, note: '', ...g }, p_assignments: as_ });
  const m = await sg(null, {}, [{ event_id: ev1, invite_status: 'sent', rsvp_status: 'attending', attending_count: 2 }, { event_id: ev2 }]);
  ok(!m.error, 'guest with two Events saved in one call');
  ok((await A.from('guests').select('id').eq('name', 'Lan')).data!.length === 1, 'shared guest is one row');
  ok((await A.from('guest_event_assignments').select('event_id').eq('guest_id', m.data as string)).data!.length === 2, 'two assignments');
  ok((await A.from('guests').select('phone').eq('id', m.data as string).single()).data!.phone === '0912345678', 'leading zero preserved');
  const cntBefore = (await A.from('guests').select('id')).data!.length;
  ok(!!(await sg(null, { name: 'X' }, [{ event_id: evC }])).error, 'cross-Wedding Event rejected');
  ok((await A.from('guests').select('id')).data!.length === cntBefore, 'rejected manual save leaves no partial guest');
  ok(!!(await sg(null, { name: 'Y' }, [{ event_id: ev1, rsvp_status: 'attending', attending_count: 5 }])).error, 'attending > party rejected');
  ok(!!(await sg(null, { name: 'Z', phone: 'abc' }, [])).error, 'bad phone rejected');
  ok(!(await sg(m.data as string, {}, [{ event_id: ev2 }])).error, 'edit drops ev1 assignment');
  ok((await A.from('guest_event_assignments').select('event_id').eq('guest_id', m.data as string)).data!.length === 1, 'assignment removed on edit');
  ok(((await C.from('guests').select('id').eq('wedding_id', wa)).data ?? []).length === 0, 'C cannot read A guests');
  ok(!!(await C.rpc('save_guest', { p_wedding_id: wa, p_guest_id: null as never, p_guest: { name: 'h', side: 'chung', party_size: 1 }, p_assignments: [] })).error, 'C cannot save into A');
  ok(((await anon.from('guest_import_batches').select('id')).data ?? []).length === 0, 'anon reads no batches');

  // Import
  const imp = (id: string, rows: unknown[], evs = [ev1, ev2], w = wa, c = A) => c.rpc('import_guest_batch', { p_batch_id: id, p_wedding_id: w, p_filename: 't.csv', p_event_ids: evs, p_rows: rows, p_skipped: 1, p_invalid: 0 });
  const b1 = crypto.randomUUID(); const rows150 = Array.from({ length: 150 }, (_, i) => row(i));
  const [r1, r2] = await Promise.all([imp(b1, rows150), imp(b1, rows150)]);
  ok(!r1.error && !r2.error, '150-row import ok (concurrent retry ok)');
  ok((await A.from('guest_import_rows').select('guest_id').eq('batch_id', b1)).data!.length === 150, 'provenance for 150 rows');
  ok((await A.from('guests').select('id').like('name', 'Khách %')).data!.length === 150, 'idempotent: retry did not duplicate');
  ok(((await imp(b1, rows150)).data as { replay: boolean }).replay === true, 'repeat request returns replay');
  ok((await A.from('guest_event_assignments').select('guest_id', { count: 'exact', head: true }).eq('event_id', ev2)).count! >= 150, 'imported guests assigned to both Events once each');
  const n0 = (await A.from('guests').select('id')).data!.length;
  ok(!!(await imp(crypto.randomUUID(), [row(900), row(901, { party_size: 0 })])).error, 'malformed party size rejects whole batch');
  ok(!!(await imp(crypto.randomUUID(), [row(902, { party_size: 1.5 })])).error, 'fractional party rejected');
  ok(!!(await imp(crypto.randomUUID(), [row(903, { decision: 'skip' })])).error, 'non-add decision rejected');
  ok(!!(await imp(crypto.randomUUID(), [row(904), row(904)])).error, 'duplicate source row rejected');
  ok(!!(await imp(crypto.randomUUID(), [row(905)], [evC])).error, 'cross-Wedding Event rejected');
  ok(!!(await imp(crypto.randomUUID(), [row(906)], [])).error, 'missing Event mapping rejected');
  ok(!!(await imp(crypto.randomUUID(), [row(907, { name: '' })])).error, 'missing name rejected');
  ok(!!(await imp(crypto.randomUUID(), [row(908)], [evC], wc, A)).error, 'A cannot import into C wedding');
  ok(!!(await imp(b1, rows150, [evC], wc, C)).error, 'C cannot reuse A batch id');
  ok((await A.from('guests').select('id')).data!.length === n0, 'rejected imports left no rows (atomic rollback)');
  ok(!!(await imp(crypto.randomUUID(), Array.from({ length: 1001 }, (_, i) => row(i + 2000)))).error, 'safety batch limit 1000');
  // Ambiguous duplicate: user explicitly adds a same-name row; server creates a separate person, never merges.
  const bDup = crypto.randomUUID();
  ok(!(await imp(bDup, [row(0, { source_row: 5 })])).error, 'explicitly-added suspected duplicate saved');
  ok((await A.from('guests').select('id').eq('name', 'Khách 0')).data!.length === 2, 'ambiguous duplicate not merged');
  ok(!!(await A.from('guest_import_batches').insert({ id: crypto.randomUUID(), wedding_id: wa })).error, 'client cannot insert batch directly');

  // Safe undo
  const ids = (await A.from('guest_import_rows').select('guest_id').eq('batch_id', b1).order('source_row')).data!.map(r => r.guest_id as string);
  await A.rpc('save_guest', { p_wedding_id: wa, p_guest_id: ids[0], p_guest: { name: 'Khách 0 (đã sửa)', phone: '0900000000', side: 'nha-gai', party_size: 1 }, p_assignments: [{ event_id: ev1 }, { event_id: ev2 }] });
  // Since 0009 a manual reply must set intent + source together with the legacy rsvp_status (consistency CHECKs).
  const rs = await A.from('guest_event_assignments').update({ attendance_intent: 'confirmed', rsvp_status: 'attending', response_source: 'manual' }).eq('guest_id', ids[1]).eq('event_id', ev1);
  ok(!rs.error, `manual RSVP change after import saved ${rs.error?.message ?? ''}`);
  await A.from('guests').delete().eq('id', ids[2]);
  const u = await A.rpc('undo_guest_batch', { p_batch_id: b1 });
  ok(!u.error && (u.data as any).removed === 147 && (u.data as any).kept === 2 && (u.data as any).missing === 1, `undo counts exact ${JSON.stringify(u.data)}`);
  ok((await A.from('guests').select('id').in('id', ids)).data!.length === 2, 'edited + RSVP-changed guests kept');
  ok(((await A.rpc('undo_guest_batch', { p_batch_id: b1 })).data as { already: boolean }).already, 'repeat undo is harmless');
  ok(!!(await C.rpc('undo_guest_batch', { p_batch_id: bDup })).error, 'C cannot undo A batch');
  ok((await A.from('guests').select('id').eq('name', 'Lan')).data!.length === 1, 'manual guest untouched by undo');
  ok((await A.from('audit_log').select('action').in('action', ['guests.imported', 'guests.import_undone'])).data!.length >= 3, 'imports and undo audited');

  await cleanup();
  console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
}
main().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
