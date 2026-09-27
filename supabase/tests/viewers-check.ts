/**
 * Phase 3 family viewers — RLS / RPC verification against the live backend.
 * Creates its own confirmed QA accounts (qa-viewer-<ts>-*@example.test), and deletes their weddings and accounts at the end.
 * Run: bun supabase/tests/viewers-check.ts   (needs SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY)
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!, anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!, service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
let failed = 0;
const ok = (c: boolean, label: string) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${label}`); if (!c) failed++; };
const mk = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(url, service, { auth: { persistSession: false } });
const TS = Date.now(); const PW = `Qa-viewer-${TS}-pw`;
const email = (k: string) => `qa-viewer-${TS}-${k}@example.test`;
const userIds: string[] = [];

async function user(k: string, confirmed = true) {
  const { data, error } = await admin.auth.admin.createUser({ email: email(k), password: PW, email_confirm: confirmed, app_metadata: { presale_exempt: true } });
  if (error) throw error; userIds.push(data.user.id);
  const c = mk(); if (confirmed) { const r = await c.auth.signInWithPassword({ email: email(k), password: PW }); if (r.error) throw r.error; }
  return c;
}
const tokenOf = (r: { data: unknown }) => ((r.data as { token: string }[] | null)?.[0]?.token ?? '');
const hasKeyDeep = (o: unknown, keys: string[]): boolean => JSON.stringify(o).match(new RegExp(`"(${keys.join('|')})":`)) !== null;

async function cleanup() {
  if (userIds.length) await admin.from('weddings').delete().in('created_by', userIds);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
}

async function main() {
  const M1 = await user('m1'), M2 = await user('m2'), V1 = await user('v1'), V2 = await user('v2'), V3 = await user('v3'), X = await user('x');
  const anon = mk();
  const wa = (await M1.rpc('create_wedding_draft', { p_partner_one: 'QA Lan', p_partner_two: 'QA Minh', p_planned_date: null as unknown as string, p_event_name: 'Lễ chung', p_event_side: 'chung', p_event_date: null as unknown as string })).data as string;
  const wx = (await X.rpc('create_wedding_draft', { p_partner_one: 'QA X', p_partner_two: 'QA Y', p_planned_date: null as unknown as string, p_event_name: 'Lễ X', p_event_side: 'chung', p_event_date: null as unknown as string })).data as string;
  ok(!!wa && !!wx, 'QA weddings created');
  const p = await M1.rpc('create_partner_invite', { p_wedding_id: wa, p_email: email('m2') });
  ok(!!(await M2.rpc('accept_partner_invite', { p_token: tokenOf(p) })).data, 'second manager joined (existing two-manager flow unchanged)');

  // seed: nhà gái event + guests/tasks/budget with private fields
  const evChung = ((await M1.from('events').select('id').eq('wedding_id', wa)).data ?? [])[0]!.id;
  const evGai = (await M1.from('events').insert({ wedding_id: wa, name: 'Tiệc nhà gái', side: 'nha-gai' }).select('id').single()).data!.id;
  const g1 = (await M1.from('guests').insert({ wedding_id: wa, name: 'Cô Ba', phone: '0901234567', side: 'chung', party_size: 2, note: 'bí mật' }).select('id').single()).data!.id;
  await M1.from('guests').insert({ wedding_id: wa, name: 'Chú Tư nhà gái', phone: '0907654321', side: 'nha-gai', party_size: 1, note: 'riêng' });
  await M1.from('guest_event_assignments').insert([{ wedding_id: wa, guest_id: g1, event_id: evChung }, { wedding_id: wa, guest_id: g1, event_id: evGai }]);
  await M1.from('tasks').insert([{ wedding_id: wa, title: 'Việc chung', note: 'ghi chú riêng', outcome: 'kết quả riêng' }, { wedding_id: wa, title: 'Việc nhà gái', event_id: evGai }]);
  const bi = await M1.from('budget_items').insert({ wedding_id: wa, label: 'Nhà hàng', category: 'tiec', estimate_vnd: 50000000, vendor: 'NCC bí mật', note: 'riêng' } as never);
  ok(!bi.error, `seed budget item ${bi.error?.message ?? ''}`);

  // invite rules
  const inv = (c: SupabaseClient, k: string, mods = ['events', 'guests', 'tasks', 'budget', 'rsvp'], sides = ['chung']) =>
    c.rpc('create_viewer_invite', { p_wedding_id: wa, p_email: email(k), p_modules: mods, p_sides: sides });
  ok(!!(await X.rpc('create_viewer_invite', { p_wedding_id: wa, p_email: email('v1'), p_modules: ['events'], p_sides: ['chung'] })).error, 'outsider manager cannot invite into another wedding');
  ok(!!(await anon.rpc('create_viewer_invite', { p_wedding_id: wa, p_email: email('v1'), p_modules: ['events'], p_sides: ['chung'] })).error, 'anon cannot invite');
  ok(!!(await inv(M1, 'v1', ['checkout'])).error, 'unknown module (checkout) rejected');
  ok(!!(await inv(M1, 'v1', ['events'], [])).error, 'empty sides rejected');
  ok(!!(await inv(M1, 'm2')).error, 'cannot invite an existing manager as viewer');
  const i1a = await inv(M1, 'v1'); const i1b = await inv(M2, 'v1');   // re-invite by the other manager replaces the first link
  ok(!!tokenOf(i1a) && !!tokenOf(i1b) && tokenOf(i1a) !== tokenOf(i1b), 'both managers can invite; re-invite issues a new token');
  const stored = (await admin.from('wedding_viewer_invites').select('token_hash,status').eq('wedding_id', wa)).data ?? [];
  ok(stored.every(r => /^[0-9a-f]{64}$/.test(r.token_hash) && r.token_hash !== tokenOf(i1b)), 'only token hashes are stored');
  ok(stored.filter(r => r.status === 'pending').length === 1, 're-invite keeps one pending slot');
  // concurrency: two different emails racing for the last slot
  const [c2, c3] = await Promise.all([inv(M1, 'v2', ['events'], ['chung']), inv(M2, 'v3', ['events'], ['chung'])]);
  ok([c2, c3].filter(r => !r.error).length === 1, 'concurrent invites for the last slot: exactly one succeeds');
  ok(!!(await inv(M1, 'zz')).error, 'third viewer slot rejected');
  const loser = c2.error ? 'v2' : 'v3'; const winner = c2.error ? 'v3' : 'v2'; const winTok = tokenOf(c2.error ? c3 : c2);

  // acceptance
  ok(!!(await V1.rpc('accept_viewer_invite', { p_token: tokenOf(i1a) })).error, 'replaced (old) token no longer accepts');
  const Wrong = loser === 'v2' ? V2 : V3;
  ok(!!(await Wrong.rpc('accept_viewer_invite', { p_token: winTok })).error, 'email mismatch cannot accept');
  const unconf = mk(); await admin.auth.admin.createUser({ email: email('u'), password: PW, email_confirm: false }).then(r => r.data.user && userIds.push(r.data.user.id));
  ok(!!(await unconf.rpc('inspect_viewer_invite', { p_token: winTok })).error, 'anon cannot inspect invite');
  ok(!!(await V1.rpc('viewer_projection', { p_wedding_id: wa })).error, 'pending invitee has no projection');
  const acc1 = await V1.rpc('accept_viewer_invite', { p_token: tokenOf(i1b) });
  const acc1b = await V1.rpc('accept_viewer_invite', { p_token: tokenOf(i1b) });
  ok(acc1.data === wa && acc1b.data === wa, 'accept works and is idempotent');
  const Win = winner === 'v2' ? V2 : V3;
  await Win.rpc('accept_viewer_invite', { p_token: winTok });
  ok(((await admin.from('wedding_viewers').select('id').eq('wedding_id', wa).is('revoked_at', null)).data ?? []).length === 2, 'exactly two active viewers');
  ok(((await admin.from('wedding_memberships').select('id').eq('wedding_id', wa)).data ?? []).length === 2, 'wedding_memberships unchanged (2 managers, no viewers)');

  // projection content (V1: all modules, chung only)
  const pr = (await V1.rpc('viewer_projection', { p_wedding_id: wa })).data as Record<string, unknown[]> & { events: { name: string }[]; guests: { name: string; events: unknown[] }[]; tasks: { title: string }[] };
  ok(!!pr && pr.events.length === 1 && pr.events[0]!.name === 'Lễ chung', 'side filter: only chung events');
  ok(pr.guests.length === 1 && pr.guests[0]!.name === 'Cô Ba' && pr.guests[0]!.events.length === 1, 'side filter: only chung guests and chung assignments');
  ok(pr.tasks.length === 1 && pr.tasks[0]!.title === 'Việc chung', 'side filter: tasks without event only via chung');
  ok(!hasKeyDeep(pr, ['phone', 'note', 'outcome', 'vendor', 'storage_path', 'token', 'token_hash', 'edit_code_hash', 'fingerprint', 'paid_at', 'expires_at', 'email']), 'projection has no private keys');
  ok(!JSON.stringify(pr).includes('0901234567') && !JSON.stringify(pr).includes('bí mật'), 'projection has no phone/note values');
  ok(!!(await V1.rpc('viewer_projection', { p_wedding_id: wx })).error, 'viewer cannot read another wedding');
  ok(!!(await X.rpc('viewer_projection', { p_wedding_id: wa })).error, 'non-viewer cannot read projection');
  const vw = (await V1.rpc('viewer_weddings')).data as { wedding_id: string }[];
  ok(vw.length === 1 && vw[0]!.wedding_id === wa, 'viewer_weddings lists only granted wedding');

  // direct table access denied
  for (const t of ['weddings', 'events', 'guests', 'guest_event_assignments', 'tasks', 'budget_items', 'invitation_photos', 'invitation_links', 'rsvp_responses', 'wedding_entitlements', 'guest_import_rows', 'audit_log', 'wedding_viewers', 'wedding_viewer_invites'] as const) {
    ok(((await V1.from(t).select('*').eq('wedding_id' as never, wa as never)).data ?? []).length === 0, `viewer direct SELECT ${t} -> 0 rows`);
  }
  ok(!!(await V1.from('events').insert({ wedding_id: wa, name: 'hack' })).error, 'viewer cannot insert events');
  await V1.from('guests').update({ name: 'hacked' }).eq('wedding_id', wa);
  ok(((await admin.from('guests').select('id').eq('name', 'hacked')).data ?? []).length === 0, 'viewer update affects 0 rows');
  ok(!!(await V1.from('wedding_viewers').insert({ wedding_id: wa, user_id: userIds[2]!, email: 'x', modules: ['events'], sides: ['chung'] } as never)).error, 'no direct viewer insert');
  await V1.from('wedding_viewers').update({ modules: ['events', 'guests'], sides: ['chung', 'nha-gai', 'nha-trai'] }).eq('wedding_id', wa);
  ok(((await admin.from('wedding_viewers').select('sides').eq('wedding_id', wa).contains('sides', ['nha-gai'])).data ?? []).length === 0, 'viewer cannot widen own grants');
  ok(!!(await V1.rpc('create_viewer_invite', { p_wedding_id: wa, p_email: 'q@example.test', p_modules: ['events'], p_sides: ['chung'] })).error, 'viewer cannot invite');
  ok(!!(await V1.rpc('save_guest', { p_wedding_id: wa, p_guest_id: null as unknown as string, p_guest: { name: 'x', side: 'chung', party_size: 1 }, p_assignments: [] })).error, 'viewer cannot call manager write RPCs');

  // grants change + revoke take effect immediately
  const v1id = (await admin.from('wedding_viewers').select('id').eq('wedding_id', wa).eq('email', email('v1')).single()).data!.id;
  ok(!!(await V1.rpc('update_viewer_grants', { p_viewer_id: v1id, p_modules: ['events'], p_sides: ['nha-gai'] })).error, 'viewer cannot change grants');
  ok(!(await M2.rpc('update_viewer_grants', { p_viewer_id: v1id, p_modules: ['events'], p_sides: ['nha-gai'] })).error, 'second manager changes grants');
  const pr2 = (await V1.rpc('viewer_projection', { p_wedding_id: wa })).data as Record<string, unknown>;
  ok(!('guests' in pr2) && !('tasks' in pr2) && (pr2['events'] as { name: string }[]).map(e => e.name).join() === 'Tiệc nhà gái', 'narrowed grants apply immediately');
  ok(!(await M1.rpc('revoke_viewer', { p_viewer_id: v1id })).error, 'manager revokes viewer');
  ok(!!(await V1.rpc('viewer_projection', { p_wedding_id: wa })).error, 'revoked viewer loses access immediately');
  ok(((await V1.rpc('viewer_weddings')).data as unknown[]).length === 0, 'revoked viewer lists no weddings');
  ok(!!(await V1.rpc('accept_viewer_invite', { p_token: tokenOf(i1b) })).error === false, 'replay of accepted token does not re-grant silently');
  ok(!!(await V1.rpc('viewer_projection', { p_wedding_id: wa })).error, 'still revoked after replay');

  // expiry
  const ie = await inv(M1, 'v1', ['events'], ['chung']);
  await admin.from('wedding_viewer_invites').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('wedding_id', wa).eq('email', email('v1')).eq('status', 'pending');
  ok((await V1.rpc('accept_viewer_invite', { p_token: tokenOf(ie) })).data === null, 'expired invite returns null (not accepted)');
  ok(!!(await V1.rpc('viewer_projection', { p_wedding_id: wa })).error, 'expired invite grants nothing');

  const audit = ((await admin.from('audit_log').select('action').eq('wedding_id', wa)).data ?? []).map(r => r.action);
  ok(['viewer.invited', 'viewer.accepted', 'viewer.grants_changed', 'viewer.revoked', 'viewer.invite_expired'].every(a => audit.includes(a)), 'viewer changes audited');
}

main().catch(e => { console.error(e); failed++; }).finally(async () => { await cleanup(); console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); process.exit(failed ? 1 : 0); });
