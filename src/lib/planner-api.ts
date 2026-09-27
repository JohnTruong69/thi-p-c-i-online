/** Typed data layer for persisted Planner rows (tasks, budget). Browser client; RLS scopes every row to the caller's Wedding. */
import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import type { CostPayload, TaskStatusDb } from './planner';
import type { EventForm } from './wedding-api';

export type TaskRow = Database['public']['Tables']['tasks']['Row'];
export type BudgetItemRow = Database['public']['Tables']['budget_items']['Row'];
export type InstallmentRow = Database['public']['Tables']['budget_installments']['Row'];
export type BudgetItemWithSchedule = BudgetItemRow & { installments: InstallmentRow[] };
const must = <T,>(r: { data: T | null; error: unknown }): T => { if (r.error) throw r.error; return (r.data ?? (null as unknown)) as T; };

export const tasksQuery = (weddingId: string) => queryOptions({
  queryKey: ['tasks', weddingId],
  queryFn: async (): Promise<TaskRow[]> => must(await supabase.from('tasks').select('*').eq('wedding_id', weddingId).order('due_date', { nullsFirst: false }).order('created_at')),
});

export type TaskInput = {
  title: string; event_id: string | null; due_date: string | null; assignee: 'both' | 'one' | 'two'; status: TaskStatusDb;
  kind: 'standard' | 'table-count'; planned_tables: number | null; reserve_tables: number | null; outcome: string | null; note: string | null;
};
export async function insertTask(weddingId: string, t: TaskInput) { must(await supabase.from('tasks').insert({ wedding_id: weddingId, source: 'manual', ...t })); }
export async function updateTask(id: string, t: Partial<TaskInput>) { must(await supabase.from('tasks').update(t).eq('id', id)); }
/** Adds chosen suggestions; the unique (wedding, template_id) index makes retries/double-clicks harmless. */
export async function addSuggestedTasks(weddingId: string, items: { id: string; title: string }[]) {
  if (!items.length) return;
  must(await supabase.from('tasks').upsert(items.map(s => ({ wedding_id: weddingId, title: s.title, template_id: s.id, source: 'suggested' })), { onConflict: 'wedding_id,template_id', ignoreDuplicates: true }));
}

export const budgetQuery = (weddingId: string) => queryOptions({
  queryKey: ['budget', weddingId],
  queryFn: async (): Promise<BudgetItemWithSchedule[]> => {
    const [items, inst] = await Promise.all([
      supabase.from('budget_items').select('*').eq('wedding_id', weddingId).order('created_at'),
      supabase.from('budget_installments').select('*').eq('wedding_id', weddingId).order('due_date', { nullsFirst: false }).order('created_at'),
    ]);
    const rows = must(items), ins = must(inst);
    return rows.map(r => ({ ...r, installments: ins.filter(i => i.budget_item_id === r.id) }));
  },
});
/** Saves the cost and replaces its schedule in one transaction (server re-checks every money rule). */
export async function saveBudgetItem(weddingId: string, id: string | null, p: CostPayload) {
  const { installments, ...item } = p;
  return must(await supabase.rpc('save_budget_item', { p_wedding_id: weddingId, p_item_id: id as string, p_item: item, p_installments: installments })) as string;
}
export async function deleteBudgetItem(id: string) { must(await supabase.from('budget_items').delete().eq('id', id)); }
export async function setBudgetCap(weddingId: string, cap: number) { must(await supabase.from('weddings').update({ budget_cap_vnd: cap }).eq('id', weddingId)); }

/** Everything tied to an Event, for date-change and removal reviews (with links back to each record). */
export async function eventImpactData(eventId: string) {
  const [t, b, g] = await Promise.all([
    supabase.from('tasks').select('id,title,due_date,status').eq('event_id', eventId).order('due_date', { nullsFirst: false }),
    supabase.from('budget_items').select('id,label,budget_installments(id,label,due_date,amount_vnd,paid_at)').eq('event_id', eventId),
    supabase.from('guest_event_assignments').select('guest_id', { count: 'exact', head: true }).eq('event_id', eventId),
  ]);
  if (g.error) throw g.error;
  return { tasks: must(t), costs: must(b), guests: g.count ?? 0 };
}
export async function updateEventWithImpact(eventId: string, f: EventForm, shiftTaskIds: string[]) {
  return must(await supabase.rpc('update_event_with_impact', {
    p_event_id: eventId, p_shift_task_ids: shiftTaskIds,
    p_fields: { name: f.name.trim(), side: f.side, event_date: f.date, event_time: f.time, venue: f.venue, address: f.address, status: f.confirmed ? 'confirmed' : 'tentative' },
  })) as number;
}
export async function removeEvent(eventId: string) {
  return must(await supabase.rpc('remove_event', { p_event_id: eventId })) as { tasks: number; budget: number; guests: number };
}
