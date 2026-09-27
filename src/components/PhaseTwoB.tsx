import { useState, useSyncExternalStore } from 'react';
import { ArrowRight, ImagePlus, Trash2 } from 'lucide-react';
import { useDemoSession } from '@/lib/demo-session';
import { checkPhotos, diffSnapshot, linkReadiness, MAX_LINKS, MAX_PHOTOS, type DateImpact, type Snapshot } from '@/lib/phase2';
import type { EventSide } from '@/lib/contracts';
import type { SessionLink } from '@/lib/adapters';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Action, DemoAction, Header, Note, Panel, Row, SmallLabel, Status, fmtDate, inputCls, useEventNames } from './PhaseOne';

/* ---------- shared session: links ---------- */
export const SIDE_LABEL: Record<EventSide, string> = { chung: 'Link chung', 'nha-gai': 'Link nhà gái', 'nha-trai': 'Link nhà trai' };
export const initialLinks: SessionLink[] = [
  { side: 'chung', enabled: true, eventIds: ['e1', 'e2'] },
  { side: 'nha-gai', enabled: true, eventIds: ['e1'] },
  { side: 'nha-trai', enabled: false, eventIds: ['e2'] },
];
export const validLinks = (v: unknown): v is SessionLink[] => Array.isArray(v) && v.length <= MAX_LINKS && v.every(l => l && typeof l.side === 'string' && typeof l.enabled === 'boolean' && Array.isArray(l.eventIds));
export const useLinks = () => useDemoSession<SessionLink[]>('links', initialLinks, validLinks);

