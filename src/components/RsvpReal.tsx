/** Real RSVP: guest form + receipt (public, server-verified) and owner reconcile screen. */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WriteButton } from './AccessStateBanner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { eventsQuery, useMyWedding } from '@/lib/wedding-api';
import { guestsQuery } from '@/lib/guests-api';
import { LINK_LABEL, LINK_SIDES, type LinkSide } from '@/lib/invitation';
import { MAX_PARTY, activeResponses, groupOf, hasErrors, phoneSuggestions, rsvpCounts, toAnswers, validateRsvp, type ResponseRow, type RsvpErrors, type RsvpForm } from '@/lib/rsvp';
import { getRsvpReceipt, submitRsvp, type RsvpReceipt } from '@/lib/rsvp.functions';
import { FormField, Header, Note, Panel, SmallLabel, Status, inputCls } from './PhaseOne';
import { LoadError, Loading } from './PhaseThree';

const codeKey = (token: string) => `rsvp-edit:${token}`;
const readCode = (token: string) => { try { return localStorage.getItem(codeKey(token)); } catch { return null; } };
type PubEvent = { id: string; name: string; date: string | null; time: string | null };

/* ================= Guest: form ================= */
export function GuestRsvpForm({ token, events }: { token: string; events: PubEvent[] }) {
  const nav = useNavigate(); const ids = events.map(e => e.id);
  const [code, setCode] = useState<string | null>(null);
  const [form, setForm] = useState<RsvpForm>({ name: '', phone: '', note: '', answers: Object.fromEntries(ids.map(id => [id, { attending: null, party: '1' }])) });
  const [errs, setErrs] = useState<RsvpErrors>({}); const [fail, setFail] = useState('');
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  useEffect(() => { const c = readCode(token); setCode(c); if (c) getRsvpReceipt({ data: { token, editCode: c } }).then(r => {
    if (!r) { setCode(null); return; }
    setForm(f => ({ ...f, name: r.guest_name, phone: r.phone ?? '', note: r.note ?? '', answers: Object.fromEntries(ids.map(id => { const a = r.answers.find(x => x.event_id === id); return [id, a ? { attending: a.attending, party: String(a.party_size ?? 1) } : { attending: null, party: '1' }]; })) }));
  }).catch(() => {}); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMutation({
    mutationFn: () => submitRsvp({ data: { token, requestKey, name: form.name, phone: form.phone, note: form.note, answers: toAnswers(form, ids), editCode: code } }),
    onSuccess: r => {
      if (r.ok) { try { if (r.receipt.edit_code) localStorage.setItem(codeKey(token), r.receipt.edit_code); } catch { /* private mode: receipt still shown once */ }
        sessionStorage.setItem(`rsvp-last:${token}`, JSON.stringify(r.receipt)); nav({ to: '/i/$token/rsvp/receipt', params: { token } }); return; }
      setRequestKey(crypto.randomUUID());
      setFail(r.reason === 'closed' ? 'Phản hồi cho lời mời này hiện không nhận nữa.' : r.reason === 'edit' ? 'Không tìm thấy câu trả lời trước để sửa; hãy gửi như một câu trả lời mới.' : r.reason === 'invalid' ? 'Thông tin chưa hợp lệ, xin kiểm tra lại.' : r.reason === 'rate' ? 'Có quá nhiều phản hồi cùng lúc. Xin đợi ít phút rồi gửi lại.' : 'Chưa gửi được. Xin thử lại.');
      if (r.reason === 'edit') { try { localStorage.removeItem(codeKey(token)); } catch { /* ignore */ } setCode(null); }
    },
    onError: () => setFail('Mạng đang chập chờn nên chưa gửi được. Câu trả lời vẫn còn đây, xin bấm gửi lại.'),
  });
  const set = (id: string, p: Partial<{ attending: boolean | null; party: string }>) => setForm(f => ({ ...f, answers: { ...f.answers, [id]: { ...f.answers[id]!, ...p } } }));
  const submit = (e: React.FormEvent) => { e.preventDefault(); setFail(''); const v = validateRsvp(form, ids); setErrs(v); if (hasErrors(v) || m.isPending) return; m.mutate(); };
  return <form onSubmit={submit} noValidate className="mx-auto max-w-lg pt-8">
    <h1 className="text-4xl">Xác nhận tham dự</h1>
    <p className="mt-2 text-muted-foreground">{code ? 'Bạn đang sửa câu trả lời đã gửi từ máy này. Bản mới sẽ thay bản cũ.' : 'Xin chọn Có hoặc Không cho từng buổi.'}</p>
    <div className="mt-5 space-y-4">
      <FormField label="Tên của bạn" id="rsvp-name" error={errs.name}><input id="rsvp-name" className={inputCls} value={form.name} maxLength={120} onChange={e => setForm({ ...form, name: e.target.value })} aria-invalid={!!errs.name} autoComplete="name" /></FormField>
      <FormField label="Số điện thoại (không bắt buộc)" id="rsvp-phone" error={errs.phone}><input id="rsvp-phone" className={inputCls} inputMode="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} aria-invalid={!!errs.phone} autoComplete="tel" /></FormField>
      {events.map(ev => { const a = form.answers[ev.id]!; const er = errs.events?.[ev.id]; return <fieldset key={ev.id} className="rounded-lg border border-border bg-card p-4" aria-invalid={!!er}>
        <legend className="px-1 font-semibold">{ev.name}</legend>
        <div className="mt-1 grid grid-cols-2 gap-2">{[true, false].map(v => <label key={String(v)} className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 text-sm ${a.attending === v ? 'border-primary bg-copper-soft font-semibold' : 'border-border'}`}><input type="radio" className="sr-only" name={`att-${ev.id}`} checked={a.attending === v} onChange={() => set(ev.id, { attending: v })} />{v ? 'Có, sẽ đến' : 'Không đến được'}</label>)}</div>
        {a.attending && <div className="mt-3"><FormField label={`Số người đi cùng tính cả bạn (1–${MAX_PARTY})`} id={`party-${ev.id}`}><input id={`party-${ev.id}`} type="number" min={1} max={MAX_PARTY} inputMode="numeric" className={inputCls} value={a.party} onChange={e => set(ev.id, { party: e.target.value })} /></FormField></div>}
        {er && <p role="alert" className="mt-2 text-xs font-semibold text-destructive">{er}</p>}
      </fieldset>; })}
      <FormField label="Lời nhắn (không bắt buộc)" id="rsvp-note" error={errs.note}><textarea id="rsvp-note" rows={3} maxLength={500} className="mt-2 w-full rounded-md border border-border bg-background p-3 text-sm" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></FormField>
    </div>
    {fail && <p role="alert" className="mt-3 text-sm font-semibold text-destructive">{fail}</p>}
    <Button type="submit" size="lg" className="mt-5 min-h-11 w-full" disabled={m.isPending}>{m.isPending && <Loader2 className="animate-spin" />}{code ? 'Gửi câu trả lời đã sửa' : 'Gửi xác nhận'}</Button>
    <Button asChild variant="ghost" size="lg" className="mt-2 min-h-11 w-full"><Link to="/i/$token" params={{ token }}>Quay lại thiệp</Link></Button>
  </form>;
}

/* ================= Guest: receipt (server-read) ================= */
export function GuestReceipt({ token }: { token: string }) {
  const [code, setCode] = useState<string | null | undefined>(undefined);
  useEffect(() => { setCode(readCode(token)); }, [token]);
  const q = useQuery({ queryKey: ['rsvp-receipt', token, code], enabled: !!code, queryFn: () => getRsvpReceipt({ data: { token, editCode: code! } }), retry: 1, gcTime: 0, staleTime: 0 });
  const cached = useMemo<RsvpReceipt | null>(() => { if (typeof window === 'undefined') return null; try { return JSON.parse(sessionStorage.getItem(`rsvp-last:${token}`) ?? 'null'); } catch { return null; } }, [token, code]); // eslint-disable-line react-hooks/exhaustive-deps
  if (code === undefined || (code && q.isPending)) return <div className="pt-16"><Loading label="Đang mở xác nhận…" /></div>;
  const r = q.data ?? (code ? null : cached);
  if (!r) return <div className="mx-auto max-w-lg pt-16 text-center"><h1 className="text-4xl">Chưa có xác nhận trên máy này</h1><p className="mt-4 text-muted-foreground">Nếu bạn đã gửi từ máy khác, câu trả lời vẫn được lưu. Bạn có thể gửi xác nhận tại đây.</p><Button asChild size="lg" className="mt-5 min-h-11"><Link to="/i/$token/rsvp" params={{ token }}>Xác nhận tham dự</Link></Button></div>;
  return <div className="mx-auto max-w-lg pt-8" data-testid="rsvp-receipt">
    <h1 className="text-4xl">Cảm ơn {r.guest_name}!</h1>
    <p className="mt-2 text-muted-foreground">Gia đình đã nhận câu trả lời{r.edited ? ' đã sửa' : ''} của bạn lúc {new Date(r.submitted_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.</p>
    <Panel className="mt-5">{r.answers.map(a => <div key={a.event_id} className="flex items-center justify-between border-b border-border py-3 last:border-0"><strong>{a.event_name}</strong><Status tone={a.attending ? 'sage' : 'warm'}>{a.attending ? `Sẽ đến · ${a.party_size} người` : 'Không đến'}</Status></div>)}</Panel>
    <p className="mt-3 text-xs text-muted-foreground">Muốn đổi ý? Bạn có thể sửa từ máy này; bản mới sẽ thay bản cũ, không tính trùng.</p>
    <div className="mt-4 grid gap-2 sm:grid-cols-2"><Button asChild variant="outline" size="lg" className="min-h-11"><Link to="/i/$token/rsvp" params={{ token }}>Sửa câu trả lời</Link></Button><Button asChild variant="ghost" size="lg" className="min-h-11"><Link to="/i/$token" params={{ token }}>Quay lại thiệp</Link></Button></div>
  </div>;
}

/* ================= Owner: reconcile ================= */
const responsesQuery = (weddingId: string) => ({
  queryKey: ['rsvp', weddingId],
  queryFn: async (): Promise<ResponseRow[]> => {
    const r = await supabase.from('rsvp_responses').select('id,link_side,guest_name,phone,note,guest_id,superseded_at,replaces_id,created_at,rsvp_answers(event_id,event_name,attending,party_size)').eq('wedding_id', weddingId).order('created_at', { ascending: false }).range(0, 9999);
    if (r.error) throw r.error;
    return (r.data ?? []).map(x => ({ ...x, answers: x.rsvp_answers ?? [] })) as ResponseRow[];
  },
});

export function OwnerRsvpScreen() {
  const w = useMyWedding().data!; const qc = useQueryClient();
  const rq = useQuery(responsesQuery(w.id)), gq = useQuery(guestsQuery(w.id)), eq = useQuery(eventsQuery(w.id));
  const [ev, setEv] = useState('all'); const [side, setSide] = useState<'all' | LinkSide>('all');
  const [sel, setSel] = useState<ResponseRow | null>(null); const [msg, setMsg] = useState('');
  if (rq.isPending || gq.isPending || eq.isPending) return <div className="max-w-4xl"><Header name="Đối chiếu phản hồi" subtitle="KHÁCH MỜI" /><Loading label="Đang tải phản hồi…" /></div>;
  const err = rq.error ?? gq.error ?? eq.error;
  if (err) return <div className="max-w-4xl"><Header name="Đối chiếu phản hồi" subtitle="KHÁCH MỜI" /><LoadError error={err} retry={() => { rq.refetch(); gq.refetch(); eq.refetch(); }} /></div>;
  const events = eq.data!, guests = gq.data!, all = rq.data!;
  const act = activeResponses(all).filter(r => (side === 'all' || r.link_side === side) && (ev === 'all' || r.answers.some(a => a.event_id === ev)));
  const review = act.filter(r => groupOf(r) === 'review'), confirmed = act.filter(r => groupOf(r) === 'confirmed');
  const matched = new Set(activeResponses(all).map(r => r.guest_id).filter(Boolean));
  const pending = guests.filter(g => !matched.has(g.id) && g.assignments.some(a => (ev === 'all' || a.event_id === ev) && a.rsvp_status === 'pending'));
  const counts = rsvpCounts(act, events.map(e => e.id));
  const history = all.filter(r => r.superseded_at);
  const unmatch = async (id: string) => { const r = await supabase.rpc('unmatch_rsvp', { p_response_id: id }); setMsg(r.error ? 'Chưa bỏ được liên kết. Xin thử lại.' : 'Đã bỏ liên kết; phản hồi quay về Cần đối chiếu. Sổ khách giữ nguyên.'); qc.invalidateQueries({ queryKey: ['rsvp', w.id] }); };
  const line = (r: ResponseRow) => r.answers.map(a => `${a.event_name}: ${a.attending ? `có · ${a.party_size} người` : 'không'}`).join(' / ');
  return <div className="max-w-4xl"><Header name="Đối chiếu phản hồi" subtitle="KHÁCH MỜI" />
    <p className="-mt-3 mb-4 text-muted-foreground">Phản hồi từ link đã công bố. Không có gì tự ghép hay tự ghi vào Sổ khách; hai bạn tự chọn khách tương ứng.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label="Buổi" id="rsvp-ev"><select id="rsvp-ev" className={inputCls} value={ev} onChange={e => setEv(e.target.value)}><option value="all">Tất cả buổi</option>{events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></FormField>
      <FormField label="Link" id="rsvp-side"><select id="rsvp-side" className={inputCls} value={side} onChange={e => setSide(e.target.value as 'all' | LinkSide)}><option value="all">Tất cả link</option>{LINK_SIDES.map(s => <option key={s} value={s}>{LINK_LABEL[s]}</option>)}</select></FormField>
    </div>
    <Panel className="mt-4"><SmallLabel>ĐẾM THEO BUỔI · CHỈ TÍNH BẢN TRẢ LỜI MỚI NHẤT</SmallLabel>
      {events.filter(e => ev === 'all' || e.id === ev).map(e => { const c = counts.perEvent[e.id]!; return <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm last:border-0"><strong>{e.name}</strong><span>{c.people} người sẽ đến · {c.yes} phản hồi có · {c.no} không</span></div>; })}
      <p className="mt-2 text-xs text-muted-foreground">{counts.responses} phản hồi; khoảng {counts.people} người khác nhau (người dự nhiều buổi chỉ tính một lần).</p></Panel>
    <p role="status" className="mt-3 text-xs font-semibold text-sage-strong">{msg}</p>
    <div className="mt-4"><SmallLabel>CẦN ĐỐI CHIẾU · {review.length} phản hồi</SmallLabel></div>
    <Panel>{review.length ? review.map(r => <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border py-3 last:border-0" data-testid="rsvp-review">
      <div className="min-w-0"><div className="font-semibold">{r.guest_name} {r.replaces_id && <Status tone="copper">Đã sửa câu trả lời</Status>}</div><p className="text-xs text-muted-foreground">{LINK_LABEL[r.link_side as LinkSide]} · {line(r)}{r.phone ? ` · ${r.phone}` : ''}</p>{r.note && <p className="text-xs">“{r.note}”</p>}</div>
      <WriteButton variant="outline" size="lg" className="min-h-11" onClick={() => setSel(r)}>Đối chiếu</WriteButton></div>) : <p className="text-sm text-muted-foreground">Không có phản hồi nào cần đối chiếu.</p>}</Panel>
    <div className="mt-4"><SmallLabel>ĐÃ XÁC NHẬN · {confirmed.length} phản hồi</SmallLabel></div>
    <Panel>{confirmed.length ? confirmed.map(r => <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border py-3 last:border-0">
      <div className="min-w-0"><div className="font-semibold">{r.guest_name} → {guests.find(g => g.id === r.guest_id)?.name ?? 'khách đã xóa'}</div><p className="text-xs text-muted-foreground">{line(r)}</p></div>
      <WriteButton variant="ghost" size="lg" className="min-h-11" onClick={() => unmatch(r.id)}>Bỏ liên kết</WriteButton></div>) : <p className="text-sm text-muted-foreground">Chưa xác nhận phản hồi nào.</p>}</Panel>
    <div className="mt-4"><SmallLabel>CHƯA TRẢ LỜI · {pending.length} khách trong sổ</SmallLabel></div>
    <Panel>{pending.length ? pending.slice(0, 100).map(g => <div key={g.id} className="border-b border-border py-2 text-sm last:border-0">{g.name}<span className="text-xs text-muted-foreground"> · {g.party_size} người dự kiến</span></div>) : <p className="text-sm text-muted-foreground">Không còn khách nào chờ trả lời.</p>}{pending.length > 100 && <p className="mt-2 text-xs text-muted-foreground">Và {pending.length - 100} khách khác — xem trong Sổ khách.</p>}</Panel>
    {history.length > 0 && <details className="mt-4"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Lịch sử: {history.length} bản trả lời đã được khách sửa</summary><Panel>{history.map(r => <div key={r.id} className="border-b border-border py-2 text-xs last:border-0"><strong>{r.guest_name}</strong> · {new Date(r.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} · {line(r)} <span className="text-muted-foreground">(đã thay bằng bản mới, không tính)</span></div>)}</Panel></details>}
    <Note>Quy tắc: khách sửa câu trả lời thì bản mới thay bản cũ và cần đối chiếu lại. Bấm gửi lặp không tạo thêm phản hồi.</Note>
    {sel && <ReconcileDialog r={sel} guests={guests} onClose={t => { setSel(null); if (t) setMsg(t); qc.invalidateQueries({ queryKey: ['rsvp', w.id] }); qc.invalidateQueries({ queryKey: ['guests', w.id] }); }} />}
  </div>;
}

function ReconcileDialog({ r, guests, onClose }: { r: ResponseRow; guests: { id: string; name: string; phone: string | null; party_size: number }[]; onClose: (msg?: string) => void }) {
  const [q, setQ] = useState(''); const [gid, setGid] = useState(''); const [apply, setApply] = useState(false); const [err, setErr] = useState('');
  const sug = phoneSuggestions(r, guests);
  const list = guests.filter(g => !q.trim() || g.name.toLowerCase().includes(q.trim().toLowerCase()) || (g.phone ?? '').includes(q.trim())).slice(0, 50);
  const m = useMutation({ mutationFn: async () => { const x = await supabase.rpc('reconcile_rsvp', { p_response_id: r.id, p_guest_id: gid, p_apply: apply }); if (x.error) throw x.error; return x.data as number; },
    onSuccess: n => onClose(apply ? `Đã liên kết và cập nhật ${n} buổi trong Sổ khách.` : 'Đã liên kết. Sổ khách giữ nguyên.'), onError: () => setErr('Chưa lưu được. Xin thử lại.') });
  return <Dialog open onOpenChange={o => { if (!o && !m.isPending) onClose(); }}><DialogContent className="max-h-[92vh] w-[calc(100vw-24px)] max-w-lg overflow-y-auto rounded-lg bg-card p-5">
    <DialogHeader className="text-left"><DialogTitle className="font-display text-2xl">Đối chiếu “{r.guest_name}”</DialogTitle><DialogDescription>Chọn khách trong sổ đúng với phản hồi này. Ứng dụng không tự chọn theo tên.</DialogDescription></DialogHeader>
    {sug.length > 0 && <p className="rounded-md bg-sage p-2 text-xs">Gợi ý cùng số điện thoại: {sug.map(g => <button type="button" key={g.id} className="ml-1 font-semibold underline" onClick={() => setGid(g.id)}>{g.name}</button>)}</p>}
    <FormField label="Tìm khách" id="rc-q"><input id="rc-q" className={inputCls} value={q} onChange={e => setQ(e.target.value)} /></FormField>
    <div role="radiogroup" aria-label="Khách trong sổ" className="max-h-60 space-y-1 overflow-y-auto">{list.map(g => <label key={g.id} className={`flex min-h-11 items-center gap-3 rounded-md border px-3 text-sm ${gid === g.id ? 'border-primary bg-copper-soft' : 'border-border'}`}><input type="radio" name="rc-g" checked={gid === g.id} onChange={() => setGid(g.id)} className="accent-primary" />{g.name}<span className="text-xs text-muted-foreground">{g.phone ?? ''} · {g.party_size} người</span></label>)}{!list.length && <p className="text-xs text-muted-foreground">Không thấy khách phù hợp. Hãy thêm khách trong Sổ khách trước.</p>}</div>
    <label className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-xs"><input type="checkbox" className="size-4 accent-primary" checked={apply} onChange={e => setApply(e.target.checked)} />Cập nhật trạng thái trả lời trong Sổ khách cho các buổi khách này được mời</label>
    {err && <p role="alert" className="text-xs font-semibold text-destructive">{err}</p>}
    <DialogFooter className="flex-col-reverse gap-2 sm:flex-row"><Button variant="outline" size="lg" className="min-h-11" onClick={() => onClose()}>Để sau</Button><WriteButton size="lg" className="min-h-11" disabled={!gid || m.isPending} onClick={() => m.mutate()}>{m.isPending && <Loader2 className="animate-spin" />}Liên kết</WriteButton></DialogFooter>
  </DialogContent></Dialog>;
}
