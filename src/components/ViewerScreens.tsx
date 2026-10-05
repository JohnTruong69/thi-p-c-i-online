import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Eye, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WriteButton } from './AccessStateBanner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { markManualSignOut } from '@/lib/auth-events';
import { validateEmail } from '@/lib/phase2c';
import { useMyWedding } from '@/lib/wedding-api';
import {
  MAX_VIEWERS, MODULE_TEXT, SIDE_LABEL, VIEWER_MODULES, VIEWER_SIDES, grantSummary, toggle, validateGrants, viewerSlotsUsed,
  type ViewerModule, type ViewerSide,
} from '@/lib/viewers';
import {
  acceptViewerInvite, createViewerInvite, inspectViewerInvite, myViewerWeddingsQuery, revokeViewer, revokeViewerInvite,
  updateViewerGrants, viewerError, viewerProjectionQuery, viewersTeamQuery, type ViewerProjection,
} from '@/lib/viewers-api';
import { DemoDialog, FormField, Header, Note, Panel, Status, fmtDate, inputCls } from './PhaseOne';
import { LoadError, Loading, SignOutButton } from './PhaseThree';
import { PublicShell } from './AuthScreens';

function GrantPicker({ modules, sides, onChange }: { modules: ViewerModule[]; sides: ViewerSide[]; onChange: (m: ViewerModule[], s: ViewerSide[]) => void }) {
  return <>
    <fieldset><legend className="text-xs font-semibold">Được xem phần nào *</legend>
      <div className="mt-2 grid gap-1">{VIEWER_MODULES.map(m => <label key={m} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={modules.includes(m)} onChange={() => onChange(toggle(modules, m), sides)} /> {MODULE_TEXT[m]}</label>)}</div>
    </fieldset>
    <fieldset><legend className="text-xs font-semibold">Của bên nào *</legend>
      <div className="mt-2 flex flex-wrap gap-x-4">{VIEWER_SIDES.map(s => <label key={s} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={sides.includes(s)} onChange={() => onChange(modules, toggle(sides, s))} /> {SIDE_LABEL[s]}</label>)}</div>
    </fieldset>
    <p className="text-xs leading-5 text-muted-foreground">Người thân chỉ xem, không sửa được gì. Họ không bao giờ thấy số điện thoại, ghi chú, tệp CSV, ảnh riêng, thiệp nháp, thanh toán hay các bên không được chọn.</p>
  </>;
}

