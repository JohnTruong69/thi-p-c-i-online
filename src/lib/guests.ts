/** Pure guest-book rules (client-safe, no I/O): counts, filters, validation, CSV export and import payload shaping. */
import { normalizePhone, normalizeText, type CsvRow } from './phase2';

export type GuestSideDb = 'chung' | 'nha-trai' | 'nha-gai';
export type InviteStatus = 'not_sent' | 'sent';
export type RsvpStatus = 'pending' | 'attending' | 'declined';
export type InvitationMethod = 'not_invited' | 'met' | 'called' | 'link_sent';
export type AttendanceIntent = 'unknown' | 'maybe' | 'confirmed' | 'declined';
export type ResponseSource = 'none' | 'in_person' | 'phone' | 'online_rsvp' | 'manual';
export type GuestAssignment = { event_id: string; table_id: string | null; invite_status: InviteStatus; rsvp_status: RsvpStatus; attending_count: number | null; invitation_method?: InvitationMethod; attendance_intent?: AttendanceIntent; expected_count?: number | null; response_source?: ResponseSource; responded_at?: string | null; response_by?: string | null };
export type GuestRecord = { id: string; name: string; phone: string | null; side: GuestSideDb; party_size: number; note: string | null; assignments: GuestAssignment[] };

export const GUEST_SIDE_TEXT: Record<GuestSideDb, string> = { 'nha-gai': 'Nhà gái', 'nha-trai': 'Nhà trai', chung: 'Cả hai' };
export const INVITE_TEXT: Record<InviteStatus, string> = { not_sent: 'Chưa gửi thiệp', sent: 'Đã gửi thiệp' };
export const RSVP_TEXT: Record<RsvpStatus, string> = { pending: 'Chưa trả lời', attending: 'Sẽ đến', declined: 'Không đến' };
export const METHOD_TEXT: Record<InvitationMethod, string> = { not_invited: 'Chưa mời', met: 'Đã gặp', called: 'Đã gọi', link_sent: 'Đã gửi link' };
export const INTENT_TEXT: Record<AttendanceIntent, string> = { unknown: 'Chưa rõ', maybe: 'Có thể đến', confirmed: 'Xác nhận đến', declined: 'Không đến' };
export const SOURCE_TEXT: Record<ResponseSource, string> = { none: 'Chưa ghi', in_person: 'Gặp trực tiếp', phone: 'Qua điện thoại', online_rsvp: 'Qua thiệp online', manual: 'Hai bạn tự ghi' };
export const methodOf = (a: GuestAssignment): InvitationMethod => a.invitation_method ?? (a.invite_status === 'sent' ? 'link_sent' : 'not_invited');
export const intentOf = (a: GuestAssignment): AttendanceIntent => a.attendance_intent ?? (a.rsvp_status === 'attending' ? 'confirmed' : a.rsvp_status === 'declined' ? 'declined' : 'unknown');
export const needsFollowup = (a: GuestAssignment) => methodOf(a) !== 'not_invited' && (intentOf(a) === 'unknown' || intentOf(a) === 'maybe');
export const followupCount = (gs: GuestRecord[]) => gs.filter(g => g.assignments.some(needsFollowup)).length;
export const MAX_IMPORT_ROWS = 1000;
export const sideFromCsv = (s: CsvRow['side']): GuestSideDb => (s === 'Nhà gái' ? 'nha-gai' : s === 'Nhà trai' ? 'nha-trai' : 'chung');

export type StatusFilter = 'all' | 'not_sent' | 'sent' | 'pending' | 'attending' | 'declined' | 'needs_followup';
export type GuestFilter = { q: string; side: GuestSideDb | 'all'; eventId: string | 'all'; status: StatusFilter };
const statusMatch = (a: GuestAssignment, s: StatusFilter) => s === 'all' || (s === 'needs_followup' ? needsFollowup(a) : s === 'not_sent' || s === 'sent' ? a.invite_status === s : a.rsvp_status === s);

/** Status filter applies to the chosen Event, or to any Event when none is chosen. */
export function filterGuests(gs: GuestRecord[], f: GuestFilter) {
  const q = normalizeText(f.q), qp = normalizePhone(f.q);
  return gs.filter(g => {
    if (f.side !== 'all' && g.side !== f.side) return false;
    if (q && !normalizeText(g.name).includes(q) && !(qp.length >= 3 && normalizePhone(g.phone ?? '').includes(qp))) return false;
    const as = f.eventId === 'all' ? g.assignments : g.assignments.filter(a => a.event_id === f.eventId);
    if (f.eventId !== 'all' && !as.length) return false;
    if (f.status !== 'all' && !as.some(a => statusMatch(a, f.status))) return false;
    return true;
  });
}

/** Totals count each guest record once even when invited to several Events. */
export function guestTotals(gs: GuestRecord[]) {
  return {
    records: gs.length,
    plannedPeople: gs.reduce((s, g) => s + g.party_size, 0),
    unassigned: gs.filter(g => !g.assignments.length).length,
  };
}
/** Per-Event: records invited, planned people, people confirmed attending (manual count). */
export function eventTotals(gs: GuestRecord[], eventId: string) {
  let records = 0, plannedPeople = 0, attendingPeople = 0, declined = 0, pending = 0, sent = 0;
  for (const g of gs) {
    const a = g.assignments.find(x => x.event_id === eventId); if (!a) continue;
    records++; plannedPeople += a.expected_count ?? g.party_size;
    if (a.invite_status === 'sent') sent++;
    if (a.rsvp_status === 'attending') attendingPeople += a.attending_count ?? a.expected_count ?? g.party_size;
    else if (a.rsvp_status === 'declined') declined++; else pending++;
  }
  return { records, plannedPeople, attendingPeople, declined, pending, sent };
}

