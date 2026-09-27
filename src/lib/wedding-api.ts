/** Typed data layer for real (persisted) Wedding data. Browser client + RLS; transactions go through security-definer RPCs. */
import { queryOptions, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type WeddingRow = Database['public']['Tables']['weddings']['Row'];
export type EventRow = Database['public']['Tables']['events']['Row'];
export type MembershipRow = Database['public']['Tables']['wedding_memberships']['Row'];
export type InviteRow = Database['public']['Tables']['wedding_invites']['Row'];
export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type EventSideDb = 'chung' | 'nha-trai' | 'nha-gai';
export const SIDE_TEXT: Record<EventSideDb, string> = { chung: 'Chung', 'nha-trai': 'Nhà trai', 'nha-gai': 'Nhà gái' };

/** Maps backend / network errors to warm Vietnamese copy; never exposes raw internals. */
export function friendlyError(e: unknown): string {
  const m = (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? '')).toLowerCase();
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')) return 'Không kết nối được. Hãy kiểm tra mạng rồi thử lại.';
  if (m.includes('jwt') || m.includes('not authenticated') || m.includes('session')) return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.';
  if (m.includes('invalid login credentials')) return 'Email hoặc mật khẩu chưa đúng.';
  if (m.includes('email not confirmed')) return 'Email chưa được xác nhận. Hãy mở thư xác nhận trong hộp thư của bạn.';
  if (m.includes('user already registered')) return 'Email này đã có tài khoản. Hãy đăng nhập hoặc lấy lại mật khẩu.';
  if (m.includes('pwned') || m.includes('weak')) return 'Mật khẩu này quá dễ đoán hoặc đã bị lộ ở nơi khác. Hãy chọn mật khẩu khác.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Bạn thao tác hơi nhanh. Hãy đợi một chút rồi thử lại.';
  if (m.includes('no free slot') || m.includes('at most two')) return 'Đám cưới đã đủ hai người quản lý hoặc đang có lời mời chờ.';
  if (m.includes('already a manager')) return 'Email này đã là người quản lý của đám cưới.';
  if (m.includes('last manager')) return 'Không thể để đám cưới không còn người quản lý nào.';
  if (m.includes('email mismatch')) return 'Lời mời dành cho một email khác, hoặc email của bạn chưa được xác nhận.';
  if (m.includes('already manages')) return 'Tài khoản này đã quản lý một đám cưới khác.';
  if (m.includes('invite is revoked')) return 'Lời mời đã bị hủy.';
  if (m.includes('invite is expired')) return 'Lời mời đã hết hạn.';
  if (m.includes('invite is accepted')) return 'Lời mời đã được dùng.';
  if (m.includes('invite not found')) return 'Không tìm thấy lời mời này.';
  if (m.includes('invalid email')) return 'Email chưa đúng định dạng.';
  if (m.includes('forbidden') || m.includes('row-level security') || m.includes('permission')) return 'Bạn không có quyền với dữ liệu này.';
  if (m.includes('check constraint')) return 'Thông tin chưa hợp lệ. Hãy kiểm tra lại các ô.';
  return 'Có lỗi xảy ra. Hãy thử lại.';
}
const must = <T,>(r: { data: T; error: unknown }): T => { if (r.error) throw r.error; return r.data; };

export const authUserQuery = queryOptions({
  queryKey: ['auth-user'],
  queryFn: async () => { const { data } = await supabase.auth.getUser(); return data.user ?? null; },
  staleTime: 60_000,
});

/** V1: one Wedding per account. Null when the signed-in user has no Wedding yet. */
export const myWeddingQuery = queryOptions({
  queryKey: ['wedding'],
  queryFn: async (): Promise<WeddingRow | null> => must(await supabase.from('weddings').select('*').order('created_at').limit(1).maybeSingle()),
});
export const useMyWedding = () => useQuery(myWeddingQuery);

export const eventsQuery = (weddingId: string) => queryOptions({
  queryKey: ['events', weddingId],
  queryFn: async (): Promise<EventRow[]> => must(await supabase.from('events').select('*').eq('wedding_id', weddingId).order('event_date', { nullsFirst: false }).order('created_at')),
});

