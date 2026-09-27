/** Phase 3 slice 2a: persisted Planner screens (tasks + budget) and the Event impact review. */
import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Loader2, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WriteButton } from './AccessStateBanner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { eventsQuery, friendlyError, useMyWedding, type EventForm, type EventRow, type WeddingRow } from '@/lib/wedding-api';
import { addSuggestedTasks, budgetQuery, deleteBudgetItem, eventImpactData, saveBudgetItem, setBudgetCap, tasksQuery, insertTask, updateTask, type BudgetItemWithSchedule, type TaskRow } from '@/lib/planner-api';
import { CATEGORIES, INSTALLMENT_LABELS, PAYERS, STATUS_FROM_UI, agreedCost, budgetTotals, dueWindow, fmtVnd, missingTemplates, payerLabel, plannedCost, toStatusUi, unpaidCost, validateCap, validateCost, type CostDraft, type CostMoney } from '@/lib/planner';
import { inTaskFilter, taskDue, validateTableCount, vietnamToday, type DemoTask } from '@/lib/task-demo';
import { SUGGESTED_TASKS, dayDiff, shiftDate } from '@/lib/phase2';
import { DemoDialog, FormField, Header, Note, Panel, PlannerTabs, SmallLabel, Status, fmtDate, inputCls, useFocusId } from './PhaseOne';
import { guestsQuery } from '@/lib/guests-api';
import { eventTotals, followupCount, guestTotals, needsFollowup } from '@/lib/guests';
import { LoadError, Loading, coupleName } from './PhaseThree';

const fullDate = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : 'Chưa ghi ngày');

/** Opens the record named in the URL once real data has loaded; reports a humane message if it is not in this Wedding. */
function useRealDeepLink<T extends { id: string }>(items: T[] | undefined, open: (x: T) => void, label: string) {
  const id = useFocusId(); const done = useRef(false); const [missing, setMissing] = useState('');
  const openRef = useRef(open); openRef.current = open;
  useEffect(() => {
    if (!id || done.current || !items || id === 'suggestions') return;
    done.current = true; const x = items.find(i => i.id === id);
    if (x) openRef.current(x); else setMissing(`Không tìm thấy ${label} này trong đám cưới của hai bạn. Có thể mục đã bị xóa.`);
  }, [id, items, label]);
  return missing;
}

/* ================= Tasks ================= */
type TaskDraft = { title: string; eventId: string; due: string; assignee: 'both' | 'one' | 'two'; status: DemoTask['status']; kind: 'standard' | 'table-count'; planned: string; reserve: string; outcome: string; note: string };
const emptyTask: TaskDraft = { title: '', eventId: '', due: '', assignee: 'both', status: 'Cần làm', kind: 'standard', planned: '', reserve: '', outcome: '', note: '' };
const assigneeLabel = (a: string, w: WeddingRow) => (a === 'one' ? w.partner_one_name : a === 'two' ? w.partner_two_name : 'Cả hai');
const asDemo = (t: TaskRow): DemoTask => ({ id: t.id, title: t.title, event: t.event_id ?? '', due: t.due_date ?? '', owner: '', status: toStatusUi(t.status) });

