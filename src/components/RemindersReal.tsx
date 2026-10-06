/** Reminder preferences: which reminder emails the couple wants. Defaults ON. */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { friendlyError, useMyWedding } from '@/lib/wedding-api';
import { reminderPrefsQuery, saveReminderPrefs } from '@/lib/reminders-api';
import { effectivePrefs } from '@/lib/reminders';
import { Header, Note, Panel, SmallLabel } from './PhaseOne';
import { Loading, LoadError } from './PhaseThree';

export function RealRemindersScreen() {
  const w = useMyWedding().data!;
  const pq = useQuery(reminderPrefsQuery(w.id));
  if (pq.isPending) return <Loading label="Đang tải cài đặt nhắc việc…" />;
  if (pq.isError) return <LoadError error={pq.error} retry={() => pq.refetch()} />;
  const eff = effectivePrefs(pq.data);
  return <RemindersForm weddingId={w.id} initial={eff} />;
}

function RemindersForm({ weddingId, initial }: { weddingId: string; initial: { task_reminders: boolean; event_reminders: boolean } }) {
  const qc = useQueryClient();
  const [tasks, setTasks] = useState(initial.task_reminders);
  const [events, setEvents] = useState(initial.event_reminders);
  const [msg, setMsg] = useState('');
  const save = useMutation({
    mutationFn: () => saveReminderPrefs(weddingId, { task_reminders: tasks, event_reminders: events }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['reminder-prefs', weddingId] }); setMsg('Đã lưu cài đặt nhắc việc.'); },
    onError: e => setMsg(friendlyError(e)),
  });
  const dirty = tasks !== initial.task_reminders || events !== initial.event_reminders;
  return <div className="mx-auto max-w-xl">
    <Header name="Nhắc việc qua email" subtitle="KHÁC / CÀI ĐẶT" />
    <Note tone="warm">Mỗi sáng, Se Duyên gửi email nhắc hai bạn những việc sắp đến hạn và buổi lễ sắp tới — để không bị lỡ nhịp chuẩn bị. Email gửi từ <strong>chao@seduyen.app</strong> đến địa chỉ hai bạn dùng để đăng nhập.</Note>
    {msg && <p role="status" className="mb-4 rounded-md bg-sage p-3 text-sm font-semibold">{msg}</p>}
    <Panel className="mt-5 space-y-1 p-2">
      <ToggleRow id="rem-task" checked={tasks} onChange={setTasks}
        title="Nhắc việc sắp đến hạn" detail="Gửi trước 7 ngày, 3 ngày và 1 ngày." />
      <ToggleRow id="rem-event" checked={events} onChange={setEvents}
        title="Nhắc buổi lễ sắp tới" detail="Gửi trước 30 ngày, 7 ngày và 1 ngày." />
    </Panel>
    <Button size="lg" className="mt-5 min-h-11 w-full sm:w-auto" disabled={save.isPending || !dirty} aria-busy={save.isPending}
      onClick={() => save.mutate()}>
      {save.isPending && <Loader2 className="animate-spin" />}{dirty ? 'Lưu thay đổi' : 'Đã lưu'}
    </Button>
    <p className="mt-4 text-xs text-muted-foreground">Mỗi mốc chỉ nhắc một lần cho mỗi việc/buổi lễ. Tắt cả hai là hai bạn sẽ không nhận email nhắc nào nữa.</p>
  </div>;
}

function ToggleRow({ id, checked, onChange, title, detail }: { id: string; checked: boolean; onChange: (v: boolean) => void; title: string; detail: string }) {
  return <label htmlFor={id} className="flex min-h-16 cursor-pointer items-center justify-between gap-4 rounded-md px-3 py-3 hover:bg-muted/50">
    <span><span className="block font-semibold">{title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span></span>
    <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="size-6 shrink-0 accent-primary" />
  </label>;
}
