/** Phase 3 slice 2b: persisted guest book, CSV import (local preview → atomic idempotent commit), safe Undo, export. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Download, Loader2, Pencil, Plus, Trash2, Undo2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { eventsQuery, friendlyError, useMyWedding, type EventRow } from '@/lib/wedding-api';
import { batchChangedCount, batchesQuery, deleteGuest, guestsQuery, importGuestBatch, saveGuest, undoGuestBatch } from '@/lib/guests-api';
import { GUEST_SIDE_TEXT, INTENT_TEXT, MAX_IMPORT_ROWS, METHOD_TEXT, SOURCE_TEXT, eventTotals, filterGuests, followupCount, guestTotals, guestsCsv, importPayload, intentOf, methodOf, needsFollowup, validateGuest, type AttendanceIntent, type GuestDraft, type GuestErrors, type GuestFilter, type GuestRecord, type GuestSideDb, type InvitationMethod, type ResponseSource } from '@/lib/guests';
import { buildPreview, guessColumns, parseCsv, summarize, PREVIEW_LIMIT, SAMPLE_CSV, type ColumnMap, type CsvRow, type CsvTable } from '@/lib/phase2';
import { pageCount, pageSlice } from '@/lib/phase2d';
import { DemoDialog, FormField, Header, Note, Panel, SmallLabel, Status, inputCls, useFocusId } from './PhaseOne';
import { LoadError, Loading } from './PhaseThree';

const guestErr = (e: unknown) => {
  const m = String((e as { message?: string })?.message ?? e).toLowerCase();
  if (m.includes('invalid phone')) return 'Số điện thoại chưa hợp lệ.';
  if (m.includes('attending exceeds')) return 'Số người sẽ đến lớn hơn số người dự kiến.';
  if (m.includes('event not in wedding')) return 'Có buổi không thuộc đám cưới này (có thể vừa bị bỏ). Hãy tải lại trang.';
  if (m.includes('batch too large')) return `Mỗi lần nhập tối đa ${MAX_IMPORT_ROWS} khách.`;
  if (m.includes('invalid party')) return 'Có dòng có số người không hợp lệ.';
  return friendlyError(e);
};
const download = (name: string, text: string) => { const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));

function useGuestData() {
  const w = useMyWedding().data!;
  const gq = useQuery(guestsQuery(w.id)), eq = useQuery(eventsQuery(w.id));
  return { w, gq, eq, events: eq.data ?? [], guests: gq.data };
}
function GuestTabs({ active }: { active: 'list' | 'import' | 'export' }) {
  const t = [['list', '/guests', 'Sổ khách'], ['import', '/guests/import', 'Nhập CSV'], ['export', '/guests/export', 'Xuất CSV']] as const;
  return <nav aria-label="Sổ khách" className="mb-5 flex gap-2 overflow-x-auto">{t.map(([k, to, l]) => <Link key={k} to={to} aria-current={k === active ? 'page' : undefined} className={`min-h-11 shrink-0 rounded-full px-4 py-2.5 text-xs font-semibold ${k === active ? 'bg-foreground text-primary-foreground' : 'bg-card'}`}>{l}</Link>)}</nav>;
}

/* ================= Guest list ================= */
const emptyDraft = (events: EventRow[]): GuestDraft => ({ name: '', phone: '', side: 'nha-gai', party: '1', note: '', assignments: events.length === 1 ? [{ event_id: events[0]!.id, invite_status: 'not_sent', rsvp_status: 'pending', attending: '', invitation_method: 'not_invited', attendance_intent: 'unknown', expected: '', response_source: 'none' }] : [] });
const toDraft = (g: GuestRecord): GuestDraft => ({ name: g.name, phone: g.phone ?? '', side: g.side, party: String(g.party_size), note: g.note ?? '', assignments: g.assignments.map(a => ({ event_id: a.event_id, invite_status: a.invite_status, rsvp_status: a.rsvp_status, attending: a.attending_count == null ? '' : String(a.attending_count), invitation_method: methodOf(a), attendance_intent: intentOf(a), expected: a.expected_count == null ? '' : String(a.expected_count), response_source: a.response_source ?? (intentOf(a) === 'unknown' ? 'none' : 'manual') })) });

