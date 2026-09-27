import { describe, expect, it } from 'vitest';
import { parseCsv, guessColumns, buildPreview, summarize, SAMPLE_CSV, SUGGESTED_TASKS, matchResponse, canClientSet, linkReadiness } from './phase2';

describe('CSV', () => {
  it('keeps leading zeros, quotes and BOM', () => {
    const t = parseCsv('\uFEFFTên,SĐT\n"Lê, An",0901234567\r\n"Nói ""chào""",012');
    expect(t.headers).toEqual(['Tên', 'SĐT']);
    expect(t.rows[0]).toEqual(['Lê, An', '0901234567']);
    expect(t.rows[1]).toEqual(['Nói "chào"', '012']);
  });
  it('supports semicolon files', () => {
    expect(parseCsv('a;b\n1;2').rows[0]).toEqual(['1', '2']);
  });
  it('flags errors and duplicates without auto-adding them', () => {
    const t = parseCsv(SAMPLE_CSV);
    const rows = buildPreview(t, guessColumns(t.headers), [{ id: 'g1', name: 'Hà My', phone: '' }]);
    expect(rows[0]!.phone).toBe('0912345678');
    expect(rows[2]!.duplicateOf).toBe('Hà My');
    expect(rows[2]!.decision).toBe('skip');
    expect(rows[3]!.errors).toContain('Thiếu tên khách');
    expect(summarize(rows)).toEqual({ valid: 2, invalid: 1, possibleDuplicates: 1, toAdd: 2 });
  });
});

describe('suggested tasks', () => {
  it('has exactly 43 unique suggestions', () => {
    expect(SUGGESTED_TASKS).toHaveLength(43);
    expect(new Set(SUGGESTED_TASKS.map(t => t.id)).size).toBe(43);
  });
});

describe('RSVP matching', () => {
  const guests = [{ id: 'a', name: 'Mai Nguyễn', phone: '0901' + '000000' }, { id: 'b', name: 'Mai Nguyen', phone: '' }, { id: 'c', name: 'Tùng', phone: '' }];
  it('matches by phone', () => expect(matchResponse({ name: 'x', phone: '0901000000' }, guests).kind).toBe('exact'));
  it('never auto-merges same names', () => {
    const r = matchResponse({ name: 'mai nguyen' }, guests);
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.guestIds).toEqual(['a', 'b']);
  });
  it('unique name is still only a suggestion', () => expect(matchResponse({ name: 'Tùng' }, guests).kind).toBe('ambiguous'));
});

describe('order and links', () => {
  it('client can never mark paid', () => {
    expect(canClientSet('verifying', 'paid_verified')).toBe(false);
    expect(canClientSet('order_pending', 'verifying')).toBe(true);
  });
  it('readiness lists missing event fields', () => {
    const ev = [{ id: 'e1', name: 'Lễ', date: '2027-10-18', time: '07:00', venue: 'Nhà' }, { id: 'e2', name: 'Tiệc tối', date: '2027-10-18', venue: 'NH' }];
    expect(linkReadiness(false, ['e1'], ev).readiness).toBe('off');
    expect(linkReadiness(true, ['e1'], ev).readiness).toBe('ready');
    expect(linkReadiness(true, ['e1', 'e2'], ev).missing).toEqual(['Tiệc tối: giờ']);
  });
});