/* ---------- Manager side: /settings/team ---------- */
export function ViewerTeamPanel() {
  const w = useMyWedding().data!; const qc = useQueryClient();
  const q = useQuery(viewersTeamQuery(w.id));
  const [open, setOpen] = useState(false), [email, setEmail] = useState(''), [err, setErr] = useState('');
  const [mods, setMods] = useState<ViewerModule[]>(['events']), [sides, setSides] = useState<ViewerSide[]>(['chung']);
  const [created, setCreated] = useState<{ url: string; email: string; expires_at: string } | null>(null), [copied, setCopied] = useState(false);
  const [edit, setEdit] = useState<{ id: string; label: string; modules: ViewerModule[]; sides: ViewerSide[] } | null>(null), [editErr, setEditErr] = useState('');
  const [confirm, setConfirm] = useState<{ kind: 'viewer' | 'invite'; id: string; label: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['viewers', w.id] });
  const inv = useMutation({
    mutationFn: () => createViewerInvite(w.id, email.trim(), mods, sides),
    onSuccess: async r => { setCreated({ url: r.url, email: email.trim().toLowerCase(), expires_at: r.expires_at }); setCopied(false); setOpen(false); await refresh(); },
    onError: e => setErr(viewerError(e)),
  });
  const save = useMutation({ mutationFn: () => updateViewerGrants(edit!.id, edit!.modules, edit!.sides), onSuccess: async () => { setEdit(null); await refresh(); }, onError: e => setEditErr(viewerError(e)) });
  const act = useMutation({
    mutationFn: async () => { if (!confirm) return; if (confirm.kind === 'invite') await revokeViewerInvite(confirm.id); else await revokeViewer(confirm.id); },
    onSuccess: async () => { setConfirm(null); setCreated(null); await refresh(); },
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <LoadError error={q.error} retry={() => q.refetch()} />;
  const { viewers, invites } = q.data; const now = Date.now();
  const pending = invites.filter(i => i.status === 'pending' && new Date(i.expires_at).getTime() > now);
  const used = viewerSlotsUsed(viewers, invites, now);
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); if (inv.isPending) return;
    const n = validateEmail(email)['email'] ?? ''; const g = validateGrants({ modules: mods, sides });
    setErr(n || g); if (!n && !g) inv.mutate();
  };
  return <>
    <Panel>
      {viewers.length === 0 && pending.length === 0 && <p className="text-sm text-muted-foreground">Chưa mời người thân nào. Người thân (ví dụ bố mẹ) chỉ xem được những phần hai bạn chọn.</p>}
      {viewers.map(v => <div key={v.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-4 last:border-0">
        <div className="min-w-0"><div className="font-display text-[17px] font-semibold break-words">{v.email}</div><p className="mt-1 text-xs text-muted-foreground break-words">Chỉ xem: {grantSummary(v)}</p></div>
        <div className="flex flex-col items-end gap-1"><Status>Người thân xem</Status>
          <WriteButton variant="ghost" size="sm" className="min-h-11" onClick={() => { setEditErr(''); setEdit({ id: v.id, label: v.email, modules: v.modules as ViewerModule[], sides: v.sides as ViewerSide[] }); }}>Sửa quyền</WriteButton>
          <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setConfirm({ kind: 'viewer', id: v.id, label: v.email })}>Rút quyền</Button></div>
      </div>)}
      {pending.map(i => <div key={i.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-4 last:border-0">
        <div className="min-w-0"><div className="font-display text-[17px] font-semibold break-words">{i.email}</div><p className="mt-1 text-xs text-muted-foreground break-words">Chờ chấp nhận · hết hạn {new Date(i.expires_at).toLocaleDateString('vi-VN')} · {grantSummary(i)}. Chưa xem được gì.</p></div>
        <div className="flex flex-col items-end gap-1"><Status tone="warm">Chờ chấp nhận</Status><Button variant="ghost" size="sm" className="min-h-11" onClick={() => setConfirm({ kind: 'invite', id: i.id, label: i.email })}>Hủy lời mời</Button></div>
      </div>)}
      <p className="pt-4 text-xs text-muted-foreground">Đã dùng {used}/{MAX_VIEWERS} chỗ cho người thân (gồm lời mời đang chờ).</p>
    </Panel>
    {created && <div className="mt-4"><Panel className="border-l-[3px] border-l-primary">
      <strong className="text-sm">Lời mời xem cho {created.email} đã được tạo — email CHƯA được gửi.</strong>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Hệ thống không gửi email. Hãy tự gửi đường dẫn này (Zalo, Messenger…). Người thân cần đăng nhập bằng đúng email trên, đã xác nhận, để chấp nhận. Đường dẫn chỉ hiện một lần và hết hạn ngày {new Date(created.expires_at).toLocaleDateString('vi-VN')}.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input readOnly aria-label="Đường dẫn lời mời xem" className={`${inputCls} mt-0`} value={created.url} onFocus={e => e.currentTarget.select()} /><Button size="lg" className="min-h-11" onClick={async () => { try { await navigator.clipboard.writeText(created.url); setCopied(true); } catch { setCopied(false); } }}><Copy className="size-4" />{copied ? 'Đã sao chép' : 'Sao chép'}</Button></div>
    </Panel></div>}
    <div className="mt-4">{used < MAX_VIEWERS
      ? <WriteButton size="lg" variant="outline" className="min-h-11" onClick={() => { setEmail(''); setErr(''); setMods(['events']); setSides(['chung']); setOpen(true); }}><Plus className="size-4" /> Mời người thân xem</WriteButton>
      : <p className="text-xs text-muted-foreground">Đã đủ hai người thân. Hủy lời mời hoặc rút quyền để mời người khác.</p>}</div>
    <DemoDialog real open={open} onOpenChange={setOpen} title="Mời người thân xem" description="Người thân chỉ xem được phần và bên hai bạn chọn; không sửa được gì." submitLabel={inv.isPending ? 'Đang tạo…' : 'Tạo lời mời'} busy={inv.isPending} onSubmit={submit}>
      <FormField id="viewer-email" label="Email người thân *" error={err}><input id="viewer-email" autoFocus type="email" autoComplete="email" maxLength={255} className={inputCls} value={email} aria-invalid={!!err} onChange={e => { setEmail(e.target.value); setErr(''); }} /></FormField>
      <GrantPicker modules={mods} sides={sides} onChange={(m, s) => { setMods(m); setSides(s); setErr(''); }} />
      <p className="text-xs text-muted-foreground">Không có email tự động: sau khi tạo, hai bạn nhận đường dẫn để tự gửi.</p>
    </DemoDialog>
    <DemoDialog real open={!!edit} onOpenChange={v => { if (!v) setEdit(null); }} title="Sửa quyền xem" description={edit ? `Áp dụng ngay cho ${edit.label}.` : ''} submitLabel={save.isPending ? 'Đang lưu…' : 'Lưu quyền'} busy={save.isPending}
      onSubmit={e => { e.preventDefault(); if (!edit || save.isPending) return; const g = validateGrants(edit); setEditErr(g); if (!g) save.mutate(); }}>
      {edit && <GrantPicker modules={edit.modules} sides={edit.sides} onChange={(m, s) => { setEdit({ ...edit, modules: m, sides: s }); setEditErr(''); }} />}
      {editErr && <p role="alert" className="text-sm font-semibold text-primary">{editErr}</p>}
    </DemoDialog>
    <Dialog open={!!confirm} onOpenChange={v => { if (!v) { setConfirm(null); act.reset(); } }}><DialogContent>
      <DialogHeader><DialogTitle>{confirm?.kind === 'invite' ? 'Hủy lời mời xem?' : 'Rút quyền xem?'}</DialogTitle>
        <DialogDescription>{confirm?.kind === 'invite' ? `Đường dẫn gửi cho ${confirm?.label} sẽ không dùng được nữa.` : `${confirm?.label} sẽ không xem được gì nữa, ngay lập tức.`}</DialogDescription></DialogHeader>
      {act.isError && <p role="alert" className="text-sm font-semibold text-primary">{viewerError(act.error)}</p>}
      <DialogFooter><Button variant="outline" className="min-h-11" onClick={() => setConfirm(null)}>Giữ nguyên</Button><Button className="min-h-11" disabled={act.isPending} onClick={() => act.mutate()}>{act.isPending && <Loader2 className="animate-spin" />}Xác nhận</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}

