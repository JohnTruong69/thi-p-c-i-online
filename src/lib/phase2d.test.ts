import { describe, expect, it } from 'vitest';
import { buildPreview, guessColumns, parseCsv, summarize } from './phase2';
import { applyResponse, guestFingerprint, linkView, mapUrl, pageCount, pageSlice, planUndo, setManual, summaryState, viewForToken, type LinkCfg } from './phase2d';

const events = [{ id: 'e1', name: 'Lễ gia tiên' }, { id: 'e2', name: 'Tiệc tối' }];
const links: LinkCfg[] = [
  { side: 'chung', enabled: true, eventIds: ['e1', 'e2'] },
  { side: 'nha-gai', enabled: true, eventIds: ['e1'] },
  { side: 'nha-trai', enabled: false, eventIds: ['e2'] },
];

describe('shared link selector', () => {
  it('chung/gái/trai follow enabled + eventIds', () => {
    expect(linkView('chung', links, events)).toMatchObject({ kind: 'ok', events: events });
    expect(linkView('nha-gai', links, events)).toMatchObject({ kind: 'ok', events: [events[0]] });
    expect(linkView('nha-trai', links, events).kind).toBe('off');
  });
  it('toggling and changing Events changes what guests see', () => {
    const next = links.map(l => (l.side === 'nha-trai' ? { ...l, enabled: true } : l.side === 'chung' ? { ...l, eventIds: ['e2'] } : l));
    expect(viewForToken('demo-nha-trai', next, events)).toMatchObject({ kind: 'ok', events: [events[1]] });
    expect(viewForToken('demo-chung', next, events)).toMatchObject({ kind: 'ok', events: [events[1]] });
    const off = links.map(l => (l.side === 'nha-gai' ? { ...l, enabled: false } : l));
    expect(viewForToken('demo-nha-gai', off, events).kind).toBe('off');
  });
  it('unknown tokens never open', () => {
    expect(viewForToken('nha-gai-hack', links, events).kind).toBe('unknown');
    expect(viewForToken('toString', links, events).kind).toBe('unknown');
    expect(viewForToken('demo-nha-gai', links.filter(l => l.side !== 'nha-gai'), events).kind).toBe('unknown');
  });
  it('deleted Events are never silently dropped', () => {
    expect(linkView('chung', links, [events[1]!]).kind).toBe('broken');
  });
  it('map URL uses the chosen address', () => expect(mapUrl('1 Lê Lợi, Huế')).toContain(encodeURIComponent('1 Lê Lợi, Huế')));
});

describe('CSV paging over 100 rows', () => {
  const csv = 'Họ và tên,Số điện thoại\n' + Array.from({ length: 150 }, (_, i) => `Khách ${i + 1},09${String(i).padStart(8, '0')}`).join('\n');
  it('row 101 is reachable and its decision counts', () => {
    const t = parseCsv(csv);
    let rows = buildPreview(t, guessColumns(t.headers), []);
    expect(pageCount(rows.length)).toBe(2);
    const p2 = pageSlice(rows, 1);
    expect(p2.from).toBe(101); expect(p2.to).toBe(150);
    expect(p2.rows[0]!.name).toBe('Khách 101');
    expect(p2.rows[0]!.phone).toBe('0900000100');
    rows = rows.map(r => (r.name === 'Khách 101' ? { ...r, decision: 'skip' } : r));
    expect(summarize(rows).toAdd).toBe(149);
  });
});

describe('CSV undo keeps edited guests', () => {
  it('import → edit one → undo removes only the untouched one', () => {
    const a = { id: 'c1', name: 'An', phone: '0901', side: 'Nhà gái', events: ['e1'], party: 1, state: 'Chưa gửi' };
    const b = { ...a, id: 'c2', name: 'Bình' };
    const snap = { c1: guestFingerprint(a), c2: guestFingerprint(b) };
    const r = planUndo(snap, [{ ...a, phone: '0909' }, b, { ...a, id: 'old' }]);
    expect(r.removeIds).toEqual(['c2']);
    expect(r.keptIds).toEqual(['c1']);
  });
});

