/** Typed data layer for read-only family viewers. All writes are manager-only SECURITY DEFINER RPCs; viewers read only viewer_projection. */
import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { friendlyError } from './wedding-api';

export type ViewerRow = Database['public']['Tables']['wedding_viewers']['Row'];
export type ViewerInviteRow = Database['public']['Tables']['wedding_viewer_invites']['Row'];
const must = <T,>(r: { data: T | null; error: unknown }): T => { if (r.error) throw r.error; return (r.data ?? (null as unknown)) as T; };

export type ViewerWedding = { wedding_id: string; partner_one_name: string; partner_two_name: string; planned_date: string | null; modules: string[]; sides: string[] };
export type ViewerProjection = {
  wedding: { partner_one_name: string; partner_two_name: string; planned_date: string | null };
  modules: string[]; sides: string[];
  events?: { id: string; name: string; side: string; date: string | null; time: string | null; venue: string | null; address: string | null; status: string }[];
  tasks?: { id: string; title: string; status: string; due_date: string | null; kind: string; planned_tables: number | null; reserve_tables: number | null; event_name: string | null }[];
  budget?: { id: string; label: string; category: string; payer: string; planned_vnd: number; paid_vnd: number; event_name: string | null }[];
  guests?: { id: string; name: string; side: string; party_size: number; events: { event_name: string; invite_status: string; rsvp_status: string; attending_count: number | null }[] }[];
  rsvp?: { event_name: string; yes: number; no: number; people: number }[];
};

export const viewersTeamQuery = (weddingId: string) => queryOptions({
  queryKey: ['viewers', weddingId],
  queryFn: async () => {
    const [v, i] = await Promise.all([
      supabase.from('wedding_viewers').select('*').eq('wedding_id', weddingId).is('revoked_at', null).order('created_at'),
      supabase.from('wedding_viewer_invites').select('*').eq('wedding_id', weddingId).order('created_at', { ascending: false }),
    ]);
    return { viewers: must(v), invites: must(i) };
  },
});
export const myViewerWeddingsQuery = queryOptions({
  queryKey: ['viewer-weddings'],
  queryFn: async () => (must(await supabase.rpc('viewer_weddings')) ?? []) as unknown as ViewerWedding[],
});
export const viewerProjectionQuery = (weddingId: string) => queryOptions({
  queryKey: ['viewer-projection', weddingId],
  queryFn: async () => must(await supabase.rpc('viewer_projection', { p_wedding_id: weddingId })) as unknown as ViewerProjection,
  refetchOnWindowFocus: true,
  retry: (n, e) => n < 2 && !String((e as { message?: string })?.message ?? '').includes('not granted'),
});

export async function createViewerInvite(weddingId: string, email: string, modules: string[], sides: string[]) {
  const rows = must(await supabase.rpc('create_viewer_invite', { p_wedding_id: weddingId, p_email: email, p_modules: modules, p_sides: sides })) as { invite_id: string; token: string; expires_at: string }[];
  const r = rows[0]; if (!r) throw new Error('invite failed');
  return { ...r, url: `${window.location.origin}/viewer-invite/${r.token}` };
}
export async function revokeViewerInvite(id: string) { must(await supabase.rpc('revoke_viewer_invite', { p_invite_id: id })); }
export async function revokeViewer(id: string) { must(await supabase.rpc('revoke_viewer', { p_viewer_id: id })); }
export async function updateViewerGrants(id: string, modules: string[], sides: string[]) { must(await supabase.rpc('update_viewer_grants', { p_viewer_id: id, p_modules: modules, p_sides: sides })); }
export async function inspectViewerInvite(token: string) {
  const rows = must(await supabase.rpc('inspect_viewer_invite', { p_token: token })) as { status: string; email_matches: boolean; expires_at: string | null }[];
  return rows[0] ?? { status: 'not_found', email_matches: false, expires_at: null };
}
export async function acceptViewerInvite(token: string) { return must(await supabase.rpc('accept_viewer_invite', { p_token: token })) as string | null; }

export function viewerError(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e).toLowerCase();
  if (m.includes('no viewer slot')) return 'Đã đủ hai người thân được xem (gồm lời mời đang chờ). Hủy lời mời hoặc rút quyền để mời người khác.';
  if (m.includes('already a viewer')) return 'Email này đã là người thân được xem. Hãy sửa quyền thay vì mời lại.';
  if (m.includes('already a manager')) return 'Email này là người quản lý đám cưới, không cần mời xem.';
  if (m.includes('invalid viewer grants')) return 'Hãy chọn ít nhất một phần và một bên được xem.';
  if (m.includes('not granted')) return 'Bạn không còn quyền xem đám cưới này.';
  if (m.includes('viewer is revoked')) return 'Người này đã bị rút quyền xem.';
  return friendlyError(e);
}
