import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, Check, Download, Plus, Undo2, Upload } from 'lucide-react';
import { useDemoSession } from '@/lib/demo-session';
import { buildPreview, guessColumns, parseCsv, summarize, PREVIEW_LIMIT, SAMPLE_CSV, SUGGESTED_TASKS, matchResponse, canClientSet, type ColumnMap, type CsvRow, type CsvTable, type OrderStatus } from '@/lib/phase2';
import { Action, DemoAction, DemoDialog, Header, Note, Panel, Row, SmallLabel, Status, inputCls, initialGuests, validGuests, initialTasks, validTasks, readDemoReceipt, useEventNames, type DemoGuest, type DemoTask } from './PhaseOne';

/* ---------------- CSV import ---------------- */
type DemoBatch = { id: string; filename: string; addedIds: string[]; skipped: number; invalid: number; undone: boolean; at: string };
const validBatch = (v: unknown): v is DemoBatch | null => v === null || (!!v && typeof (v as DemoBatch).id === 'string' && Array.isArray((v as DemoBatch).addedIds));

export function CsvImportScreen() {
  const [guests, setGuests] = useDemoSession<DemoGuest[]>('guests', initialGuests, validGuests);
  const [, setBatch] = useDemoSession<DemoBatch | null>('csv-batch', null, validBatch);
  const events = useEventNames();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState('');
  const [table, setTable] = useState<CsvTable | null>(null);
  const [map, setMap] = useState<ColumnMap>({ name: '', phone: '', side: '', party: '' });
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = (name: string, text: string) => {
    const t = parseCsv(text);
    if (!t.headers.length || !t.rows.length) { setError('File không có dòng dữ liệu nào. Hãy kiểm tra dòng tiêu đề và nội dung.'); return; }
    if (t.rows.length > 2000) { setError('File quá dài (tối đa 2.000 dòng trong bản dùng thử).'); return; }
    setError(''); setFile(name); setTable(t); setMap(guessColumns(t.headers)); setEventIds(events.map(e => e.id)); setStep(1);
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) { setError('Chỉ nhận file .csv. Từ Excel, chọn Lưu thành → CSV UTF-8.'); return; }
    if (f.size > 1_000_000) { setError('File lớn hơn 1 MB.'); return; }
    setLoading(true);
    f.text().then(t => load(f.name, t)).catch(() => setError('Không đọc được file này.')).finally(() => setLoading(false));
  };
  const toReview = () => {
    if (!table) return;
    if (!map.name) { setError('Hãy chọn cột chứa tên khách.'); return; }
    if (!eventIds.length) { setError('Chọn ít nhất một buổi mời cho các khách này.'); return; }
    setError('');
    setRows(buildPreview(table, map, guests.map(g => ({ id: g.id, name: g.name, phone: g.phone }))));
    setStep(2);
  };
  const sum = summarize(rows);
  const commit = () => {
    const stamp = Date.now();
    const add = rows.filter(r => r.decision === 'add' && !r.errors.length);
    const created: DemoGuest[] = add.map((r, i) => ({ id: `csv${stamp}-${i}`, name: r.name, phone: r.phone, side: r.side, events: eventIds, party: r.party, state: 'Chưa gửi', added: true }));
    setGuests(g => [...created, ...g]);
    setBatch({ id: `b${stamp}`, filename: file, addedIds: created.map(c => c.id), skipped: rows.length - add.length - sum.invalid, invalid: sum.invalid, undone: false, at: new Date().toISOString() });
    navigate({ to: '/guests/import/$batch', params: { batch: 'demo-batch' } });
  };
  const setDecision = (row: number, decision: CsvRow['decision']) => setRows(rs => rs.map(r => (r.row === row ? { ...r, decision } : r)));

  return <div className="max-w-4xl">
    <Header name={step === 2 ? 'Kiểm tra trước khi thêm' : 'Nhập khách từ CSV'} subtitle={`NHẬP CSV · BƯỚC ${step + 1}/3`} />
    <div className="mb-5 flex gap-2" aria-label="Các bước">{['1 · Chọn file', '2 · Ghép cột', '3 · Kiểm tra'].map((x, i) => <span key={x} aria-current={i === step ? 'step' : undefined} className={`min-w-0 flex-1 rounded-full px-2 py-2 text-center text-[10px] font-semibold ${i <= step ? 'bg-foreground text-primary-foreground' : 'bg-card'}`}>{x}</span>)}</div>
    {error && <p role="alert" className="mb-4 rounded-md bg-copper-soft p-3 text-sm font-semibold text-destructive">{error}</p>}
    {step === 0 && <>
      <Note>File được đọc ngay trên máy của bạn, không tải lên đâu. Cột gợi ý: Họ và tên, Số điện thoại, Nhà mời, Số người. Số 0 đầu điện thoại được giữ nguyên.</Note>
      <Panel className="mt-4">
        <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background p-5 text-center text-sm focus-within:ring-2 focus-within:ring-ring">
          <Upload className="size-6 text-primary" />{loading ? 'Đang đọc file…' : 'Chọn file CSV (UTF-8, tối đa 1 MB)'}
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={e => onFile(e.target.files?.[0])} />
        </label>
      </Panel>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <DemoAction variant="outline" onClick={() => { const url = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'mau-khach-moi.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}><Download /> Tải file mẫu</DemoAction>
        <DemoAction variant="outline" onClick={() => load('mau-khach-moi.csv', SAMPLE_CSV)}>Thử với file mẫu <ArrowRight /></DemoAction>
      </div>
    </>}
    {step === 1 && table && <>
      <Panel>
        <h2 className="text-xl">{file} · {table.rows.length} dòng</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {([['name', 'Cột tên khách *'], ['phone', 'Cột điện thoại'], ['side', 'Cột nhà mời'], ['party', 'Cột số người']] as const).map(([k, label]) => <label key={k} className="block text-xs font-semibold">{label}
            <select className={inputCls} value={map[k]} onChange={e => setMap({ ...map, [k]: e.target.value })}><option value="">— Không dùng —</option>{table.headers.map(h => <option key={h} value={h}>{h}</option>)}</select></label>)}
        </div>
        <fieldset className="mt-4"><legend className="text-xs font-semibold">Mời các khách này dự buổi *</legend>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">{events.map(ev => <label key={ev.id} className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={eventIds.includes(ev.id)} onChange={e => setEventIds(e.target.checked ? [...eventIds, ev.id] : eventIds.filter(x => x !== ev.id))} />{ev.name}</label>)}</div>
        </fieldset>
      </Panel>
      <DemoAction className="mt-5 w-full" onClick={toReview}>Kiểm tra dữ liệu <ArrowRight /></DemoAction>
      <DemoAction variant="ghost" className="mt-2 w-full" onClick={() => setStep(0)}>Chọn file khác</DemoAction>
    </>}
    {step === 2 && <>
      <div className="grid grid-cols-3 gap-2" aria-live="polite">
        {[[sum.valid, 'hợp lệ'], [sum.invalid, 'lỗi'], [sum.possibleDuplicates, 'nghi trùng']].map(([n, l]) => <Panel key={l} className="p-3 text-center"><strong className="block font-display text-2xl">{n}</strong><span className="text-xs">{l}</span></Panel>)}
      </div>
      <Note tone="warm">Dòng nghi trùng mặc định <strong>bỏ qua</strong>; chỉ thêm khi hai bạn chọn. Dòng lỗi cần sửa trong file gốc.</Note>
      <SmallLabel>{rows.length > PREVIEW_LIMIT ? `XEM TRƯỚC ${PREVIEW_LIMIT}/${rows.length} DÒNG ĐẦU` : `XEM TRƯỚC ${rows.length} DÒNG`}</SmallLabel>
      <div className="space-y-2">{rows.slice(0, PREVIEW_LIMIT).map(r => <Panel key={r.row} className="p-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="min-w-0"><div className="break-words text-sm font-semibold">Dòng {r.row} · {r.name || '(không tên)'}</div>
            <p className="text-xs text-muted-foreground">{[r.phone, r.side, `${r.party} người`].filter(Boolean).join(' · ')}</p>
            {r.errors.length > 0 && <p className="text-xs font-semibold text-destructive">{r.errors.join('; ')}</p>}
            {r.duplicateOf && <p className="text-xs font-semibold text-primary">Có thể trùng với “{r.duplicateOf}”</p>}</div>
          {r.errors.length ? <Status tone="copper">Lỗi</Status> :
            <select aria-label={`Quyết định dòng ${r.row}`} className="h-11 rounded-md border border-border bg-background px-2 text-xs" value={r.decision} onChange={e => setDecision(r.row, e.target.value as CsvRow['decision'])}><option value="add">Thêm</option><option value="skip">Bỏ qua</option></select>}
        </div></Panel>)}</div>
      <DemoAction className="mt-5 w-full" onClick={commit}>Thêm {sum.toAdd} khách vào sổ (trong phiên) <Check /></DemoAction>
      <DemoAction variant="ghost" className="mt-2 w-full" onClick={() => setStep(1)}>Quay lại ghép cột</DemoAction>
    </>}
  </div>;
}

export function CsvBatchScreen() {
  const [batch, setBatch] = useDemoSession<DemoBatch | null>('csv-batch', null, validBatch);
  const [, setGuests] = useDemoSession<DemoGuest[]>('guests', initialGuests, validGuests);
  if (!batch) return <div className="max-w-3xl"><Header name="Kết quả nhập" subtitle="NHẬP CSV" /><Note tone="warm">Chưa có lần nhập nào trong phiên xem này.</Note><Action to="/guests/import" className="mt-5 w-full">Nhập file CSV</Action></div>;
  const undo = () => { const ids = new Set(batch.addedIds); setGuests(g => g.filter(x => !ids.has(x.id))); setBatch({ ...batch, undone: true }); };
  return <div className="max-w-3xl"><Header name="Kết quả nhập" subtitle="NHẬP CSV · BƯỚC 3/3" />
    <Panel className="bg-foreground text-primary-foreground"><div className="text-xs">{batch.filename}</div><div className="mt-1 font-display text-4xl">{batch.undone ? 'Đã hoàn tác' : `${batch.addedIds.length} khách đã thêm`}</div><p className="mt-2 text-xs">{batch.skipped} dòng bỏ qua · {batch.invalid} dòng lỗi · chỉ trong phiên xem này</p></Panel>
    {!batch.undone && <DemoAction variant="outline" className="mt-4 w-full" onClick={undo}><Undo2 /> Hoàn tác lần nhập này</DemoAction>}
    <Action to="/guests" className="mt-3 w-full">Về sổ khách <ArrowRight /></Action>
  </div>;
}

/* ---------------- Suggested tasks ---------------- */
export function SuggestionLibrary({ autoOpen = false }: { autoOpen?: boolean }) {
  const [tasks, setTasks] = useDemoSession<DemoTask[]>('tasks', initialTasks, validTasks);
  const [open, setOpen] = useState(autoOpen);
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const existing = new Set(tasks.map(t => t.title));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const add = SUGGESTED_TASKS.filter(s => picked.includes(s.id) && !existing.has(s.title));
    if (!add.length) { setMsg('Hãy chọn ít nhất một việc chưa có.'); return; }
    setTasks(t => [...t, ...add.map((s, i) => ({ id: `sg${Date.now()}-${i}`, title: s.title, event: 'Mọi buổi', due: '', owner: 'Cả hai', status: 'Cần làm' as const, tag: 'Chưa hẹn', bucket: 'Sắp tới' as const, added: true }))]);
    setOpen(false); setPicked([]); setMsg(`Đã thêm ${add.length} việc gợi ý vào danh sách (trong phiên).`);
  };
  return <div className="mt-4"><Panel><h2 className="text-xl">Thư viện 43 việc gợi ý</h2><p className="mt-1 text-xs text-muted-foreground">Chỉ thêm những việc hai bạn chọn.</p><DemoAction variant="outline" className="mt-3" onClick={() => { setMsg(''); setOpen(true); }}><Plus /> Chọn việc gợi ý</DemoAction>{msg && <p role="status" className="mt-2 text-xs font-semibold text-sage-strong">{msg}</p>}</Panel>
    <DemoDialog open={open} onOpenChange={setOpen} title="Việc gợi ý" description="Đánh dấu việc muốn thêm. Việc đã có sẽ không thêm lại." submitLabel={`Thêm ${picked.length} việc`} onSubmit={submit}>
      {(['Sớm', '3 tháng trước', '1 tháng trước', 'Tuần cưới'] as const).map(phase => <fieldset key={phase}><legend className="text-xs font-bold uppercase text-primary">{phase}</legend><div className="mt-1 space-y-1">{SUGGESTED_TASKS.filter(s => s.phase === phase).map(s => { const has = existing.has(s.title); return <label key={s.id} className={`flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-sm ${has ? 'opacity-60' : ''}`}><input type="checkbox" className="size-4 accent-primary" disabled={has} checked={has || picked.includes(s.id)} onChange={e => setPicked(e.target.checked ? [...picked, s.id] : picked.filter(x => x !== s.id))} />{s.title}{has ? ' · đã có' : ''}</label>; })}</div></fieldset>)}
    </DemoDialog></div>;
}

