import { useState } from 'react';
import { type DateImpact } from '@/lib/phase2';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fmtDate } from './PhaseOne';

/* ---------- Event date change review ---------- */
export function DateImpactDialog({ open, eventName, from, to, impact, onCancel, onConfirm }: { open: boolean; eventName: string; from: string; to: string; impact: DateImpact | null; onCancel: () => void; onConfirm: (shift: boolean) => void }) {
  const [shift, setShift] = useState(true);
  if (!impact) return null;
  return <Dialog open={open} onOpenChange={o => { if (!o) onCancel(); }}><DialogContent className="max-h-[92vh] w-[calc(100vw-24px)] max-w-lg overflow-y-auto rounded-lg bg-card p-5 sm:p-6">
    <DialogHeader className="text-left"><DialogTitle className="font-display text-2xl">{impact.cleared ? 'Xóa ngày' : 'Đổi ngày'} {eventName}?</DialogTitle><DialogDescription>{from ? fmtDate(from) + '/' + from.slice(0, 4) : 'Chưa có ngày'} → {to ? `${fmtDate(to)}/${to.slice(0, 4)}` : 'Chưa có ngày'}{impact.deltaDays ? ` (${impact.deltaDays > 0 ? 'lùi' : 'sớm'} ${Math.abs(impact.deltaDays)} ngày)` : ''}. Chỉ thay đổi trong phiên xem này.</DialogDescription></DialogHeader>
    <div className="space-y-4 text-sm">
      {impact.cleared && <p role="alert" className="rounded-md bg-copper-soft p-2 text-xs font-semibold">Buổi này sẽ không còn ngày. Hạn các việc giữ nguyên, không tự dời.</p>}
      <section><h3 className="font-semibold">Việc gắn với buổi này · {impact.tasks.length}</h3>
        {impact.tasks.length ? <><ul className="mt-1 space-y-1 text-xs">{impact.tasks.map(t => <li key={t.id}>{t.title}: {fmtDate(t.from)} → {fmtDate(t.to)}</li>)}</ul>
          <label className="mt-2 flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-xs"><input type="checkbox" className="size-4 accent-primary" checked={shift} onChange={e => setShift(e.target.checked)} />Dời hạn các việc này theo ngày mới</label></> : <p className="text-xs text-muted-foreground">Không có việc có hạn gắn với buổi này.</p>}</section>
      <section><h3 className="font-semibold">Khoản cọc / ngày trả cố định · {impact.costWarnings.length}</h3>
        {impact.costWarnings.length ? <><ul className="mt-1 space-y-1 text-xs">{impact.costWarnings.map((c, i) => <li key={i}>{c.title} · {c.label}: {fmtDate(c.due)}</li>)}</ul><p className="mt-1 rounded-md bg-copper-soft p-2 text-xs">Không tự đổi hạn trả. Hãy hỏi lại bên cung cấp rồi sửa trong Ngân sách nếu cần.</p></> : <p className="text-xs text-muted-foreground">Không có khoản có ngày trả gắn với buổi này.</p>}</section>
    </div>
    <DialogFooter className="mt-4 flex-col-reverse gap-2 sm:flex-row"><Button variant="outline" size="lg" className="min-h-11" onClick={onCancel}>Giữ ngày cũ</Button><Button size="lg" className="min-h-11" onClick={() => onConfirm(shift && impact.tasks.length > 0)}>{impact.cleared ? 'Xóa ngày' : 'Đổi ngày'}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