export async function createWeddingDraft(i: { one: string; two: string; plannedDate: string; eventName: string; eventSide: EventSideDb; eventDate: string }) {
  return must(await supabase.rpc('create_wedding_draft', {
    p_partner_one: i.one, p_partner_two: i.two, p_planned_date: (i.plannedDate || null) as string,
    p_event_name: i.eventName, p_event_side: i.eventSide, p_event_date: (i.eventDate || null) as string,
  })) as string;
}
export async function updateWedding(id: string, i: { one: string; two: string; plannedDate: string }) {
  must(await supabase.from('weddings').update({ partner_one_name: i.one.trim(), partner_two_name: i.two.trim(), planned_date: i.plannedDate || null }).eq('id', id));
}

export type EventForm = { name: string; side: EventSideDb; date: string; time: string; venue: string; address: string; confirmed: boolean };
const toRow = (f: EventForm) => ({ name: f.name.trim(), side: f.side, event_date: f.date || null, event_time: f.time || null, venue: f.venue.trim() || null, address: f.address.trim() || null, status: f.confirmed ? 'confirmed' : 'tentative' });
export const toEventForm = (e: EventRow): EventForm => ({ name: e.name, side: e.side as EventSideDb, date: e.event_date ?? '', time: (e.event_time ?? '').slice(0, 5), venue: e.venue ?? '', address: e.address ?? '', confirmed: e.status === 'confirmed' });
export function validateEventForm(f: EventForm): string {
  if (!f.name.trim()) return 'Hãy nhập tên buổi lễ.';
  if (f.name.trim().length > 80) return 'Tên buổi lễ tối đa 80 ký tự.';
  if (f.confirmed && (!f.date || !f.time || !f.venue.trim() || !f.address.trim())) return 'Để đánh dấu đã chốt, cần ngày, giờ, nơi và địa chỉ.';
  return '';
}
export async function insertEvent(weddingId: string, f: EventForm) { must(await supabase.from('events').insert({ wedding_id: weddingId, ...toRow(f) })); }
export async function updateEvent(id: string, f: EventForm) { must(await supabase.from('events').update(toRow(f)).eq('id', id)); }
export async function deleteEvent(id: string) { must(await supabase.from('events').delete().eq('id', id)); }
/** Real references that removal would touch (tasks/budget keep the row but lose the Event link; guest assignments are removed). */
export async function eventReferences(id: string) {
  const [t, b, g] = await Promise.all([
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('event_id', id),
    supabase.from('budget_items').select('id', { count: 'exact', head: true }).eq('event_id', id),
    supabase.from('guest_event_assignments').select('guest_id', { count: 'exact', head: true }).eq('event_id', id),
  ]);
  for (const r of [t, b, g]) if (r.error) throw r.error;
  return { tasks: t.count ?? 0, budget: b.count ?? 0, guests: g.count ?? 0 };
}

export const teamQuery = (weddingId: string) => queryOptions({
  queryKey: ['team', weddingId],
  queryFn: async () => {
    const members = must(await supabase.from('wedding_memberships').select('*').eq('wedding_id', weddingId).order('created_at'));
    const profiles = members.length ? must(await supabase.from('profiles').select('*').in('id', members.map(m => m.user_id))) : [];
    const invites = must(await supabase.from('wedding_invites').select('*').eq('wedding_id', weddingId).order('created_at', { ascending: false }));
    return { members: members.map(m => ({ ...m, profile: profiles.find(p => p.id === m.user_id) ?? null })), invites };
  },
});
export async function createInvite(weddingId: string, email: string) {
  const rows = must(await supabase.rpc('create_partner_invite', { p_wedding_id: weddingId, p_email: email })) as { invite_id: string; token: string; expires_at: string }[];
  const r = rows[0]; if (!r) throw new Error('invite failed');
  return { ...r, url: `${window.location.origin}/invite/${r.token}` };
}
export async function revokeInvite(id: string) { must(await supabase.rpc('revoke_partner_invite', { p_invite_id: id })); }
export async function removeManager(membershipId: string) { must(await supabase.rpc('remove_manager', { p_membership_id: membershipId })); }
export async function inspectInvite(token: string) {
  const rows = must(await supabase.rpc('inspect_invite', { p_token: token })) as { status: string; email_matches: boolean; expires_at: string | null }[];
  return rows[0] ?? { status: 'not_found', email_matches: false, expires_at: null };
}
export async function acceptInvite(token: string) { return must(await supabase.rpc('accept_partner_invite', { p_token: token })) as string | null; }

/** Only same-origin paths may be used as post-login destinations. */
export function safeRedirect(v: unknown): string | undefined {
  return typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : undefined;
}