export function RealGuestsScreen() {
  const { w, gq, eq, events, guests } = useGuestData(); const qc = useQueryClient();
  const [f, setF] = useState<GuestFilter>({ q: '', side: 'all', eventId: 'all', status: 'all' });
  const [open, setOpen] = useState(false); const [editId, setEditId] = useState<string | null>(null);
  const [d, setD] = useState<GuestDraft>(emptyDraft([])); const [errs, setErrs] = useState<GuestErrors>({}); const [saveErr, setSaveErr] = useState(''); const [msg, setMsg] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const focusId = useFocusId(); const deepDone = useRef(false); const [missing, setMissing] = useState('');
  const openEdit = (g: GuestRecord) => { setEditId(g.id); setD(toDraft(g)); setErrs({}); setSaveErr(''); setConfirmDel(false); setOpen(true); };
  useEffect(() => { if (!focusId || deepDone.current || !guests) return; deepDone.current = true; const g = guests.find(x => x.id === focusId); if (g) openEdit(g); else setMissing('Không tìm thấy khách này trong sổ khách của hai bạn. Có thể khách đã bị xóa.'); }, [focusId, guests]);
  const save = useMutation({ mutationFn: () => saveGuest(w.id, editId, d), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['guests', w.id] }); setOpen(false); setMsg(editId ? `Đã lưu thay đổi cho ${d.name.trim()}.` : `Đã thêm ${d.name.trim()} vào sổ khách.`); }, onError: e => setSaveErr(guestErr(e)) });
  const del = useMutation({ mutationFn: () => deleteGuest(editId!), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['guests', w.id] }); setOpen(false); setMsg(`Đã xóa ${d.name.trim()} khỏi sổ khách.`); }, onError: e => setSaveErr(guestErr(e)) });
  const list = useMemo(() => filterGuests(guests ?? [], f), [guests, f]);
  if (gq.isPending || eq.isPending) return <Loading label="Đang tải sổ khách…" />;
  if (gq.isError || eq.isError) return <LoadError error={gq.error ?? eq.error} retry={() => { gq.refetch(); eq.refetch(); }} />;
  const all = guests ?? []; const tot = guestTotals(all); const shown = guestTotals(list); const followups = followupCount(all);
  const evName = (id: string) => events.find(e => e.id === id)?.name ?? 'Buổi đã bỏ';
  const submit = (e: React.FormEvent) => { e.preventDefault(); setSaveErr(''); const v = validateGuest(d); setErrs(v); if (Object.keys(v).length || save.isPending) return; save.mutate(); };
  const setA = (evId: string, patch: Partial<GuestDraft['assignments'][number]>) => setD(x => ({ ...x, assignments: x.assignments.map(a => a.event_id === evId ? { ...a, ...patch } : a) }));
  return <div className="max-w-4xl">
    <Header name="Sổ khách" subtitle="KHÁCH MỜI" /><GuestTabs active="list" />
    {missing && <p role="alert" className="mb-4 rounded-md bg-copper-soft p-3 text-sm font-semibold text-destructive">{missing}</p>}
    {msg && <p role="status" className="mb-4 rounded-md bg-sage p-3 text-sm font-semibold">{msg}</p>}
    <div className="grid gap-2 sm:grid-cols-3">
      <Panel className="p-3"><strong className="block font-display text-2xl">{tot.records}</strong><span className="text-xs">hồ sơ khách (mỗi khách một dòng)</span></Panel>
      <Panel className="p-3"><strong className="block font-display text-2xl">{tot.plannedPeople}</strong><span className="text-xs">người dự kiến (cộng số người của từng hồ sơ, không đếm lặp)</span></Panel>
      <Panel className="p-3"><strong className="block font-display text-2xl">{tot.unassigned}</strong><span className="text-xs">hồ sơ chưa mời buổi nào</span></Panel>
    </div>
    {events.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{events.map(ev => { const t = eventTotals(all, ev.id); return <Panel key={ev.id} className="p-3"><div className="text-sm font-semibold">{ev.name}</div><p className="text-xs text-muted-foreground">{t.records} hồ sơ · {t.plannedPeople} người dự kiến · {t.sent} đã gửi thiệp · {t.attendingPeople} người sẽ đến · {t.declined} hồ sơ không đến · {t.pending} chưa trả lời</p></Panel>; })}</div>}
    <Note>Một khách dự nhiều buổi vẫn là một hồ sơ. Cách mời và ý định dự được ghi riêng cho từng buổi; câu trả lời qua điện thoại cũng có thể lưu ở đây.</Note>
    <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={() => setF({ ...f, status: 'needs_followup' })}>Cần hỏi lại · {followups} hồ sơ</Button>
    <div className="mt-4 grid gap-2 sm:grid-cols-4">
      <label className="text-xs font-semibold sm:col-span-4">Tìm theo tên hoặc số điện thoại<input className={inputCls} value={f.q} onChange={e => setF({ ...f, q: e.target.value })} /></label>
      <label className="text-xs font-semibold">Nhà mời<select className={inputCls} value={f.side} onChange={e => setF({ ...f, side: e.target.value as GuestFilter['side'] })}><option value="all">Tất cả</option>{(Object.keys(GUEST_SIDE_TEXT) as GuestSideDb[]).map(s => <option key={s} value={s}>{GUEST_SIDE_TEXT[s]}</option>)}</select></label>
      <label className="text-xs font-semibold">Buổi<select className={inputCls} value={f.eventId} onChange={e => setF({ ...f, eventId: e.target.value })}><option value="all">Mọi buổi</option>{events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}</select></label>
      <label className="text-xs font-semibold sm:col-span-2">Trạng thái{f.eventId === 'all' ? ' (ở bất kỳ buổi nào)' : ''}<select className={inputCls} value={f.status} onChange={e => setF({ ...f, status: e.target.value as GuestFilter['status'] })}><option value="all">Tất cả</option><option value="needs_followup">Cần hỏi lại</option><option value="not_sent">Chưa gửi link</option><option value="sent">Đã gửi link</option><option value="pending">Chưa rõ / có thể đến</option><option value="attending">Xác nhận đến</option><option value="declined">Không đến</option></select></label>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><SmallLabel>{`ĐANG HIỆN ${shown.records} HỒ SƠ · ${shown.plannedPeople} NGƯỜI`}</SmallLabel>
      <Button size="lg" className="min-h-11" onClick={() => { setEditId(null); setD(emptyDraft(events)); setErrs({}); setSaveErr(''); setOpen(true); }}><Plus /> Thêm khách</Button></div>
    {all.length === 0 ? <Panel className="mt-3"><p className="text-sm">Sổ khách còn trống. Thêm từng khách, hoặc nhập nhiều khách một lúc từ file CSV.</p><Button asChild variant="outline" className="mt-3 min-h-11"><Link to="/guests/import"><Upload /> Nhập từ CSV</Link></Button></Panel>
      : list.length === 0 ? <Panel className="mt-3"><p className="text-sm">Không có khách nào khớp bộ lọc này.</p><Button variant="ghost" className="mt-2 min-h-11 px-0 text-primary" onClick={() => setF({ q: '', side: 'all', eventId: 'all', status: 'all' })}>Bỏ bộ lọc</Button></Panel>
      : <div className="mt-3 space-y-2">{list.map(g => <Panel key={g.id} item={g.id} className="p-3"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2"><div className="min-w-0"><div className="break-words font-semibold">{g.name}</div><p className="text-xs text-muted-foreground">{[g.phone, GUEST_SIDE_TEXT[g.side], `${g.party_size} người dự kiến`].filter(Boolean).join(' · ')}</p>
        <ul className="mt-1 space-y-0.5 text-xs">{g.assignments.length ? g.assignments.map(a => <li key={a.event_id}><strong>{evName(a.event_id)}:</strong> {METHOD_TEXT[methodOf(a)]} · {INTENT_TEXT[intentOf(a)]}{intentOf(a) === 'confirmed' ? ` · ${a.attending_count ?? a.expected_count ?? g.party_size} người` : ''}{needsFollowup(a) ? ' · Cần hỏi lại' : ''}{a.responded_at ? ` · cập nhật ${new Date(a.responded_at).toLocaleDateString('vi-VN')}` : ''}</li>) : <li className="text-muted-foreground">Chưa mời buổi nào</li>}</ul></div>
        <Button variant="outline" className="min-h-11" aria-label={`Sửa ${g.name}`} onClick={() => openEdit(g)}><Pencil /> Sửa</Button></div></Panel>)}</div>}
    <DemoDialog real busy={save.isPending} open={open} onOpenChange={o => { if (!save.isPending) setOpen(o); }} title={editId ? 'Sửa khách' : 'Thêm khách'} description="Lưu vào sổ khách của đám cưới. Nếu lưu lỗi, nội dung đang nhập vẫn được giữ." submitLabel={save.isPending ? 'Đang lưu…' : 'Lưu khách'} onSubmit={submit}>
      {saveErr && <p role="alert" className="rounded-md bg-copper-soft p-3 text-sm font-semibold text-destructive">{saveErr}</p>}
      <FormField label="Tên khách *" id="g-name" error={errs.name}><input id="g-name" className={inputCls} value={d.name} onChange={e => setD({ ...d, name: e.target.value })} /></FormField>
      <FormField label="Số điện thoại" id="g-phone" error={errs.phone}><input id="g-phone" inputMode="tel" className={inputCls} value={d.phone} onChange={e => setD({ ...d, phone: e.target.value })} /></FormField>
      <div className="grid grid-cols-2 gap-3"><FormField label="Nhà mời" id="g-side"><select id="g-side" className={inputCls} value={d.side} onChange={e => setD({ ...d, side: e.target.value as GuestSideDb })}>{(Object.keys(GUEST_SIDE_TEXT) as GuestSideDb[]).map(s => <option key={s} value={s}>{GUEST_SIDE_TEXT[s]}</option>)}</select></FormField>
        <FormField label="Số người dự kiến *" id="g-party" error={errs.party}><input id="g-party" inputMode="numeric" className={inputCls} value={d.party} onChange={e => setD({ ...d, party: e.target.value })} /></FormField></div>
      <fieldset><legend className="text-xs font-semibold">Mời dự buổi</legend>{events.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Chưa có buổi lễ nào. <Link className="text-primary underline" to="/wedding/events">Thêm buổi</Link></p>}
        <div className="mt-2 space-y-2">{events.map(ev => { const a = d.assignments.find(x => x.event_id === ev.id); return <div key={ev.id} className="rounded-md border border-border p-2">
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={!!a} onChange={e => setD(x => ({ ...x, assignments: e.target.checked ? [...x.assignments, { event_id: ev.id, invite_status: 'not_sent', rsvp_status: 'pending', attending: '', invitation_method: 'not_invited', attendance_intent: 'unknown', expected: '', response_source: 'none' }] : x.assignments.filter(y => y.event_id !== ev.id) }))} />{ev.name}</label>
          {a && <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs font-semibold">Đã mời bằng cách nào?<select className={inputCls} value={a.invitation_method ?? 'not_invited'} onChange={e => { const method = e.target.value as InvitationMethod; setA(ev.id, { invitation_method: method, invite_status: method === 'link_sent' ? 'sent' : 'not_sent' }); }}>{(Object.keys(METHOD_TEXT) as InvitationMethod[]).map(k => <option key={k} value={k}>{METHOD_TEXT[k]}</option>)}</select></label>
            <label className="text-xs font-semibold">Khách dự buổi này?<select className={inputCls} value={a.attendance_intent ?? 'unknown'} onChange={e => { const intent = e.target.value as AttendanceIntent; setA(ev.id, { attendance_intent: intent, rsvp_status: intent === 'confirmed' ? 'attending' : intent === 'declined' ? 'declined' : 'pending', attending: intent === 'confirmed' ? a.attending : '', response_source: intent === 'unknown' ? 'none' : 'manual' }); }}>{(Object.keys(INTENT_TEXT) as AttendanceIntent[]).map(k => <option key={k} value={k}>{INTENT_TEXT[k]}</option>)}</select></label>
            <label className="text-xs font-semibold">Số người dự kiến cho buổi này<input inputMode="numeric" placeholder={`Mặc định ${d.party || 1}`} className={inputCls} value={a.expected ?? ''} onChange={e => setA(ev.id, { expected: e.target.value, response_source: a.response_source === 'online_rsvp' ? 'manual' : a.response_source ?? 'none' })} /></label>
            {a.attendance_intent === 'confirmed' && <label className="text-xs font-semibold">Số người xác nhận đến<input inputMode="numeric" placeholder={`Mặc định ${a.expected || d.party || 1}`} className={inputCls} value={a.attending} onChange={e => setA(ev.id, { attending: e.target.value, response_source: a.response_source === 'online_rsvp' ? 'manual' : a.response_source ?? 'manual' })} /></label>}
            {a.attendance_intent !== 'unknown' && <label className="text-xs font-semibold sm:col-span-2">Biết câu trả lời qua đâu?<select className={inputCls} value={a.response_source ?? 'manual'} onChange={e => setA(ev.id, { response_source: e.target.value as ResponseSource })}>{(['manual','phone','in_person'] as ResponseSource[]).map(k => <option key={k} value={k}>{SOURCE_TEXT[k]}</option>)}{a.response_source === 'online_rsvp' && <option value="online_rsvp" disabled>{SOURCE_TEXT.online_rsvp} · đã đối chiếu</option>}</select></label>}</div>}
        </div>; })}</div>{errs.assignments && <p className="mt-1 text-xs font-semibold text-destructive">{errs.assignments}</p>}</fieldset>
      <FormField label="Ghi chú" id="g-note" error={errs.note}><textarea id="g-note" className={`${inputCls} min-h-20 py-2`} value={d.note} onChange={e => setD({ ...d, note: e.target.value })} /></FormField>
      {editId && (confirmDel ? <div className="rounded-md bg-copper-soft p-3 text-sm"><p>Xóa {d.name || 'khách này'} khỏi sổ và mọi buổi đã mời?</p><div className="mt-2 flex gap-2"><Button type="button" variant="destructive" className="min-h-11" disabled={del.isPending} onClick={() => del.mutate()}>{del.isPending ? 'Đang xóa…' : 'Xóa khách'}</Button><Button type="button" variant="outline" className="min-h-11" onClick={() => setConfirmDel(false)}>Giữ lại</Button></div></div>
        : <Button type="button" variant="ghost" className="min-h-11 px-0 text-destructive" onClick={() => setConfirmDel(true)}><Trash2 /> Xóa khách</Button>)}
    </DemoDialog>
  </div>;
}

