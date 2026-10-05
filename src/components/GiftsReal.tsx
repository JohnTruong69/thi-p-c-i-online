/** Sổ tiền mừng: the gift money ledger. Managers record who gave what to reciprocate ("đi lại") later. */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WriteButton } from './AccessStateBanner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { eventsQuery, friendlyError, useMyWedding } from '@/lib/wedding-api';
import { guestsQuery } from '@/lib/guests-api';
import { deleteGiftRecord, giftRecordsQuery, saveGiftRecord, setGiftThanked } from '@/lib/gifts-api';
import { GIFT_METHODS, emptyGiftDraft, giftSideLabel, giftTotals, giftsToCsv, methodLabel, validateGiftDraft, type GiftDraft, type GiftRecord, type GiftSide } from '@/lib/gifts';
import { fmtVnd } from '@/lib/planner';
import { DemoDialog, FormField, Header, Note, Panel, SmallLabel, Status, inputCls } from './PhaseOne';
import { GuestTabs } from './GuestsReal';
import { LoadError, Loading, coupleName } from './PhaseThree';

const download = (name: string, text: string) => { const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); };

export function RealGiftsScreen() {
  const w = useMyWedding().data!; const qc = useQueryClient();
  const gq = useQuery(giftRecordsQuery(w.id));
  const eq = useQuery(eventsQuery(w.id));
  const guestsQ = useQuery(guestsQuery(w.id));
  const [q, setQ] = useState(''); const [eventId, setEventId] = useState('all'); const [side, setSide] = useState('all'); const [unthankedOnly, setUnthankedOnly] = useState(false);
  const [open, setOpen] = useState(false); const [editing, setEditing] = useState<GiftRecord | null>(null);
  const [d, setD] = useState<GiftDraft>(emptyGiftDraft()); const [errs, setErrs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState(''); const [confirmDel, setConfirmDel] = useState<GiftRecord | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['gifts', w.id] });
  const save = useMutation({
    mutationFn: () => saveGiftRecord(w.id, editing?.id ?? null, d),
    onSuccess: async () => { await refresh(); setOpen(false); const name = d.giver_name.trim(); setEditing(null); setMsg(editing ? `Đã lưu tiền mừng của ${name}.` : `Đã ghi ${fmtVnd(Number(d.amount))} của ${name}.`); },
    onError: e => setErrs({ form: friendlyError(e) }),
  });
  const thanked = useMutation({ mutationFn: (r: GiftRecord) => setGiftThanked(r.id, !r.thanked), onSuccess: refresh, onError: e => setMsg(friendlyError(e)) });
  const del = useMutation({ mutationFn: (id: string) => deleteGiftRecord(id), onSuccess: async () => { await refresh(); setConfirmDel(null); setMsg('Đã xóa khoản mừng.'); }, onError: e => setMsg(friendlyError(e)) });
  const events = eq.data ?? []; const guests = guestsQ.data ?? [];
  const evName = (id: string | null) => (id ? events.find(e => e.id === id)?.name ?? 'Buổi đã bỏ' : 'Chung');
  const records = useMemo(() => gq.data ?? [], [gq.data]);
  const filtered = useMemo(() => records.filter(r =>
    (!q.trim() || r.giver_name.toLowerCase().includes(q.trim().toLowerCase())) &&
    (eventId === 'all' || (r.event_id ?? '') === eventId) &&
    (side === 'all' || r.side === side) &&
    (!unthankedOnly || !r.thanked)), [records, q, eventId, side, unthankedOnly]);
  const t = giftTotals(records);
  if (gq.isPending || eq.isPending) return <Loading label="Đang tải sổ tiền mừng…" />;
  if (gq.isError || eq.isError) return <LoadError error={gq.error ?? eq.error} retry={() => { gq.refetch(); eq.refetch(); }} />;

  const openAdd = () => { setEditing(null); setD(emptyGiftDraft()); setErrs({}); setMsg(''); setOpen(true); };
  const openEdit = (r: GiftRecord) => {
    setEditing(r); setMsg('');
    setD({ giver_name: r.giver_name, guest_id: r.guest_id, amount: String(r.amount_vnd), event_id: r.event_id ?? '', side: r.side, method: r.method, gift_detail: r.gift_detail ?? '', thanked: r.thanked, note: r.note ?? '' });
    setErrs({}); setOpen(true);
  };
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (save.isPending) return; const v = validateGiftDraft(d); setErrs(v); if (Object.keys(v).length) return; save.mutate(); };
  const doExport = () => { download(`so-tien-mung-${new Date().toISOString().slice(0, 10)}.csv`, giftsToCsv(records, evName)); setMsg(`Đã tạo file CSV với ${records.length} lượt mừng.`); };
  const pickGuest = (name: string) => {
    const g = guests.find(x => x.name.toLowerCase() === name.trim().toLowerCase());
    setD(p => ({ ...p, giver_name: name, guest_id: g ? g.id : null, side: g ? (g.side as GiftSide) : p.side }));
  };

  return <div className="max-w-4xl"><div className="flex flex-wrap items-end justify-between gap-x-3"><Header name="Tiền mừng" subtitle={`SỔ KHÁCH · ${coupleName(w).toUpperCase()}`} />
    <div className="mb-6 flex flex-wrap gap-2"><Button variant="outline" size="lg" className="min-h-11" disabled={records.length === 0} onClick={doExport}><Download className="size-4" /> Xuất CSV</Button><WriteButton size="lg" className="min-h-11" onClick={openAdd}><Plus className="size-4" /> Ghi tiền mừng</WriteButton></div></div>
    <GuestTabs active="gifts" />
    {msg && <p role="status" className="mb-4 rounded-md bg-sage p-3 text-sm font-semibold">{msg}</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <Panel className="hero-panel p-4"><p className="text-xs font-semibold text-muted-foreground">Tổng tiền mừng</p><h2 className="mt-1 font-display text-3xl font-bold text-primary">{fmtVnd(t.total)}</h2><p className="mt-1 text-xs text-muted-foreground">{t.count} lượt mừng</p></Panel>
      <Panel className="p-4"><p className="text-xs font-semibold text-muted-foreground">Chưa cảm ơn</p><h2 className="mt-1 font-display text-3xl font-bold">{t.unthanked}</h2><p className="mt-1 text-xs text-muted-foreground">người cần gửi lời cảm ơn sau đám cưới</p></Panel>
    </div>
    <div className="mt-4"><Note tone="warm">Ghi lại ai mừng bao nhiêu để sau này “đi lại” cho phải đạo — như cách các mẹ vẫn giữ quyển sổ tay. Chỉ hai người quản lý thấy được sổ này.</Note></div>
    <div className="mb-4 mt-5 flex flex-wrap items-center gap-2">
      <input type="search" aria-label="Tìm tên người mừng" placeholder="Tìm tên người mừng…" value={q} onChange={e => setQ(e.target.value)} className="h-11 min-w-0 flex-1 rounded-md border border-border bg-card px-4 text-sm" />
      <select aria-label="Lọc theo buổi" value={eventId} onChange={e => setEventId(e.target.value)} className="h-11 rounded-md border border-border bg-card px-3 text-sm"><option value="all">Mọi buổi</option>{events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}<option value="">Chung</option></select>
      <select aria-label="Lọc theo nhà" value={side} onChange={e => setSide(e.target.value)} className="h-11 rounded-md border border-border bg-card px-3 text-sm"><option value="all">Cả hai nhà</option><option value="nha-trai">Nhà trai</option><option value="nha-gai">Nhà gái</option><option value="chung">Chung</option></select>
      <label className="flex h-11 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={unthankedOnly} onChange={e => setUnthankedOnly(e.target.checked)} /> Chưa cảm ơn</label>
    </div>
    {filtered.length === 0 ? <Note tone="warm">{records.length === 0 ? 'Chưa ghi khoản mừng nào. Sau đám cưới, ngồi bóc phong bì và ghi vào đây nhé — mỗi người một dòng.' : 'Không tìm thấy khoản mừng phù hợp.'}</Note> :
      <div className="space-y-3" aria-live="polite">{filtered.map(r => <Panel key={r.id}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><h2 className="break-words font-display text-xl font-semibold">{r.giver_name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{evName(r.event_id)} · {giftSideLabel(r.side)} · {methodLabel(r.method)}{r.method === 'hien_vat' && r.gift_detail ? ` · ${r.gift_detail}` : ''}</p></div>
          <div className="text-right"><p className="font-display text-xl font-bold text-primary">{fmtVnd(r.amount_vnd)}</p><Status tone={r.thanked ? 'sage' : 'warm'}>{r.thanked ? 'Đã cảm ơn' : 'Chưa cảm ơn'}</Status></div>
        </div>
        {r.note && <p className="mt-2 break-words text-sm text-muted-foreground">{r.note}</p>}
        <div className="mt-2 flex flex-wrap gap-x-4">
          <Button variant="ghost" className="min-h-11 px-0 text-primary" onClick={() => openEdit(r)}><Pencil className="size-4" /> Sửa</Button>
          <WriteButton variant="ghost" className="min-h-11 px-0 text-primary" disabled={thanked.isPending} onClick={() => thanked.mutate(r)}>{r.thanked ? 'Bỏ đánh dấu cảm ơn' : 'Đã cảm ơn'}</WriteButton>
          <Button variant="ghost" className="min-h-11 px-0 text-destructive" onClick={() => setConfirmDel(r)}><Trash2 className="size-4" /> Xóa</Button>
        </div>
      </Panel>)}</div>}
    <DemoDialog real busy={save.isPending} open={open} onOpenChange={o => { if (!save.isPending) setOpen(o); }} title={editing ? 'Sửa khoản mừng' : 'Ghi tiền mừng'} description="Mỗi người mừng một dòng — ghi ngay khi bóc phong bì để khỏi sót." submitLabel={save.isPending ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Ghi vào sổ'} onSubmit={submit}>
      <FormField label="Tên người mừng *" id="gift-name" error={errs['giver_name']}>
        <input id="gift-name" list="gift-guest-list" autoFocus maxLength={120} className={inputCls} value={d.giver_name} aria-invalid={!!errs['giver_name']} onChange={e => pickGuest(e.target.value)} placeholder="Ví dụ: Bác Hai" />
        <datalist id="gift-guest-list">{guests.map(g => <option key={g.id} value={g.name} />)}</datalist>
      </FormField>
      <p className="-mt-2 text-xs text-muted-foreground">Gõ tên có trong sổ khách để tự gắn với hồ sơ khách.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Số tiền (đ) *" id="gift-amount" error={errs['amount']}><input id="gift-amount" type="number" min="0" step="1000" inputMode="numeric" className={inputCls} value={d.amount} aria-invalid={!!errs['amount']} onChange={e => setD({ ...d, amount: e.target.value })} placeholder="500000" /></FormField>
        <FormField label="Hình thức" id="gift-method"><select id="gift-method" className={inputCls} value={d.method} onChange={e => setD({ ...d, method: e.target.value as GiftDraft['method'] })}>{GIFT_METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></FormField>
      </div>
      {d.method === 'hien_vat' && <FormField label="Chi tiết hiện vật *" id="gift-detail" error={errs['gift_detail']}><input id="gift-detail" maxLength={200} className={inputCls} value={d.gift_detail} onChange={e => setD({ ...d, gift_detail: e.target.value })} placeholder="Ví dụ: bộ ấm chén" /></FormField>}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Buổi lễ" id="gift-event"><select id="gift-event" className={inputCls} value={d.event_id} onChange={e => setD({ ...d, event_id: e.target.value })}><option value="">Chung</option>{events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></FormField>
        <FormField label="Nhà" id="gift-side"><select id="gift-side" className={inputCls} value={d.side} onChange={e => setD({ ...d, side: e.target.value as GiftSide })}><option value="chung">Chung</option><option value="nha-trai">Nhà trai</option><option value="nha-gai">Nhà gái</option></select></FormField>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={d.thanked} onChange={e => setD({ ...d, thanked: e.target.checked })} /> Đã gửi lời cảm ơn</label>
      <FormField label="Ghi chú" id="gift-note" error={errs['note']}><input id="gift-note" maxLength={500} className={inputCls} value={d.note} onChange={e => setD({ ...d, note: e.target.value })} placeholder="Ví dụ: mừng chung với gia đình anh Ba" /></FormField>
      {errs['form'] && <div role="alert"><Note tone="copper">{errs['form']}</Note></div>}
    </DemoDialog>
    <Dialog open={!!confirmDel} onOpenChange={v => { if (!v) setConfirmDel(null); }}><DialogContent className="max-h-[92vh] w-[calc(100vw-24px)] max-w-lg overflow-y-auto rounded-lg bg-card p-5 text-foreground sm:p-6">
      <DialogHeader className="text-left"><DialogTitle className="font-display text-2xl">Xóa khoản mừng?</DialogTitle><DialogDescription>Khoản mừng của “{confirmDel?.giver_name}” ({confirmDel ? fmtVnd(confirmDel.amount_vnd) : ''}) sẽ bị xóa khỏi sổ.</DialogDescription></DialogHeader>
      <DialogFooter className="flex-col-reverse gap-2 sm:flex-row"><Button variant="outline" size="lg" className="min-h-11" onClick={() => setConfirmDel(null)}>Giữ lại</Button><Button size="lg" className="min-h-11" disabled={del.isPending} onClick={() => confirmDel && del.mutate(confirmDel.id)}>{del.isPending && <Loader2 className="animate-spin" />}Xác nhận xóa</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
