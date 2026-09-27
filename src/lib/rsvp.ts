/** Pure RSVP rules shared by the guest form and the owner reconcile screen. */
export type RsvpChoice = { attending: boolean | null; party: string };
export type RsvpForm = { name: string; phone: string; note: string; answers: Record<string, RsvpChoice> };
export type RsvpErrors = Partial<Record<'name' | 'phone' | 'note' | 'answers', string>> & { events?: Record<string, string> };
export const MAX_PARTY = 20;

export function validateRsvp(f: RsvpForm, eventIds: string[]): RsvpErrors {
  const e: RsvpErrors = {}; const ev: Record<string, string> = {};
  if (!f.name.trim()) e.name = 'Xin cho biết tên của bạn.'; else if (f.name.trim().length > 120) e.name = 'Tên tối đa 120 ký tự.';
  const ph = f.phone.trim();
  if (ph && !/^\+?[0-9]{8,15}$/.test(ph.replace(/[\s.\-()]/g, ''))) e.phone = 'Số điện thoại chưa đúng (8–15 chữ số).';
  if (f.note.length > 500) e.note = 'Lời nhắn tối đa 500 ký tự.';
  for (const id of eventIds) {
    const a = f.answers[id];
    if (!a || a.attending === null) ev[id] = 'Xin chọn Có hoặc Không.';
    else if (a.attending) { const n = Number(a.party); if (!/^\d+$/.test(a.party.trim()) || n < 1 || n > MAX_PARTY) ev[id] = `Số người từ 1 đến ${MAX_PARTY}.`; }
  }
  if (Object.keys(ev).length) { e.events = ev; e.answers = 'Còn buổi chưa trả lời đủ.'; }
  return e;
}
export const hasErrors = (e: RsvpErrors) => Object.keys(e).length > 0;

/** Payload keyed by event id; only events on the link are sent, party only when attending. */
export function toAnswers(f: RsvpForm, eventIds: string[]) {
  return Object.fromEntries(eventIds.map(id => { const a = f.answers[id]!; return [id, a.attending ? { attending: true, party_size: Number(a.party) } : { attending: false }]; }));
}

export type ResponseRow = { id: string; link_side: string; guest_name: string; phone: string | null; note: string | null; guest_id: string | null; superseded_at: string | null; replaces_id: string | null; created_at: string; answers: { event_id: string; event_name: string; attending: boolean; party_size: number | null }[] };
export type Group = 'review' | 'confirmed';
export const activeResponses = (rs: ResponseRow[]) => rs.filter(r => !r.superseded_at);
export const groupOf = (r: ResponseRow): Group => (r.guest_id ? 'confirmed' : 'review');

/** Per-Event counts from active responses only (edits never double-count). `people` is the largest party a response brings to any one Event, so someone attending two Events counts once. */
export function rsvpCounts(rs: ResponseRow[], eventIds: string[]) {
  const act = activeResponses(rs);
  const perEvent = Object.fromEntries(eventIds.map(id => {
    const as = act.flatMap(r => r.answers.filter(a => a.event_id === id));
    return [id, { responses: as.length, yes: as.filter(a => a.attending).length, no: as.filter(a => !a.attending).length, people: as.reduce((s, a) => s + (a.attending ? a.party_size ?? 0 : 0), 0) }];
  }));
  const people = act.reduce((s, r) => s + Math.max(0, ...r.answers.filter(a => a.attending && eventIds.includes(a.event_id)).map(a => a.party_size ?? 0)), 0);
  return { perEvent, responses: act.length, people };
}

const digits = (p: string | null) => (p ?? '').replace(/\D/g, '').replace(/^84/, '0');
/** Suggestions only (never applied automatically): same phone number. Name matches are not suggested for the shared link. */
export function phoneSuggestions<T extends { id: string; phone: string | null }>(r: { phone: string | null }, guests: T[]): T[] {
  const d = digits(r.phone); if (d.length < 8) return [];
  return guests.filter(g => digits(g.phone) === d);
}