/* ---------- Viewer invite acceptance (public route, needs matching confirmed email) ---------- */
export function ViewerInviteAcceptPage({ token }: { token: string }) {
  const navigate = useNavigate(); const qc = useQueryClient();
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'signedOut' } | { kind: 'error'; text: string } | { kind: 'info'; status: string; matches: boolean; email: string }>({ kind: 'loading' });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const load = async () => {
    setState({ kind: 'loading' });
    const { data } = await supabase.auth.getUser();
    if (!data.user) { setState({ kind: 'signedOut' }); return; }
    try { const r = await inspectViewerInvite(token); setState({ kind: 'info', status: r.status, matches: r.email_matches, email: data.user.email ?? '' }); }
    catch (e) { setState({ kind: 'error', text: viewerError(e) }); }
  };
  useEffect(() => { void load(); }, [token]);
  const accept = async () => {
    setBusy(true); setMsg('');
    try { const w = await acceptViewerInvite(token); if (!w) { setMsg('Lời mời đã hết hạn. Hãy nhờ người mời tạo lời mời mới.'); await load(); return; } await qc.invalidateQueries(); navigate({ to: '/view/$weddingId', params: { weddingId: w }, replace: true }); }
    catch (e) { setMsg(viewerError(e)); } finally { setBusy(false); }
  };
  const signOut = async () => { markManualSignOut(); qc.clear(); await supabase.auth.signOut(); await load(); };
  const here = `/viewer-invite/${token}`;
  return <PublicShell><Header name="Lời mời xem kế hoạch cưới" subtitle="NGƯỜI THÂN XEM" /><Panel>
    {state.kind === 'loading' && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Đang kiểm tra lời mời…</p>}
    {state.kind === 'error' && <><p role="alert" className="text-sm font-semibold text-primary">{state.text}</p><Button size="lg" variant="outline" className="mt-3 min-h-11 w-full" onClick={load}>Thử lại</Button></>}
    {state.kind === 'signedOut' && <><p className="text-sm leading-6">Bạn được mời xem một phần kế hoạch cưới. Hãy đăng nhập hoặc tạo tài khoản bằng <strong>đúng email nhận lời mời</strong>. Trước khi chấp nhận, bạn chưa xem được gì.</p>
      <div className="mt-4 grid gap-2"><Button asChild size="lg" className="min-h-11"><Link to="/login" search={{ redirect: here }}>Đăng nhập để chấp nhận</Link></Button><Button asChild size="lg" variant="outline" className="min-h-11"><Link to="/register" search={{ redirect: here }}>Tạo tài khoản</Link></Button></div></>}
    {state.kind === 'info' && (state.status === 'pending' ? (state.matches
      ? <><p className="text-sm leading-6">Sau khi chấp nhận, bạn chỉ <strong>xem</strong> được những phần hai bạn đã chọn; không sửa được gì.</p>{msg && <p role="alert" className="mt-3 text-sm font-semibold text-primary">{msg}</p>}<Button size="lg" className="mt-4 min-h-11 w-full" disabled={busy} onClick={accept}>{busy && <Loader2 className="animate-spin" />}Chấp nhận lời mời</Button></>
      : <><Note tone="warm">Bạn đang đăng nhập bằng <strong>{state.email}</strong>, nhưng lời mời này dành cho email khác. Hãy đăng xuất rồi đăng nhập bằng email được mời.</Note><Button size="lg" variant="outline" className="mt-4 min-h-11 w-full" onClick={signOut}>Đăng xuất</Button></>)
      : <><Note tone="warm">{state.status === 'expired' ? 'Lời mời đã hết hạn. Hãy nhờ người mời tạo lời mời mới.' : state.status === 'revoked' ? 'Lời mời đã bị hủy.' : state.status === 'accepted' ? 'Lời mời đã được dùng.' : 'Không tìm thấy lời mời này. Hãy kiểm tra lại đường dẫn.'}</Note>{state.status === 'accepted' && <Button asChild size="lg" className="mt-4 min-h-11 w-full"><Link to="/view">Mở trang xem</Link></Button>}</>)}
  </Panel></PublicShell>;
}

