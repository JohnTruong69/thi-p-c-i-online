/**
 * Phase 3 slice 1 — RLS / RPC verification against the live backend through the public Data API,
 * signed in as three real confirmed test accounts (rlstest-{a,b,c}@example.test).
 * Run: bun supabase/tests/rls-check.ts   (needs SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY)
 * Cleans up every wedding it creates via the service role at the end.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!, anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!, service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
let failed = 0;
const ok = (c: boolean, label: string) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${label}`); if (!c) failed++; };
const mk = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
async function as(k: string) {
  const c = mk();
  const { error } = await c.auth.signInWithPassword({ email: `rlstest-${k}@example.test`, password: `Test-pass-${k}-123456` });
  if (error) throw error;
  return c;
}
const admin = createClient(url, service, { auth: { persistSession: false } });

async function cleanup() {
  const { data } = await admin.from('profiles').select('id').like('email', 'rlstest-%');
  const ids = (data ?? []).map(r => r.id);
  if (ids.length) await admin.from('weddings').delete().in('created_by', ids);
}

async function main() {
  await cleanup();
  const A = await as('a'), B = await as('b'), C = await as('c');
  const anon = mk();
  const draft = (c: SupabaseClient, a: string) => c.rpc('create_wedding_draft', { p_partner_one: a, p_partner_two: 'Minh', p_planned_date: null, p_event_name: 'Lễ cưới' });

  const [r1, r2, r3] = await Promise.all([draft(A, 'Lan'), draft(A, 'Lan'), draft(A, 'Lan')]);
  const wa = r1.data as string;
  ok(!!wa && r2.data === wa && r3.data === wa, 'three concurrent create clicks -> one wedding');
  ok(((await A.from('weddings').select('id')).data ?? []).length === 1, 'A sees exactly one wedding');
  ok(((await A.from('events').select('id')).data ?? []).length === 1, 'first event created with draft');
  const wc = (await draft(C, 'Hoa')).data as string;

  ok(((await C.from('events').select('id').eq('wedding_id', wa)).data ?? []).length === 0, 'C cannot read A events by guessing wedding id');
  ok(!!(await C.from('events').insert({ wedding_id: wa, name: 'hack' })).error, 'C cannot insert into A wedding');
  await C.from('events').update({ name: 'hacked' }).eq('wedding_id', wa);
  ok(((await admin.from('events').select('id').eq('name', 'hacked')).data ?? []).length === 0, 'C update on A rows affects 0 rows');
  ok(!!(await C.rpc('create_partner_invite', { p_wedding_id: wa, p_email: 'x@example.test' })).error, 'C cannot invite into A wedding');
  ok(!!(await C.from('audit_log').insert({ wedding_id: wc, action: 'forged' } as never)).error, 'audit log not insertable by client');
  await C.from('audit_log').delete().eq('wedding_id', wc);
  ok(((await C.from('audit_log').select('id')).data ?? []).length >= 2, 'audit log not deletable by client');
  ok(!!(await C.from('wedding_memberships').insert({ wedding_id: wa, user_id: (await C.auth.getUser()).data.user!.id } as never)).error, 'no direct membership insert');
  ok(!!(await C.from('weddings').update({ created_by: (await A.auth.getUser()).data.user!.id } as never).eq('id', wc)).error, 'created_by not client-updatable');

  const evA = (await A.from('events').select('id').single()).data!.id;
  ok(!!(await A.from('events').update({ wedding_id: wc }).eq('id', evA)).error, 'cannot move a row to another wedding');
  const memA = (await A.from('wedding_memberships').select('id').single()).data!.id;
  ok(!!(await A.rpc('remove_manager', { p_membership_id: memA })).error, 'sole manager cannot remove self');

  const inv = await A.rpc('create_partner_invite', { p_wedding_id: wa, p_email: 'RLSTEST-B@example.test' });
  const tok = (inv.data as { token: string }[])?.[0]?.token;
  ok(!!tok, 'A creates invite for B');
  ok(!!(await A.rpc('create_partner_invite', { p_wedding_id: wa, p_email: 'third@example.test' })).error, 'no third slot while invite pending');

  ok(((await B.from('weddings').select('id')).data ?? []).length === 0 && ((await B.from('events').select('id')).data ?? []).length === 0 && ((await B.from('wedding_invites').select('id')).data ?? []).length === 0, 'pending invitee has zero data access');
  ok(!!(await C.rpc('accept_partner_invite', { p_token: tok })).error, 'different email cannot accept');
  ok(((await B.rpc('inspect_invite', { p_token: tok })).data as { email_matches: boolean }[])[0]?.email_matches === true, 'invitee email matches');
  ok((await B.rpc('accept_partner_invite', { p_token: tok })).data === wa, 'B accepts');
  ok((await B.rpc('accept_partner_invite', { p_token: tok })).data === wa, 'accept retry is idempotent');
  await B.from('events').update({ venue: 'Nhà hàng B' }).eq('id', evA);
  ok(((await A.from('events').select('venue').eq('id', evA).single()).data?.venue) === 'Nhà hàng B', 'B has equal write rights, A sees it');
  ok(((await B.from('wedding_memberships').select('id')).data ?? []).length === 2, 'two managers');
  ok(!!(await A.rpc('create_partner_invite', { p_wedding_id: wa, p_email: 'third@example.test' })).error, 'no third manager');

  await B.rpc('remove_manager', { p_membership_id: memA });
  const memB = (await B.from('wedding_memberships').select('id').single()).data!.id;
  ok(!!(await B.rpc('remove_manager', { p_membership_id: memB })).error, 'cannot leave zero managers');
  const acts = ((await B.from('audit_log').select('action').eq('wedding_id', wa)).data ?? []).map(r => r.action);
  ok(['invite.created', 'membership.added', 'membership.removed'].every(a => acts.includes(a)), 'membership changes audited');
  ok(((await A.from('weddings').select('id')).data ?? []).length === 0, 'removed manager loses access');

  ok(((await anon.from('weddings').select('id')).data ?? []).length === 0, 'anon reads no weddings');
  ok(!!(await anon.rpc('create_wedding_draft', { p_partner_one: 'a', p_partner_two: 'b', p_planned_date: null, p_event_name: 'c' })).error, 'anon cannot call RPC');

  const inv2 = await C.rpc('create_partner_invite', { p_wedding_id: wc, p_email: 'late@example.test' });
  const t2 = (inv2.data as { invite_id: string; token: string }[])[0]!;
  await C.rpc('revoke_partner_invite', { p_invite_id: t2.invite_id });
  ok(((await C.rpc('inspect_invite', { p_token: t2.token })).data as { status: string }[])[0]?.status === 'revoked', 'revoked invite reported');
  await admin.from('wedding_invites').update({ status: 'pending', expires_at: new Date(Date.now() - 60000).toISOString() }).eq('id', t2.invite_id);
  ok(((await C.rpc('inspect_invite', { p_token: t2.token })).data as { status: string }[])[0]?.status === 'expired', 'expired invite reported');

  await cleanup();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
}
main().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
