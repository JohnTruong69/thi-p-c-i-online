/**
 * Phase 3 trial / read-only write gate — live verification with isolated QA accounts
 * (qa-gate-<ts>-*@example.test). Deletes its weddings, storage objects and accounts at the end.
 * Run: bun supabase/tests/write-gate-check.ts   (needs SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY)
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

const url = process.env.SUPABASE_URL!, anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!, service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
let failed = 0;
const ok = (c: boolean, label: string) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${label}`); if (!c) failed++; };
const mk = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(url, service, { auth: { persistSession: false } });
const TS = Date.now(); const PW = `Qa-gate-${TS}-pw`; const B = 'invitation-photos';
const email = (k: string) => `qa-gate-${TS}-${k}@example.test`;
const userIds: string[] = []; const weddings: string[] = [];
const RO = (r: { error: { message?: string } | null }) => !!r.error && /read-only/.test(r.error.message ?? '');
const png = (seed: number) => { const b = Buffer.alloc(64); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(seed, 20); return b; };
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const item = { label: 'Tiệc', category: 'tiec', category_detail: null, event_id: null, payer: 'couple', estimate_vnd: 1000, agreed_vnd: null, paid_vnd: 0, deposit_vnd: 0, extra_vnd: 0, vendor: null };

async function user(k: string) {
  const { data, error } = await admin.auth.admin.createUser({ email: email(k), password: PW, email_confirm: true });
  if (error) throw error; userIds.push(data.user.id);
  const c = mk(); const r = await c.auth.signInWithPassword({ email: email(k), password: PW }); if (r.error) throw r.error;
  return c;
}
async function draft(c: SupabaseClient, n: string) {
  const w = (await c.rpc('create_wedding_draft', { p_partner_one: n, p_partner_two: 'QA', p_planned_date: null as never, p_event_name: 'Lễ', p_event_side: 'chung', p_event_date: null as never })).data as string;
  weddings.push(w); return w;
}
const state = async (c: SupabaseClient, w: string) => (await c.rpc('wedding_access_state', { p_wedding_id: w })).data as { state: string; writable: boolean; write_gate_enabled: boolean };
const setTrial = (w: string, startedDaysAgo: number) => {
  const s = new Date(Date.now() - startedDaysAgo * 864e5); const e = new Date(s.getTime() + 7 * 864e5);
  return admin.from('weddings').update({ trial_started_at: s.toISOString(), trial_ends_at: e.toISOString() }).eq('id', w);
};
const monthsAgo = (m: number) => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - m); return d; };
async function setEnt(w: string, plan: 'one_payment_36m' | 'legacy_wedding_24m', paidMonthsAgo: number) {
  await admin.from('wedding_entitlements').delete().eq('wedding_id', w);
  const paid = monthsAgo(paidMonthsAgo); paid.setUTCHours(12, 0, 0, 0);
  let exp: Date;
  if (plan === 'legacy_wedding_24m') { exp = new Date(paid); exp.setUTCMonth(exp.getUTCMonth() + 24); }
  else { // expires = (paid in VN local + 36 months) back to UTC; VN has no DST so +36 calendar months at same clock
    exp = new Date(paid); exp.setUTCMonth(exp.getUTCMonth() + 36); }
  const r = await admin.from('wedding_entitlements').insert({ wedding_id: w, paid_at: paid.toISOString(), expires_at: exp.toISOString(), source: 'qa', plan_version: plan } as never);
  if (r.error) throw new Error('entitlement fixture: ' + r.error.message);
}

async function cleanup() {
  for (const w of weddings) { const l = (await admin.storage.from(B).list(w, { limit: 100 })).data ?? []; if (l.length) await admin.storage.from(B).remove(l.map(f => `${w}/${f.name}`)); }
  if (userIds.length) await admin.from('weddings').delete().in('created_by', userIds);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
}

async function main() {
  const M1 = await user('m1'), M2 = await user('m2'), V = await user('v'), anon = mk();
  const w = await draft(M1, 'Gate');
  const p = await M1.rpc('create_partner_invite', { p_wedding_id: w, p_email: email('m2') });
  await M2.rpc('accept_partner_invite', { p_token: ((p.data as { token: string }[])[0]).token });
  const ev = ((await M1.from('events').select('id').eq('wedding_id', w)).data ?? [])[0]!.id;

  // --- default OFF
  let s = await state(M1, w);
  ok(s.write_gate_enabled === false && s.writable === true && s.state === 'trial_not_started', 'new wedding: gate OFF, writable, no clock started');
  ok(!(await M1.from('tasks').insert({ wedding_id: w, title: 'off' })).error, 'gate OFF: direct write works');
  const realGated = (await admin.from('wedding_write_gate').select('wedding_id')).data ?? [];
  ok(realGated.every(r => weddings.includes(r.wedding_id)), 'no non-QA wedding is gated');

  // --- clients cannot activate / tamper
  ok(!!(await M1.from('wedding_write_gate' as never).insert({ wedding_id: w } as never)).error, 'manager cannot insert gate row');
  ok(((await M1.from('wedding_write_gate' as never).select('*')).data ?? []).length === 0, 'manager cannot read gate table');
  ok(!!(await M1.rpc('enable_wedding_write_gate' as never, { p_wedding_id: w } as never)).error, 'manager cannot call enable_wedding_write_gate');
  ok(!!(await anon.rpc('enable_wedding_write_gate' as never, { p_wedding_id: w } as never)).error, 'anon cannot call enable_wedding_write_gate');
  ok(!!(await M1.rpc('wedding_write_allowed' as never, { p_wedding_id: w } as never)).error, 'wedding_write_allowed not callable by clients');

  // --- seed data during OFF, including invitation + photo + viewer + import batch
  await M1.rpc('ensure_invitation', { p_wedding_id: w });
  const g = (await M1.rpc('save_guest', { p_wedding_id: w, p_guest_id: null as never, p_guest: { name: 'Cô Ba', phone: '0901', side: 'chung', party_size: 2 }, p_assignments: [{ event_id: ev }] })).data as string;
  const bi = (await M1.rpc('save_budget_item', { p_wedding_id: w, p_item_id: null as never, p_item: item, p_installments: [] })).data as string;
  const t = (await M1.from('tasks').insert({ wedding_id: w, title: 'seed' }).select('id').single()).data!.id;
  const bid = crypto.randomUUID();
  const imp = await M1.rpc('import_guest_batch', { p_batch_id: bid, p_wedding_id: w, p_filename: 'a.csv', p_event_ids: [ev], p_rows: [{ source_row: 2, name: 'Imp', phone: '', side: 'chung', party_size: 1, decision: 'add' }], p_skipped: 0, p_invalid: 0 });
  ok(!imp.error, 'seed import batch');
  const p1 = png(1), path1 = `${w}/${hash(p1)}.png`;
  ok(!(await M1.storage.from(B).upload(path1, p1, { contentType: 'image/png' })).error, 'gate OFF: photo upload works');
  const photo = (await M1.rpc('register_invitation_photo', { p_wedding_id: w, p_path: path1 })).data as string;
  const vi = await M1.rpc('create_viewer_invite', { p_wedding_id: w, p_email: email('v'), p_modules: ['events', 'guests', 'tasks'], p_sides: ['chung'] });
  await V.rpc('accept_viewer_invite', { p_token: ((vi.data as { token: string }[])[0]).token });
  const viewerId = (await admin.from('wedding_viewers').select('id').eq('wedding_id', w).single()).data!.id;

  // --- activate on QA wedding with server-started 7-day trial
  const en = await admin.rpc('enable_wedding_write_gate' as never, { p_wedding_id: w, p_start_trial: true, p_note: 'qa' } as never);
  ok(!en.error, `service role activates gate ${en.error?.message ?? ''}`);
  const wr = (await admin.from('weddings').select('trial_started_at,trial_ends_at').eq('id', w).single()).data!;
  ok(Math.abs(Date.parse(wr.trial_ends_at!) - Date.parse(wr.trial_started_at!) - 7 * 864e5) < 1000 && Math.abs(Date.parse(wr.trial_started_at!) - Date.now()) < 120_000, 'trial clock = server now + 7 days');
  s = await state(M2, w);
  ok(s.state === 'trial_active' && s.writable && s.write_gate_enabled, 'trial_active writable (second manager sees same state)');
  ok(!(await M2.from('tasks').insert({ wedding_id: w, title: 'trial' })).error, 'trial_active: second manager write ok');
  ok(!!(await M1.from('weddings').update({ trial_ends_at: new Date(Date.now() + 99 * 864e5).toISOString() } as never).eq('id', w)).error, 'client cannot extend trial clock');
  // concurrency: parallel writes during trial all succeed
  const par = await Promise.all(Array.from({ length: 8 }, (_, i) => M1.from('tasks').insert({ wedding_id: w, title: `p${i}` })));
  ok(par.every(r => !r.error), 'trial_active: 8 concurrent writes all succeed');

  // --- expire trial (server clock in the past)
  await setTrial(w, 8);
  s = await state(M1, w);
  ok(s.state === 'trial_expired_read_only' && s.writable === false, 'trial expired → read-only state');

  const denied = async (label: string) => {
    const checks: [string, PromiseLike<{ error: { message?: string } | null }>][] = [
      ['insert task', M1.from('tasks').insert({ wedding_id: w, title: 'x' })],
      ['update task', M1.from('tasks').update({ title: 'x' }).eq('id', t)],
      ['delete task', M1.from('tasks').delete().eq('id', t)],
      ['insert event', M1.from('events').insert({ wedding_id: w, name: 'x', side: 'chung' })],
      ['update event', M1.from('events').update({ venue: 'x' }).eq('id', ev)],
      ['update guest', M2.from('guests').update({ name: 'x' }).eq('id', g)],
      ['delete guest', M2.from('guests').delete().eq('id', g)],
      ['update assignment', M2.from('guest_event_assignments').update({ rsvp_status: 'attending' }).eq('guest_id', g)],
      ['update budget', M1.from('budget_items').update({ label: 'x' }).eq('id', bi)],
      ['insert installment', M1.from('budget_installments').insert({ wedding_id: w, budget_item_id: bi, amount_vnd: 1, label: 'x' })],
      ['update wedding', M1.from('weddings').update({ partner_one_name: 'x' }).eq('id', w)],
      ['update invitation', M1.from('invitations').update({ title: 'x' }).eq('wedding_id', w)],
      ['update link', M1.from('invitation_links').update({ enabled: true }).eq('wedding_id', w)],
      ['rpc save_guest', M1.rpc('save_guest', { p_wedding_id: w, p_guest_id: null as never, p_guest: { name: 'n', phone: '', side: 'chung', party_size: 1 }, p_assignments: [] })],
      ['rpc save_budget_item', M1.rpc('save_budget_item', { p_wedding_id: w, p_item_id: null as never, p_item: item, p_installments: [] })],
      ['rpc update_event_with_impact', M1.rpc('update_event_with_impact', { p_event_id: ev, p_fields: { name: 'Lễ', side: 'chung', event_date: '2027-10-25', event_time: '', venue: '', address: '', status: 'tentative' }, p_shift_task_ids: [] })],
      ['rpc remove_event', M1.rpc('remove_event', { p_event_id: ev })],
      ['rpc import_guest_batch', M1.rpc('import_guest_batch', { p_batch_id: crypto.randomUUID(), p_wedding_id: w, p_filename: 'b.csv', p_event_ids: [ev], p_rows: [{ source_row: 2, name: 'Imp2', phone: '', side: 'chung', party_size: 1, decision: 'add' }], p_skipped: 0, p_invalid: 0 })],
      ['rpc undo_guest_batch', M1.rpc('undo_guest_batch', { p_batch_id: bid })],
      ['rpc save_invitation_revision', M1.rpc('save_invitation_revision', { p_wedding_id: w, p_note: 'x' })],
      ['rpc remove_invitation_photo', M1.rpc('remove_invitation_photo', { p_photo_id: photo })],
      ['rpc create_partner_invite', M2.rpc('create_partner_invite', { p_wedding_id: w, p_email: email('zz') })],
      ['rpc update_viewer_grants', M1.rpc('update_viewer_grants', { p_viewer_id: viewerId, p_modules: ['events'], p_sides: ['chung'] })],
    ];
    const res = await Promise.all(checks.map(([, p]) => p));
    // UPDATE/DELETE via RLS may also report success with 0 rows if filtered; the trigger raises, so an error is required.
    res.forEach((r, i) => ok(RO(r), `${label}: ${checks[i]![0]} denied (read-only)`));
    const p2 = png(Math.floor(Math.random() * 1e9)); const up = await M1.storage.from(B).upload(`${w}/${hash(p2)}.png`, p2, { contentType: 'image/png' });
    ok(!!up.error, `${label}: storage upload denied`);
    await M1.storage.from(B).remove([path1]);
    ok(((await admin.storage.from(B).list(w)).data ?? []).some(f => path1.endsWith(f.name)), `${label}: storage delete denied (object kept)`);
  };
  const allowed = async (label: string) => {
    ok(((await M1.from('tasks').select('id').eq('wedding_id', w)).data ?? []).length > 0, `${label}: manager reads tasks`);
    ok(!(await M2.rpc('export_wedding_data', { p_wedding_id: w })).error, `${label}: export works`);
    ok(!((await M1.storage.from(B).createSignedUrls([path1], 60)).error), `${label}: private photo still readable by manager`);
    const vp = await V.rpc('viewer_projection', { p_wedding_id: w });
    ok(!vp.error && !!vp.data, `${label}: family viewer still reads projection`);
    ok(!(await M1.from('profiles').update({ display_name: 'QA Gate' }).eq('id', userIds[0]!)).error, `${label}: account profile update works`);
  };
  await denied('trial expired'); await allowed('trial expired');
  const pre = (await admin.from('tasks').select('id', { count: 'exact', head: true }).eq('wedding_id', w)).count;
  const par2 = await Promise.all(Array.from({ length: 8 }, () => M1.from('tasks').insert({ wedding_id: w, title: 'race' })));
  ok(par2.every(RO) && (await admin.from('tasks').select('id', { count: 'exact', head: true }).eq('wedding_id', w)).count === pre, 'trial expired: 8 concurrent writes all denied, no rows added');

  // deletion request and withdraw remain possible
  const dr = await M1.rpc('request_wedding_data_deletion', { p_wedding_id: w });
  ok(!dr.error, `trial expired: deletion request works ${dr.error?.message ?? ''}`);
  if (dr.data) ok(!(await M1.rpc('withdraw_wedding_data_deletion', { p_request_id: dr.data as string })).error, 'trial expired: withdraw deletion request works');

  // --- paid / legacy states
  const cases: [string, 'one_payment_36m' | 'legacy_wedding_24m', number, string, boolean][] = [
    ['paid active', 'one_payment_36m', 1, 'paid_active', true],
    ['paid expired', 'one_payment_36m', 37, 'paid_expired_read_only', false],
    ['legacy active', 'legacy_wedding_24m', 1, 'legacy_paid_active', true],
    ['legacy expired', 'legacy_wedding_24m', 25, 'legacy_paid_expired', false],
  ];
  for (const [label, plan, ago, st, writable] of cases) {
    await setEnt(w, plan, ago);
    s = await state(M1, w);
    ok(s.state === st && s.writable === writable, `${label}: state ${s.state} writable=${s.writable}`);
    if (writable) {
      ok(!(await M2.from('tasks').update({ title: label }).eq('id', t)).error, `${label}: manager direct write ok`);
      ok(!(await M1.rpc('save_guest', { p_wedding_id: w, p_guest_id: g, p_guest: { name: 'Cô Ba', phone: '0901', side: 'chung', party_size: 3 }, p_assignments: [{ event_id: ev }] })).error, `${label}: RPC write ok`);
    } else { await denied(label); await allowed(label); }
  }
  // paid active overrides an expired trial; a wedding still OFF is never affected
  const w2 = await draft(M1 === M1 ? await user('other') : M1, 'Off');
  await setTrial(w2, 30);
  ok(((await admin.from('wedding_write_gate').select('wedding_id').eq('wedding_id', w2)).data ?? []).length === 0, 'second wedding not gated');
}

main().catch(e => { console.error(e); failed++; }).finally(async () => {
  await cleanup();
  const left = await admin.from('weddings').select('id', { count: 'exact', head: true }).in('id', weddings.length ? weddings : ['00000000-0000-0000-0000-000000000000']);
  console.log(`cleanup: QA weddings remaining=${left.count}`);
  console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
});