/* ---------- Event date change review ---------- */
export function DateImpactDialog({ open, eventName, from, to, impact, onCancel, onConfirm }: { open: boolean; eventName: string; from: string; to: string; impact: DateImpact | null; onCancel: () => void; onConfirm: (shift: boolean) => void }) {
  const [shift, setShift] = useState(true);
  if (!impact) return null;
  return <Dialog open={open} onOpenChange={o => { if (!o) onCancel(); }}><DialogContent className="max-h-[92vh] w-[calc(100vw-24px)] max-w-lg overflow-y-auto rounded-lg bg-card p-5 sm:p-6">
    <DialogHeader className="text-left"><DialogTitle className="font-display text-2xl">{impact.cleared ? 'Xóa ngày' : 'Đổi ngày'} {eventName}?</DialogTitle><DialogDescription>{from ? fmtDate(from) + '/' + from.slice(0, 4) : 'Chưa có ngày'} → {to ? `${fmtDate(to)}/${to.slice(0, 4)}` : 'Chưa có ngày'}{impact.deltaDays ? ` (${impact.deltaDays > 0 ? 'lùi' : 'sớm'} ${Math.abs(impact.deltaDays)} ngày)` : ''}. Chỉ thay đổi trong phiên xem này.</DialogDescription></DialogHeader>
    <div className="space-y-4 text-sm">
      {impact.cleared && <p role="alert" className="rounded-md bg-copper-soft p-2 text-xs font-semibold">Buổi này sẽ không còn ngày. Hạn các việc giữ nguyên, không tự dời; link có buổi này sẽ cần sửa trước khi công bố.</p>}
      <section><h3 className="font-semibold">Việc gắn với buổi này · {impact.tasks.length}</h3>
        {impact.tasks.length ? <><ul className="mt-1 space-y-1 text-xs">{impact.tasks.map(t => <li key={t.id}>{t.title}: {fmtDate(t.from)} → {fmtDate(t.to)}</li>)}</ul>
          <label className="mt-2 flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-xs"><input type="checkbox" className="size-4 accent-primary" checked={shift} onChange={e => setShift(e.target.checked)} />Dời hạn các việc này theo ngày mới</label></> : <p className="text-xs text-muted-foreground">Không có việc có hạn gắn với buổi này.</p>}</section>
      <section><h3 className="font-semibold">Khoản cọc / ngày trả cố định · {impact.costWarnings.length}</h3>
        {impact.costWarnings.length ? <><ul className="mt-1 space-y-1 text-xs">{impact.costWarnings.map((c, i) => <li key={i}>{c.title} · {c.label}: {fmtDate(c.due)}</li>)}</ul><p className="mt-1 rounded-md bg-copper-soft p-2 text-xs">Không tự đổi hạn trả. Hãy hỏi lại bên cung cấp rồi sửa trong Ngân sách nếu cần.</p></> : <p className="text-xs text-muted-foreground">Không có khoản có ngày trả gắn với buổi này.</p>}</section>
      <section><h3 className="font-semibold">Thiệp · {impact.linksToReview.length} link đang bật có buổi này</h3>
        <p className="text-xs text-muted-foreground">{impact.linksToReview.length ? `${impact.linksToReview.map(s => SIDE_LABEL[s as EventSide] ?? s).join(', ')} sẽ cần hai bạn xem lại ở “Thay đổi sau khi gửi”. Không có gì tự cập nhật cho khách.` : 'Không link nào bị ảnh hưởng.'}</p></section>
    </div>
    <DialogFooter className="mt-4 flex-col-reverse gap-2 sm:flex-row"><Button variant="outline" size="lg" className="min-h-11" onClick={onCancel}>Giữ ngày cũ</Button><Button size="lg" className="min-h-11" onClick={() => onConfirm(shift && impact.tasks.length > 0)}>{impact.cleared ? 'Xóa ngày' : 'Đổi ngày'}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

/* ---------- Photos (tab memory only) ---------- */
type Photo = { id: string; name: string; url: string };
let photos: Photo[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };
const EMPTY: Photo[] = [];
/** Object URLs are revoked when photos are removed or the demo is reset. */
export function clearPhotos() { photos.forEach(p => URL.revokeObjectURL(p.url)); photos = []; emit(); }
if (typeof window !== 'undefined') window.addEventListener('phase1-demo-reset', clearPhotos);
export const usePhotos = () => useSyncExternalStore(subscribe, () => photos, () => EMPTY);

export function PhotoManager() {
  const list = usePhotos();
  const [msg, setMsg] = useState<{ ok: string; bad: string[] }>({ ok: '', bad: [] });
  const add = (files: FileList | null) => {
    if (!files?.length) return;
    const arr = [...files];
    const { accepted, rejected } = checkPhotos(arr, photos.length);
    const bad = rejected.map(r => `${r.name}: ${r.reason}`);
    let loaded = 0; const next: Photo[] = [];
    if (!accepted.length) { setMsg({ ok: '', bad }); return; }
    accepted.forEach(i => {
      const f = arr[i]!; const url = URL.createObjectURL(f); const img = new Image();
      img.onload = () => { next.push({ id: `${Date.now()}-${i}`, name: f.name, url }); done(); };
      img.onerror = () => { URL.revokeObjectURL(url); bad.push(`${f.name}: không mở được ảnh`); done(); };
      img.src = url;
    });
    function done() { loaded++; if (loaded === accepted.length) { photos = [...photos, ...next].slice(0, MAX_PHOTOS); emit(); setMsg({ ok: next.length ? `Đã thêm ${next.length} ảnh vào bản xem thử (chỉ trên máy này, chưa tải lên).` : '', bad }); } }
  };
  const remove = (id: string) => { const p = photos.find(x => x.id === id); if (p) URL.revokeObjectURL(p.url); photos = photos.filter(x => x.id !== id); emit(); setMsg({ ok: 'Đã bỏ ảnh.', bad: [] }); };
  return <div><div className="flex items-center justify-between text-xs font-semibold"><span>Ảnh của hai bạn</span><span>{list.length}/{MAX_PHOTOS}</span></div>
    <label className={`mt-2 flex min-h-20 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background p-4 text-sm focus-within:ring-2 focus-within:ring-ring ${list.length >= MAX_PHOTOS ? 'pointer-events-none opacity-50' : ''}`}><ImagePlus className="size-5 text-primary" />{list.length >= MAX_PHOTOS ? 'Đã đủ 50 ảnh' : 'Chọn ảnh (JPG, PNG, WEBP · tối đa 8 MB/ảnh)'}<input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={list.length >= MAX_PHOTOS} onChange={e => { add(e.target.files); e.target.value = ''; }} /></label>
    <p className="mt-1 text-[11px] text-muted-foreground">Ảnh chỉ hiển thị trong tab này và mất khi tải lại trang; chưa lưu lên máy chủ.</p>
    <div role="status" className="mt-2 text-xs">{msg.ok && <p className="font-semibold text-sage-strong">{msg.ok}</p>}{msg.bad.map(b => <p key={b} className="font-semibold text-destructive">{b}</p>)}</div>
    {list.length > 0 && <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">{list.map(p => <li key={p.id} className="relative"><img src={p.url} alt={p.name} className="aspect-square w-full rounded-md object-cover" /><button type="button" aria-label={`Bỏ ảnh ${p.name}`} onClick={() => remove(p.id)} className="absolute right-1 top-1 grid size-8 place-items-center rounded-full bg-card/90 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"><Trash2 className="size-4" /></button></li>)}</ul>}
  </div>;
}

/* ---------- Links (1–3 versions) ---------- */
export function LinksScreen() {
  const events = useEventNames();
  const [links, setLinks] = useLinks();
  const [msg, setMsg] = useState('');
  const toggle = (side: EventSide) => { setLinks(ls => ls.map(l => (l.side === side ? { ...l, enabled: !l.enabled } : l))); setMsg(`${SIDE_LABEL[side]}: đã ${links.find(l => l.side === side)?.enabled ? 'tắt' : 'bật'} trong phiên.`); };
  const setEvent = (side: EventSide, id: string, on: boolean) => setLinks(ls => ls.map(l => (l.side === side ? { ...l, eventIds: on ? [...l.eventIds, id] : l.eventIds.filter(x => x !== id) } : l)));
  return <div className="max-w-4xl"><Header name="Các phiên bản link" subtitle="LỜI MỜI" />
    <p className="-mt-3 mb-5 text-muted-foreground">Tối đa {MAX_LINKS} link: chung, nhà gái, nhà trai. Mỗi link chỉ hiện những buổi hai bạn chọn.</p>
    <p role="status" className="mb-3 text-xs font-semibold text-primary">{msg}</p>
    <div className="space-y-3">{links.map(l => { const r = linkReadiness(l.enabled, l.eventIds, events); return <Panel key={l.side}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl">{SIDE_LABEL[l.side]}</h2><Status tone={r.readiness === 'ready' ? 'sage' : r.readiness === 'off' ? 'warm' : 'copper'}>{r.readiness === 'ready' ? 'Sẵn sàng' : r.readiness === 'off' ? 'Đang tắt' : 'Cần sửa'}</Status></div>
      <fieldset className="mt-3"><legend className="text-xs font-semibold">Buổi có trong link</legend><div className="mt-1 grid gap-1 sm:grid-cols-2">{events.map(e => <label key={e.id} className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={l.eventIds.includes(e.id)} onChange={x => setEvent(l.side, e.id, x.target.checked)} />{e.name}</label>)}</div></fieldset>
      {r.missing.length > 0 && <p className="mt-2 text-xs font-semibold text-primary">Còn thiếu: {r.missing.join(', ')}</p>}
      {l.eventIds.some(id => !events.some(e => e.id === id)) && <DemoAction variant="outline" className="mt-2" onClick={() => { setLinks(ls => ls.map(x => (x.side === l.side ? { ...x, eventIds: x.eventIds.filter(id => events.some(e => e.id === id)) } : x))); setMsg(`${SIDE_LABEL[l.side]}: đã gỡ buổi đã bị bỏ. Hãy chọn lại buổi nếu cần.`); }}>Gỡ buổi đã bị bỏ</DemoAction>}
      <div className="mt-3 flex flex-wrap gap-2"><DemoAction variant="outline" onClick={() => toggle(l.side)}>{l.enabled ? 'Tắt link' : 'Bật link'}</DemoAction>{r.missing.length > 0 && <Action to="/wedding/events" variant="ghost">Sửa buổi lễ <ArrowRight /></Action>}<Action to="/invitation/preview" variant="ghost">Xem trước</Action></div>
    </Panel>; })}</div>
    <Note tone="warm">Bật link chỉ chọn link để công bố sau. Công bố cần gói thiệp cưới đã được xác minh thanh toán; bản dùng thử không tạo địa chỉ công khai.</Note>
    <Action to="/publish" className="mt-5 w-full">Xem lại trước khi công bố <ArrowRight /></Action>
  </div>;
}

export function PublishReviewScreen() {
  const events = useEventNames();
  const [links] = useLinks();
  const rs = links.map(l => ({ l, r: linkReadiness(l.enabled, l.eventIds, events) }));
  const ready = rs.filter(x => x.r.readiness === 'ready');
  return <div className="max-w-3xl"><Header name="Xem lại trước khi công bố" subtitle="CÔNG BỐ THIỆP" />
    <Note tone="warm"><strong>Chưa có gói thiệp cưới được xác minh.</strong><br />Chỉ khi thanh toán thật được xác minh, link sẵn sàng mới công bố được. Trang này không tự bật đã trả hay đã công bố.</Note>
    <div className="mt-4"><SmallLabel>SẼ CÔNG BỐ ĐƯỢC · {ready.length}</SmallLabel></div>
    <Panel>{ready.length ? ready.map(({ l }) => <Row key={l.side} title={SIDE_LABEL[l.side]} detail={l.eventIds.map(id => { const e = events.find(x => x.id === id); return e ? `${e.name} · ${e.time} · ${fmtDate(e.date)}` : ''; }).filter(Boolean).join(' / ')} right={<Status>Sẵn sàng</Status>} />) : <p className="text-sm text-muted-foreground">Chưa có link nào sẵn sàng.</p>}</Panel>
    <div className="mt-4"><SmallLabel>CHƯA CÔNG BỐ ĐƯỢC</SmallLabel></div>
    <Panel>{rs.filter(x => x.r.readiness !== 'ready').map(({ l, r }) => <Row key={l.side} title={SIDE_LABEL[l.side]} detail={r.readiness === 'off' ? 'Đang tắt' : `Thiếu: ${r.missing.join(', ')}`} to="/invitation/variants" />)}</Panel>
    <Action to="/plans" className="mt-5 w-full">Xem gói thiệp cưới để công bố</Action>
    <Action to="/invitation/variants" variant="outline" className="mt-2 w-full">Sửa các link</Action>
    <Action to="/invitation/history" variant="ghost" className="mt-2 w-full">Chia sẻ, mã QR và lịch sử</Action>
  </div>;
}

/* ---------- Changes after sending ---------- */
const validSnap = (v: unknown): v is Snapshot | null => v === null || (!!v && typeof (v as Snapshot).revision === 'number' && Array.isArray((v as Snapshot).events));
type Inv = { title: string; message: string };
export function ChangesReviewScreen({ invite }: { invite: Inv }) {
  const events = useEventNames();
  const [links] = useLinks();
  const [snap, setSnap] = useDemoSession<Snapshot | null>('sent-snapshot', null, validSnap);
  const [msg, setMsg] = useState('');
  const current = { title: invite.title, message: invite.message, events: events.map(e => ({ id: e.id, name: e.name, date: e.date, time: e.time, venue: e.venue, address: e.address })) };
  const changes = snap ? diffSnapshot(snap, current) : [];
  const affected = links.filter(l => l.enabled && changes.some(c => !c.eventId || l.eventIds.includes(c.eventId)));
  return <div className="max-w-3xl"><Header name="Thay đổi sau khi gửi" subtitle="LỜI MỜI · BẢN DÙNG THỬ" />
    <p className="-mt-3 mb-5 text-muted-foreground">So sánh bản đã gửi với thông tin hiện tại. Không có gì tự cập nhật cho khách.</p>
    <p role="status" className="mb-3 text-xs font-semibold text-sage-strong">{msg}</p>
    {!snap ? <><Note>Chưa có mốc “bản đã gửi”. Trong bản dùng thử, hãy đặt mốc từ thông tin hiện tại rồi sửa buổi lễ hoặc lời mời để xem so sánh.</Note><DemoAction className="mt-4 w-full" onClick={() => { setSnap({ revision: 1, ...current }); setMsg('Đã đặt mốc bản 1 (minh họa, không gửi cho ai).'); }}>Đặt mốc bản đã gửi (minh họa)</DemoAction></> : <>
      <Panel><SmallLabel>BẢN {snap.revision} → THÔNG TIN HIỆN TẠI</SmallLabel>{changes.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có thay đổi nào so với bản đã gửi.</p> : <ul className="space-y-3">{changes.map((c, i) => <li key={i} className="border-b border-border pb-2 text-sm last:border-0"><div className="font-semibold">{c.field}</div><div className="text-xs">Trước: <span className="line-through">{c.before}</span></div><div className="text-xs text-primary">Sau: <strong>{c.after}</strong></div></li>)}</ul>}</Panel>
      {changes.length > 0 && <Note tone="warm"><strong>{affected.length} link đang bật bị ảnh hưởng</strong><br />{affected.map(l => SIDE_LABEL[l.side]).join(', ') || 'Không có'}. Địa chỉ link và phản hồi cũ giữ nguyên; ứng dụng không tự báo khách.</Note>}
      <div className="mt-4 grid gap-2 sm:grid-cols-2"><DemoAction disabled={!changes.length} onClick={() => { setSnap({ revision: snap.revision + 1, ...current }); setMsg(`Đã duyệt thành bản ${snap.revision + 1} trong phiên. Chưa cập nhật bản công khai thật.`); }}>Duyệt thành bản {snap.revision + 1} (minh họa)</DemoAction><DemoAction variant="outline" onClick={() => { setSnap(null); setMsg('Đã xóa mốc so sánh.'); }}>Xóa mốc</DemoAction></div>
      <Action to="/invitation/preview" variant="ghost" className="mt-2 w-full">Xem bản thử</Action>
    </>}
  </div>;
}

/* ---------- Admin (demo) ---------- */
type AdminNote = { order: string; text: string; at: string };
const validNotes = (v: unknown): v is AdminNote[] => Array.isArray(v) && v.every(n => n && typeof n.order === 'string' && typeof n.text === 'string');
const DEMO_ORDERS = [{ code: 'TCO-1001', wedding: 'Lan & Minh', status: 'Đang chờ chuyển khoản' }, { code: 'TCO-1002', wedding: 'Hà & Nam', status: 'Cần hỗ trợ' }, { code: 'TCO-1003', wedding: 'Vy & Khoa', status: 'Đang xác minh' }];
export function AdminScreen() {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [notes, setNotes] = useDemoSession<AdminNote[]>('admin-notes', [], validNotes);
  const shown = DEMO_ORDERS.filter(o => !q.trim() || (o.code + o.wedding).toLowerCase().includes(q.trim().toLowerCase()));
  const order = DEMO_ORDERS.find(o => o.code === sel);
  return <div className="max-w-3xl"><Header name="Vận hành" subtitle="QUẢN TRỊ · BẢN DEMO" />
    <Note tone="warm">Dữ liệu đơn là mẫu. Không có quyền quản trị thật, không xem được giao dịch ngân hàng, không xác minh hay hoàn tiền từ trang này.</Note>
    <label htmlFor="admin-q" className="mt-4 block text-xs font-semibold">Tìm mã đơn hoặc tên đám cưới</label>
    <input id="admin-q" type="search" value={q} onChange={e => setQ(e.target.value)} className={inputCls} placeholder="TCO-1001" />
    <Panel className="mt-3">{shown.length === 0 ? <p className="text-sm text-muted-foreground">Không tìm thấy đơn.</p> : shown.map(o => <div key={o.code} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border py-3 last:border-0"><div className="min-w-0"><div className="font-semibold">{o.code} · {o.wedding}</div><p className="text-xs text-muted-foreground">{o.status}</p></div><DemoAction variant={sel === o.code ? 'default' : 'outline'} onClick={() => { setSel(o.code); setErr(''); setText(''); }}>Mở</DemoAction></div>)}</Panel>
    {order && <Panel className="mt-4"><h2 className="text-xl">{order.code}</h2><p className="text-xs text-muted-foreground">{order.wedding} · {order.status}</p>
      <label htmlFor="admin-note" className="mt-3 block text-xs font-semibold">Ghi chú hỗ trợ (trong phiên)</label>
      <textarea id="admin-note" rows={3} value={text} onChange={e => setText(e.target.value)} className="mt-2 w-full rounded-md border border-border bg-background p-3 text-sm" aria-invalid={!!err} />
      {err && <p role="alert" className="text-xs font-semibold text-destructive">{err}</p>}
      <div className="mt-2 flex flex-wrap gap-2"><DemoAction onClick={() => { if (!text.trim()) { setErr('Hãy nhập nội dung ghi chú.'); return; } setNotes(n => [{ order: order.code, text: text.trim(), at: new Date().toISOString() }, ...n]); setText(''); setErr(''); }}>Lưu ghi chú</DemoAction></div>
      <p className="mt-2 text-xs text-muted-foreground">Xác minh thanh toán và hoàn tiền cần hệ thống thanh toán thật (giai đoạn sau), nên không có nút cho các việc này.</p>
      <ul className="mt-3 space-y-1 text-xs" aria-live="polite">{notes.filter(n => n.order === order.code).map((n, i) => <li key={i} className="rounded-md bg-background p-2">{n.text}</li>)}</ul>
    </Panel>}
  </div>;
}
