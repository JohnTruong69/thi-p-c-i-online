/** Typed data layer for reminder preferences. Browser client; RLS scopes rows to wedding managers. */
import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ReminderPrefs } from './reminders';

const must = <T,>(r: { data: T | null; error: unknown }): T => { if (r.error) throw r.error; return (r.data ?? (null as unknown)) as T; };

export const reminderPrefsQuery = (weddingId: string) => queryOptions({
  queryKey: ['reminder-prefs', weddingId],
  queryFn: async (): Promise<ReminderPrefs | null> => {
    const r = await supabase.from('reminder_prefs').select('wedding_id,task_reminders,event_reminders').eq('wedding_id', weddingId).maybeSingle();
    if (r.error) throw r.error;
    return r.data as ReminderPrefs | null;
  },
});

export async function saveReminderPrefs(weddingId: string, prefs: { task_reminders: boolean; event_reminders: boolean }) {
  must(await supabase.from('reminder_prefs').upsert({ wedding_id: weddingId, ...prefs }, { onConflict: 'wedding_id' }));
}
