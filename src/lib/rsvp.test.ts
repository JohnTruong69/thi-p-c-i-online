import { describe, expect, it } from 'vitest';
import { phoneSuggestions, rsvpCounts, toAnswers, validateRsvp, type ResponseRow } from './rsvp';
const base = { name: 'Lan', phone: '', note: '', answers: { e1: { attending: true, party: '2' }, e2: { attending: false, party: '1' } } };
const row = (id: string, a: ResponseRow['answers'], extra: Partial<ResponseRow> = {}): ResponseRow => ({ id, link_side: 'chung', guest_name: 'x', phone: null, note: null, guest_id: null, superseded_at: null, replaces_id: null, created_at: '', answers: a, ...extra });
describe('rsvp', () => {
  it('validates every link event and party only when attending', () => {
    expect(validateRsvp(base, ['e1', 'e2'])).toEqual({});
    const e = validateRsvp({ ...base, name: ' ', answers: { e1: { attending: true, party: '0' } } }, ['e1', 'e2']);
    expect(e.name).toBeTruthy(); expect(Object.keys(e.events!)).toEqual(['e1', 'e2']);
    expect(validateRsvp({ ...base, answers: { ...base.answers, e1: { attending: true, party: '21' } } }, ['e1', 'e2']).events?.e1).toBeTruthy();
    expect(validateRsvp({ ...base, phone: '12' }, ['e1', 'e2']).phone).toBeTruthy();
  });
  it('payload omits party for no', () => expect(toAnswers(base, ['e1', 'e2'])).toEqual({ e1: { attending: true, party_size: 2 }, e2: { attending: false } }));
  it('counts per event, ignores superseded, no double count across events', () => {
    const rs = [
      row('a', [{ event_id: 'e1', event_name: '', attending: true, party_size: 3 }, { event_id: 'e2', event_name: '', attending: true, party_size: 2 }]),
      row('old', [{ event_id: 'e1', event_name: '', attending: true, party_size: 9 }], { superseded_at: 'x' }),
      row('b', [{ event_id: 'e1', event_name: '', attending: false, party_size: null }]),
    ];
    const c = rsvpCounts(rs, ['e1', 'e2']);
    expect(c.perEvent.e1).toEqual({ responses: 2, yes: 1, no: 1, people: 3 });
    expect(c.perEvent.e2!.people).toBe(2); expect(c.people).toBe(3); expect(c.responses).toBe(2);
  });
  it('suggests by phone only, never by name', () => {
    const gs = [{ id: '1', name: 'x', phone: '0901234567' }, { id: '2', name: 'x', phone: null }];
    expect(phoneSuggestions({ phone: '+84 901 234 567' }, gs).map(g => g.id)).toEqual(['1']);
    expect(phoneSuggestions({ phone: null }, gs)).toEqual([]);
  });
});
