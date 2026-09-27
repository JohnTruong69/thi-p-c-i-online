import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export type RsvpReceipt = { receipt_id: string; guest_name: string; phone?: string | null; note?: string | null; submitted_at: string; edited: boolean; answers: { event_id: string; event_name: string; attending: boolean; party_size: number | null }[]; edit_code?: string; replay?: boolean };
export type SubmitResult = { ok: true; receipt: RsvpReceipt } | { ok: false; reason: 'closed' | 'invalid' | 'edit' | 'error' };

function publicClient() {
  const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
  return createClient<Database>(process.env['SUPABASE_URL']!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => { const h = new Headers(init?.headers); if (key.startsWith('sb_') && h.get('Authorization') === `Bearer ${key}`) h.delete('Authorization'); h.set('apikey', key); return fetch(input, { ...init, headers: h }); } },
  });
}

const answer = z.union([z.object({ attending: z.literal(true), party_size: z.number().int().min(1).max(20) }), z.object({ attending: z.literal(false) })]);

/** Public RSVP write. The database re-derives link, published revision, entitlement and the Event list from the token. */
export const submitRsvp = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => z.object({
    token: z.string().max(100), requestKey: z.string().uuid(), name: z.string().max(120), phone: z.string().max(30), note: z.string().max(500),
    answers: z.record(z.string().uuid(), answer).refine(o => Object.keys(o).length <= 20), editCode: z.string().max(64).nullable(),
  }).parse(d))
  .handler(async ({ data }): Promise<SubmitResult> => {
    const r = await publicClient().rpc('submit_rsvp', { p_token: data.token, p_request_key: data.requestKey, p_name: data.name, p_phone: data.phone, p_note: data.note, p_answers: data.answers, p_edit_code: data.editCode as string });
    if (r.error) {
      const m = r.error.message;
      if (m.includes('closed')) return { ok: false, reason: 'closed' };
      if (m.includes('edit code')) return { ok: false, reason: 'edit' };
      if (/invalid|missing|not on link/.test(m)) return { ok: false, reason: 'invalid' };
      console.error('submit_rsvp failed', r.error.code);
      return { ok: false, reason: 'error' };
    }
    return { ok: true, receipt: r.data as unknown as RsvpReceipt };
  });

/** Public receipt read: only with the edit code from this device, and only while the link is open. */
export const getRsvpReceipt = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => z.object({ token: z.string().max(100), editCode: z.string().max(64) }).parse(d))
  .handler(async ({ data }): Promise<RsvpReceipt | null> => {
    const r = await publicClient().rpc('get_rsvp_receipt', { p_token: data.token, p_edit_code: data.editCode });
    if (r.error || !r.data) return null;
    return r.data as unknown as RsvpReceipt;
  });
