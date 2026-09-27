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
  it('deleted Events are dropped', () => {
    expect(linkView('chung', links, [events[1]!])).toMatchObject({ kind: 'ok', events: [events[1]] });
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
    expect(map.g1!.e1).toMatchObject({ choice: 'yes', count: 2, source: 'rsvp' });
    expect(map.g1!.e2).toMatchObject({ choice: 'no', source: 'rsvp' });
    expect(summaryState(map.g1, ['e1', 'e2'], 'Chưa trả lời')).toBe('Trả lời từng buổi');
  });
  it('does not overwrite a manual update', () => {
    const m = setManual({}, 'g1', 'e2', 'yes', 't0');
    const r = applyResponse(m, 'g1', { e1: { choice: 'yes', count: 1 }, e2: { choice: 'no', count: 1 } }, 't1', 'Link chung');
    expect(r.skipped).toEqual(['e2']);
    expect(r.map.g1!.e2!.source).toBe('manual');
    expect(r.map.g1!.e2!.choice).toBe('yes');
  });
});
