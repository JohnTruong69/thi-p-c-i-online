import { describe, expect, it } from 'vitest';
import { csvCell, eventTotals, filterGuests, followupCount, guestTotals, guestsCsv, importPayload, toGuestPayload, validateGuest, type GuestRecord } from './guests';
import { buildPreview, parseCsv } from './phase2';

const g = (id: string, o: Partial<GuestRecord> = {}): GuestRecord => ({ id, name: id, phone: null, side: 'nha-gai', party_size: 2, note: null, assignments: [], ...o });
const A = (event_id: string, rsvp_status: 'pending' | 'attending' | 'declined' = 'pending', attending_count: number | null = null) => ({ event_id, invite_status: 'not_sent' as const, rsvp_status, attending_count });
describe('guest counts', () => {
  const gs = [g('Lan', { assignments: [A('e1', 'attending', 1), A('e2')] }), g('Bình', { party_size: 3, side: 'nha-trai', assignments: [A('e1', 'declined')] }), g('Mai')];
  it('counts shared guests once', () => { expect(guestTotals(gs)).toEqual({ records: 3, plannedPeople: 7, unassigned: 1 }); });
  it('per-Event totals', () => { expect(eventTotals(gs, 'e1')).toMatchObject({ records: 2, plannedPeople: 5, attendingPeople: 1, declined: 1 }); expect(eventTotals(gs, 'e2').records).toBe(1); });
  it('filters by event/status/side/search', () => {
    expect(filterGuests(gs, { q: '', side: 'all', eventId: 'e2', status: 'all' }).map(x => x.id)).toEqual(['Lan']);
    expect(filterGuests(gs, { q: '', side: 'all', eventId: 'e1', status: 'declined' }).map(x => x.id)).toEqual(['Bình']);
    expect(filterGuests(gs, { q: 'binh', side: 'nha-trai', eventId: 'all', status: 'all' }).length).toBe(1);
  });
});
describe('validation + csv', () => {
  const d = { name: 'Lan', phone: '0912345678', side: 'nha-gai' as const, party: '2', note: '', assignments: [{ event_id: 'e1', invite_status: 'sent' as const, rsvp_status: 'attending' as const, attending: '3' }] };
  it('attending cannot exceed party', () => { expect(validateGuest(d).assignments).toBeTruthy(); expect(validateGuest({ ...d, assignments: [] })).toEqual({}); });
  it('rejects bad party', () => { expect(validateGuest({ ...d, party: '1.5' }).party).toBeTruthy(); expect(validateGuest({ ...d, party: '51' }).party).toBeTruthy(); });
  it('guards formula injection and keeps leading zero', () => { expect(csvCell('=HYPERLINK()')).toBe(`"'=HYPERLINK()"`); expect(csvCell('0912')).toBe('"0912"'); expect(guestsCsv([g('@x', { phone: '0901' })], [{ id: 'e1', name: 'Tiệc' }])).toContain(`"'@x","0901"`); });
  it('import payload only has explicit adds; 101+ rows parse', () => {
    const csv = 'Tên,SĐT\n' + Array.from({ length: 105 }, (_, i) => `Khách ${i},09${String(i).padStart(8, '0')}`).join('\n') + '\nKhách 1,0999999999\n';
    const rows = buildPreview(parseCsv(csv), { name: 'Tên', phone: 'SĐT', side: '', party: '' }, []);
    expect(rows.length).toBe(106);
    const dup = rows[105]!; expect(dup.duplicateReason).toBe('name'); expect(dup.decision).toBe('skip');
    expect(importPayload(rows).length).toBe(105);
    expect(importPayload(rows.map(r => ({ ...r, decision: 'add' }))).length).toBe(106);
  });
});

describe('per-event follow-up added to the existing guest book', () => {
  const guests = [
    g('Hà', { party_size: 4, assignments: [
      { ...A('e1'), invitation_method: 'called', attendance_intent: 'maybe', expected_count: 2, response_source: 'phone' },
      { ...A('e2', 'attending', 1), invitation_method: 'met', attendance_intent: 'confirmed', expected_count: 1, response_source: 'in_person' },
    ] }),
    g('Mai', { assignments: [{ ...A('e1'), invitation_method: 'not_invited', attendance_intent: 'unknown', expected_count: null }] }),
  ] satisfies GuestRecord[];
  it('counts a household once for follow-up and keeps event headcounts separate', () => {
    expect(followupCount(guests)).toBe(1);
    expect(filterGuests(guests, { q: '', side: 'all', eventId: 'e1', status: 'needs_followup' }).map(x => x.id)).toEqual(['Hà']);
    expect(filterGuests(guests, { q: '', side: 'all', eventId: 'e2', status: 'needs_followup' })).toEqual([]);
    expect(eventTotals(guests, 'e1').plannedPeople).toBe(4); // Hà 2 + Mai 2
    expect(eventTotals(guests, 'e2')).toMatchObject({ plannedPeople: 1, attendingPeople: 1 });
  });
  it('validates confirmed people against this event and maps intent to legacy RSVP fields', () => {
    const draft = { name: 'Hà', phone: '', side: 'nha-gai' as const, party: '4', note: '', assignments: [
      { event_id: 'e1', invite_status: 'not_sent' as const, rsvp_status: 'attending' as const, attending: '3', invitation_method: 'called' as const, attendance_intent: 'confirmed' as const, expected: '2', response_source: 'phone' as const },
    ] };
    expect(validateGuest(draft).assignments).toContain('Số người sẽ đến');
    const corrected = { ...draft, assignments: [{ ...draft.assignments[0]!, attending: '2' }] };
    expect(validateGuest(corrected)).toEqual({});
    expect(toGuestPayload(corrected).assignments[0]).toMatchObject({ invite_status: 'not_sent', rsvp_status: 'attending', expected_count: 2, attending_count: 2, response_source: 'phone' });
  });
});
