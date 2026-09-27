/** Typed data layer for the persisted Đường Hẹn invitation. Browser client + RLS; writes to identity/publication go through RPCs. */
import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { friendlyError, type EventRow } from './wedding-api';
import { photoPath, toSnapshot, type InvitationSnapshot, type LinkSide, type SnapEvent } from './invitation';
import { verifyInvitationPhoto } from './invitation.functions';

export type InvitationRow = Database['public']['Tables']['invitations']['Row'];
export type LinkRow = Database['public']['Tables']['invitation_links']['Row'];
export type PhotoRow = Database['public']['Tables']['invitation_photos']['Row'];
export type RevisionRow = Database['public']['Tables']['invitation_revisions']['Row'];
const must = <T,>(r: { data: T | null; error: unknown }): T => { if (r.error) throw r.error; return (r.data ?? (null as unknown)) as T; };
const BUCKET = 'invitation-photos';

/** A read-only wedding that never opened its invitation: there is no draft and none may be created. */
export class InvitationNotStartedReadOnly extends Error { constructor() { super('invitation not started (read-only)'); this.name = 'InvitationNotStartedReadOnly'; } }
export const isInvitationNotStartedReadOnly = (e: unknown) => e instanceof InvitationNotStartedReadOnly || (e instanceof Error && e.name === 'InvitationNotStartedReadOnly');

export type InvitationBundle = { invitation: InvitationRow; links: LinkRow[]; photos: PhotoRow[]; revisions: RevisionRow[]; entitled: boolean };
export const invitationQuery = (weddingId: string) => queryOptions({
  queryKey: ['invitation', weddingId],
  retry: (n, e) => !isInvitationNotStartedReadOnly(e) && n < 3,
  queryFn: async (): Promise<InvitationBundle> => {
    // Lazy creation only when no draft exists yet; read-only weddings never create one (the DB gate refuses it).
    const existing = must(await supabase.from('invitations').select('id').eq('wedding_id', weddingId).maybeSingle());
    if (!existing) {
      const r = await supabase.rpc('ensure_invitation', { p_wedding_id: weddingId });
      if (r.error && /read-only/i.test(r.error.message ?? '')) throw new InvitationNotStartedReadOnly();
      must(r);
    }
    const [inv, links, photos, revisions, ent] = await Promise.all([
      supabase.from('invitations').select('*').eq('wedding_id', weddingId).single(),
      supabase.from('invitation_links').select('*').eq('wedding_id', weddingId),
      supabase.from('invitation_photos').select('*').eq('wedding_id', weddingId).order('created_at').order('id'),
      supabase.from('invitation_revisions').select('*').eq('wedding_id', weddingId).order('revision', { ascending: false }),
      supabase.rpc('has_valid_entitlement', { p_wedding_id: weddingId }),
    ]);
    return { invitation: must(inv), links: must(links), photos: must(photos), revisions: must(revisions), entitled: must(ent) === true };
  },
});

export const photoUrlsQuery = (paths: string[]) => queryOptions({
  queryKey: ['invitation-photo-urls', paths],
  enabled: paths.length > 0,
  staleTime: 30 * 60_000,
  queryFn: async (): Promise<Record<string, string>> => {
    const r = must(await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600));
    return Object.fromEntries(r.filter(x => x.signedUrl && x.path).map(x => [x.path as string, x.signedUrl as string]));
  },
});

export const eventToSnap = (e: EventRow): SnapEvent => ({ id: e.id, name: e.name, side: e.side, date: e.event_date, time: e.event_time ? e.event_time.slice(0, 5) : null, venue: e.venue, address: e.address });
/** Same shape as the server snapshot, built from the current rows. */
export function currentSnapshot(b: InvitationBundle, events: EventRow[]): InvitationSnapshot {
  const order: LinkSide[] = ['chung', 'nha-gai', 'nha-trai'];
  return {
    title: b.invitation.title, message: b.invitation.message,
    cover: b.photos.find(p => p.id === b.invitation.cover_photo_id)?.storage_path ?? null,
    photos: b.photos.map(p => p.storage_path),
    links: [...b.links].sort((x, y) => order.indexOf(x.side as LinkSide) - order.indexOf(y.side as LinkSide)).map(l => ({ side: l.side as LinkSide, enabled: l.enabled, event_ids: l.event_ids })),
    events: events.map(eventToSnap),
  };
}
export const publishedRevision = (b: InvitationBundle) => b.revisions.find(r => r.id === b.invitation.published_revision_id) ?? null;
export const revisionSnapshot = (r: RevisionRow | null | undefined) => (r ? toSnapshot(r.snapshot) : null);

export async function updateContent(id: string, title: string, message: string) { must(await supabase.from('invitations').update({ title: title.trim(), message: message.trim() }).eq('id', id)); }
export async function setCover(id: string, photoId: string | null) { must(await supabase.from('invitations').update({ cover_photo_id: photoId }).eq('id', id)); }
export async function updateLink(id: string, patch: { enabled?: boolean; event_ids?: string[] }) { must(await supabase.from('invitation_links').update(patch).eq('id', id)); }
export async function saveRevision(weddingId: string, note: string) { return must(await supabase.rpc('save_invitation_revision', { p_wedding_id: weddingId, p_note: note })) as { revision: number; unchanged: boolean }; }
export async function publishInvitation(weddingId: string) { return must(await supabase.rpc('publish_invitation', { p_wedding_id: weddingId })); }

async function sha256Hex(buf: ArrayBuffer) { const d = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }
/** Upload → server content check + registration. Identical images map to the same path, so they count once. */
export async function uploadPhoto(weddingId: string, file: File, existing: string[]): Promise<'added' | 'duplicate'> {
  const hash = await sha256Hex(await file.arrayBuffer());
  const path = photoPath(weddingId, hash, file.type);
  if (existing.includes(path)) return 'duplicate';
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error && !/exist|duplicate/i.test(up.error.message)) throw up.error;
  await verifyInvitationPhoto({ data: { weddingId, path } });
  return 'added';
}
export async function removePhoto(photoId: string) {
  const path = must(await supabase.rpc('remove_invitation_photo', { p_photo_id: photoId })) as string;
  await supabase.storage.from(BUCKET).remove([path]);
}

export function invitationError(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e).toLowerCase();
  if (m.includes('entitlement required')) return 'Máy chủ từ chối công bố: đám cưới chưa có gói thiệp cưới được xác minh thanh toán.';
  if (m.includes('no ready link')) return 'Chưa có link nào đủ thông tin để công bố.';
  if (m.includes('photo limit') || m.includes('row-level security') && m.includes('storage')) return 'Đã đủ 50 ảnh cho đám cưới này.';
  if (m.includes('invalid photo content') || m.includes('invalid photo type')) return 'Tệp không phải ảnh JPG, PNG hoặc WEBP hợp lệ.';
  if (m.includes('invalid photo size') || m.includes('exceeded') || m.includes('too large')) return 'Ảnh lớn hơn 10 MB.';
  if (m.includes('event not in wedding')) return 'Có buổi không thuộc đám cưới này. Hãy tải lại trang.';
  return friendlyError(e);
}
