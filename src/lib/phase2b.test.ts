import { describe, expect, it } from 'vitest';
import { computeDateImpact, checkPhotos, diffSnapshot, shiftDate } from './phase2';
import { toEventInput, toGuest, toLink, toRsvpInput } from './adapters';

describe('date impact', () => {
  it('shifts linked task deadlines, warns on payments, flags links', () => {
    const r = computeDateImpact('e2', '2027-10-18', '2027-10-25',
      [{ id: 't', title: 'Xe', event: 'e2', due: '2027-10-01' }, { id: 'u', title: 'Khác', event: 'e1', due: '2027-10-01' }, { id: 'v', title: 'Không hạn', event: 'e2', due: '' }],
      [{ id: 'c', title: 'Tiệc', event: 'e2', installments: [{ label: 'Cọc', due: '2027-09-01' }] }],
      [{ side: 'chung', enabled: true, eventIds: ['e1', 'e2'] }, { side: 'nha-trai', enabled: false, eventIds: ['e2'] }]);
    expect(r.deltaDays).toBe(7);
    expect(r.tasks).toEqual([{ id: 't', title: 'Xe', from: '2027-10-01', to: '2027-10-08' }]);
    expect(r.costWarnings).toEqual([{ title: 'Tiệc', label: 'Cọc', due: '2027-09-01' }]);
    expect(r.linksToReview).toEqual(['chung']);
  });
  it('shiftDate crosses months', () => expect(shiftDate('2027-01-30', 3)).toBe('2027-02-02'));
});

describe('photos', () => {
  it('rejects type, size and over-limit', () => {
    const r = checkPhotos([{ name: 'a.gif', type: 'image/gif', size: 1 }, { name: 'b.jpg', type: 'image/jpeg', size: 9e6 }, { name: 'c.jpg', type: 'image/jpeg', size: 1 }, { name: 'd.png', type: 'image/png', size: 1 }], 49);
    expect(r.accepted).toEqual([2]);
    expect(r.rejected.map(x => x.reason)).toEqual(['Chỉ nhận JPG, PNG hoặc WEBP', 'Ảnh lớn hơn 8 MB', 'Đã đủ 50 ảnh']);
  });
});

describe('snapshot diff', () => {
  it('lists field changes, removed and new events', () => {
    const ev = { id: 'e2', name: 'Tiệc tối', date: '2027-10-18', time: '18:30', venue: 'NH', address: 'A' };
    const d = diffSnapshot({ revision: 1, title: 'A', message: 'm', events: [ev, { ...ev, id: 'e1', name: 'Lễ' }] }, { title: 'A', message: 'm', events: [{ ...ev, time: '19:00' }, { ...ev, id: 'e3', name: 'Mới' }] });
    expect(d.map(x => x.field)).toEqual(['Tiệc tối · Giờ', 'Lễ', 'Mới']);
  });
});

describe('adapters', () => {
  it('maps session shapes to contracts', () => {
    expect(toEventInput({ id: 'e', name: ' Tiệc ', side: 'Nhà trai', date: '', time: '', venue: '', address: '', confirmed: false })).toEqual({ name: 'Tiệc', side: 'nha-trai', status: 'tentative' });
    expect(toGuest({ id: 'g', name: 'An', phone: '0901', side: 'Nhà gái', events: ['e1'] }, 'w').phone).toBe('0901');
    const l = toLink({ side: 'chung', enabled: true, eventIds: ['e1'] }, 'inv', [{ id: 'e1', name: 'Lễ', date: 'd', time: 't', venue: 'v' }]);
    expect(l).toMatchObject({ readiness: 'ready', publication: 'unpublished' });
    expect(toRsvpInput('tok', ' An ', { e1: { choice: 'yes', count: 2 }, e2: { choice: 'no', count: 0 } }).answers).toEqual([{ eventId: 'e1', attending: true, partySize: 2 }, { eventId: 'e2', attending: false }]);
  });
});
