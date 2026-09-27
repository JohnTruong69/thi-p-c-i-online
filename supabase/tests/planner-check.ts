/**
 * Phase 3 slice 2a — Planner (tasks + budget) DB verification through the public Data API as confirmed test accounts.
 * Run: bun supabase/tests/planner-check.ts   (needs SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY). Self-cleaning.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!, anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!, service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
let failed = 0;
const ok = (c: boolean, label: string) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${label}`); if (!c) failed++; };
const mk = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
async function as(k: string) { const c = mk(); const { error } = await c.auth.signInWithPassword({ email: `rlstest-${k}@example.test`, password: `Test-pass-${k}-123456` }); if (error) throw error; return c; }
const admin = createClient(url, service, { auth: { persistSession: false } });
async function cleanup() {
  const { data } = await admin.from('profiles').select('id').like('email', 'rlstest-%');
  const ids = (data ?? []).map(r => r.id); if (ids.length) await admin.from('weddings').delete().in('created_by', ids);
}
const item = (o: Record<string, unknown> = {}) => ({ label: 'Tiệc', category: 'tiec', category_detail: null, event_id: null, payer: 'couple', estimate_vnd: 0, agreed_vnd: 100_000_000, paid_vnd: 20_000_000, deposit_vnd: 10_000_000, extra_vnd: 0, vendor: null, ...o });

async function main() {
  await cleanup();
  const A = await as('a'), C = await as('c'), anon = mk();
  const draft = (c: typeof A, n: string) => c.rpc('create_wedding_draft', { p_partner_one: n, p_partner_two: 'Minh', p_planned_date: null as never, p_event_name: 'Tiệc tối', p_event_side: 'chung', p_event_date: '2027-10-18' });
  const wa = (await draft(A, 'Lan')).data as string, wc = (await draft(C, 'Hoa')).data as string;
  const ev = (await A.from('events').select('id').eq('wedding_id', wa).single()).data!.id;
  const evC = (await C.from('events').select('id').eq('wedding_id', wc).single()).data!.id;

  // Tasks
  const t1 = await A.from('tasks').insert({ wedding_id: wa, title: 'Dự tính bàn', kind: 'table-count', planned_tables: 12, reserve_tables: 0, event_id: ev, due_date: '2027-10-01' }).select('id').single();
  ok(!t1.error, 'table-count task with 0 reserve saved');
  ok(!!(await A.from('tasks').insert({ wedding_id: wa, title: 'x', kind: 'table-count', status: 'done' })).error, 'done table-count without planned tables rejected');
  ok(!!(await A.from('tasks').insert({ wedding_id: wa, title: 'x', kind: 'standard', planned_tables: 3 })).error, 'standard task cannot hold table counts');
  const t2 = (await A.from('tasks').insert({ wedding_id: wa, title: 'Không dời', event_id: ev, due_date: '2027-09-01' }).select('id').single()).data!.id;
  ok(!!(await A.from('tasks').insert({ wedding_id: wa, title: 'x', event_id: evC })).error, 'task cannot link an Event from another wedding');
  const sug = () => A.from('tasks').upsert([{ wedding_id: wa, title: 'Xem ngày tốt', template_id: 's2', source: 'suggested' }], { onConflict: 'wedding_id,template_id', ignoreDuplicates: true });
  await Promise.all([sug(), sug()]); await sug();
  ok(((await A.from('tasks').select('id').eq('template_id', 's2')).data ?? []).length === 1, 'suggestion added once by template id despite retries');
  ok(!(await A.from('tasks').insert({ wedding_id: wa, title: 'Xem ngày tốt' })).error, 'manual task with same title as a suggestion is allowed');
  ok(((await C.from('tasks').select('id').eq('wedding_id', wa)).data ?? []).length === 0, 'C cannot read A tasks');
  ok(!!(await C.from('tasks').insert({ wedding_id: wa, title: 'hack' })).error, 'C cannot insert A tasks');
  await C.from('tasks').update({ title: 'hacked' }).eq('id', t1.data!.id);
  ok((await admin.from('tasks').select('title').eq('id', t1.data!.id).single()).data!.title === 'Dự tính bàn', 'C cannot update A tasks');
  ok(!!(await A.from('tasks').update({ wedding_id: wc }).eq('id', t2)).error, 'task cannot move to another wedding');
  ok(((await anon.from('tasks').select('id')).data ?? []).length === 0, 'anon reads no tasks');

  // Budget money rules (server-side)
  const save = (o: Record<string, unknown>, inst: unknown[] = [], id: string | null = null) => A.rpc('save_budget_item', { p_wedding_id: wa, p_item_id: id as never, p_item: item(o), p_installments: inst });
  const b1 = await save({ event_id: ev }, [{ label: 'Cuối', amount_vnd: 80_000_000, due_date: '2027-10-10' }]);
  ok(!b1.error && !!b1.data, 'valid cost + schedule saved atomically');
  ok(!!(await save({ deposit_vnd: 30_000_000 })).error, 'deposit > paid rejected');
  ok(!!(await save({ paid_vnd: 120_000_000, extra_vnd: 10_000_000 })).error, 'paid > agreed + extra rejected');
  ok(!(await save({ paid_vnd: 110_000_000, extra_vnd: 10_000_000 })).error, 'paid = agreed + extra allowed');
  ok(!!(await save({ estimate_vnd: -1 })).error, 'negative money rejected');
  ok(!!(await save({ agreed_vnd: null, paid_vnd: 5, deposit_vnd: 0, estimate_vnd: 1 })).error, 'paid without agreed price rejected');
  ok(!!(await save({ category: 'khac' })).error, 'Khác requires detail');
  const before = (await A.from('budget_items').select('id')).data!.length;
  ok(!!(await save({}, [{ label: 'Cuối', amount_vnd: 80_000_001, due_date: null }])).error, 'schedule above unpaid rejected');
  ok((await A.from('budget_items').select('id')).data!.length === before, 'rejected save leaves no partial cost');
  ok(!!(await save({ paid_vnd: 30_000_000 }, [{ label: 'Cuối', amount_vnd: 80_000_000 }], b1.data as string)).error, 'raising paid past schedule rejected');
  ok((await A.from('budget_installments').select('amount_vnd').eq('budget_item_id', b1.data as string)).data!.length === 1, 'failed edit keeps original schedule');
  ok(!!(await A.from('budget_items').update({ paid_vnd: 99_000_000 }).eq('id', b1.data as string)).error, 'direct update also enforces schedule rule');
  ok(!!(await C.rpc('save_budget_item', { p_wedding_id: wa, p_item_id: null as never, p_item: item(), p_installments: [] })).error, 'C cannot save cost into A wedding');
  ok(((await C.from('budget_items').select('id').eq('wedding_id', wa)).data ?? []).length === 0, 'C cannot read A costs');
  ok(!(await A.from('weddings').update({ budget_cap_vnd: 80_000_000 }).eq('id', wa)).error, 'manager can set budget cap');
  ok(!!(await A.from('weddings').update({ budget_cap_vnd: 0 }).eq('id', wa)).error, 'cap must be > 0');

  // Event date change: only consented tasks shift
  const fields = { name: 'Tiệc tối', side: 'chung', event_date: '2027-10-25', event_time: '', venue: '', address: '', status: 'tentative' };
  ok(!!(await C.rpc('update_event_with_impact', { p_event_id: ev, p_fields: fields, p_shift_task_ids: [] })).error, 'C cannot change A event');
  const n = await A.rpc('update_event_with_impact', { p_event_id: ev, p_fields: fields, p_shift_task_ids: [t1.data!.id] });
  ok(n.data === 1, 'one consented task shifted');
  const due = async (id: string) => (await A.from('tasks').select('due_date').eq('id', id).single()).data!.due_date;
  ok(await due(t1.data!.id) === '2027-10-08' && await due(t2) === '2027-09-01', 'consented +7 days; other task untouched');
  ok((await A.from('budget_installments').select('due_date').eq('budget_item_id', b1.data as string).single()).data!.due_date === '2027-10-10', 'payment date never changed automatically');

  // Event removal: one transaction
  ok(!!(await C.rpc('remove_event', { p_event_id: ev })).error, 'C cannot remove A event');
  const g = (await admin.from('guests').insert({ wedding_id: wa, name: 'Hà My' }).select('id').single()).data!.id;
  await admin.from('guest_event_assignments').insert({ wedding_id: wa, guest_id: g, event_id: ev });
  const r = await A.rpc('remove_event', { p_event_id: ev });
  const rr = r.data as { tasks: number; budget: number; guests: number };
  ok(!r.error && rr.tasks === 2 && rr.budget === 1 && rr.guests === 1, 'remove_event reports affected rows');
  ok(((await A.from('tasks').select('id').is('event_id', null).in('id', [t1.data!.id, t2])).data ?? []).length === 2, 'tasks kept as unassigned');
  ok(((await A.from('budget_items').select('id').is('event_id', null).eq('id', b1.data as string)).data ?? []).length === 1, 'cost kept as shared');
  ok(((await A.from('guests').select('id').eq('id', g)).data ?? []).length === 1 && ((await A.from('guest_event_assignments').select('guest_id').eq('guest_id', g)).data ?? []).length === 0, 'guest kept, assignment removed');
  ok(((await A.from('audit_log').select('id').eq('action', 'event.removed')).data ?? []).length === 1, 'removal audited');

  await cleanup();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); process.exit(failed ? 1 : 0);
}
main().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
