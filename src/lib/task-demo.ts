/** Browser-tab planner shape. Legacy tag/bucket are intentionally ignored. */
export type DemoTask = {
  id: string; title: string; event: string; due: string; owner: string;
  status: 'Cần làm' | 'Đang làm' | 'Chờ chốt' | 'Xong';
  kind?: 'table-count' | 'standard'; plannedTables?: number | undefined; reserveTables?: number | undefined;
  outcome?: string; note?: string; added?: boolean;
};

export function normalizeTask(task: DemoTask): DemoTask {
  const kind = task.kind === 'standard' ? 'standard' : task.kind === 'table-count' || (task.id === 't1' && !task.kind) ? 'table-count' : undefined;
  return {
    id: task.id,
    title: task.id === 't1' && task.title === 'Sổ bàn tiệc nhà trai' ? 'Dự tính số bàn tiệc nhà trai' : task.title,
    event: task.event, due: typeof task.due === 'string' ? task.due : '',
    owner: task.owner, status: task.status,
    ...(kind ? { kind } : {}),
    ...(kind === 'table-count' && Number.isInteger(task.plannedTables) && (task.plannedTables ?? -1) >= 0 ? { plannedTables: task.plannedTables } : {}),
    ...(kind === 'table-count' && Number.isInteger(task.reserveTables) && (task.reserveTables ?? -1) >= 0 ? { reserveTables: task.reserveTables } : {}),
    ...(typeof task.outcome === 'string' ? { outcome: task.outcome } : {}),
    ...(typeof task.note === 'string' ? { note: task.note } : {}),
    ...(task.added ? { added: true } : {}),
  };
}

export function vietnamToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function dayNumber(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year = 0, month = 0, day = 0] = iso.split('-').map(Number);
  const stamp = Date.UTC(year, month - 1, day);
  return new Date(stamp).toISOString().slice(0, 10) === iso ? stamp / 86400000 : null;
}

export function taskDue(task: Pick<DemoTask, 'due' | 'status'>, today: string): { label: string; group: 'today' | 'soon' | 'overdue' | 'none' } {
  const due = dayNumber(task.due);
  const current = dayNumber(today);
  if (due === null || current === null) return { label: 'Chưa đặt hạn', group: 'none' };
  const diff = due - current;
  // Finished work keeps its actual date without presenting an urgent deadline.
  if (task.status === 'Xong') return { label: `Hạn ${task.due.slice(8, 10)}/${task.due.slice(5, 7)}/${task.due.slice(0, 4)}`, group: 'none' };
  if (diff < 0) return { label: `Quá hạn ${-diff} ngày`, group: 'overdue' };
  if (diff === 0) return { label: 'Hạn hôm nay', group: 'today' };
  return { label: `Hạn ${task.due.slice(8, 10)}/${task.due.slice(5, 7)}/${task.due.slice(0, 4)}`, group: 'soon' };
}

export function inTaskFilter(task: DemoTask, filter: string, today: string): boolean {
  if (filter === 'Tất cả') return true;
  if (filter === 'Chờ chốt') return task.status === 'Chờ chốt';
  const group = taskDue(task, today).group;
  if (filter === 'Hôm nay') return group === 'today';
  if (filter !== 'Sắp hạn') return false;
  const due = dayNumber(task.due);
  const current = dayNumber(today);
  return group === 'overdue' || (group === 'soon' && due !== null && current !== null && due - current <= 14);
}

export function validateTableCount(kind: DemoTask['kind'], planned: string, reserve: string, status: DemoTask['status']): string {
  if (kind !== 'table-count') return '';
  if ((planned && !/^(0|[1-9]\d*)$/.test(planned)) || (reserve && !/^(0|[1-9]\d*)$/.test(reserve))) return 'Số bàn phải là số nguyên từ 0 trở lên.';
  if ((planned && !Number.isSafeInteger(Number(planned))) || (reserve && !Number.isSafeInteger(Number(reserve)))) return 'Số bàn quá lớn. Hãy nhập số nhỏ hơn.';
  if (status === 'Xong' && (!planned || Number(planned) < 1)) return 'Cần nhập số bàn dự kiến lớn hơn 0 trước khi đánh dấu đã xong.';
  return '';
}