import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Armchair, ArrowRight, Copy, Loader2, LogOut, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WriteButton } from './AccessStateBanner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { markManualSignOut } from '@/lib/auth-events';
import { validateEmail } from '@/lib/phase2c';
import {
  SIDE_TEXT, authUserQuery, createInvite, createWeddingDraft, eventsQuery, friendlyError, insertEvent,
  removeManager, revokeInvite, teamQuery, toEventForm, updateEvent, updateWedding, useMyWedding, validateEventForm,
  type EventForm, type EventRow, type EventSideDb, type WeddingRow,
} from '@/lib/wedding-api';
import { EventDateImpactDialog, EventRemovalSummary } from './PlannerReal';
import { removeEvent, updateEventWithImpact } from '@/lib/planner-api';
import { addSuggestedTasks } from '@/lib/planner-api';
import { shiftDate } from '@/lib/phase2';
import { DemoDialog, FormField, Header, Note, Panel, PlannerTabs, Row, Status, fmtDate, inputCls, useDeepLink } from './PhaseOne';

const isEmptyWedding = (w: WeddingRow | null | undefined): w is null | undefined => !w;
export const coupleName = (w?: WeddingRow | null) => (w ? `${w.partner_one_name} & ${w.partner_two_name}` : '');

export function Loading({ label = 'Đang tải…' }: { label?: string }) { return <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {label}</p>; }
export function LoadError({ error, retry }: { error: unknown; retry: () => void }) {
  return <div role="alert" className="space-y-3"><Note tone="copper">{friendlyError(error)}</Note><Button variant="outline" size="lg" className="min-h-11" onClick={retry}>Thử lại</Button></div>;
}

export function useSignOut() {
  const qc = useQueryClient(); const navigate = useNavigate();
  return async () => { markManualSignOut(); await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); navigate({ to: '/login', replace: true }); };
}
export function SignOutButton({ className = '' }: { className?: string }) {
  const signOut = useSignOut(); const [busy, setBusy] = useState(false);
  return <Button variant="ghost" size="sm" className={`min-h-11 ${className}`} disabled={busy} onClick={async () => { setBusy(true); await signOut(); }}><LogOut className="size-4" /> Đăng xuất</Button>;
}

/** Wraps owner screens: loading/error/retry, and requires a real Wedding except on the onboarding screen. */
export function WeddingGate({ children, allowWithout }: { children: React.ReactNode; allowWithout: boolean }) {
  const q = useMyWedding();
  if (q.isPending) return <Loading label="Đang mở đám cưới của hai bạn…" />;
  if (q.isError) return <LoadError error={q.error} retry={() => q.refetch()} />;
  if (isEmptyWedding(q.data) && !allowWithout) return <div className="mx-auto max-w-xl"><WeddingOnboardingWizard /></div>;
  return <>{children}</>;
}

/* ---------- Onboarding wizard: 3 warm steps for a brand-new couple ---------- */
const STARTER_TASKS = [
  { id: 's1', title: 'Chốt ngày cưới với hai gia đình' },
  { id: 's3', title: 'Ước tính ngân sách chung' },
  { id: 's4', title: 'Lập danh sách khách sơ bộ' },
];
const WIZARD_STEPS = ['Tên hai bạn', 'Ngày cưới', 'Buổi lễ đầu tiên'];

