/** Typed data layer for the seating chart. Browser client; RLS scopes every row to wedding managers. */
import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SeatingTable } from './seating';

const must = <T,>(r: { data: T | null; error: unknown }): T => { if (r.error) throw r.error; return (r.data ?? (null as unknown)) as T; };

export const seatingTablesQuery = (weddingId: string, eventId: string) => queryOptions({
  queryKey: ['seating', weddingId, eventId],
  queryFn: async (): Promise<SeatingTable[]> =>
    must(await supabase.from('seating_tables').select('*').eq('wedding_id', weddingId).eq('event_id', eventId).order('position').order('created_at')) as SeatingTable[],
});

export async function createSeatingTable(weddingId: string, eventId: string, name: string, capacity: number, position: number) {
  must(await supabase.from('seating_tables').insert({ wedding_id: weddingId, event_id: eventId, name: name.trim(), capacity, position }));
}
export async function updateSeatingTable(id: string, patch: { name?: string; capacity?: number }) {
  const row: { name?: string; capacity?: number } = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.capacity !== undefined) row.capacity = patch.capacity;
  must(await supabase.from('seating_tables').update(row).eq('id', id));
}
export async function deleteSeatingTable(id: string) {
  // guest_event_assignments.table_id is ON DELETE SET NULL: guests become unseated.
  must(await supabase.from('seating_tables').delete().eq('id', id));
}
export async function assignTable(guestId: string, eventId: string, tableId: string | null) {
  must(await supabase.from('guest_event_assignments').update({ table_id: tableId }).eq('guest_id', guestId).eq('event_id', eventId));
}