/* ---------- Read-only viewer shell (no owner navigation, no edit controls) ---------- */
function ViewerShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background"><div className="sticky top-0 z-10 flex h-[62px] items-center justify-between border-b border-border bg-card px-5">
    <Link to="/view" className="flex items-center gap-2"><img src="/logo-se-duyen.webp" alt="Se Duyên" className="size-9 rounded-lg object-cover" /><span className="text-[13px] font-extrabold">Se Duyên</span></Link>
    <div className="flex items-center gap-2"><Status><Eye className="mr-1 size-3" />Chỉ xem</Status><SignOutButton /></div>
  </div><main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-7">{children}</main></div>;
}

export function ViewerHomeScreen() {
  const q = useQuery(myViewerWeddingsQuery);
  return <ViewerShell><Header name="Kế hoạch được chia sẻ" subtitle="NGƯỜI THÂN XEM" />
    {q.isPending ? <Loading /> : q.isError ? <LoadError error={q.error} retry={() => q.refetch()} />
      : q.data.length === 0 ? <Note>Tài khoản này chưa được mời xem đám cưới nào, hoặc quyền xem đã bị rút. <Link to="/home" className="font-semibold underline">Về trang của bạn</Link></Note>
      : <div className="grid gap-3">{q.data.map(w => <Link key={w.wedding_id} to="/view/$weddingId" params={{ weddingId: w.wedding_id }} className="block"><Panel className="hover:border-primary">
          <div className="font-display text-xl">{w.partner_one_name} & {w.partner_two_name}</div>
          <p className="mt-1 text-xs text-muted-foreground">Chỉ xem: {grantSummary(w)}</p></Panel></Link>)}</div>}
  </ViewerShell>;
}

