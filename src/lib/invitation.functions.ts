import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { Database } from '@/integrations/supabase/types';
import { isPhotoPath, sniffImage } from './invitation';

const MAX_BYTES = 10 * 1024 * 1024;

/** Server-side content check of an uploaded photo (magic bytes + size), then DB registration (path/owner/mime/limit re-checked in SQL). */
export const verifyInvitationPhoto = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ weddingId: z.string().uuid(), path: z.string().max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!isPhotoPath(data.weddingId, data.path)) throw new Error('invalid photo path');
    const bucket = context.supabase.storage.from('invitation-photos');
    const dl = await bucket.download(data.path);
    if (dl.error || !dl.data) throw new Error('photo not uploaded');
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const mime = sniffImage(bytes.slice(0, 16));
    const ext = data.path.split('.').pop();
    const expected = ext === 'jpg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'image/webp';
    if (bytes.length === 0 || bytes.length > MAX_BYTES || mime !== expected) {
      await bucket.remove([data.path]);
      throw new Error('invalid photo content');
    }
    const r = await context.supabase.rpc('register_invitation_photo', { p_wedding_id: data.weddingId, p_path: data.path });
    if (r.error) throw new Error(r.error.message);
    return r.data as string;
  });

export type PublicInvitation =
  | { open: false }
  | { open: true; side: string; title: string; message: string; coverUrl: string | null; photoUrls: string[]; events: { id: string; name: string; side: string; date: string | null; time: string | null; venue: string | null; address: string | null }[] };

/** Public, read-only: only a published revision behind a server-verified entitlement opens; every other case is the same neutral closed value. */
export const getPublicInvitation = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => z.object({ token: z.string().max(100) }).parse(d))
  .handler(async ({ data }): Promise<PublicInvitation> => {
    const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
    const pub = createClient<Database>(process.env['SUPABASE_URL']!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => { const h = new Headers(init?.headers); if (key.startsWith('sb_') && h.get('Authorization') === `Bearer ${key}`) h.delete('Authorization'); h.set('apikey', key); return fetch(input, { ...init, headers: h }); } },
    });
    const r = await pub.rpc('public_invitation', { p_token: data.token });
    const v = r.data as { open?: boolean; side?: string; title?: string; message?: string; has_cover?: boolean; photo_count?: number; events?: [] } | null;
    if (r.error || !v || v.open !== true) return { open: false };
    let coverUrl: string | null = null; let photoUrls: string[] = [];
    if (v.has_cover || (v.photo_count ?? 0) > 0) {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const pr = await supabaseAdmin.rpc('public_invitation_photo_paths', { p_token: data.token });
      const pp = (pr.data ?? {}) as { cover?: string | null; photos?: string[] };
      const paths = [...new Set([...(pp.cover ? [pp.cover] : []), ...(pp.photos ?? [])])];
      if (paths.length) {
        const s = await supabaseAdmin.storage.from('invitation-photos').createSignedUrls(paths, 3600);
        const urls = Object.fromEntries((s.data ?? []).filter(x => x.signedUrl && x.path).map(x => [x.path as string, x.signedUrl as string]));
        coverUrl = pp.cover ? urls[pp.cover] ?? null : null;
        photoUrls = (pp.photos ?? []).filter(p => p !== pp.cover).map(p => urls[p]).filter((u): u is string => !!u);
      }
    }
    return { open: true, side: v.side ?? 'chung', title: v.title ?? '', message: v.message ?? '', coverUrl, photoUrls, events: v.events ?? [] };
  });