/* ================= CSV import ================= */
export function RealCsvImportScreen() {
  const { w, gq, eq, events, guests } = useGuestData(); const qc = useQueryClient(); const navigate = useNavigate();
  const bq = useQuery(batchesQuery(w.id));
  const [step, setStep] = useState(0); const [file, setFile] = useState(''); const [table, setTable] = useState<CsvTable | null>(null);
  const [map, setMap] = useState<ColumnMap>({ name: '', phone: '', side: '', party: '' }); const [eventIds, setEventIds] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [page, setPage] = useState(0);
  const batchId = useRef<string>('');
  const commit = useMutation({
    mutationFn: () => { const sum = summarize(rows); const payload = importPayload(rows); return importGuestBatch({ batchId: batchId.current, weddingId: w.id, filename: file, eventIds, rows: payload, skipped: rows.length - payload.length - sum.invalid, invalid: sum.invalid }); },
    onSuccess: async r => { await Promise.all([qc.invalidateQueries({ queryKey: ['guests', w.id] }), qc.invalidateQueries({ queryKey: ['guest-batches', w.id] })]); navigate({ to: '/guests/import/$batch', params: { batch: r.batch_id } }); },
    onError: e => setError(`${guestErr(e)} Chưa có khách nào được thêm; bấm lại để thử — không bị thêm trùng.`),
  });
  if (gq.isPending || eq.isPending) return <Loading label="Đang tải sổ khách…" />;
  if (gq.isError || eq.isError) return <LoadError error={gq.error ?? eq.error} retry={() => { gq.refetch(); eq.refetch(); }} />;
  const load = (name: string, text: string) => {
    const t = parseCsv(text);
    if (!t.headers.length || !t.rows.length) { setError('File không có dòng dữ liệu nào. Hãy kiểm tra dòng tiêu đề và nội dung.'); return; }
    if (t.rows.length > MAX_IMPORT_ROWS) { setError(`File có ${t.rows.length} dòng. Mỗi lần nhập tối đa ${MAX_IMPORT_ROWS} dòng để lưu trọn vẹn trong một lần — hãy chia file thành nhiều phần. Tổng số khách không bị giới hạn.`); return; }
    setError(''); setFile(name); setTable(t); setMap(guessColumns(t.headers)); setEventIds(events.map(e => e.id)); setStep(1);
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) { setError('Chỉ nhận file .csv. Từ Excel, chọn Lưu thành → CSV UTF-8.'); return; }
    if (f.size > 1_000_000) { setError('File lớn hơn 1 MB.'); return; }
    setLoading(true); f.text().then(t => load(f.name, t)).catch(() => setError('Không đọc được file này.')).finally(() => setLoading(false));
  };
  const toReview = () => {
    if (!table) return;
    if (!map.name) { setError('Hãy chọn cột chứa tên khách.'); return; }
    if (!eventIds.length) { setError('Chọn ít nhất một buổi mời cho các khách này.'); return; }
    setError(''); setRows(buildPreview(table, map, (guests ?? []).map(g => ({ id: g.id, name: g.name, phone: g.phone ?? '' })))); setPage(0); setStep(2);
    batchId.current = newId();
  };
  const setDecision = (row: number, decision: CsvRow['decision']) => { batchId.current = newId(); setRows(rs => rs.map(r => (r.row === row ? { ...r, decision } : r))); };
  const sum = summarize(rows);
  return <div className="max-w-4xl">
    <Header name={step === 2 ? 'Kiểm tra trước khi thêm' : 'Nhập khách từ CSV'} subtitle={`NHẬP CSV · BƯỚC ${step + 1}/3`} /><GuestTabs active="import" />
    <div className="mb-5 flex gap-2" aria-label="Các bước">{['1 · Chọn file', '2 · Ghép cột', '3 · Kiểm tra'].map((x, i) => <span key={x} aria-current={i === step ? 'step' : undefined} className={`min-w-0 flex-1 rounded-full px-2 py-2 text-center text-[10px] font-semibold ${i <= step ? 'bg-foreground text-primary-foreground' : 'bg-card'}`}>{x}</span>)}</div>
    {error && <p role="alert" className="mb-4 rounded-md bg-copper-soft p-3 text-sm font-semibold text-destructive">{error}</p>}
    {step === 0 && <>
      <Note>File được đọc ngay trên máy của bạn, không tải lên đâu. Chỉ những dòng hai bạn xác nhận ở bước 3 mới được lưu vào sổ khách. Cột gợi ý: Họ và tên, Số điện thoại, Nhà mời, Số người. Số 0 đầu điện thoại được giữ nguyên.</Note>
      {events.length === 0 && <Note tone="warm">Cần có ít nhất một buổi lễ trước khi nhập khách. <Link className="underline" to="/wedding/events">Thêm buổi</Link></Note>}
      <Panel className="mt-4"><label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background p-5 text-center text-sm focus-within:ring-2 focus-within:ring-ring"><Upload className="size-6 text-primary" />{loading ? 'Đang đọc file…' : `Chọn file CSV (UTF-8, tối đa 1 MB, ${MAX_IMPORT_ROWS} dòng mỗi lần)`}<input type="file" accept=".csv,text/csv" className="sr-only" onChange={e => onFile(e.target.files?.[0])} /></label></Panel>
      <div className="mt-4 grid gap-2 sm:grid-cols-2"><Button variant="outline" size="lg" className="min-h-11" onClick={() => download('mau-khach-moi.csv', SAMPLE_CSV)}><Download /> Tải file mẫu</Button><Button variant="outline" size="lg" className="min-h-11" onClick={() => load('mau-khach-moi.csv', SAMPLE_CSV)}>Thử với file mẫu <ArrowRight /></Button></div>
      {(bq.data?.length ?? 0) > 0 && <div className="mt-6"><SmallLabel>CÁC LẦN NHẬP TRƯỚC</SmallLabel><div className="space-y-2">{bq.data!.map(b => <Panel key={b.id} className="p-3"><Link to="/guests/import/$batch" params={{ batch: b.id }} className="flex min-h-11 items-center justify-between gap-2 text-sm"><span className="min-w-0 break-words">{b.filename || 'File CSV'} · {b.added_count} khách · {new Date(b.created_at).toLocaleString('vi-VN')}{b.undone_at ? ' · đã hoàn tác' : ''}</span><ArrowRight className="size-4 shrink-0" /></Link></Panel>)}</div></div>}
    </>}
    {step === 1 && table && <>
      <Panel><h2 className="text-xl">{file} · {table.rows.length} dòng</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{([['name', 'Cột tên khách *'], ['phone', 'Cột điện thoại'], ['side', 'Cột nhà mời'], ['party', 'Cột số người']] as const).map(([k, label]) => <label key={k} className="block text-xs font-semibold">{label}<select className={inputCls} value={map[k]} onChange={e => setMap({ ...map, [k]: e.target.value })}><option value="">— Không dùng —</option>{table.headers.map(h => <option key={h} value={h}>{h}</option>)}</select></label>)}</div>
        <fieldset className="mt-4"><legend className="text-xs font-semibold">Mời các khách này dự buổi *</legend><div className="mt-2 grid gap-1 sm:grid-cols-2">{events.map(ev => <label key={ev.id} className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={eventIds.includes(ev.id)} onChange={e => setEventIds(e.target.checked ? [...eventIds, ev.id] : eventIds.filter(x => x !== ev.id))} />{ev.name}</label>)}</div></fieldset>
      </Panel>
      <Button size="lg" className="mt-5 min-h-11 w-full" onClick={toReview}>Kiểm tra dữ liệu <ArrowRight /></Button>
      <Button variant="ghost" size="lg" className="mt-2 min-h-11 w-full" onClick={() => setStep(0)}>Chọn file khác</Button>
    </>}
    {step === 2 && <>
      <div className="grid grid-cols-3 gap-2" aria-live="polite">{[[sum.valid, 'dòng hợp lệ'], [sum.invalid, 'dòng lỗi'], [sum.possibleDuplicates, 'dòng nghi trùng']].map(([n, l]) => <Panel key={l} className="p-3 text-center"><strong className="block font-display text-2xl">{n}</strong><span className="text-xs">{l}</span></Panel>)}</div>
      <Note tone="warm">Dòng nghi trùng (trùng số điện thoại hoặc trùng tên) mặc định <strong>bỏ qua</strong> và không bao giờ tự gộp; chỉ thêm khi hai bạn chọn “Thêm”. Dòng lỗi cần sửa trong file gốc.</Note>
      {(() => { const pg = pageSlice(rows, page); const pc = pageCount(rows.length); const nav = (pos: string) => pc > 1 && <nav aria-label={`Trang xem trước ${pos}`} className="my-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2"><Button variant="outline" className="min-h-11" disabled={pg.page === 0} onClick={() => setPage(pg.page - 1)}>Trang trước</Button><span className="text-center text-xs font-semibold">Trang {pg.page + 1}/{pc}</span><Button variant="outline" className="min-h-11" disabled={pg.page >= pc - 1} onClick={() => setPage(pg.page + 1)}>Trang sau</Button></nav>; return <>
        <SmallLabel>{`DÒNG ${pg.from}–${pg.to} / ${rows.length} · MỖI TRANG ${PREVIEW_LIMIT} DÒNG`}</SmallLabel>
        {pc > 1 && <p className="mb-2 text-xs text-muted-foreground">Các con số tính trên toàn file {rows.length} dòng. Hãy xem các trang để chọn từng dòng.</p>}
        {nav('trên')}
        <div className="space-y-2">{pg.rows.map(r => <Panel key={r.row} className="p-3"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"><div className="min-w-0"><div className="break-words text-sm font-semibold">Dòng {r.row} · {r.name || '(không tên)'}</div>
          <p className="text-xs text-muted-foreground">{[r.phone, r.side, `${r.party} người`].filter(Boolean).join(' · ')}</p>
          {r.errors.length > 0 && <p className="text-xs font-semibold text-destructive">{r.errors.join('; ')}</p>}
          {r.duplicateOf && <p className="text-xs font-semibold text-primary">Có thể trùng với “{r.duplicateOf}” ({r.duplicateReason === 'phone' ? 'cùng số điện thoại' : 'cùng tên'}) — chỉ là gợi ý</p>}</div>
          {r.errors.length ? <Status tone="copper">Lỗi</Status> : <select aria-label={`Quyết định dòng ${r.row}`} className="h-11 rounded-md border border-border bg-background px-2 text-xs" value={r.decision} onChange={e => setDecision(r.row, e.target.value as CsvRow['decision'])}><option value="add">Thêm</option><option value="skip">Bỏ qua</option></select>}
        </div></Panel>)}</div>{nav('dưới')}</>; })()}
      <Button size="lg" className="mt-5 min-h-11 w-full" disabled={commit.isPending || sum.toAdd === 0} onClick={() => { setError(''); commit.mutate(); }}>{commit.isPending ? <><Loader2 className="animate-spin" /> Đang lưu…</> : <>Thêm {sum.toAdd} khách vào sổ <Check /></>}</Button>
      {sum.toAdd === 0 && <p className="mt-2 text-xs text-muted-foreground">Chưa có dòng nào được chọn “Thêm”.</p>}
      <Button variant="ghost" size="lg" className="mt-2 min-h-11 w-full" disabled={commit.isPending} onClick={() => setStep(1)}>Quay lại ghép cột</Button>
    </>}
  </div>;
}