export type GuestDraft = { name: string; phone: string; side: GuestSideDb; party: string; note: string; assignments: { event_id: string; invite_status: InviteStatus; rsvp_status: RsvpStatus; attending: string; invitation_method?: InvitationMethod; attendance_intent?: AttendanceIntent; expected?: string; response_source?: ResponseSource }[] };
export type GuestErrors = Partial<Record<'name' | 'phone' | 'party' | 'note' | 'assignments', string>>;
export function validateGuest(d: GuestDraft): GuestErrors {
  const e: GuestErrors = {};
  if (!d.name.trim()) e.name = 'Hãy nhập tên khách.'; else if (d.name.trim().length > 120) e.name = 'Tên tối đa 120 ký tự.';
  if (d.phone.trim() && !/^\+?\d{8,15}$/.test(d.phone.replace(/[\s.\-()]/g, ''))) e.phone = 'Số điện thoại cần 8–15 chữ số.';
  const p = Number(d.party);
  if (!/^\d+$/.test(d.party.trim()) || p < 1 || p > 50) e.party = 'Số người là số nguyên từ 1 đến 50.';
  if (d.note.length > 1000) e.note = 'Ghi chú tối đa 1.000 ký tự.';
  for (const a of d.assignments) {
    if (a.expected?.trim()) {
      const n = Number(a.expected);
      if (!/^\d+$/.test(a.expected.trim()) || n < 1 || (!e.party && n > p)) { e.assignments = 'Số người dự kiến cho mỗi buổi phải từ 1 đến số người của khách/hộ.'; break; }
    }
    const intent = a.attendance_intent ?? (a.rsvp_status === 'attending' ? 'confirmed' : a.rsvp_status === 'declined' ? 'declined' : 'unknown');
    if (intent !== 'unknown' && a.response_source === 'none') { e.assignments = 'Hãy chọn nguồn câu trả lời cho buổi này.'; break; }
    if (a.rsvp_status !== 'attending' || a.attending.trim() === '') continue;
    const n = Number(a.attending);
    const cap = a.expected?.trim() ? Number(a.expected) : p;
    if (!/^\d+$/.test(a.attending.trim()) || n < 1 || (!e.party && n > cap)) { e.assignments = 'Số người sẽ đến phải từ 1 đến số người dự kiến cho buổi này.'; break; }
  }
  return e;
}
export function toGuestPayload(d: GuestDraft) {
  return {
    guest: { name: d.name.trim(), phone: d.phone.trim(), side: d.side, party_size: Number(d.party), note: d.note.trim() },
    assignments: d.assignments.map(a => {
      const method = a.invitation_method ?? (a.invite_status === 'sent' ? 'link_sent' : 'not_invited');
      const intent = a.attendance_intent ?? (a.rsvp_status === 'attending' ? 'confirmed' : a.rsvp_status === 'declined' ? 'declined' : 'unknown');
      return { event_id: a.event_id, invite_status: method === 'link_sent' ? 'sent' : 'not_sent',
        rsvp_status: intent === 'confirmed' ? 'attending' : intent === 'declined' ? 'declined' : 'pending',
        attending_count: intent === 'confirmed' && a.attending.trim() ? Number(a.attending) : null,
        invitation_method: method, attendance_intent: intent, expected_count: a.expected?.trim() ? Number(a.expected) : null,
        response_source: intent === 'unknown' ? 'none' : a.response_source ?? 'manual' };
    }),
  };
}

/** Rows the user explicitly chose to add; the server re-validates everything. */
export function importPayload(rows: CsvRow[]) {
  return rows.filter(r => r.decision === 'add' && !r.errors.length).map(r => ({ source_row: r.row, name: r.name, phone: r.phone, side: sideFromCsv(r.side), party_size: r.party, decision: 'add' as const }));
}

/** Neutralises spreadsheet formulas (=, +, -, @, tab, CR) and quotes every cell. */
export function csvCell(v: string | number | null | undefined) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
export function guestsCsv(gs: GuestRecord[], events: { id: string; name: string }[]) {
  const head = ['Họ và tên', 'Số điện thoại', 'Nhà mời', 'Số người dự kiến', 'Ghi chú', ...events.flatMap(e => [`${e.name} · Cách mời`, `${e.name} · Ý định dự`, `${e.name} · Dự kiến`, `${e.name} · Xác nhận`, `${e.name} · Nguồn phản hồi`])];
  const lines = gs.map(g => [g.name, g.phone ?? '', GUEST_SIDE_TEXT[g.side], g.party_size, g.note ?? '', ...events.flatMap(e => {
    const a = g.assignments.find(x => x.event_id === e.id);
    return a ? [METHOD_TEXT[methodOf(a)], INTENT_TEXT[intentOf(a)], a.expected_count ?? g.party_size, a.rsvp_status === 'attending' ? a.attending_count ?? a.expected_count ?? g.party_size : '', SOURCE_TEXT[a.response_source ?? 'none']] : ['Không mời', '', '', '', ''];
  })]);
  return '\uFEFF' + [head, ...lines].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
