import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export const deletionRequestsQuery = (weddingId: string) => queryOptions({
  queryKey: ['data-deletion-requests', weddingId],
  queryFn: async () => {
    const { data, error } = await supabase.from('data_deletion_requests').select('*')
      .eq('wedding_id', weddingId).order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
});

export async function exportWeddingData(weddingId: string): Promise<Json> {
  const { data, error } = await supabase.rpc('export_wedding_data', { p_wedding_id: weddingId });
  if (error) throw error;
  if (!data) throw new Error('empty export');
  return data;
}

export function saveWeddingExport(data: Json) {
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `du-lieu-dam-cuoi-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function requestDataDeletion(weddingId: string) {
  const { data, error } = await supabase.rpc('request_wedding_data_deletion', { p_wedding_id: weddingId });
  if (error) throw error;
  return data;
}

export async function withdrawDataDeletion(requestId: string) {
  const { error } = await supabase.rpc('withdraw_wedding_data_deletion', { p_request_id: requestId });
  if (error) throw error;
}