export function RealCsvBatchScreen() {
  const w = useMyWedding().data!; const id = useFocusId() ?? ''; const qc = useQueryClient();
  const bq = useQuery(batchesQuery(w.id));
  const cq = useQuery({ queryKey: ['guest-batch-changed', id], queryFn: () => batchChangedCount(id), enabled: !!id });
  const [err, setErr] = useState('');
  const undo = useMutation({ mutationFn: () => undoGuestBatch(id), onSuccess: async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['guests', w.id] }), qc.invalidateQueries({ queryKey: ['guest-batches', w.id] }), qc.invalidateQueries({ queryKey: ['guest-batch-changed', id] })]); }, onError: e => setErr(guestErr(e)) });
  if (bq.isPending) return <Loading label="Đang tải kết quả nhập…" />;
  if (bq.isError) return <LoadError error={bq.error} retry={() => bq.refetch()} />;
  const b = bq.data.find(x => x.id === id);
  if (!b) return <div className="max-w-3xl"><Header name="Kết quả nhập" subtitle="NHẬP CSV" /><Note tone="warm">Không tìm thấy lần nhập này trong đám cưới của hai bạn.</Note><Button asChild size="lg" className="mt-5 min-h-11 w-full"><Link to="/guests/import">Nhập file CSV</Link></Button></div>;
  const changed = cq.data?.changed ?? 0;
  return <div className="max-w-3xl"><Header name="Kết quả nhập" subtitle="NHẬP CSV · BƯỚC 3/3" /><GuestTabs active="import" />
    <Panel className="bg-foreground text-primary-foreground"><div className="text-xs">{b.filename || 'File CSV'} · {new Date(b.created_at).toLocaleString('vi-VN')}</div><div className="mt-1 font-display text-4xl">{b.undone_at ? 'Đã hoàn tác' : `${b.added_count} khách đã thêm`}</div><p className="mt-2 text-xs">{b.added_count} hồ sơ đã lưu · {b.skipped_count} dòng bỏ qua · {b.invalid_count} dòng lỗi</p></Panel>
    {err && <p role="alert" className="mt-3 rounded-md bg-copper-soft p-3 text-sm font-semibold text-destructive">{err}</p>}
    {b.undone_at && <p role="status" className="mt-3 rounded-md bg-sage p-3 text-sm font-semibold">Đã bỏ {b.undo_removed ?? 0} khách chưa sửa.{b.undo_kept ? ` Giữ lại ${b.undo_kept} khách đã được sửa sau khi nhập.` : ''}{b.undo_missing ? ` ${b.undo_missing} khách đã được xóa trước đó.` : ''}</p>}
    {!b.undone_at && changed > 0 && <Note tone="warm">{changed} khách trong lần nhập này đã được sửa sau đó (thông tin, thiệp hoặc trả lời). Hoàn tác sẽ giữ lại những khách này, chỉ bỏ khách chưa sửa.</Note>}
    {!b.undone_at && <Button variant="outline" size="lg" className="mt-4 min-h-11 w-full" disabled={undo.isPending} onClick={() => { setErr(''); undo.mutate(); }}>{undo.isPending ? <Loader2 className="animate-spin" /> : <Undo2 />} Hoàn tác lần nhập này</Button>}
    <Button asChild size="lg" className="mt-3 min-h-11 w-full"><Link to="/guests">Về sổ khách <ArrowRight /></Link></Button>
    <Button asChild variant="ghost" size="lg" className="mt-2 min-h-11 w-full"><Link to="/guests/import">Nhập thêm file khác</Link></Button>
  </div>;
}

