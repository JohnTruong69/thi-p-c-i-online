import { describe, expect, it } from 'vitest';
import { giftTotals, giftsToCsv, methodLabel, validateGiftDraft, emptyGiftDraft, type GiftRecord } from './gifts';

const rec = (over: Partial<GiftRecord> = {}): GiftRecord => ({
  id: 'r1', wedding_id: 'w1', guest_id: null, giver_name: 'Bác Hai', amount_vnd: 500000,
  event_id: 'e1', side: 'nha-trai', method: 'phong_bi', gift_detail: null, thanked: false,
  note: null, created_at: '2026-01-01', ...over,
});

describe('giftTotals', () => {
  it('sums amounts, counts records and unthanked', () => {
    const t = giftTotals([rec(), rec({ id: 'r2', amount_vnd: 1000000, thanked: true }), rec({ id: 'r3', amount_vnd: 0, method: 'hien_vat', gift_detail: 'Bộ ấm chén' })]);
    expect(t.total).toBe(1500000);
    expect(t.count).toBe(3);
    expect(t.unthanked).toBe(2);
  });
  it('handles empty list', () => {
    expect(giftTotals([])).toEqual({ total: 0, count: 0, unthanked: 0 });
  });
});

describe('validateGiftDraft', () => {
  it('requires name and a non-negative integer amount', () => {
    const e = validateGiftDraft({ ...emptyGiftDraft(), amount: '-5' });
    expect(e['giver_name']).toBeTruthy();
    expect(e['amount']).toBeTruthy();
  });
  it('requires gift detail for physical gifts', () => {
    const e = validateGiftDraft({ ...emptyGiftDraft(), giver_name: 'Cô Ba', amount: '0', method: 'hien_vat' });
    expect(e['gift_detail']).toBeTruthy();
  });
  it('accepts a valid draft', () => {
    const e = validateGiftDraft({ ...emptyGiftDraft(), giver_name: 'Bác Hai', amount: '500000' });
    expect(e).toEqual({});
  });
});

describe('giftsToCsv', () => {
  it('builds a BOM csv with header, rows and total', () => {
    const csv = giftsToCsv([rec(), rec({ id: 'r2', giver_name: 'Cô "Ba"', amount_vnd: 200000, event_id: null, thanked: true })], id => (id ? 'Tiệc tối' : 'Chung'));
    expect(csv.startsWith('\uFEFFNgười mừng')).toBe(true);
    expect(csv).toContain('"Cô ""Ba"""');
    expect(csv).toContain('Tổng cộng,700000');
  });
});

describe('methodLabel', () => {
  it('labels known methods and passes through unknown', () => {
    expect(methodLabel('phong_bi')).toBe('Phong bì');
    expect(methodLabel('chuyen_khoan')).toBe('Chuyển khoản');
    expect(methodLabel('zzz')).toBe('zzz');
  });
});