const TASK_STATUS: Record<string, string> = { todo: 'Chưa làm', doing: 'Đang làm', waiting: 'Chờ chốt', done: 'Đã xong' };
const RSVP_TEXT: Record<string, string> = { pending: 'Chưa trả lời', attending: 'Sẽ đến', declined: 'Không đến' };
const vnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`;
const sideText = (s: string) => SIDE_LABEL[s as ViewerSide] ?? s;

export function ViewerWeddingScreen({ weddingId }: { weddingId: string }) {
  const q = useQuery(viewerProjectionQuery(weddingId));
  const [tab, setTab] = useState<string | null>(null);
  if (q.isPending) return <ViewerShell><Loading /></ViewerShell>;
  if (q.isError) return <ViewerShell><Header name="Không mở được" subtitle="NGƯỜI THÂN XEM" /><div role="alert"><Note tone="copper">{viewerError(q.error)}</Note></div><Button variant="outline" size="lg" className="mt-3 min-h-11" onClick={() => q.refetch()}>Thử lại</Button><p className="mt-4 text-sm"><Link to="/view" className="underline">Về danh sách</Link></p></ViewerShell>;
  const p: ViewerProjection = q.data; const active = tab && p.modules.includes(tab) ? tab : p.modules[0]!;
  return <ViewerShell>
    <Header name={`${p.wedding.partner_one_name} & ${p.wedding.partner_two_name}`} subtitle="NGƯỜI THÂN XEM" />
    <p className="-mt-3 mb-4 text-sm text-muted-foreground">Bạn chỉ xem, không sửa được. Bên được xem: {p.sides.map(sideText).join(', ')}.</p>
    <div role="tablist" className="mb-5 flex gap-2 overflow-x-auto pb-1">{p.modules.map(m => <button key={m} role="tab" aria-selected={m === active} onClick={() => setTab(m)}
      className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${m === active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>{(MODULE_TEXT[m as ViewerModule] ?? m).replace(/ \(.*\)/, '')}</button>)}</div>
    {active === 'events' && <List empty="Chưa có buổi lễ nào." items={p.events ?? []} render={e => <><div className="font-semibold">{e.name} <span className="text-xs font-normal text-muted-foreground">· {sideText(e.side)}</span></div><p className="text-xs text-muted-foreground">{e.date ? fmtDate(e.date) : 'Chưa có ngày'}{e.time ? ` · ${e.time}` : ''}{e.venue ? ` · ${e.venue}` : ''}{e.address ? ` — ${e.address}` : ''}</p></>} />}
    {active === 'tasks' && <List empty="Chưa có việc nào." items={p.tasks ?? []} render={t => <><div className="flex items-start justify-between gap-2"><span className="font-semibold">{t.title}</span><Status tone={t.status === 'done' ? 'sage' : 'warm'}>{TASK_STATUS[t.status] ?? t.status}</Status></div><p className="text-xs text-muted-foreground">{t.due_date ? `Hạn ${fmtDate(t.due_date)}` : 'Chưa đặt hạn'}{t.event_name ? ` · ${t.event_name}` : ''}{t.kind === 'table-count' && t.planned_tables != null ? ` · ${t.planned_tables} bàn + ${t.reserve_tables ?? 0} dự phòng` : ''}</p></>} />}
    {active === 'budget' && <>{p.budget && p.budget.length > 0 && <Panel className="mb-3"><p className="text-sm">Tổng dự tính <strong>{vnd(p.budget.reduce((s, b) => s + b.planned_vnd, 0))}</strong> · đã trả <strong>{vnd(p.budget.reduce((s, b) => s + b.paid_vnd, 0))}</strong></p></Panel>}
      <List empty="Chưa có khoản chi nào." items={p.budget ?? []} render={b => <><div className="font-semibold">{b.label}</div><p className="text-xs text-muted-foreground">Dự tính {vnd(b.planned_vnd)} · đã trả {vnd(b.paid_vnd)}{b.event_name ? ` · ${b.event_name}` : ''}</p></>} /></>}
    {active === 'guests' && <><p className="mb-3 text-xs text-muted-foreground">{(p.guests ?? []).length} khách (bản ghi) · {(p.guests ?? []).reduce((s, g) => s + g.party_size, 0)} người dự tính. Không hiển thị số điện thoại và ghi chú.</p>
      <List empty="Chưa có khách nào ở bên được xem." items={p.guests ?? []} render={g => <><div className="font-semibold">{g.name} <span className="text-xs font-normal text-muted-foreground">· {sideText(g.side)} · {g.party_size} người</span></div>{g.events.length > 0 && <p className="text-xs text-muted-foreground">{g.events.map(e => `${e.event_name}: ${RSVP_TEXT[e.rsvp_status] ?? e.rsvp_status}${e.attending_count ? ` (${e.attending_count})` : ''}`).join(' · ')}</p>}</>} /></>}
    {active === 'rsvp' && <List empty="Chưa có buổi lễ nào ở bên được xem." items={(p.rsvp ?? []).map((r, i) => ({ ...r, id: String(i) }))} render={r => <><div className="font-semibold">{r.event_name}</div><p className="text-xs text-muted-foreground">{r.yes} phản hồi sẽ đến ({r.people} người) · {r.no} không đến</p></>} />}
  </ViewerShell>;
}
function List<T extends { id: string }>({ items, render, empty }: { items: T[]; render: (x: T) => React.ReactNode; empty: string }) {
  if (!items.length) return <Note>{empty}</Note>;
  return <Panel className="p-0">{items.map(x => <div key={x.id} className="border-b border-border px-5 py-3 last:border-0">{render(x)}</div>)}</Panel>;
}
