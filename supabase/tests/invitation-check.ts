/**
 * Phase 3 slice 3 — invitation/photos/links/publish-gate DB + storage verification as confirmed rlstest-* accounts. Self-cleaning.
 * Run: bun supabase/tests/invitation-check.ts (needs SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY).
 */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
const url = process.env.SUPABASE_URL!, anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!, service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
let failed = 0;
const ok = (c: boolean, label: string) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${label}`); if (!c) failed++; };
const mk = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
async function as(k: string) { const c = mk(); const { error } = await c.auth.signInWithPassword({ email: `rlstest-${k}@example.test`, password: `Test-pass-${k}-123456` }); if (error) throw error; return c; }
const admin = createClient(url, service, { auth: { persistSession: false } });
const B = 'invitation-photos';
async function cleanup() {
  const { data } = await admin.from('profiles').select('id').like('email', 'rlstest-%'); const ids = (data ?? []).map(r => r.id);
  if (!ids.length) return;
  const ws = (await admin.from('weddings').select('id').in('created_by', ids)).data ?? [];
  for (const w of ws) { const l = (await admin.storage.from(B).list(w.id, { limit: 100 })).data ?? []; if (l.length) await admin.storage.from(B).remove(l.map(f => `${w.id}/${f.name}`)); }
  await admin.from('weddings').delete().in('created_by', ids);
}
const png = (seed: number) => { const b = Buffer.alloc(64); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(seed, 20); return b; };
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');

async function main() {
  await cleanup();
  const A = await as('a'), C = await as('c'), anon = mk();
  const draft = (c: typeof A, n: string) => c.rpc('create_wedding_draft', { p_partner_one: n, p_partner_two: 'Minh', p_planned_date: null as never, p_event_name: 'Tiệc tối', p_event_side: 'chung', p_event_date: '2027-10-18' });
  const wa = (await draft(A, 'Lan')).data as string, wc = (await draft(C, 'Hoa')).data as string;
  const [i1, i2] = await Promise.all([A.rpc('ensure_invitation', { p_wedding_id: wa }), A.rpc('ensure_invitation', { p_wedding_id: wa })]);
  ok(!i1.error && i1.data === i2.data, 'concurrent ensure_invitation returns one draft');
  ok((await A.from('invitations').select('id').eq('wedding_id', wa)).data!.length === 1, 'exactly one invitation per wedding');
  const links = (await A.from('invitation_links').select('*').eq('wedding_id', wa)).data!;
  ok(links.length === 3 && links.every(l => /^[0-9a-f]{64}$/.test(l.token)), 'three links with 64-hex tokens');
  ok(new Set(links.map(l => l.token)).size === 3, 'tokens unique');
  ok(!!(await A.from('invitation_links').insert({ wedding_id: wa, invitation_id: i1.data as string, side: 'chung' })).error, 'client cannot insert a 4th link');
  const chung = links.find(l => l.side === 'chung')!;
  ok(!!(await A.from('invitation_links').update({ token: 'f'.repeat(64) } as never).eq('id', chung.id)).error, 'token cannot be changed by client');
  ok(!!(await A.from('invitations').update({ template: 'other' } as never).eq('wedding_id', wa)).error, 'template locked');
  ok(!!(await A.from('invitations').update({ published_revision_id: null, published_at: new Date().toISOString() } as never).eq('wedding_id', wa)).error, 'client cannot set publication columns');
  ok(!(await A.from('invitations').update({ title: 'Lan & Minh', message: 'Mời bạn' }).eq('wedding_id', wa)).error, 'manager updates content');

  // Links + Events
  const ev1 = (await A.from('events').select('id').eq('wedding_id', wa).single()).data!.id;
  const evC = (await C.from('events').select('id').eq('wedding_id', wc).single()).data!.id;
  ok(!!(await A.from('invitation_links').update({ event_ids: [evC] }).eq('id', chung.id)).error, 'cross-wedding Event rejected in link');
  ok(!(await A.from('invitation_links').update({ enabled: true, event_ids: [ev1] }).eq('id', chung.id)).error, 'link enabled with own Event');
  const ev2 = (await A.from('events').insert({ wedding_id: wa, name: 'Lễ vu quy', event_date: '2027-10-17', event_time: '09:00', venue: 'Nhà gái', address: '2 Lê Lợi' }).select('id').single()).data!.id;
  await A.from('invitation_links').update({ event_ids: [ev1, ev2] }).eq('id', chung.id);
  ok(!(await A.rpc('remove_event', { p_event_id: ev2 })).error, 'remove Event in a link');
  const after = (await A.from('invitation_links').select('event_ids').eq('id', chung.id).single()).data!;
  ok(after.event_ids.includes(ev2), 'removed Event id kept in link (shown as needs-fix, not silently dropped)');
  ok(!(await A.from('invitation_links').update({ event_ids: [ev1] }).eq('id', chung.id)).error, 'manager can remove orphan id');

  // Cross-wedding / anon
  ok(((await C.from('invitations').select('id').eq('wedding_id', wa)).data ?? []).length === 0, 'C cannot read A invitation');
  ok(((await C.from('invitation_links').select('token').eq('wedding_id', wa)).data ?? []).length === 0, 'C cannot read A tokens');
  ok(((await C.from('invitation_links').update({ enabled: false }).eq('id', chung.id).select()).data ?? []).length === 0, 'C cannot update A link');
  ok(!!(await C.rpc('ensure_invitation', { p_wedding_id: wa })).error, 'C cannot ensure A invitation');
  ok(!!(await C.rpc('save_invitation_revision', { p_wedding_id: wa, p_note: '' })).error, 'C cannot save A revision');
  ok(((await anon.from('invitation_links').select('token')).data ?? []).length === 0, 'anon reads no links');
  ok(!!(await anon.rpc('ensure_invitation', { p_wedding_id: wa })).error, 'anon cannot call ensure_invitation');

  // Photos / storage
  const p1 = png(1), path1 = `${wa}/${hash(p1)}.png`;
  ok(!(await A.storage.from(B).upload(path1, p1, { contentType: 'image/png' })).error, 'manager uploads photo to own folder');
  ok(!!(await A.storage.from(B).upload(path1, p1, { contentType: 'image/png' })).error, 'identical photo cannot be uploaded twice');
  const reg = await A.rpc('register_invitation_photo', { p_wedding_id: wa, p_path: path1 });
  ok(!reg.error, 'photo registered');
  ok((await A.rpc('register_invitation_photo', { p_wedding_id: wa, p_path: path1 })).data === reg.data, 'register idempotent');
  const pc = png(2);
  ok(!!(await C.storage.from(B).upload(`${wa}/${hash(pc)}.png`, pc, { contentType: 'image/png' })).error, 'C cannot upload into A folder');
  ok(!!(await A.storage.from(B).upload(`${wa}/evil.png`, pc, { contentType: 'image/png' })).error, 'bad path name rejected by storage');
  ok(!!(await A.storage.from(B).upload(`${wa}/${hash(pc)}.svg`, pc, { contentType: 'image/svg+xml' })).error, 'svg rejected by storage path rule');
  const txt = Buffer.from('not an image'), tpath = `${wa}/${hash(txt)}.png`;
  await A.storage.from(B).upload(tpath, txt, { contentType: 'text/plain' });
  ok(!!(await A.rpc('register_invitation_photo', { p_wedding_id: wa, p_path: tpath })).error, 'wrong stored MIME rejected at registration');
  await A.storage.from(B).remove([tpath]);
  ok(((await C.storage.from(B).download(path1)).data) == null, 'C cannot download A photo');
  ok(((await anon.storage.from(B).download(path1)).data) == null, 'anon cannot download photo');
  ok(!!(await C.rpc('register_invitation_photo', { p_wedding_id: wa, p_path: path1 })).error, 'C cannot register into A');
  ok(!(await A.from('invitations').update({ cover_photo_id: reg.data as string }).eq('wedding_id', wa)).error, 'cover set to own photo');
  // Fill to 50 via storage and ensure 51st is blocked by storage + DB
  const extra = Array.from({ length: 49 }, (_, i) => png(100 + i));
  for (const b of extra) { const p = `${wa}/${hash(b)}.png`; await A.storage.from(B).upload(p, b, { contentType: 'image/png' }); await A.rpc('register_invitation_photo', { p_wedding_id: wa, p_path: p }); }
  ok((await A.from('invitation_photos').select('id').eq('wedding_id', wa)).data!.length === 50, '50 photos registered');
  const b51 = png(999);
  ok(!!(await A.storage.from(B).upload(`${wa}/${hash(b51)}.png`, b51, { contentType: 'image/png' })).error, '51st photo rejected by storage');
  const pid = (await A.from('invitation_photos').select('id').eq('storage_path', `${wa}/${hash(extra[0]!)}.png`).single()).data!.id;
  ok(!(await A.rpc('remove_invitation_photo', { p_photo_id: pid })).error, 'photo removed');

  // Revisions + publish gate + public projection
  const s1 = await A.rpc('save_invitation_revision', { p_wedding_id: wa, p_note: '' });
  ok(!s1.error && (s1.data as { revision: number }).revision === 1, 'revision 1 saved');
  ok((await A.rpc('save_invitation_revision', { p_wedding_id: wa, p_note: '' })).data?.unchanged === true, 'unchanged draft does not create a new revision');
  ok(!!(await A.from('invitation_revisions').delete().eq('wedding_id', wa)).error || ((await A.from('invitation_revisions').select('id').eq('wedding_id', wa)).data ?? []).length === 1, 'revisions are append-only for clients');
  const pub = await A.rpc('publish_invitation', { p_wedding_id: wa });
  ok(!!pub.error && /entitlement required/.test(pub.error.message), 'unpaid publish denied by server');
  ok((await A.from('invitations').select('published_revision_id').eq('wedding_id', wa).single()).data!.published_revision_id === null, 'nothing published');
  ok(!!(await A.from('wedding_entitlements').insert({ wedding_id: wa, paid_at: new Date().toISOString(), expires_at: new Date(Date.now() + 864e5).toISOString(), source: 'client' })).error, 'client cannot create entitlement');
  const closed = await anon.rpc('public_invitation', { p_token: chung.token });
  ok(!closed.error && JSON.stringify(closed.data) === '{"open":false}', 'enabled but unpublished/unpaid link is neutral closed for anon');
  ok(JSON.stringify((await anon.rpc('public_invitation', { p_token: 'x' })).data) === '{"open":false}', 'unknown token same neutral closed');
  const offTok = links.find(l => l.side === 'nha-trai')!.token;
  ok(JSON.stringify((await anon.rpc('public_invitation', { p_token: offTok })).data) === '{"open":false}', 'disabled link neutral closed');

  // Positive path with a service-granted entitlement (simulates Phase 4 verification) then expiry
  await admin.from('wedding_entitlements').insert({ wedding_id: wa, paid_at: new Date(Date.now() - 1000).toISOString(), expires_at: new Date(Date.now() + 864e5).toISOString(), source: 'test' });
  ok(!(await A.rpc('publish_invitation', { p_wedding_id: wa })).error, 'publish allowed only once server entitlement exists');
  const open = (await anon.rpc('public_invitation', { p_token: chung.token })).data as { open: boolean; events: { id: string }[] };
  ok(open.open === true && open.events.length === 1 && open.events[0]!.id === ev1, 'public projection shows only published link Events');
  ok(!JSON.stringify(open).includes(wa), 'projection does not expose wedding id');
  await A.from('invitations').update({ title: 'Draft only' }).eq('wedding_id', wa);
  ok(((await anon.rpc('public_invitation', { p_token: chung.token })).data as { title: string }).title === 'Lan & Minh', 'draft edits not visible publicly');
  await admin.from('wedding_entitlements').update({ expires_at: new Date(Date.now() - 500).toISOString(), paid_at: new Date(Date.now() - 1000).toISOString() }).eq('wedding_id', wa);
  ok(JSON.stringify((await anon.rpc('public_invitation', { p_token: chung.token })).data) === '{"open":false}', 'expired entitlement closes link');

  await cleanup();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); process.exit(failed ? 1 : 0);
}
main().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