export function WeddingOnboardingWizard() {
  const qc = useQueryClient(); const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ one: '', two: '', plannedDate: '', eventName: 'Lễ cưới', eventDate: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: async () => {
      const id = await createWeddingDraft({ one: f.one.trim(), two: f.two.trim(), plannedDate: f.plannedDate, eventName: f.eventName.trim() || 'Lễ cưới', eventSide: 'chung', eventDate: f.eventDate });
      const due = f.plannedDate ? shiftDate(f.plannedDate, -90) : undefined;
      await addSuggestedTasks(id, STARTER_TASKS.map(s => ({ ...s, due_date: due })));
      return id;
    },
    onSuccess: async () => { await qc.invalidateQueries(); navigate({ to: '/home', replace: true }); },
    onError: e => setErr({ form: friendlyError(e) }),
  });
  const next = () => {
    if (step === 0) {
      const n: Record<string, string> = {};
      if (!f.one.trim()) n['one'] = 'Hãy nhập tên cô dâu.';
      if (!f.two.trim()) n['two'] = 'Hãy nhập tên chú rể.';
      setErr(n); if (Object.keys(n).length) return;
    }
    setErr({}); setStep(s => Math.min(2, s + 1));
  };
  return <div>
    <div className="mb-6 text-center">
      <img src="/logo-se-duyen.webp" alt="Se Duyên" className="mx-auto size-16 rounded-2xl object-cover" />
      <p className="mt-3 text-xs font-bold uppercase tracking-widest text-primary">Chào mừng đến với Se Duyên</p>
      <h1 className="mt-1 font-display text-3xl font-bold">Cùng nhau se duyên cho ngày trọng đại</h1>
    </div>
    <ol className="mb-6 flex items-center gap-2" aria-label="Tiến trình">
      {WIZARD_STEPS.map((label, i) => <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
        <span aria-current={i === step ? 'step' : undefined} className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i <= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{i + 1}</span>
        <span className={`hidden text-xs font-semibold sm:block ${i <= step ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
        {i < 2 && <span className={`h-px flex-1 ${i < step ? 'bg-primary' : 'bg-border'}`} aria-hidden="true" />}
      </li>)}
    </ol>
    <Panel className="hero-panel">
      {step === 0 && <>
        <h2 className="font-display text-2xl font-semibold">Hai bạn là ai?</h2>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">Bắt đầu bằng tên hai bạn — mọi kế hoạch sẽ mang dấu ấn của hai người.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Tên cô dâu *" id="wz-one" error={err['one']}><input id="wz-one" autoFocus className={inputCls} maxLength={60} value={f.one} onChange={e => setF({ ...f, one: e.target.value })} /></FormField>
          <FormField label="Tên chú rể *" id="wz-two" error={err['two']}><input id="wz-two" className={inputCls} maxLength={60} value={f.two} onChange={e => setF({ ...f, two: e.target.value })} /></FormField>
        </div>
      </>}
      {step === 1 && <>
        <h2 className="font-display text-2xl font-semibold">Ngày cưới dự kiến</h2>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">Có ngày cưới, Se Duyên sẽ đếm ngược từng ngày và tự đặt hạn cho các việc cần làm. Chưa chốt cũng không sao — bổ sung sau vẫn được.</p>
        <FormField label="Ngày cưới dự kiến" id="wz-date"><input id="wz-date" autoFocus type="date" className={inputCls} value={f.plannedDate} onChange={e => setF({ ...f, plannedDate: e.target.value })} /></FormField>
      </>}
      {step === 2 && <>
        <h2 className="font-display text-2xl font-semibold">Buổi lễ đầu tiên</h2>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">Mỗi đám cưới thường có vài buổi lễ. Cứ ghi buổi đầu tiên, thêm các buổi khác sau.</p>
        <FormField label="Tên buổi lễ *" id="wz-ev"><input id="wz-ev" autoFocus className={inputCls} maxLength={80} value={f.eventName} onChange={e => setF({ ...f, eventName: e.target.value })} placeholder="Lễ cưới" /></FormField>
        <FormField label="Ngày (nếu đã biết)" id="wz-evdate"><input id="wz-evdate" type="date" className={inputCls} value={f.eventDate} onChange={e => setF({ ...f, eventDate: e.target.value })} /></FormField>
      </>}
      {err['form'] && <div role="alert" className="mt-4"><Note tone="copper">{err['form']}</Note></div>}
      <div className="mt-6 flex gap-2">
        {step > 0 && <Button variant="outline" size="lg" className="min-h-11" onClick={() => { setErr({}); setStep(s => s - 1); }}>Quay lại</Button>}
        {step < 2
          ? <Button size="lg" className="min-h-11 flex-1" onClick={next}>Tiếp tục <ArrowRight /></Button>
          : <WriteButton size="lg" className="min-h-11 flex-1" disabled={m.isPending} aria-busy={m.isPending} onClick={() => { setErr({}); m.mutate(); }}>{m.isPending ? 'Đang chuẩn bị…' : 'Bắt đầu se duyên'} <ArrowRight /></WriteButton>}
      </div>
    </Panel>
    <p className="mt-4 text-center text-xs text-muted-foreground">Se Duyên sẽ tự thêm 3 việc đầu tiên để hai bạn bắt đầu ngay.</p>
    <Button asChild variant="ghost" size="lg" className="mt-2 min-h-11 w-full text-muted-foreground"><Link to="/view">Xem kế hoạch người thân chia sẻ</Link></Button>
  </div>;
}

/* ---------- Onboarding: create (or edit) the single Wedding draft ---------- */
export function WeddingNewScreen() {
  const q = useMyWedding(); const qc = useQueryClient(); const navigate = useNavigate();
  const w = q.data;
  const [f, setF] = useState({ one: '', two: '', plannedDate: '', eventName: 'Lễ cưới', eventSide: 'chung' as EventSideDb, eventDate: '' });
  const [err, setErr] = useState<Record<string, string>>({}); const [msg, setMsg] = useState(''); const [saved, setSaved] = useState(false);
  useEffect(() => { if (w) setF(p => ({ ...p, one: w.partner_one_name, two: w.partner_two_name, plannedDate: w.planned_date ?? '' })); }, [w?.id, w?.updated_at]);
  const m = useMutation({
    mutationFn: async () => {
      if (w) { await updateWedding(w.id, f); return w.id; }
      return createWeddingDraft(f);
    },
    onSuccess: async () => { await qc.invalidateQueries(); if (w) setSaved(true); else navigate({ to: '/wedding/events' }); },
    onError: e => setMsg(friendlyError(e)),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); if (m.isPending) return; setMsg(''); setSaved(false);
    const n: Record<string, string> = {};
    if (!f.one.trim()) n['one'] = 'Hãy nhập tên cô dâu.'; if (!f.two.trim()) n['two'] = 'Hãy nhập tên chú rể.';
    if (!w && !f.eventName.trim()) n['eventName'] = 'Hãy đặt tên cho buổi lễ đầu tiên.';
    setErr(n); if (Object.keys(n).length) return; m.mutate();
  };
  if (q.isPending) return <Loading />;
  if (q.isError) return <LoadError error={q.error} retry={() => q.refetch()} />;
  return <div className="max-w-2xl"><Header name={w ? 'Thông tin đám cưới' : 'Câu chuyện của hai bạn'} subtitle={w ? 'ĐÃ LƯU VÀO TÀI KHOẢN' : 'THÔNG TIN NGÀY CƯỚI'} />
    <p className="mb-5 text-muted-foreground">{w ? 'Bản nháp đám cưới của hai bạn đã được lưu. Sửa tên hoặc ngày dự kiến bất cứ lúc nào.' : 'Bắt đầu bằng tên hai bạn và một buổi lễ. Chưa chốt ngày giờ cũng không sao.'}</p>
    <Panel><form noValidate onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Tên cô dâu *" id="w-one" error={err['one']}><input id="w-one" className={inputCls} maxLength={60} value={f.one} onChange={e => setF({ ...f, one: e.target.value })} /></FormField>
        <FormField label="Tên chú rể *" id="w-two" error={err['two']}><input id="w-two" className={inputCls} maxLength={60} value={f.two} onChange={e => setF({ ...f, two: e.target.value })} /></FormField>
      </div>
      <FormField label="Ngày cưới dự kiến" id="w-date"><input id="w-date" type="date" className={inputCls} value={f.plannedDate} onChange={e => setF({ ...f, plannedDate: e.target.value })} /></FormField>
      {!w && <fieldset className="space-y-4 rounded-lg border border-border p-4"><legend className="px-1 text-xs font-bold uppercase text-primary">Buổi lễ đầu tiên</legend>
        <FormField label="Tên buổi lễ *" id="w-ev" error={err['eventName']}><input id="w-ev" className={inputCls} maxLength={80} value={f.eventName} onChange={e => setF({ ...f, eventName: e.target.value })} /></FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Bên tổ chức" id="w-side"><select id="w-side" className={inputCls} value={f.eventSide} onChange={e => setF({ ...f, eventSide: e.target.value as EventSideDb })}>{(Object.keys(SIDE_TEXT) as EventSideDb[]).map(k => <option key={k} value={k}>{SIDE_TEXT[k]}</option>)}</select></FormField>
          <FormField label="Ngày (nếu đã biết)" id="w-evdate"><input id="w-evdate" type="date" className={inputCls} value={f.eventDate} onChange={e => setF({ ...f, eventDate: e.target.value })} /></FormField>
        </div>
        <p className="text-xs text-muted-foreground">Buổi lễ được lưu ở trạng thái “Chưa chốt”; thêm giờ, nơi và các buổi khác ở bước sau.</p>
      </fieldset>}
      {msg && <div role="alert"><Note tone="copper">{msg}</Note></div>}
      {saved && <div role="status"><Note>Đã lưu thông tin đám cưới.</Note></div>}
      <WriteButton type="submit" size="lg" className="min-h-11 w-full" disabled={m.isPending} aria-busy={m.isPending}>{m.isPending && <Loader2 className="animate-spin" />}{m.isPending ? 'Đang lưu…' : w ? 'Lưu thay đổi' : 'Lưu và tiếp tục'}</WriteButton>
    </form></Panel>
    {w && <Button asChild variant="outline" size="lg" className="mt-4 min-h-11"><Link to="/wedding/events">Các buổi lễ <ArrowRight /></Link></Button>}
  </div>;
}

/* ---------- Events: real rows ---------- */
const emptyEvent: EventForm = { name: '', side: 'chung', date: '', time: '', venue: '', address: '', confirmed: false };
export function RealEventsScreen() {
  const wq = useMyWedding(); const w = wq.data!;
  const qc = useQueryClient();
  const q = useQuery({ ...eventsQuery(w.id) });
  const [open, setOpen] = useState(false), [editing, setEditing] = useState<EventRow | null>(null), [f, setF] = useState<EventForm>(emptyEvent), [error, setError] = useState('');
  const [removing, setRemoving] = useState<EventRow | null>(null);
  const [review, setReview] = useState(false);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['events', w.id] }), qc.invalidateQueries({ queryKey: ['tasks', w.id] }), qc.invalidateQueries({ queryKey: ['budget', w.id] }), qc.invalidateQueries({ queryKey: ['event-impact'] })]);
  const save = useMutation({
    mutationFn: async (shift: string[] | undefined) => (editing ? (shift ? updateEventWithImpact(editing.id, f, shift) : updateEvent(editing.id, f)) : insertEvent(w.id, f)),
    onSuccess: async () => { await refresh(); setReview(false); setOpen(false); },
    onError: e => setError(friendlyError(e)),
  });
  const del = useMutation({ mutationFn: (id: string) => removeEvent(id), onSuccess: async () => { await refresh(); setRemoving(null); } });
  const edit = (x?: EventRow) => { setEditing(x ?? null); setError(''); setF(x ? toEventForm(x) : emptyEvent); setOpen(true); };
  const deep = useDeepLink(q.data ?? [], edit, 'buổi lễ');
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (save.isPending) return; const v = validateEventForm(f); setError(v); if (v) return; if (editing && (editing.event_date ?? '') !== f.date && editing.event_date) { setReview(true); return; } save.mutate(undefined); };
  return <div className="max-w-3xl"><Header name="Những buổi lễ của mình" subtitle={`KẾ HOẠCH · ${coupleName(w).toUpperCase()}`} /><PlannerTabs active="events" />
    {deep.missing && <div role="alert" className="mb-4"><Note tone="copper">Không tìm thấy buổi lễ này trong đám cưới của hai bạn. Có thể buổi đã bị bỏ.</Note></div>}
    <p className="mb-5 text-muted-foreground">Mỗi buổi có giờ, nơi và lời mời khác nhau. Có thể để chưa chốt. Hai bạn cùng thấy và sửa được danh sách này.</p>
    <WriteButton size="lg" className="min-h-11" onClick={() => edit()}><Plus /> Thêm buổi lễ</WriteButton>
    <div className="mt-4 space-y-3" aria-live="polite">
      {q.isPending && <Loading />}
      {q.isError && <LoadError error={q.error} retry={() => q.refetch()} />}
      {q.data?.length === 0 && <Note tone="warm">Chưa có buổi lễ nào — thêm buổi đầu tiên để bắt đầu nhé.</Note>}
      {q.data?.map(x => <Panel key={x.id} item={x.id}>
        <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="text-xl">{x.name}</h2><Status tone={x.status === 'confirmed' ? 'sage' : 'warm'}>{x.status === 'confirmed' ? 'Đã chốt' : 'Chưa chốt'}</Status></div>
        <p className="mt-2 text-xs leading-6">{SIDE_TEXT[x.side as EventSideDb]} · {x.event_date ? fmtDate(x.event_date) : 'Chưa ghi ngày'} · {x.event_time ? x.event_time.slice(0, 5) : 'Chưa chốt giờ'}<br />{x.venue || 'Chưa ghi nơi'}{x.address ? ` · ${x.address}` : ''}</p>
        <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="lg" className="min-h-11" onClick={() => edit(x)}><Pencil className="size-4" /> Sửa</Button><Button asChild variant="outline" size="lg" className="min-h-11"><Link to="/wedding/events/seating/$eventId" params={{ eventId: x.id }}><Armchair className="size-4" /> Xếp bàn</Link></Button><WriteButton variant="ghost" size="lg" className="min-h-11" onClick={() => setRemoving(x)}>Bỏ buổi</WriteButton></div>
      </Panel>)}
    </div>
    <p className="mt-4 text-xs text-muted-foreground">Buổi lễ đã lưu có thể được chọn cho việc cần làm, khoản chi, khách mời và các link thiệp.</p>
    {review && editing && <EventDateImpactDialog event={editing} form={f} busy={save.isPending} error={save.isError ? friendlyError(save.error) : ''} onCancel={() => { setReview(false); save.reset(); }} onConfirm={ids => save.mutate(ids)} />}
    <Dialog open={!!removing} onOpenChange={v => { if (!v) { setRemoving(null); del.reset(); } }}><DialogContent className="max-h-[92vh] w-[calc(100vw-24px)] max-w-lg overflow-y-auto rounded-lg bg-card p-5 text-foreground sm:p-6">
      <DialogHeader className="text-left"><DialogTitle className="font-display text-2xl">Bỏ {removing?.name}?</DialogTitle><DialogDescription>Buổi lễ sẽ bị xóa khỏi đám cưới của hai bạn cho cả hai người quản lý.</DialogDescription></DialogHeader>
      {removing && <EventRemovalSummary eventId={removing.id} />}
      {del.isError && <div role="alert"><Note tone="copper">{friendlyError(del.error)}</Note></div>}
      <DialogFooter className="flex-col-reverse gap-2 sm:flex-row"><Button variant="outline" size="lg" className="min-h-11" onClick={() => setRemoving(null)}>Giữ buổi</Button><WriteButton size="lg" className="min-h-11" disabled={del.isPending} onClick={() => removing && del.mutate(removing.id)}>{del.isPending && <Loader2 className="animate-spin" />}Xác nhận bỏ buổi</WriteButton></DialogFooter>
    </DialogContent></Dialog>
    <DemoDialog real busy={save.isPending} open={open && !review} onOpenChange={o => { if (save.isPending) return; setOpen(o); if (!o) deep.onClosed(); }} title={editing ? 'Sửa buổi lễ' : 'Thêm buổi lễ'} description="Thông tin chưa chốt vẫn có thể ghi lại." submitLabel={save.isPending ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Thêm buổi lễ'} onSubmit={submit}>
      <FormField label="Tên buổi lễ *" id="event-name" error={error}><input id="event-name" autoFocus maxLength={80} className={inputCls} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} aria-invalid={!!error} /></FormField>
      <FormField label="Bên tổ chức" id="event-side"><select id="event-side" className={inputCls} value={f.side} onChange={e => setF({ ...f, side: e.target.value as EventSideDb })}>{(Object.keys(SIDE_TEXT) as EventSideDb[]).map(k => <option key={k} value={k}>{SIDE_TEXT[k]}</option>)}</select></FormField>
      <div className="grid gap-3 sm:grid-cols-2"><FormField label="Ngày" id="event-date"><input id="event-date" type="date" className={inputCls} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></FormField><FormField label="Giờ" id="event-time"><input id="event-time" type="time" className={inputCls} value={f.time} onChange={e => setF({ ...f, time: e.target.value })} /></FormField></div>
      <FormField label="Địa điểm" id="event-venue"><input id="event-venue" maxLength={120} className={inputCls} value={f.venue} onChange={e => setF({ ...f, venue: e.target.value })} /></FormField>
      <FormField label="Địa chỉ" id="event-address"><input id="event-address" maxLength={240} className={inputCls} value={f.address} onChange={e => setF({ ...f, address: e.target.value })} /></FormField>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={f.confirmed} onChange={e => setF({ ...f, confirmed: e.target.checked })} /> Đã chốt đầy đủ thông tin</label>
    </DemoDialog>
  </div>;
}

/* ---------- Couple team: real memberships and invites ---------- */
export function TeamPanel() {
  const w = useMyWedding().data!; const qc = useQueryClient(); const navigate = useNavigate();
  const me = useQuery(authUserQuery).data;
  const q = useQuery(teamQuery(w.id));
  const [inviteOpen, setInviteOpen] = useState(false), [email, setEmail] = useState(''), [err, setErr] = useState('');
  const [created, setCreated] = useState<{ url: string; email: string; expires_at: string } | null>(null), [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: 'member'; id: string; self: boolean; label: string } | { kind: 'invite'; id: string; label: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['team', w.id] });
  const inv = useMutation({ mutationFn: () => createInvite(w.id, email.trim()), onSuccess: async r => { setCreated({ url: r.url, email: email.trim().toLowerCase(), expires_at: r.expires_at }); setInviteOpen(false); setEmail(''); await refresh(); }, onError: e => setErr(friendlyError(e)) });
  const act = useMutation({
    mutationFn: async () => { if (!confirm) return; if (confirm.kind === 'invite') await revokeInvite(confirm.id); else await removeManager(confirm.id); },
    onSuccess: async () => { const self = confirm?.kind === 'member' && confirm.self; setConfirm(null); if (self) { await qc.invalidateQueries(); navigate({ to: '/wedding/new' }); } else { setCreated(null); await refresh(); } },
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <LoadError error={q.error} retry={() => q.refetch()} />;
  const { members, invites } = q.data;
  const now = Date.now();
  const pending = invites.filter(i => i.status === 'pending' && new Date(i.expires_at).getTime() > now);
  const expired = invites.filter(i => i.status === 'pending' && new Date(i.expires_at).getTime() <= now);
  const slotFree = members.length + pending.length < 2;
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (inv.isPending) return; const n = validateEmail(email); setErr(n['email'] ?? ''); if (!n['email']) inv.mutate(); };
  return <>
    <Panel>
      {members.map(m => { const self = m.user_id === me?.id; const name = m.profile?.display_name || m.profile?.email || 'Người quản lý'; return <div key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-4 last:border-0">
        <div className="min-w-0"><div className="font-display text-[17px] font-semibold leading-tight break-words">{name}{self ? ' (bạn)' : ''}</div><p className="mt-1 text-xs text-muted-foreground break-words">{m.profile?.email}{m.user_id === w.created_by ? ' · người tạo (chỉ là thông tin, không có quyền cao hơn)' : ''}</p></div>
        <div className="flex flex-col items-end gap-1"><Status>Người quản lý</Status>{members.length > 1 && <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setConfirm({ kind: 'member', id: m.id, self, label: name })}>{self ? 'Rời đám cưới' : 'Rút quyền'}</Button>}</div>
      </div>; })}
      {pending.map(i => <div key={i.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-4 last:border-0">
        <div className="min-w-0"><div className="font-display text-[17px] font-semibold break-words">{i.email}</div><p className="mt-1 text-xs text-muted-foreground">Lời mời chờ chấp nhận · hết hạn {new Date(i.expires_at).toLocaleDateString('vi-VN')}. Chưa có quyền xem dữ liệu.</p></div>
        <div className="flex flex-col items-end gap-1"><Status tone="warm">Chờ chấp nhận</Status><Button variant="ghost" size="sm" className="min-h-11" onClick={() => setConfirm({ kind: 'invite', id: i.id, label: i.email })}>Hủy lời mời</Button></div>
      </div>)}
      {slotFree && <p className="pt-4 text-xs text-muted-foreground">Còn một chỗ cho người còn lại trong cặp đôi.</p>}
      {expired.length > 0 && <p className="pt-2 text-xs text-muted-foreground">{expired.length} lời mời đã hết hạn và không còn dùng được.</p>}
    </Panel>
    {created && <div className="mt-4"><Panel className="border-l-[3px] border-l-primary">
      <strong className="text-sm">Lời mời cho {created.email} đã được tạo — email CHƯA được gửi.</strong>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Hệ thống chưa kết nối gửi email. Hãy tự gửi đường dẫn này cho người còn lại (Zalo, Messenger…). Người đó cần đăng nhập bằng đúng email trên để chấp nhận. Đường dẫn chỉ hiện một lần và hết hạn ngày {new Date(created.expires_at).toLocaleDateString('vi-VN')}.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input readOnly aria-label="Đường dẫn chấp nhận lời mời" className={`${inputCls} mt-0`} value={created.url} onFocus={e => e.currentTarget.select()} /><Button size="lg" className="min-h-11" onClick={async () => { try { await navigator.clipboard.writeText(created.url); setCopied(true); } catch { setCopied(false); } }}><Copy className="size-4" />{copied ? 'Đã sao chép' : 'Sao chép'}</Button></div>
    </Panel></div>}
    <div className="mt-4 flex flex-wrap gap-2">{slotFree ? <WriteButton size="lg" className="min-h-11" onClick={() => { setEmail(''); setErr(''); setInviteOpen(true); }}><Plus className="size-4" /> Mời người còn lại</WriteButton> : <p className="text-xs text-muted-foreground">Đã đủ hai người (gồm lời mời đang chờ). Hủy lời mời hoặc rút quyền để mời người khác.</p>}</div>
    <DemoDialog open={inviteOpen} onOpenChange={setInviteOpen} title="Mời người còn lại" description="Sau khi chấp nhận, người này có quyền như bạn ở mọi việc. Khi lời mời còn chờ, họ chưa xem được dữ liệu nào." submitLabel={inv.isPending ? 'Đang tạo…' : 'Tạo lời mời'} onSubmit={submit}>
      <FormField id="partner-email" label="Email người còn lại *" error={err}><input id="partner-email" autoFocus type="email" autoComplete="email" maxLength={255} className={inputCls} value={email} aria-invalid={!!err} onChange={e => { setEmail(e.target.value); setErr(''); }} /></FormField>
      <p className="text-xs text-muted-foreground">Chưa có gửi email tự động: sau khi tạo, bạn sẽ nhận một đường dẫn để tự gửi.</p>
    </DemoDialog>
    <Dialog open={!!confirm} onOpenChange={v => { if (!v) { setConfirm(null); act.reset(); } }}><DialogContent className="max-h-[92vh] w-[calc(100vw-24px)] max-w-lg overflow-y-auto rounded-lg bg-card p-5 sm:p-6">
      <DialogHeader className="text-left"><DialogTitle className="font-display text-2xl">{confirm?.kind === 'invite' ? 'Hủy lời mời?' : confirm?.self ? 'Rời đám cưới?' : 'Rút quyền?'}</DialogTitle>
        <DialogDescription>{confirm?.kind === 'invite' ? `Đường dẫn đã gửi cho ${confirm.label} sẽ không dùng được nữa.` : confirm?.self ? 'Bạn sẽ mất quyền xem và sửa đám cưới này. Người còn lại vẫn giữ toàn bộ dữ liệu.' : `${confirm?.label} sẽ mất quyền xem và sửa đám cưới này. Dữ liệu được giữ nguyên.`} Thay đổi được ghi vào nhật ký.</DialogDescription></DialogHeader>
      {act.isError && <div role="alert"><Note tone="copper">{friendlyError(act.error)}</Note></div>}
      <DialogFooter className="flex-col-reverse gap-2 sm:flex-row"><Button variant="outline" size="lg" className="min-h-11" onClick={() => setConfirm(null)}>Giữ nguyên</Button><Button size="lg" className="min-h-11" disabled={act.isPending} onClick={() => act.mutate()}>{act.isPending && <Loader2 className="animate-spin" />}Xác nhận</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}

export function AccountScreen() {
  const me = useQuery(authUserQuery); const w = useMyWedding().data;
  const signOut = useSignOut();
  return <div className="mx-auto max-w-xl"><Header name="Tài khoản của bạn" subtitle="TÀI KHOẢN" />
    <Panel>{me.isPending ? <Loading /> : <Row title="Đăng nhập bằng" detail={me.data?.email ?? '—'} />}
      <Row title="Đám cưới" detail={w ? `${coupleName(w)} · bản nháp đã lưu` : 'Chưa có đám cưới'} to="/wedding/new" />
      <Row title="Người cùng quản lý" detail="Tối đa hai người, quyền như nhau" to="/settings/data" />
    </Panel>
    <div className="mt-5 flex flex-wrap gap-2"><Button asChild variant="outline" size="lg" className="min-h-11"><Link to="/forgot-password">Đổi mật khẩu qua email</Link></Button><Button variant="ghost" size="lg" className="min-h-11" onClick={() => signOut()}><LogOut className="size-4" /> Đăng xuất</Button></div>
  </div>;
}