export function RealTasksScreen() {
  const w = useMyWedding().data!; const qc = useQueryClient();
  const tq = useQuery(tasksQuery(w.id)); const eq = useQuery(eventsQuery(w.id));
  const [today, setToday] = useState(''); useEffect(() => setToday(vietnamToday()), []);
  const [filter, setFilter] = useState('Tất cả');
  const [open, setOpen] = useState(false), [editing, setEditing] = useState<TaskRow | null>(null), [f, setF] = useState<TaskDraft>(emptyTask);
  const [err, setErr] = useState(''), [countErr, setCountErr] = useState(''), [saveErr, setSaveErr] = useState(''), [done, setDone] = useState('');
  const events = eq.data ?? [];
  const evName = (id: string | null) => (id ? events.find(e => e.id === id)?.name ?? 'Buổi đã bỏ' : 'Mọi buổi');
  const refresh = () => qc.invalidateQueries({ queryKey: ['tasks', w.id] });
  const edit = (t?: TaskRow) => {
    setEditing(t ?? null); setErr(''); setCountErr(''); setSaveErr('');
    setF(t ? { title: t.title, eventId: t.event_id ?? '', due: t.due_date ?? '', assignee: t.assignee as TaskDraft['assignee'], status: toStatusUi(t.status), kind: t.kind as TaskDraft['kind'], planned: t.planned_tables === null ? '' : String(t.planned_tables), reserve: t.reserve_tables === null ? '' : String(t.reserve_tables), outcome: t.outcome ?? '', note: t.note ?? '' } : emptyTask);
    setOpen(true);
  };
  const missing = useRealDeepLink(tq.data, edit, 'việc');
  const save = useMutation({
    mutationFn: async () => {
      const table = f.kind === 'table-count';
      const input = { title: f.title.trim(), event_id: f.eventId || null, due_date: f.due || null, assignee: f.assignee, status: STATUS_FROM_UI[f.status], kind: f.kind,
        // switching to a standard task drops stale table counts on save
        planned_tables: table && f.planned !== '' ? Number(f.planned) : null, reserve_tables: table && f.reserve !== '' ? Number(f.reserve) : null,
        outcome: f.outcome.trim() || null, note: f.note.trim() || null };
      if (editing) await updateTask(editing.id, input); else await insertTask(w.id, input);
      return input.title;
    },
    onSuccess: async title => { await refresh(); setDone(editing ? `Đã lưu “${title}”.` : `Đã thêm “${title}”.`); if (!editing) setFilter('Tất cả'); setOpen(false); },
    onError: e => setSaveErr(friendlyError(e)),
  });
  const quickDone = useMutation({
    mutationFn: (t: TaskRow) => updateTask(t.id, { status: 'done' }),
    onSuccess: async () => { await refresh(); setDone('Đã đánh dấu xong.'); }, onError: e => setDone(friendlyError(e)),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); if (save.isPending) return; setSaveErr('');
    const title = f.title.trim(); const ce = validateTableCount(f.kind, f.planned, f.reserve, f.status);
    setErr(title ? '' : 'Hãy nhập tên việc.'); setCountErr(ce); if (!title || ce) return; save.mutate();
  };
  if (tq.isPending || eq.isPending) return <Loading label="Đang tải việc cần làm…" />;
  if (tq.isError) return <LoadError error={tq.error} retry={() => tq.refetch()} />;
  if (eq.isError) return <LoadError error={eq.error} retry={() => eq.refetch()} />;
  const tasks = tq.data; const shown = tasks.filter(t => inTaskFilter(asDemo(t), filter, today));
  return <div className="max-w-4xl"><div className="flex flex-wrap items-end justify-between gap-x-3"><Header name="Việc của hai bạn" subtitle={`KẾ HOẠCH · ${coupleName(w).toUpperCase()}`} /><WriteButton size="lg" className="mb-6 min-h-11" onClick={() => edit()}><Plus /> Thêm việc</WriteButton></div><PlannerTabs active="tasks" />
    {missing && <div role="alert" className="mb-4"><Note tone="copper">{missing}</Note></div>}
    <p className="mb-6 text-muted-foreground">“Hôm nay” là việc đến hạn hôm nay; “Sắp hạn” gồm việc quá hạn và đến hạn trong 14 ngày tới, không gồm hôm nay hay việc đã xong. Việc xa hơn và chưa đặt hạn vẫn ở “Tất cả”.</p>
    <div className="mb-6 grid grid-cols-4 gap-1.5 sm:flex sm:gap-2" role="group" aria-label="Lọc việc">{['Hôm nay', 'Sắp hạn', 'Chờ chốt', 'Tất cả'].map(x => <Button key={x} aria-pressed={filter === x} variant={filter === x ? 'default' : 'outline'} className="min-h-11 min-w-0 rounded-full px-1 text-[11px] sm:px-4 sm:text-sm" onClick={() => setFilter(x)}>{x}</Button>)}</div>
    <SmallLabel>{filter === 'Tất cả' ? `TẤT CẢ · ${tasks.length} VIỆC` : filter === 'Hôm nay' ? 'ĐẾN HẠN HÔM NAY' : filter === 'Sắp hạn' ? 'QUÁ HẠN HOẶC TRONG 14 NGÀY TỚI' : 'ĐANG CHỜ CHỐT'}</SmallLabel><p role="status" className="mb-2 text-xs font-semibold text-sage-strong">{done}</p>
    <div className="space-y-3" aria-live="polite">
      {shown.length === 0 && <Note tone="warm">{tasks.length === 0 ? 'Chưa có việc nào. Hãy thêm việc đầu tiên hoặc chọn từ thư viện việc gợi ý bên dưới.' : filter === 'Hôm nay' ? 'Không có việc chưa xong nào đến hạn hôm nay.' : filter === 'Sắp hạn' ? 'Không có việc quá hạn hay đến hạn trong 14 ngày tới. Việc có hạn xa hơn và chưa đặt hạn vẫn ở Tất cả.' : 'Chưa có việc nào đang chờ chốt.'}</Note>}
      {shown.map(t => { const due = taskDue(asDemo(t), today); const st = toStatusUi(t.status); return <Panel key={t.id} item={t.id}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h2 className="break-words text-xl">{t.title}</h2><p className="mt-1 text-xs text-muted-foreground">{evName(t.event_id)} · {assigneeLabel(t.assignee, w)} phụ trách{t.source === 'suggested' ? ' · Từ việc gợi ý' : ''}</p></div><Status tone={st === 'Xong' ? 'sage' : st === 'Chờ chốt' ? 'warm' : 'copper'}>{st === 'Xong' ? 'Đã xong' : st}</Status></div>
        <p className={`mt-2 text-sm ${due.group === 'overdue' ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>{due.label}</p>
        {t.kind === 'table-count' && <><p className="mt-2 text-sm"><span className="font-semibold">Số bàn dự kiến:</span> {t.planned_tables === null ? 'Chưa nhập' : `${t.planned_tables} bàn`} · <span className="font-semibold">Số bàn dự phòng:</span> {t.reserve_tables === null ? 'Chưa nhập' : `${t.reserve_tables} bàn`}</p><p className="mt-1 text-xs text-muted-foreground">Hai bạn tự dự tính số bàn; không tự tính từ phản hồi tham dự, không thay đổi sổ khách hay ngân sách.</p></>}
        {t.outcome && <p className="mt-2 break-words text-sm"><span className="font-semibold">Kết quả cần chốt:</span> {t.outcome}</p>}{t.note && <p className="mt-1 break-words text-sm"><span className="font-semibold">Ghi chú:</span> {t.note}</p>}
        <div className="mt-1 flex flex-wrap gap-x-3"><Button variant="ghost" className="min-h-11 px-0 text-primary" onClick={() => edit(t)}><Pencil className="size-4" /> Sửa việc</Button>
          {st !== 'Xong' && <WriteButton variant="ghost" className="min-h-11 px-0 text-primary" disabled={quickDone.isPending} title={t.kind === 'table-count' && !t.planned_tables ? 'Cần nhập số bàn dự kiến lớn hơn 0 trước' : undefined} onClick={() => { if (t.kind === 'table-count' && !t.planned_tables) { edit(t); setF(p => ({ ...p, status: 'Xong' })); setCountErr('Cần nhập số bàn dự kiến lớn hơn 0 trước khi đánh dấu đã xong.'); return; } quickDone.mutate(t); }}>Đánh dấu xong</WriteButton>}</div>
      </Panel>; })}
    </div>
    <RealSuggestionLibrary weddingId={w.id} tasks={tasks} onAdded={n => setDone(`Đã thêm ${n} việc gợi ý.`)} />
    <Button asChild variant="outline" size="lg" className="mt-5 min-h-11"><Link to="/plan/budget">Xem ngân sách <ArrowRight /></Link></Button>
    <DemoDialog real busy={save.isPending} open={open} onOpenChange={o => { if (!save.isPending) setOpen(o); }} title={editing ? 'Sửa việc' : 'Thêm việc'} description="Ghi việc cần làm và kết quả hai bạn muốn chốt. Lưu vào tài khoản cho cả hai người." submitLabel={save.isPending ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Thêm việc'} onSubmit={submit}>
      <FormField label="Tên việc *" id="task-title" error={err}><input id="task-title" autoFocus value={f.title} maxLength={120} aria-invalid={!!err} aria-describedby={err ? 'task-title-err' : undefined} onChange={e => setF({ ...f, title: e.target.value })} className={inputCls} placeholder="Ví dụ: Đặt xe đón dâu" /></FormField>
      <FormField label="Loại việc" id="task-kind"><select id="task-kind" value={f.kind} onChange={e => { setF({ ...f, kind: e.target.value as TaskDraft['kind'] }); setCountErr(''); }} className={inputCls}><option value="standard">Việc thường</option><option value="table-count">Dự tính số bàn</option></select></FormField>
      {editing?.kind === 'table-count' && f.kind === 'standard' && (editing.planned_tables !== null || editing.reserve_tables !== null) && <p className="text-xs font-semibold text-destructive">Khi lưu thành việc thường, số bàn đã ghi sẽ bị bỏ. Đổi lại “Dự tính số bàn” trước khi lưu để giữ.</p>}
      <FormField label="Buổi lễ" id="task-event"><select id="task-event" value={f.eventId} onChange={e => setF({ ...f, eventId: e.target.value })} className={inputCls}><option value="">Mọi buổi</option>{events.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></FormField>
      <div className="grid gap-4 sm:grid-cols-2"><FormField label="Hạn" id="task-due"><input id="task-due" type="date" value={f.due} onChange={e => setF({ ...f, due: e.target.value })} className={inputCls} /></FormField><FormField label="Người phụ trách" id="task-owner"><select id="task-owner" value={f.assignee} onChange={e => setF({ ...f, assignee: e.target.value as TaskDraft['assignee'] })} className={inputCls}><option value="both">Cả hai</option><option value="one">{w.partner_one_name}</option><option value="two">{w.partner_two_name}</option></select></FormField></div>
      <FormField label="Trạng thái" id="task-status"><select id="task-status" value={f.status} onChange={e => setF({ ...f, status: e.target.value as DemoTask['status'] })} className={inputCls}>{(['Cần làm', 'Đang làm', 'Chờ chốt', 'Xong'] as const).map(x => <option key={x} value={x}>{x === 'Xong' ? 'Đã xong' : x}</option>)}</select></FormField>
      {f.kind === 'table-count' && <><div className="grid gap-4 sm:grid-cols-2"><FormField label="Số bàn dự kiến" id="task-tables" error={countErr}><input id="task-tables" type="number" min="0" step="1" inputMode="numeric" value={f.planned} aria-invalid={!!countErr} aria-describedby={countErr ? 'task-tables-err' : undefined} onChange={e => setF({ ...f, planned: e.target.value })} className={inputCls} /></FormField><FormField label="Số bàn dự phòng" id="task-reserve"><input id="task-reserve" type="number" min="0" step="1" inputMode="numeric" value={f.reserve} aria-invalid={!!countErr} onChange={e => setF({ ...f, reserve: e.target.value })} className={inputCls} /></FormField></div><p className="text-xs text-muted-foreground">Đây là số bàn hai bạn tự dự tính, không tự tính từ phản hồi tham dự; sửa ở đây không đổi sổ khách hay ngân sách.</p></>}
      <FormField label="Kết quả cần chốt" id="task-outcome"><input id="task-outcome" value={f.outcome} maxLength={500} onChange={e => setF({ ...f, outcome: e.target.value })} className={inputCls} placeholder="Hai bạn muốn chốt điều gì?" /></FormField>
      <FormField label="Ghi chú" id="task-note"><textarea id="task-note" value={f.note} maxLength={1000} rows={3} onChange={e => setF({ ...f, note: e.target.value })} className={inputCls} placeholder="Thông tin cần nhớ" /></FormField>
      {saveErr && <div role="alert"><Note tone="copper">{saveErr} Thông tin bạn nhập vẫn còn; hãy thử lưu lại.</Note></div>}
    </DemoDialog>
  </div>;
}

function RealSuggestionLibrary({ weddingId, tasks, onAdded }: { weddingId: string; tasks: TaskRow[]; onAdded: (n: number) => void }) {
  const qc = useQueryClient(); const focus = useFocusId();
  const [open, setOpen] = useState(focus === 'suggestions'); const [picked, setPicked] = useState<string[]>([]); const [msg, setMsg] = useState('');
  const have = new Set(tasks.map(t => t.template_id).filter(Boolean));
  const add = useMutation({
    mutationFn: async (ids: string[]) => { await addSuggestedTasks(weddingId, SUGGESTED_TASKS.filter(s => ids.includes(s.id))); return ids.length; },
    onSuccess: async n => { await qc.invalidateQueries({ queryKey: ['tasks', weddingId] }); setOpen(false); setPicked([]); onAdded(n); },
    onError: e => setMsg(friendlyError(e)),
  });
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (add.isPending) return; const ids = missingTemplates(picked, [...have] as string[]); if (!ids.length) { setMsg('Hãy chọn ít nhất một việc chưa có.'); return; } setMsg(''); add.mutate(ids); };
  return <div className="mt-4"><Panel item="suggestions"><h2 className="text-xl">Thư viện 43 việc gợi ý</h2><p className="mt-1 text-xs text-muted-foreground">Chỉ thêm những việc hai bạn chọn. Đã có {have.size} việc từ thư viện.</p><Button variant="outline" size="lg" className="mt-3 min-h-11" onClick={() => { setMsg(''); setOpen(true); }}><Plus /> Chọn việc gợi ý</Button></Panel>
    <DemoDialog real busy={add.isPending} open={open} onOpenChange={o => { if (!add.isPending) setOpen(o); }} title="Việc gợi ý" description="Đánh dấu việc muốn thêm. Việc đã có từ thư viện sẽ không thêm lại." submitLabel={add.isPending ? 'Đang thêm…' : `Thêm ${picked.length} việc`} onSubmit={submit}>
      {(['Sớm', '3 tháng trước', '1 tháng trước', 'Tuần cưới'] as const).map(phase => <fieldset key={phase}><legend className="text-xs font-bold uppercase text-primary">{phase}</legend><div className="mt-1 space-y-1">{SUGGESTED_TASKS.filter(s => s.phase === phase).map(s => { const h = have.has(s.id); return <label key={s.id} className={`flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-sm ${h ? 'opacity-60' : ''}`}><input type="checkbox" className="size-4 accent-primary" disabled={h} checked={h || picked.includes(s.id)} onChange={e => setPicked(e.target.checked ? [...picked, s.id] : picked.filter(x => x !== s.id))} />{s.title}{h ? ' · đã có' : ''}</label>; })}</div></fieldset>)}
      {msg && <p role="alert" className="text-xs font-semibold text-destructive">{msg}</p>}
    </DemoDialog></div>;
}

/* ================= Budget ================= */
const money = (x: BudgetItemWithSchedule): CostMoney => ({ estimate: x.estimate_vnd, agreed: x.agreed_vnd, paid: x.paid_vnd, deposit: x.deposit_vnd, extra: x.extra_vnd });
const emptyCost = (): CostDraft => ({ title: '', category: 'tiec', categoryDetail: '', eventId: '', payer: 'couple', estimate: '', agreed: '', paid: '0', deposit: '0', extra: '0', vendor: '', installments: [] });
const SHARED = 'Dùng chung, không thuộc riêng buổi nào';

export function RealBudgetScreen() {
  const w = useMyWedding().data!; const qc = useQueryClient();
  const bq = useQuery(budgetQuery(w.id)); const eq = useQuery(eventsQuery(w.id));
  const [filter, setFilter] = useState('all'), [payerFilter, setPayerFilter] = useState('all');
  const [open, setOpen] = useState(false), [editing, setEditing] = useState<BudgetItemWithSchedule | null>(null), [f, setF] = useState<CostDraft>(emptyCost());
  const [errors, setErrors] = useState<Record<string, string>>({}), [saveErr, setSaveErr] = useState(''), [msg, setMsg] = useState('');
  const [capOpen, setCapOpen] = useState(false), [capDraft, setCapDraft] = useState(''), [capErr, setCapErr] = useState('');
  const [removing, setRemoving] = useState(false);
  const events = eq.data ?? [];
  const evName = (id: string | null) => (id ? events.find(e => e.id === id)?.name ?? SHARED : SHARED);
  const refresh = () => qc.invalidateQueries({ queryKey: ['budget', w.id] });
  const edit = (x?: BudgetItemWithSchedule) => {
    setEditing(x ?? null); setErrors({}); setSaveErr(''); setRemoving(false);
    setF(x ? { title: x.label, category: x.category as CostDraft['category'], categoryDetail: x.category_detail ?? '', eventId: x.event_id ?? '', payer: x.payer as CostDraft['payer'], estimate: x.estimate_vnd ? String(x.estimate_vnd) : '', agreed: x.agreed_vnd === null ? '' : String(x.agreed_vnd), paid: String(x.paid_vnd), deposit: String(x.deposit_vnd), extra: String(x.extra_vnd), vendor: x.vendor ?? '', installments: x.installments.filter(i => !i.paid_at).map(i => ({ key: i.id, label: i.label as CostDraft['installments'][number]['label'], amount: String(i.amount_vnd), due: i.due_date ?? '' })) } : emptyCost());
    setOpen(true);
  };
  const missing = useRealDeepLink(bq.data, edit, 'khoản chi');
  const save = useMutation({
    mutationFn: async () => { const v = validateCost(f); setErrors(v.errors); if (!v.payload) return null; await saveBudgetItem(w.id, editing?.id ?? null, v.payload); return v.payload.label; },
    onSuccess: async title => { if (!title) return; await refresh(); setMsg(editing ? `Đã lưu “${title}”.` : `Đã thêm “${title}”.`); setOpen(false); },
    onError: e => setSaveErr(String((e as { message?: string })?.message ?? '').includes('schedule exceeds') ? 'Tổng các đợt vượt phần còn phải trả.' : friendlyError(e)),
  });
  const del = useMutation({ mutationFn: () => deleteBudgetItem(editing!.id), onSuccess: async () => { await refresh(); setMsg(`Đã xóa “${editing?.label}”.`); setOpen(false); }, onError: e => setSaveErr(friendlyError(e)) });
  const cap = useMutation({ mutationFn: (n: number) => setBudgetCap(w.id, n), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['wedding'] }); setCapOpen(false); }, onError: e => setCapErr(friendlyError(e)) });
  if (bq.isPending || eq.isPending) return <Loading label="Đang tải ngân sách…" />;
  if (bq.isError) return <LoadError error={bq.error} retry={() => bq.refetch()} />;
  if (eq.isError) return <LoadError error={eq.error} retry={() => eq.refetch()} />;
  const items = bq.data; const t = budgetTotals(items.map(money)); const capV = w.budget_cap_vnd;
  const schedule = items.flatMap(x => x.installments.filter(i => !i.paid_at).map(i => ({ ...i, title: x.label, payer: x.payer }))).sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
  const visible = items.filter(x => (filter === 'all' || (filter === 'shared' ? !x.event_id : filter.startsWith('p:') ? x.payer === filter.slice(2) : x.event_id === filter)) && (payerFilter === 'all' || x.payer === payerFilter));
  const filters = [['all', 'Tất cả'], ['shared', 'Chung'], ['p:nha-trai', 'Nhà trai'], ['p:nha-gai', 'Nhà gái'], ...events.map(e => [e.id, e.name])] as [string, string][];
  return <div className="max-w-4xl"><Header name="Tiền bạc rõ ràng hơn" subtitle={`KẾ HOẠCH · ${coupleName(w).toUpperCase()}`} /><PlannerTabs active="budget" />
    {missing && <div role="alert" className="mb-4"><Note tone="copper">{missing}</Note></div>}
    <h2 className="font-display text-2xl">Đám cưới của mình đang dự tính hết bao nhiêu?</h2><p className="mb-5 mt-2 text-sm text-muted-foreground">Ghi từng khoản để hai bạn và hai gia đình dễ cùng theo dõi. Mọi khoản được lưu vào tài khoản.</p>
    <div className="mb-5 flex flex-wrap gap-2"><WriteButton size="lg" className="min-h-11" onClick={() => edit()}><Plus /> Thêm khoản chi</WriteButton><Button variant="outline" size="lg" className="min-h-11" onClick={() => { setCapDraft(capV ? String(capV) : ''); setCapErr(''); setCapOpen(true); }}><Pencil /> {capV ? 'Đổi mức dự định chi' : 'Đặt mức dự định chi'}</Button></div>
    <p role="status" className="mb-2 text-xs font-semibold text-sage-strong">{msg}</p>
    <section aria-label="Tổng hợp ngân sách" className="rounded-lg bg-foreground p-4 text-primary-foreground sm:p-5"><div className="text-xs font-semibold">Mức hai bạn dự định chi</div><div className="mt-1 break-words font-display text-4xl font-semibold" data-testid="budget-cap">{capV ? fmtVnd(capV) : 'Chưa đặt'}</div><p className="mt-2 text-xs opacity-85">Mức hai bạn tự đặt để theo dõi; có thể đổi bất cứ lúc nào.</p>
      <dl className="mt-5 space-y-1.5 border-t border-primary-foreground/25 pt-4 text-xs sm:text-sm" aria-live="polite">{[
        { label: 'Tổng chi đang dự tính', value: fmtVnd(t.planned), tone: 'bg-stat-blue-soft' },
        { label: 'Đã chốt giá', value: fmtVnd(t.agreed), tone: 'bg-sage' },
        { label: 'Đã thanh toán (gồm tiền cọc)', value: fmtVnd(t.paid), tone: 'bg-card' },
        { label: 'Còn phải trả cho khoản đã chốt', value: fmtVnd(t.unpaid), tone: 'bg-warm' },
        ...(capV ? [{ label: t.planned > capV ? 'Cảnh báo: vượt mức dự định' : 'Chênh lệch tạm tính so với mức dự định', value: fmtVnd(Math.abs(capV - t.planned)), tone: `bg-copper-soft border-l-[3px] ${t.planned > capV ? 'border-l-destructive' : 'border-l-transparent'}` }] : []),
      ].map(row => <div key={row.label} className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-md px-3 py-2.5 text-foreground ${row.tone}`}><dt className="min-w-0 flex-1 font-medium">{row.label}</dt><dd className="break-words text-right font-bold">{row.value}</dd></div>)}</dl></section>
    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Tổng chi đang dự tính lấy giá đã chốt nếu có, nếu chưa thì lấy tiền dự tính; phát sinh đã xác nhận cộng vào giá đã chốt và phần còn phải trả. Mỗi khoản chỉ tính một lần. Đây là tổng những khoản đã ghi, chưa chắc đủ mọi chi phí. Tiền mừng không được tự trừ; số khách phản hồi không tự đổi giá tiệc.</p>
    <section className="mt-8"><SmallLabel>SẮP PHẢI TRẢ</SmallLabel>{schedule.length ? <div className="space-y-2">{schedule.map(i => <Panel key={i.id}><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{i.title} · {i.label}</h3><p className="mt-1 text-xs text-muted-foreground">{i.due_date ? fullDate(i.due_date) : 'Chưa ghi ngày trả'} · {payerLabel(i.payer)} trả</p></div><strong>{fmtVnd(i.amount_vnd)}</strong></div></Panel>)}</div> : <Note tone="warm">Chưa ghi lịch trả cho khoản nào. {t.unpaid > 0 ? `Các khoản đã chốt còn phải trả ${fmtVnd(t.unpaid)}, nhưng chưa gán số này vào một hạn nào.` : 'Chưa có khoản đã chốt cần trả.'}</Note>}</section>
    <section className="mt-8"><SmallLabel>CÁC KHOẢN ĐÃ GHI · {visible.length}/{items.length}</SmallLabel>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc khoản theo buổi hoặc nhà">{filters.map(([id, label]) => <Button key={id} aria-pressed={filter === id} variant={filter === id ? 'default' : 'outline'} className="min-h-11 rounded-full px-3 text-xs" onClick={() => setFilter(id)}>{label}</Button>)}</div>
      <label className="mt-3 block max-w-xs text-xs font-semibold">Bên trả<select className={inputCls} value={payerFilter} onChange={e => setPayerFilter(e.target.value)}><option value="all">Tất cả</option>{PAYERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
      {items.length === 0 ? <div className="mt-4"><Note tone="warm">Chưa có khoản chi nào. Hãy thêm khoản đầu tiên, ví dụ tiền tiệc hoặc ảnh cưới.</Note></div> : visible.length === 0 && <div className="mt-4"><Note tone="warm">Chưa có khoản nào phù hợp bộ lọc.</Note></div>}
      {CATEGORIES.map(c => { const list = visible.filter(x => x.category === c.id); return list.length ? <div key={c.id} className="mt-6"><h3 className="mb-2 font-display text-xl">{c.label}</h3><div className="space-y-2">{list.map(x => { const m = money(x); const next = x.installments.filter(i => i.due_date && !i.paid_at).sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0]; return <Panel key={x.id} item={x.id}>
        <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h4 className="font-semibold">{x.label}</h4>{x.category === 'khac' && <p className="mt-1 text-xs font-medium text-primary">Khác: {x.category_detail}</p>}<p className="mt-1 text-xs text-muted-foreground">{evName(x.event_id)} · {payerLabel(x.payer)} trả</p></div><Button variant="outline" className="min-h-11 px-3 text-xs" onClick={() => edit(x)}><Pencil className="size-4" /> Sửa</Button></div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3"><div>Tiền dự tính<br /><strong>{x.estimate_vnd ? fmtVnd(x.estimate_vnd) : 'Chưa ghi'}</strong></div><div>Giá đã chốt (gồm phát sinh)<br /><strong>{x.agreed_vnd === null ? 'Chưa chốt' : fmtVnd(agreedCost(m))}</strong></div><div>Đã cọc<br /><strong>{fmtVnd(x.deposit_vnd)}</strong></div><div>Đã thanh toán<br /><strong>{fmtVnd(x.paid_vnd)}</strong></div><div>Còn phải trả<br /><strong>{x.agreed_vnd === null ? 'Chưa chốt' : fmtVnd(unpaidCost(m))}</strong></div><div>Ngày trả tiếp<br /><strong>{next ? fullDate(next.due_date) : x.installments.length ? 'Chưa ghi ngày trả' : 'Chưa ghi lịch'}</strong></div></div>
        <p className="mt-2 text-xs text-muted-foreground">Tính vào tổng: {fmtVnd(plannedCost(m))}</p>
        {x.extra_vnd > 0 && <p className="mt-1 text-xs">Trong giá đã chốt có phát sinh đã xác nhận: {fmtVnd(x.extra_vnd)}</p>}{x.vendor && <p className="mt-1 text-xs text-muted-foreground">Đối tác: {x.vendor}</p>}
      </Panel>; })}</div></div> : null; })}</section>
    <p className="mt-5 text-xs text-muted-foreground">Tiền cọc và thanh toán nhà cung cấp được theo dõi riêng, không liên quan đến việc mua gói thiệp cưới.</p>
    <DemoDialog real busy={save.isPending || del.isPending} open={open} onOpenChange={o => { if (!save.isPending && !del.isPending) setOpen(o); }} title={editing ? 'Sửa khoản chi' : 'Thêm khoản chi'} description="Khoản chi được lưu vào tài khoản; cả hai người quản lý cùng thấy." submitLabel={save.isPending ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Thêm khoản chi'} onSubmit={e => { e.preventDefault(); if (!save.isPending) { setSaveErr(''); save.mutate(); } }}>
      <FormField label="Tên khoản chi *" id="cost-title" error={errors['title']}><input id="cost-title" autoFocus maxLength={120} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} className={inputCls} aria-invalid={!!errors['title']} /></FormField>
      <FormField label="Nhóm chi" id="cost-group"><select id="cost-group" value={f.category} onChange={e => setF({ ...f, category: e.target.value as CostDraft['category'], categoryDetail: e.target.value === 'khac' ? f.categoryDetail : '' })} className={inputCls}>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></FormField>
      {f.category === 'khac' && <FormField label="Cụ thể là khoản gì? *" id="cost-group-detail" error={errors['categoryDetail']}><input id="cost-group-detail" value={f.categoryDetail} onChange={e => setF({ ...f, categoryDetail: e.target.value })} className={inputCls} maxLength={120} placeholder="Ví dụ: Quà cảm ơn / Phí phục vụ" aria-invalid={!!errors['categoryDetail']} /></FormField>}
      <div><FormField label="Khoản chi này dành cho buổi nào?" id="cost-event"><select id="cost-event" value={f.eventId} onChange={e => setF({ ...f, eventId: e.target.value })} className={inputCls}><option value="">{SHARED}</option>{events.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></FormField><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Ảnh cưới có thể dùng chung; tiền tiệc chọn đúng buổi tiệc. Mỗi khoản chỉ tính một lần.</p></div>
      <FormField label="Ai sẽ trả" id="cost-payer"><select id="cost-payer" value={f.payer} onChange={e => setF({ ...f, payer: e.target.value as CostDraft['payer'] })} className={inputCls}>{PAYERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></FormField>
      <div className="grid gap-4 sm:grid-cols-2">{([['estimate', 'Tiền dự tính (đ)'], ['agreed', 'Giá đã chốt (đ)'], ['paid', 'Đã thanh toán, gồm cọc (đ)'], ['deposit', 'Trong đó tiền cọc (đ)'], ['extra', 'Phát sinh đã xác nhận (đ)']] as const).map(([key, label]) => <FormField key={key} label={label} id={`cost-${key}`} error={errors[key]}><input id={`cost-${key}`} inputMode="numeric" value={f[key]} onChange={e => setF({ ...f, [key]: e.target.value })} className={inputCls} aria-invalid={!!errors[key]} /></FormField>)}</div>
      <p className="text-xs text-muted-foreground">Phát sinh đã xác nhận được cộng vào giá đã chốt và phần còn phải trả. Chỉ ghi sau khi có giá chốt.</p>
      <FormField label="Ghi chú đối tác" id="cost-vendor"><input id="cost-vendor" maxLength={200} value={f.vendor} onChange={e => setF({ ...f, vendor: e.target.value })} className={inputCls} /></FormField>
      <fieldset className="space-y-3 border-t border-border pt-4"><legend className="font-semibold">Lịch trả cho nhà cung cấp</legend>{f.installments.map((i, index) => <div key={i.key} className="space-y-2 rounded-md border border-border p-3">
        <FormField label="Đợt trả" id={`installment-label-${index}`}><select id={`installment-label-${index}`} className={inputCls} value={i.label} onChange={e => setF({ ...f, installments: f.installments.map((x, j) => j === index ? { ...x, label: e.target.value as typeof i.label } : x) })}>{INSTALLMENT_LABELS.map(x => <option key={x}>{x}</option>)}</select></FormField>
        <FormField label="Số tiền (đ)" id={`installment-amount-${index}`} error={errors[`installment-${index}`]}><input id={`installment-amount-${index}`} className={inputCls} inputMode="numeric" value={i.amount} onChange={e => setF({ ...f, installments: f.installments.map((x, j) => j === index ? { ...x, amount: e.target.value } : x) })} /></FormField>
        <FormField label="Hạn trả (để trống nếu chưa chốt)" id={`installment-due-${index}`}><input id={`installment-due-${index}`} type="date" className={inputCls} value={i.due} onChange={e => setF({ ...f, installments: f.installments.map((x, j) => j === index ? { ...x, due: e.target.value } : x) })} /></FormField>
        <Button type="button" variant="ghost" className="min-h-11" onClick={() => setF({ ...f, installments: f.installments.filter((_, j) => j !== index) })}>Bỏ đợt này</Button></div>)}
        {errors['schedule'] && <p role="alert" className="text-xs text-destructive">{errors['schedule']}</p>}
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setF({ ...f, installments: [...f.installments, { key: `k${Date.now()}`, label: 'Đợt tiếp', amount: '', due: '' }] })}><Plus /> Thêm đợt trả</Button></fieldset>
      {editing && <div className="border-t border-border pt-3">{removing ? <div className="space-y-2"><p className="text-sm">Xóa hẳn “{editing.label}” và lịch trả của khoản này cho cả hai người?</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="min-h-11" onClick={() => setRemoving(false)}>Giữ lại</Button><Button type="button" variant="destructive" className="min-h-11" disabled={del.isPending} onClick={() => del.mutate()}>{del.isPending && <Loader2 className="animate-spin" />}Xóa khoản chi</Button></div></div> : <Button type="button" variant="ghost" className="min-h-11 text-destructive" onClick={() => setRemoving(true)}>Xóa khoản chi này</Button>}</div>}
      {saveErr && <div role="alert"><Note tone="copper">{saveErr} Thông tin bạn nhập vẫn còn; hãy thử lưu lại.</Note></div>}
    </DemoDialog>
    <DemoDialog real busy={cap.isPending} open={capOpen} onOpenChange={o => { if (!cap.isPending) setCapOpen(o); }} title="Mức dự định chi" description="Mức này do hai bạn tự đặt, không phải số tiền mặt." submitLabel={cap.isPending ? 'Đang lưu…' : 'Lưu mức'} onSubmit={e => { e.preventDefault(); if (cap.isPending) return; const v = validateCap(capDraft); if (typeof v === 'string') { setCapErr(v); return; } setCapErr(''); cap.mutate(v); }}>
      <FormField label="Mức hai bạn dự định chi (đ) *" id="cap-value" error={capErr}><input id="cap-value" autoFocus inputMode="numeric" value={capDraft} onChange={e => setCapDraft(e.target.value)} className={inputCls} /></FormField>
    </DemoDialog>
  </div>;
}

/* ================= Event date impact (real rows) ================= */
type Impact = Awaited<ReturnType<typeof eventImpactData>>;
/** Review before saving an Event whose date changes or is cleared. Task shifts need per-task consent; payment dates only warn. */
export function EventDateImpactDialog({ event, form, onCancel, onConfirm, busy, error }: { event: EventRow; form: EventForm; onCancel: () => void; onConfirm: (shiftIds: string[]) => void; busy: boolean; error: string }) {
  const q = useQuery({ queryKey: ['event-impact', event.id], queryFn: () => eventImpactData(event.id) });
  const from = event.event_date ?? '', to = form.date; const delta = from && to ? dayDiff(from, to) : 0; const cleared = !!from && !to;
  const shiftable = (q.data?.tasks ?? []).filter(t => t.due_date && t.status !== 'done' && delta);
  const [picked, setPicked] = useState<string[] | null>(null); const chosen = picked ?? [];
  const payments = (q.data?.costs ?? []).flatMap(c => (c.budget_installments ?? []).filter(i => i.due_date && !i.paid_at).map(i => ({ ...i, costId: c.id, title: c.label })));
  return <Dialog open onOpenChange={o => { if (!o && !busy) onCancel(); }}><DialogContent className="max-h-[92vh] w-[calc(100vw-24px)] max-w-lg overflow-y-auto rounded-lg bg-card p-5 text-foreground sm:p-6">
    <DialogHeader className="text-left"><DialogTitle className="font-display text-2xl">{cleared ? 'Xóa ngày' : 'Đổi ngày'} {event.name}?</DialogTitle><DialogDescription>{fullDate(from || null)} → {fullDate(to || null)}{delta ? ` (${delta > 0 ? 'lùi' : 'sớm'} ${Math.abs(delta)} ngày)` : ''}. Xem những gì liên quan trước khi lưu.</DialogDescription></DialogHeader>
    {q.isPending ? <Loading label="Đang kiểm tra dữ liệu liên quan…" /> : q.isError ? <LoadError error={q.error} retry={() => q.refetch()} /> : <div className="space-y-4 text-sm">
      {cleared && <p role="alert" className="rounded-md bg-copper-soft p-2 text-xs font-semibold">Buổi này sẽ không còn ngày. Hạn các việc giữ nguyên, không tự dời.</p>}
      <section><h3 className="font-semibold">Việc gắn với buổi này · {q.data.tasks.length}</h3>
        {shiftable.length ? <><p className="mt-1 text-xs text-muted-foreground">Chọn từng việc muốn dời hạn theo ngày mới. Việc không chọn giữ nguyên hạn.</p><ul className="mt-2 space-y-1">{shiftable.map(t => <li key={t.id}><label className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-xs"><input type="checkbox" className="size-4 accent-primary" checked={chosen.includes(t.id)} onChange={e => setPicked(e.target.checked ? [...chosen, t.id] : chosen.filter(x => x !== t.id))} /><span className="flex-1">{t.title}: {fmtDate(t.due_date!)} → {fmtDate(shiftDate(t.due_date!, delta))}</span><Link to="/plan/tasks/$id" params={{ id: t.id }} className="text-primary underline">Xem</Link></label></li>)}</ul></>
          : <p className="text-xs text-muted-foreground">{q.data.tasks.length ? 'Không có việc chưa xong nào có hạn cần dời.' : 'Không có việc gắn với buổi này.'}</p>}</section>
      <section><h3 className="font-semibold">Ngày trả cố định cho nhà cung cấp · {payments.length}</h3>
        {payments.length ? <><ul className="mt-1 space-y-1 text-xs">{payments.map(p => <li key={p.id}>{p.title} · {p.label}: {fullDate(p.due_date)} · <Link to="/plan/budget/$id" params={{ id: p.costId }} className="text-primary underline">Mở khoản chi</Link></li>)}</ul><p className="mt-1 rounded-md bg-copper-soft p-2 text-xs">Không tự đổi hạn trả. Hãy hỏi lại bên cung cấp rồi sửa trong Ngân sách nếu cần.</p></> : <p className="text-xs text-muted-foreground">Không có ngày trả nào gắn với buổi này.</p>}</section>
      <section><h3 className="font-semibold">Link thiệp</h3><p className="text-xs text-muted-foreground">Link thiệp chưa được lưu vào tài khoản ở bước này. Khi link thiệp có buổi này được bật, hai bạn cần xem lại trước khi công bố.</p></section>
    </div>}
    {error && <div role="alert"><Note tone="copper">{error}</Note></div>}
    <DialogFooter className="flex-col-reverse gap-2 sm:flex-row"><Button variant="outline" size="lg" className="min-h-11" disabled={busy} onClick={onCancel}>Quay lại sửa</Button><Button size="lg" className="min-h-11" disabled={busy || !q.data} onClick={() => onConfirm(chosen)}>{busy && <Loader2 className="animate-spin" />}{chosen.length ? `Lưu và dời ${chosen.length} việc` : 'Lưu, không dời việc'}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

/** Removal review with links back to each affected record. */
export function EventRemovalSummary({ eventId }: { eventId: string }) {
  const q = useQuery({ queryKey: ['event-impact', eventId], queryFn: () => eventImpactData(eventId) });
  if (q.isPending) return <Loading label="Đang kiểm tra dữ liệu liên quan…" />;
  if (q.isError) return <LoadError error={q.error} retry={() => q.refetch()} />;
  const { tasks, costs, guests } = q.data;
  return <div className="space-y-3 text-sm">
    <div><p>{tasks.length} việc sẽ giữ lại nhưng chuyển về “Mọi buổi”.</p>{tasks.length > 0 && <ul className="mt-1 space-y-1 text-xs">{tasks.map(t => <li key={t.id}><Link to="/plan/tasks/$id" params={{ id: t.id }} className="text-primary underline">{t.title}</Link></li>)}</ul>}</div>
    <div><p>{costs.length} khoản chi sẽ giữ lại, chuyển về “Dùng chung”.</p>{costs.length > 0 && <ul className="mt-1 space-y-1 text-xs">{costs.map(c => <li key={c.id}><Link to="/plan/budget/$id" params={{ id: c.id }} className="text-primary underline">{c.label}</Link></li>)}</ul>}</div>
    <p>{guests} lượt mời khách vào buổi này sẽ bị gỡ; hồ sơ khách giữ nguyên.</p>
    <p className="text-xs text-muted-foreground">Mọi thay đổi diễn ra cùng lúc: nếu có lỗi, không dữ liệu nào bị đổi dở dang.</p>
  </div>;
}

/* ================= Home: nearest real tasks + payments ================= */
export function RealHomeScreen() {
  const w = useMyWedding().data!;
  const gsq = useQuery(guestsQuery(w.id)); const tq = useQuery(tasksQuery(w.id)), bq = useQuery(budgetQuery(w.id)), eq = useQuery(eventsQuery(w.id));
  const [today, setToday] = useState(''); useEffect(() => setToday(vietnamToday()), []);
  if (tq.isPending || bq.isPending || eq.isPending) return <Loading label="Đang tải tổng quan…" />;
  const failed = [tq, bq, eq].find(q => q.isError);
  if (failed) return <LoadError error={failed.error} retry={() => { tq.refetch(); bq.refetch(); eq.refetch(); }} />;
  const events = eq.data ?? []; const evName = (id: string | null) => (id ? events.find(e => e.id === id)?.name ?? 'Buổi đã bỏ' : 'Mọi buổi');
  const open = (tq.data ?? []).filter(t => t.status !== 'done' && t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const [first, second] = open;
  const pays = (bq.data ?? []).flatMap(c => c.installments.filter(i => !i.paid_at && i.due_date).map(i => ({ i, c }))).sort((a, b) => a.i.due_date!.localeCompare(b.i.due_date!));
  const nextPay = pays[0]; const unpaid = budgetTotals((bq.data ?? []).map(money)).unpaid;
  const overdueTasks = open.filter(t => dueWindow(t.due_date, today) === 'overdue');
  const weekTasks = open.filter(t => dueWindow(t.due_date, today) === 'seven_days');
  const undatedTasks = (tq.data ?? []).filter(t => t.status !== 'done' && !t.due_date).length;
  const overduePays = pays.filter(({ i }) => dueWindow(i.due_date, today) === 'overdue');
  const weekPays = pays.filter(({ i }) => dueWindow(i.due_date, today) === 'seven_days');
  const monthPays = pays.filter(({ i }) => dueWindow(i.due_date, today) === 'thirty_days');
  const followupGuest = gsq.data?.find(g => g.assignments.some(needsFollowup));
  const card = (t: TaskRow) => { const d = taskDue(asDemo(t), today); const st = toStatusUi(t.status); return <><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><h2 className="break-words font-display text-xl font-semibold">{t.title}</h2><p className="mt-1 text-xs text-muted-foreground">{evName(t.event_id)} · {assigneeLabel(t.assignee, w)} phụ trách</p></div><Status tone={st === 'Chờ chốt' ? 'warm' : 'copper'}>{st}</Status></div><p className={`mt-2 text-sm ${d.group === 'overdue' ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>{d.label}</p></>; };
  return <div><Header name="Hôm nay, mình làm gì?" subtitle={today ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()) : 'TỔNG QUAN'} /><p className="-mt-3 mb-7 text-muted-foreground">Những điều hai bạn đang chuẩn bị cho ngày cưới.</p>
    <section className="mb-7" aria-label="Việc cần chú ý"><SmallLabel>CẦN CHÚ Ý</SmallLabel>
      <div className="grid gap-3 sm:grid-cols-3">
        <Panel className="border-l-[3px] border-l-primary p-4"><p className="text-xs font-semibold text-muted-foreground">Việc cần làm</p><h2 className="mt-1 font-display text-2xl">{today ? overdueTasks.length : '…'} quá hạn</h2><p className="mt-1 text-xs">{today ? `${weekTasks.length} việc đến hạn trong 7 ngày · ${undatedTasks} việc chưa đặt hạn` : 'Đang tính hạn theo giờ Việt Nam…'}</p><Button asChild variant="ghost" className="mt-2 min-h-11 px-0 text-primary">{overdueTasks[0] || weekTasks[0] ? <Link to="/plan/tasks/$id" params={{ id: (overdueTasks[0] ?? weekTasks[0])!.id }}>Xem việc cần làm <ArrowRight /></Link> : <Link to="/plan/tasks">Xem việc cần làm <ArrowRight /></Link>}</Button></Panel>
        <Panel className="border-l-[3px] border-l-destructive p-4"><p className="text-xs font-semibold text-muted-foreground">Lịch trả tiền</p><h2 className="mt-1 font-display text-2xl">{today ? overduePays.length : '…'} khoản quá hạn</h2><p className="mt-1 text-xs">{today ? `${weekPays.length} khoản trong 7 ngày · ${monthPays.length} khoản trong 8–30 ngày` : 'Đang tính hạn theo giờ Việt Nam…'}</p><Button asChild variant="ghost" className="mt-2 min-h-11 px-0 text-primary">{overduePays[0] || weekPays[0] ? <Link to="/plan/budget/$id" params={{ id: (overduePays[0] ?? weekPays[0])!.c.id }}>Xem lịch trả tiền <ArrowRight /></Link> : <Link to="/plan/budget">Xem lịch trả tiền <ArrowRight /></Link>}</Button></Panel>
        <Panel className="border-l-[3px] border-l-sage-strong p-4"><p className="text-xs font-semibold text-muted-foreground">Khách cần hỏi lại</p><h2 className="mt-1 font-display text-2xl">{gsq.isPending ? '…' : gsq.isError ? 'Chưa tải được' : `${followupCount(gsq.data ?? [])} hồ sơ`}</h2><p className="mt-1 text-xs">Đã mời nhưng chưa rõ hoặc mới nói có thể đến.</p><Button asChild variant="ghost" className="mt-2 min-h-11 px-0 text-primary">{followupGuest ? <Link to="/guests/$id" params={{ id: followupGuest.id }}>Xem sổ khách <ArrowRight /></Link> : <Link to="/guests">Xem sổ khách <ArrowRight /></Link>}</Button></Panel>
      </div>
    </section>
    <div className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]"><div><SmallLabel>VIỆC CÓ HẠN GẦN NHẤT</SmallLabel><Panel className="border-l-[3px] border-l-primary">{first ? card(first) : <p className="text-sm text-muted-foreground">Chưa có việc chưa xong nào được đặt hạn.</p>}<Button asChild variant="ghost" className="mt-3 min-h-11 px-0 text-primary"><Link to="/plan/tasks">{first ? 'Mở danh sách việc' : 'Lập kế hoạch và đặt hạn'} <ArrowRight /></Link></Button></Panel>
      <div className="mt-7"><SmallLabel>TIẾP THEO</SmallLabel><div className="grid gap-3 sm:grid-cols-2"><Panel>{second ? card(second) : <p className="text-sm text-muted-foreground">Chưa có việc có hạn tiếp theo.</p>}<Button asChild variant="ghost" className="mt-2 min-h-11 px-0 text-primary"><Link to="/plan/tasks">Xem việc <ArrowRight /></Link></Button></Panel>
        <Panel><div className="mb-3"><Status>{nextPay ? 'KHOẢN SẮP PHẢI TRẢ' : 'CHƯA GHI HẠN TRẢ'}</Status></div><h2 className="text-xl">{nextPay ? fmtVnd(nextPay.i.amount_vnd) : unpaid > 0 ? fmtVnd(unpaid) : 'Chưa có khoản cần trả'}</h2><p className="mt-1 text-xs text-muted-foreground">{nextPay ? `${nextPay.c.label} · ${nextPay.i.label} · ${fullDate(nextPay.i.due_date)}` : unpaid > 0 ? 'Còn phải trả, chưa ghi hạn' : 'Xem sổ chi tiêu'}</p>{nextPay ? <Button asChild variant="ghost" className="mt-2 min-h-11 px-0 text-primary"><Link to="/plan/budget/$id" params={{ id: nextPay.c.id }}>Xem khoản <ArrowRight /></Link></Button> : <Button asChild variant="ghost" className="mt-2 min-h-11 px-0 text-primary"><Link to="/plan/budget">Xem ngân sách <ArrowRight /></Link></Button>}</Panel></div></div></div>
      <div><SmallLabel>KHÁCH MỜI</SmallLabel><Panel className="bg-sage">{gsq.isPending ? <p className="text-sm">Đang tải sổ khách…</p> : gsq.isError ? <p className="text-sm">Chưa tải được sổ khách. <button className="underline" onClick={() => gsq.refetch()}>Thử lại</button></p> : (() => { const t = guestTotals(gsq.data); const att = events.reduce((s, e) => s + eventTotals(gsq.data, e.id).attendingPeople, 0); return t.records ? <><h2 className="text-xl">{t.records} hồ sơ khách · {t.plannedPeople} người dự kiến</h2><p className="mt-1 text-xs">Mỗi khách đếm một lần dù mời nhiều buổi. Đã ghi {att} lượt người sẽ đến (cộng theo từng buổi).</p></> : <p className="text-sm">Sổ khách còn trống.</p>; })()}<Button asChild variant="ghost" className="mt-3 min-h-11 px-0 text-primary"><Link to="/guests">Xem sổ khách <ArrowRight /></Link></Button></Panel>
        <div className="mt-7"><SmallLabel>HÀNH TRÌNH CỦA MÌNH</SmallLabel><Panel><p className="text-sm">{events.length} buổi lễ · {(tq.data ?? []).length} việc · {(bq.data ?? []).length} khoản chi đã lưu</p><Button asChild variant="ghost" className="mt-2 min-h-11 px-0 text-primary"><Link to="/wedding/events">Các buổi lễ <ArrowRight /></Link></Button></Panel></div></div></div></div>;
}
