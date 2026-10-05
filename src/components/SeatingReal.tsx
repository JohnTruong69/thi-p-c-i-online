/** Seating chart per event (xếp bàn tiệc). Guests are seated in people (party_size). */
import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WriteButton } from './AccessStateBanner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { eventsQuery, friendlyError, useMyWedding } from '@/lib/wedding-api';
import { guestsQuery } from '@/lib/guests-api';
import { assignTable, createSeatingTable, deleteSeatingTable, seatingTablesQuery, updateSeatingTable } from '@/lib/seating-api';
import { tableLoads, unseatedPeople, validateTable, type SeatingTable } from '@/lib/seating';
import { GUEST_SIDE_TEXT } from '@/lib/guests';
import { DemoDialog, FormField, Header, Note, Panel, SmallLabel, inputCls, useFocusId } from './PhaseOne';
import { LoadError, Loading, coupleName } from './PhaseThree';

export function RealSeatingScreen() {
  const w = useMyWedding().data!; const qc = useQueryClient();
  const eventId = useFocusId() ?? '';
  const eq = useQuery(eventsQuery(w.id));
  const tq = useQuery(seatingTablesQuery(w.id, eventId));
  const gq = useQuery(guestsQuery(w.id));
  const [open, setOpen] = useState(false); const [editing, setEditing] = useState<SeatingTable | null>(null);
  const [name, setName] = useState(''); const [capacity, setCapacity] = useState('10'); const [errs, setErrs] = useState<Record<string, string>>({});
  const [confirmDel, setConfirmDel] = useState<SeatingTable | null>(null);
  const [q, setQ] = useState(''); const [tableFilter, setTableFilter] = useState('all');
  const [msg, setMsg] = useState('');
  const refreshTables = () => qc.invalidateQueries({ queryKey: ['seating', w.id, eventId] });
  const refreshGuests = () => qc.invalidateQueries({ queryKey: ['guests', w.id] });
  const save = useMutation({
    mutationFn: async () => {
      if (editing) await updateSeatingTable(editing.id, { name, capacity: Number(capacity) });
      else await createSeatingTable(w.id, eventId, name, Number(capacity), tq.data?.length ?? 0);
    },
    onSuccess: async () => { await refreshTables(); setOpen(false); setMsg(editing ? 'Đã lưu bàn.' : 'Đã thêm bàn.'); },
    onError: e => setErrs({ form: friendlyError(e) }),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteSeatingTable(id),
    onSuccess: async () => { await Promise.all([refreshTables(), refreshGuests()]); setConfirmDel(null); setMsg('Đã xóa bàn; khách ở bàn đó chuyển sang “Chưa xếp”.'); },
    onError: e => setMsg(friendlyError(e)),
  });
  const assign = useMutation({
    mutationFn: ({ guestId, tableId }: { guestId: string; tableId: string | null }) => assignTable(guestId, eventId, tableId),
    onSuccess: refreshGuests,
    onError: e => setMsg(friendlyError(e)),
  });
  const event = useMemo(() => (eq.data ?? []).find(e => e.id === eventId), [eq.data, eventId]);
  const tables = useMemo(() => tq.data ?? [], [tq.data]);
  const guests = useMemo(() => (gq.data ?? []).filter(g => g.assignments.some(a => a.event_id === eventId)), [gq.data, eventId]);
  const tableOf = (guestId: string) => guests.find(g => g.id === guestId)?.assignments.find(a => a.event_id === eventId)?.table_id ?? null;
  const rows = useMemo(() => guests.map(g => ({ table_id: g.assignments.find(a => a.event_id === eventId)?.table_id ?? null, party_size: g.party_size })), [guests, eventId]);
  const loads = useMemo(() => tableLoads(tables, rows), [tables, rows]);
  const unseated = unseatedPeople(rows);
  const totalPeople = rows.reduce((s, r) => s + r.party_size, 0);
  const shown = guests.filter(g => {
    if (q.trim() && !g.name.toLowerCase().includes(q.trim().toLowerCase())) return false;
    const tid = tableOf(g.id);
    if (tableFilter === 'unseated') return !tid;
    if (tableFilter !== 'all' && tid !== tableFilter) return false;
    return true;
  });
  if (eq.isPending || tq.isPending || gq.isPending) return <Loading label="Đang tải sơ đồ bàn…" />;
  if (eq.isError || tq.isError || gq.isError) return <LoadError error={eq.error ?? tq.error ?? gq.error} retry={() => { eq.refetch(); tq.refetch(); gq.refetch(); }} />;
  if (!eventId || !event) return <div className="mx-auto max-w-xl"><Header name="Xếp bàn tiệc" subtitle="KẾ HOẠCH" /><Note tone="copper">Không tìm thấy buổi lễ này. Có thể buổi đã bị bỏ.</Note><Button asChild variant="outline" size="lg" className="mt-4 min-h-11"><Link to="/wedding/events"><ArrowLeft className="size-4" /> Về các buổi lễ</Link></Button></div>;

  const openAdd = () => { setEditing(null); setName(`Bàn ${tables.length + 1}`); setCapacity('10'); setErrs({}); setMsg(''); setOpen(true); };
  const openEdit = (t: SeatingTable) => { setEditing(t); setName(t.name); setCapacity(String(t.capacity)); setErrs({}); setMsg(''); setOpen(true); };
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (save.isPending) return; const v = validateTable(name, capacity); setErrs(v); if (Object.keys(v).length) return; save.mutate(); };

  return <div className="max-w-4xl">
    <Button asChild variant="ghost" size="lg" className="mb-2 min-h-11 px-0 text-primary"><Link to="/wedding/events"><ArrowLeft className="size-4" /> Các buổi lễ</Link></Button>
    <Header name={`Xếp bàn — ${event.name}`} subtitle={`KẾ HOẠCH · ${coupleName(w).toUpperCase()}`} />
    {msg && <p role="status" className="mb-4 rounded-md bg-sage p-3 text-sm font-semibold">{msg}</p>}
    <Panel className="hero-panel mb-6 p-4"><div className="flex flex-wrap gap-x-10 gap-y-3">
      <div><p className="text-xs text-muted-foreground">Đã xếp</p><p className="font-display text-3xl font-bold text-primary">{totalPeople - unseated}<span className="text-lg text-muted-foreground">/{totalPeople} người</span></p></div>
      <div><p className="text-xs text-muted-foreground">Số bàn</p><p className="font-display text-3xl font-bold">{tables.length}</p></div>
      <div><p className="text-xs text-muted-foreground">Chưa xếp</p><p className="font-display text-3xl font-bold">{unseated} người</p></div>
    </div></Panel>
    <section aria-label="Bàn tiệc"><SmallLabel>BÀN TIỆC · {tables.length}</SmallLabel>
      <div className="grid gap-3 sm:grid-cols-2">
        {loads.map(({ table, people, records, over }) => <Panel key={table.id} className={`p-4 ${over ? 'border-l-[3px] border-l-destructive' : ''}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><h3 className="break-words font-display text-lg font-semibold">{table.name}</h3>
              <p className={`mt-1 text-xs ${over ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>{people}/{table.capacity} người{over ? ' — quá tải!' : ''} · {records} hồ sơ</p></div>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="sm" className="min-h-11" aria-label={`Sửa ${table.name}`} onClick={() => openEdit(table)}><Pencil className="size-4" /></Button>
              <Button variant="ghost" size="sm" className="min-h-11 text-destructive" aria-label={`Xóa ${table.name}`} onClick={() => setConfirmDel(table)}><Trash2 className="size-4" /></Button>
            </div>
          </div>
        </Panel>)}
        <Panel className="flex min-h-[104px] items-center justify-center border-dashed"><Button variant="ghost" className="min-h-11 text-primary" onClick={openAdd}><Plus className="size-4" /> Thêm bàn</Button></Panel>
      </div>
    </section>
    <section aria-label="Xếp khách" className="mt-8"><SmallLabel>XẾP KHÁCH · {guests.length} HỒ SƠ</SmallLabel>
      <div className="mb-4 flex flex-wrap gap-2">
        <input type="search" aria-label="Tìm khách" placeholder="Tìm tên khách…" value={q} onChange={e => setQ(e.target.value)} className="h-11 min-w-0 flex-1 rounded-md border border-border bg-card px-4 text-sm" />
        <select aria-label="Lọc theo bàn" value={tableFilter} onChange={e => setTableFilter(e.target.value)} className="h-11 rounded-md border border-border bg-card px-3 text-sm">
          <option value="all">Mọi bàn</option><option value="unseated">Chưa xếp</option>
          {tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      {guests.length === 0 ? <Note tone="warm">Buổi này chưa có khách nào. Thêm khách vào sổ khách và gán họ vào buổi này trước nhé.</Note>
        : shown.length === 0 ? <Note tone="warm">Không tìm thấy khách phù hợp.</Note>
        : <div className="space-y-2" aria-live="polite">{shown.map(g => { const tid = tableOf(g.id); const load = loads.find(l => l.table.id === tid); return <Panel key={g.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0"><p className="break-words font-semibold">{g.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{g.party_size} người · {GUEST_SIDE_TEXT[g.side]}</p></div>
          <select aria-label={`Bàn của ${g.name}`} value={tid ?? ''} disabled={assign.isPending} onChange={e => assign.mutate({ guestId: g.id, tableId: e.target.value || null })} className="h-11 max-w-full rounded-md border border-border bg-card px-3 text-sm">
            <option value="">Chưa xếp</option>
            {tables.map(t => <option key={t.id} value={t.id}>{t.name} ({loads.find(l => l.table.id === t.id)?.people ?? 0}/{t.capacity})</option>)}
          </select>
        </div>{load?.over && <p className="mt-1 text-xs font-semibold text-destructive">Bàn {load.table.name} đang quá tải.</p>}</Panel>; })}</div>}
    </section>
    <DemoDialog real busy={save.isPending} open={open} onOpenChange={o => { if (!save.isPending) setOpen(o); }} title={editing ? 'Sửa bàn' : 'Thêm bàn'} description="Đặt tên và sức chứa cho bàn tiệc." submitLabel={save.isPending ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Thêm bàn'} onSubmit={submit}>
      <FormField label="Tên bàn *" id="table-name" error={errs['name']}><input id="table-name" autoFocus maxLength={40} className={inputCls} value={name} aria-invalid={!!errs['name']} onChange={e => setName(e.target.value)} placeholder="Ví dụ: Bàn 1" /></FormField>
      <FormField label="Sức chứa (người) *" id="table-capacity" error={errs['capacity']}><input id="table-capacity" type="number" min="1" max="50" step="1" inputMode="numeric" className={inputCls} value={capacity} aria-invalid={!!errs['capacity']} onChange={e => setCapacity(e.target.value)} /></FormField>
      {errs['form'] && <div role="alert"><Note tone="copper">{errs['form']}</Note></div>}
    </DemoDialog>
    <Dialog open={!!confirmDel} onOpenChange={v => { if (!v) setConfirmDel(null); }}><DialogContent className="max-h-[92vh] w-[calc(100vw-24px)] max-w-lg overflow-y-auto rounded-lg bg-card p-5 text-foreground sm:p-6">
      <DialogHeader className="text-left"><DialogTitle className="font-display text-2xl">Xóa {confirmDel?.name}?</DialogTitle><DialogDescription>Khách đang ngồi bàn này sẽ chuyển sang “Chưa xếp”. Bàn bị xóa không khôi phục được.</DialogDescription></DialogHeader>
      <DialogFooter className="flex-col-reverse gap-2 sm:flex-row"><Button variant="outline" size="lg" className="min-h-11" onClick={() => setConfirmDel(null)}>Giữ bàn</Button><Button size="lg" className="min-h-11" disabled={del.isPending} onClick={() => confirmDel && del.mutate(confirmDel.id)}>{del.isPending && <Loader2 className="animate-spin" />}Xác nhận xóa</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