/* ---------------- RSVP reconciliation ---------------- */
type Resp = { id: string; name: string; phone?: string; link: string; answer: string };
type Links = Record<string, string | 'separate'>;
const SAMPLE_RESPONSES: Resp[] = [
  { id: 'r1', name: 'Mai Nguyễn', link: 'Link chung', answer: 'Lễ gia tiên: Có đến · 2 người · Tiệc tối: Không đến' },
  { id: 'r2', name: 'Quang Tùng', link: 'Link chung', answer: 'Tiệc tối: Có đến · 1 người' },
];
const validLinks = (v: unknown): v is Links => !!v && typeof v === 'object' && !Array.isArray(v);

export function OwnerRsvpReconcile() {
  const [guests, setGuests] = useDemoSession<DemoGuest[]>('guests', initialGuests, validGuests);
  const [links, setLinks] = useDemoSession<Links>('rsvp-links', {}, validLinks);
  const [responses, setResponses] = useState<Resp[]>(SAMPLE_RESPONSES);
  const [choice, setChoice] = useState<Record<string, string>>({});
  useEffect(() => {
    const extra: Resp[] = [];
    try { for (const k of Object.keys(sessionStorage)) if (k.startsWith('rsvp-demo:')) { const tok = k.slice(10); const r = readDemoReceipt(tok); if (r) extra.push({ id: `tab-${tok}`, name: r.name, link: `Link ${tok}`, answer: Object.values(r.answers).map(a => (a.choice === 'yes' ? `Có đến · ${a.count} người` : 'Không đến')).join(' · ') }); } } catch { /* storage unavailable */ }
    setResponses([...extra, ...SAMPLE_RESPONSES]);
  }, []);
  const pending = responses.filter(r => !links[r.id]);
  const done = responses.filter(r => links[r.id]);
  const confirm = (r: Resp) => { const id = choice[r.id]; if (!id) return; setLinks(l => ({ ...l, [r.id]: id })); if (id !== 'separate') setGuests(g => g.map(x => (x.id === id ? { ...x, state: r.answer.includes('Có đến') ? 'Có đến' : 'Không đến' } : x))); };
  const setManual = (id: string, state: string) => setGuests(g => g.map(x => (x.id === id ? { ...x, state } : x)));
  return <div className="max-w-4xl"><Header name="Phản hồi tham dự" subtitle="PHẢN HỒI THAM DỰ" />
    <p className="-mt-3 mb-5 text-muted-foreground">Nối từng phản hồi với khách trong sổ. Tên trùng không bao giờ tự gộp.</p>
    <SmallLabel>CẦN ĐỐI CHIẾU · {pending.length}</SmallLabel>
    {pending.length === 0 && <Note>Mọi phản hồi đã được đối chiếu.</Note>}
    <div className="space-y-3">{pending.map(r => { const m = matchResponse(r, guests.map(g => ({ id: g.id, name: g.name, phone: g.phone }))); const cands = m.kind === 'exact' ? [m.guestId] : m.kind === 'ambiguous' ? m.guestIds : []; return <Panel key={r.id}>
      <div className="font-display text-lg font-semibold">{r.name} · {r.link}</div><p className="text-xs text-muted-foreground">{r.answer}</p><p className="mt-1 text-xs font-semibold text-primary">{m.reason}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><select aria-label={`Nối phản hồi của ${r.name}`} className={inputCls + ' mt-0'} value={choice[r.id] ?? ''} onChange={e => setChoice({ ...choice, [r.id]: e.target.value })}><option value="">— Chọn khách trong sổ —</option>{cands.length > 0 && <optgroup label="Gợi ý">{cands.map(id => { const g = guests.find(x => x.id === id); return g ? <option key={id} value={id}>{g.name} · {g.side}</option> : null; })}</optgroup>}<optgroup label="Tất cả khách">{guests.filter(g => !cands.includes(g.id)).map(g => <option key={g.id} value={g.id}>{g.name} · {g.side}</option>)}</optgroup><option value="separate">Giữ riêng, không nối với ai</option></select><DemoAction className="sm:mt-0" onClick={() => confirm(r)}>Xác nhận</DemoAction></div>
    </Panel>; })}</div>
    {done.length > 0 && <><div className="mt-6"><SmallLabel>ĐÃ ĐỐI CHIẾU · {done.length}</SmallLabel></div><Panel>{done.map(r => <Row key={r.id} title={r.name} detail={links[r.id] === 'separate' ? 'Giữ riêng' : `Nối với ${guests.find(g => g.id === links[r.id])?.name ?? 'khách đã xóa'}`} right={<DemoAction variant="ghost" onClick={() => setLinks(l => { const n = { ...l }; delete n[r.id]; return n; })}>Bỏ nối</DemoAction>} />)}</Panel></>}
    <div className="mt-6"><SmallLabel>CẬP NHẬT THỦ CÔNG</SmallLabel></div>
    <Panel>{guests.map(g => <div key={g.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border py-2 last:border-0"><span className="min-w-0 break-words text-sm">{g.name}</span><select aria-label={`Trạng thái của ${g.name}`} className="h-11 rounded-md border border-border bg-background px-2 text-xs" value={g.state} onChange={e => setManual(g.id, e.target.value)}>{['Chưa gửi', 'Chưa trả lời', 'Có đến', 'Không đến'].map(s => <option key={s}>{s}</option>)}</select></div>)}<p className="mt-2 text-xs text-muted-foreground">Nguồn cập nhật: hai bạn nhập tay (trong phiên).</p></Panel>
    <p className="mt-4 text-xs text-muted-foreground">Phản hồi mẫu và phản hồi thử trong tab này; chưa có phản hồi thật từ khách.</p>
  </div>;
}

/* ---------------- Order status ---------------- */
const LABEL: Record<OrderStatus, string> = { order_pending: 'Đang chờ chuyển khoản', verifying: 'Đang xác minh', needs_support: 'Cần hỗ trợ', paid_verified: 'Đã xác minh' };
const validOrder = (v: unknown): v is OrderStatus => typeof v === 'string' && v in LABEL;
export function OrderStatusDemo() {
  const [status, setStatus] = useDemoSession<OrderStatus>('order', 'order_pending', validOrder);
  return <Panel className="mt-4"><SmallLabel>TRẠNG THÁI ĐƠN MINH HỌA</SmallLabel><div role="status" className="font-display text-2xl">{LABEL[status]}</div>
    <p className="mt-1 text-xs text-muted-foreground">{status === 'verifying' ? 'Trong bản thật, hệ thống tự đối chiếu giao dịch; trang này không tự chuyển sang đã trả.' : status === 'needs_support' ? 'Trong bản thật, hai bạn gửi mã đơn để được hỗ trợ. Bản dùng thử chưa có kênh hỗ trợ.' : 'Chưa ghi nhận giao dịch.'}</p>
    <div className="mt-3 flex flex-wrap gap-2">{(['order_pending', 'verifying', 'needs_support'] as OrderStatus[]).filter(s => s !== status).map(s => <DemoAction key={s} variant="outline" onClick={() => canClientSet(status, s) && setStatus(s)} className={canClientSet(status, s) ? '' : 'hidden'}>Xem “{LABEL[s]}”</DemoAction>)}
      </div>
    <p className="mt-2 text-xs text-muted-foreground">Trạng thái “Đã xác minh” chỉ có thể đến từ giao dịch thật được hệ thống xác nhận, không bật được trong bản dùng thử.</p></Panel>;
}
