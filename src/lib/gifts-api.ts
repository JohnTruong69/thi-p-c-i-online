/** Typed data layer for the gift money ledger. Browser client; RLS scopes every row to wedding managers. */
import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { GiftDraft, GiftRecord } from './gifts';

const must = <T,>(r: { data: T | null; error: unknown }): T => { if (r.error) throw r.error; return (r.data ?? (null as unknown)) as T; };

export const giftRecordsQuery = (weddingId: string) => queryOptions({
  queryKey: ['gifts', weddingId],
  queryFn: async (): Promise<GiftRecord[]> =>
    must(await supabase.from('gift_records').select('*').eq('wedding_id', weddingId).order('created_at', { ascending: false }).range(0, 9999)) as GiftRecord[],
});

export async function saveGiftRecord(weddingId: string, id: string | null, d: GiftDraft) {
  const row = {
    wedding_id: weddingId,
    giver_name: d.giver_name.trim(),
    guest_id: d.guest_id,
    amount_vnd: Number(d.amount),
    event_id: d.event_id || null,
    side: d.side,
    method: d.method,
    gift_detail: d.gift_detail.trim() || null,
    thanked: d.thanked,
    note: d.note.trim() || null,
  };
  if (id) must(await supabase.from('gift_records').update(row).eq('id', id));
  else must(await supabase.from('gift_records').insert(row));
}
export async function setGiftThanked(id: string, thanked: boolean) {
  must(await supabase.from('gift_records').update({ thanked }).eq('id', id));
}
export async function deleteGiftRecord(id: string) { must(await supabase.from('gift_records').delete().eq('id', id)); }
