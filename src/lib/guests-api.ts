/** Typed data layer for the persisted guest book. Browser client; RLS scopes every row; writes go through transactional RPCs. */
import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import type { GuestAssignment, GuestDraft, GuestRecord, GuestSideDb } from './guests';
import { toGuestPayload } from './guests';

export type ImportBatchRow = Database['public']['Tables']['guest_import_batches']['Row'];
const must = <T,>(r: { data: T | null; error: unknown }): T => { if (r.error) throw r.error; return (r.data ?? (null as unknown)) as T; };

export const guestsQuery = (weddingId: string) => queryOptions({
  queryKey: ['guests', weddingId],
  queryFn: async (): Promise<GuestRecord[]> => {
    const rows = must(await supabase.from('guests')
      .select('id,name,phone,side,party_size,note,created_at,guest_event_assignments(event_id,invite_status,rsvp_status,attending_count,invitation_method,attendance_intent,expected_count,response_source,responded_at,response_by)')
      .eq('wedding_id', weddingId).order('created_at', { ascending: false }).range(0, 9999));
    return rows.map(r => ({ id: r.id, name: r.name, phone: r.phone, side: r.side as GuestSideDb, party_size: r.party_size, note: r.note, assignments: (r.guest_event_assignments ?? []) as GuestAssignment[] }));
  },
});

export async function saveGuest(weddingId: string, id: string | null, d: GuestDraft) {
  const p = toGuestPayload(d);
  return must(await supabase.rpc('save_guest', { p_wedding_id: weddingId, p_guest_id: id as string, p_guest: p.guest, p_assignments: p.assignments })) as string;
}
export async function deleteGuest(id: string) { must(await supabase.from('guests').delete().eq('id', id)); }

export const batchesQuery = (weddingId: string) => queryOptions({
  queryKey: ['guest-batches', weddingId],
  queryFn: async (): Promise<ImportBatchRow[]> => must(await supabase.from('guest_import_batches').select('*').eq('wedding_id', weddingId).order('created_at', { ascending: false })),
});

export type ImportRowPayload = { source_row: number; name: string; phone: string; side: GuestSideDb; party_size: number; decision: 'add' };
/** Idempotent: the batch UUID is generated once per confirmed preview, so retries return the first result. */
export async function importGuestBatch(a: { batchId: string; weddingId: string; filename: string; eventIds: string[]; rows: ImportRowPayload[]; skipped: number; invalid: number }) {
  return must(await supabase.rpc('import_guest_batch', { p_batch_id: a.batchId, p_wedding_id: a.weddingId, p_filename: a.filename, p_event_ids: a.eventIds, p_rows: a.rows, p_skipped: a.skipped, p_invalid: a.invalid })) as { batch_id: string; added: number; replay: boolean };
}
export async function undoGuestBatch(batchId: string) {
  return must(await supabase.rpc('undo_guest_batch', { p_batch_id: batchId })) as { removed: number; kept: number; missing: number; already: boolean };
}
/** How many guests of a batch have changed since import (these would be kept by Undo). */
export async function batchChangedCount(batchId: string) {
  const rows = must(await supabase.from('guest_import_rows').select('guest_id,fingerprint').eq('batch_id', batchId));
  const ids = rows.map(r => r.guest_id).filter((x): x is string => !!x);
  let changed = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const gs = must(await supabase.from('guests').select('id,created_at,updated_at,guest_event_assignments(created_at,updated_at)').in('id', chunk));
    changed += gs.filter(g => g.created_at !== g.updated_at || (g.guest_event_assignments ?? []).some(a => a.created_at !== a.updated_at)).length;
  }
  return { total: rows.length, present: ids.length, changed };
}