/* ================= Export ================= */
export function RealGuestsExportScreen() {
  const { gq, eq, events } = useGuestData(); const [done, setDone] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  if (gq.isPending || eq.isPending) return <Loading label="Đang tải sổ khách…" />;
  if (gq.isError || eq.isError) return <LoadError error={gq.error ?? eq.error} retry={() => { gq.refetch(); eq.refetch(); }} />;
  const run = async () => {
    setBusy(true); setDone(''); setErr('');
    try {
      const fresh = await gq.refetch(); const ev = await eq.refetch();
      if (fresh.isError || ev.isError || !fresh.data) throw fresh.error ?? ev.error ?? new Error('load');
      download(`so-khach-${new Date().toISOString().slice(0, 10)}.csv`, guestsCsv(fresh.data, ev.data ?? []));
      setDone(`Đã tạo file CSV với ${fresh.data.length} hồ sơ khách (${guestTotals(fresh.data).plannedPeople} người dự kiến) từ sổ khách đã lưu.`);
    } catch (e) { setErr(`Chưa tạo được file: ${friendlyError(e)}`); } finally { setBusy(false); }
  };
  const t = guestTotals(gq.data ?? []);
  return <div className="max-w-3xl"><Header name="Xuất danh sách khách" subtitle="KHÁCH MỜI" /><GuestTabs active="export" />
    <Panel><p className="text-sm">{t.records} hồ sơ khách · {t.plannedPeople} người dự kiến · {events.length} buổi</p><p className="mt-1 text-xs text-muted-foreground">File gồm tên, số điện thoại, nhà mời, số người, ghi chú và trạng thái thiệp/trả lời theo từng buổi.</p>
      <Button size="lg" className="mt-4 min-h-11 w-full" disabled={busy || t.records === 0} onClick={run}>{busy ? <Loader2 className="animate-spin" /> : <Download />} Tải file CSV</Button>
      {t.records === 0 && <p className="mt-2 text-xs text-muted-foreground">Sổ khách còn trống nên chưa có gì để xuất.</p>}</Panel>
    {done && <p role="status" className="mt-3 rounded-md bg-sage p-3 text-sm font-semibold">{done}</p>}
    {err && <p role="alert" className="mt-3 rounded-md bg-copper-soft p-3 text-sm font-semibold text-destructive">{err}</p>}
    <Note tone="warm">File có số điện thoại của khách. Hãy giữ riêng tư, chỉ chia sẻ với người cần. Ô bắt đầu bằng = + - @ được thêm dấu ’ để bảng tính không chạy như công thức.</Note>
  </div>;
}

/* Home summary */
export function useGuestSummary() { const w = useMyWedding().data!; return useQuery(guestsQuery(w.id)); }