describe('RSVP per Event', () => {
  it('mixed answers stay per Event and never collapse', () => {
    const { map } = applyResponse({}, 'g1', { e1: { choice: 'yes', count: 2 }, e2: { choice: 'no', count: 1 } }, 't', 'Link chung');
    expect(map['g1']!['e1']).toMatchObject({ choice: 'yes', count: 2, source: 'rsvp' });
    expect(map['g1']!['e2']).toMatchObject({ choice: 'no', source: 'rsvp' });
    expect(summaryState(map['g1'], ['e1', 'e2'], 'Chưa trả lời')).toBe('Trả lời từng buổi');
  });
  it('does not overwrite a manual update', () => {
    const m = setManual({}, 'g1', 'e2', 'yes', 't0');
    const r = applyResponse(m, 'g1', { e1: { choice: 'yes', count: 1 }, e2: { choice: 'no', count: 1 } }, 't1', 'Link chung');
    expect(r.skipped).toEqual(['e2']);
    expect(r.map['g1']!['e2']!.source).toBe('manual');
    expect(r.map['g1']!['e2']!.choice).toBe('yes');
  });
});

import { collectReceipts, receiptKey } from './phase2d';
import { computeDateImpact, linkReadiness } from './phase2';
describe('many demo responses per token', () => {
  it('two guests on the same token are both kept, not merged', () => {
    const store: [string, string][] = [
      [receiptKey('demo-chung', 'a1'), JSON.stringify({ name: 'An', answers: { e1: { choice: 'yes', count: 2 } }, at: '2027-01-01T01:00:00Z' })],
      [receiptKey('demo-chung', 'b2'), JSON.stringify({ name: 'Bình', answers: { e1: { choice: 'no', count: 1 } }, at: '2027-01-01T02:00:00Z' })],
      ['rsvp-demo-last:demo-chung', 'b2'],
    ];
    const r = collectReceipts(store);
    expect(r.map(x => x.name)).toEqual(['Bình', 'An']);
    expect(r[1]!.answers['e1']!.choice).toBe('yes');
    expect(new Set(r.map(x => x.id)).size).toBe(2);
  });
  it('reads legacy one-per-token receipt', () => {
    const r = collectReceipts([['rsvp-demo:demo', JSON.stringify({ name: 'Cũ', answers: { e1: { choice: 'no', count: 1 } } })]]);
    expect(r[0]).toMatchObject({ id: 'legacy', token: 'demo', name: 'Cũ' });
  });
});
describe('removed Events on links', () => {
  const ev = [{ id: 'e1', name: 'Lễ', date: '2027-10-18', time: '07:00', venue: 'Nhà', address: 'A' }];
  it('link with 2 Events, one removed → needs-fix', () => {
    const r = linkReadiness(true, ['e1', 'e2'], ev);
    expect(r.readiness).toBe('needs-fix');
    expect(r.missing).toEqual(['Buổi đã bị bỏ — cần chọn lại']);
  });
  it('link with only the removed Event → needs-fix, never ready', () => {
    expect(linkReadiness(true, ['e2'], ev).readiness).toBe('needs-fix');
  });
});
describe('clearing an Event date', () => {
  it('is reviewed, tasks kept, deposits and links warned', () => {
    const i = computeDateImpact('e1', '2027-10-18', '', [{ id: 't', title: 'T', event: 'e1', due: '2027-10-01' }], [{ id: 'c', title: 'Cọc', event: 'e1', installments: [{ label: 'Cọc', due: '2027-09-01' }] }], [{ side: 'chung', enabled: true, eventIds: ['e1'] }]);
    expect(i.cleared).toBe(true);
    expect(i.tasks).toEqual([]);
    expect(i.costWarnings).toHaveLength(1);
    expect(i.linksToReview).toEqual(['chung']);
  });
});

describe('enabled link with removed Events', () => {
  const evs = [{ id: 'e1', name: 'Lễ' }];
  it('only orphan ids → broken (neutral page, no RSVP)', () => {
    expect(linkView('chung', [{ side: 'chung', enabled: true, eventIds: ['gone'] }], evs).kind).toBe('broken');
    expect(linkView('chung', [{ side: 'chung', enabled: true, eventIds: [] }], evs).kind).toBe('broken');
  });
  it('valid + orphan → broken until owners fix it', () => {
    expect(viewForToken('demo-chung', [{ side: 'chung', enabled: true, eventIds: ['e1', 'gone'] }], evs).kind).toBe('broken');
  });
  it('valid-only link still opens; off stays off', () => {
    expect(linkView('chung', [{ side: 'chung', enabled: true, eventIds: ['e1'] }], evs).kind).toBe('ok');
    expect(linkView('chung', [{ side: 'chung', enabled: false, eventIds: ['gone'] }], evs).kind).toBe('off');
  });
});
