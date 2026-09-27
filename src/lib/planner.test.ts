import { describe, expect, it } from 'vitest';
import { budgetTotals, missingTemplates, parseVnd, validateCap, validateCost, toStatusUi, type CostDraft } from './planner';
import { inTaskFilter, taskDue, validateTableCount, type DemoTask } from './task-demo';

const draft = (o: Partial<CostDraft> = {}): CostDraft => ({ title: 'Tiệc', category: 'tiec', categoryDetail: '', eventId: '', payer: 'couple', estimate: '', agreed: '', paid: '0', deposit: '0', extra: '0', vendor: '', installments: [], ...o });

describe('budget totals', () => {
  it('uses agreed (with confirmed extra) else estimate, once per item; paid includes deposit', () => {
    const t = budgetTotals([
      { estimate: 40_000_000, agreed: 50_000_000, paid: 10_000_000, deposit: 10_000_000, extra: 2_000_000 },
      { estimate: 8_000_000, agreed: null, paid: 0, deposit: 0, extra: 0 },
    ]);
    expect(t).toEqual({ planned: 60_000_000, agreed: 52_000_000, paid: 10_000_000, unpaid: 42_000_000 });
  });
  it('parses exact VND integers', () => {
    expect(parseVnd('1.500.000')).toBe(1_500_000); expect(parseVnd('')).toBeNull(); expect(parseVnd('-5')).toBeNaN(); expect(parseVnd('1,5')).toBeNaN();
  });
});

describe('validateCost', () => {
  it('requires estimate or agreed, Khác detail', () => {
    expect(validateCost(draft()).errors['estimate']).toBeTruthy();
    expect(validateCost(draft({ category: 'khac', estimate: '1' })).errors['categoryDetail']).toBeTruthy();
  });
  it('deposit<=paid<=agreed+extra and schedule<=unpaid', () => {
    expect(validateCost(draft({ agreed: '100', paid: '50', deposit: '60' })).errors['deposit']).toBeTruthy();
    expect(validateCost(draft({ agreed: '100', paid: '120', extra: '10' })).errors['paid']).toBeTruthy();
    expect(validateCost(draft({ agreed: '100', paid: '110', extra: '10' })).payload?.paid_vnd).toBe(110);
    expect(validateCost(draft({ paid: '10', estimate: '5' })).errors['paid']).toBeTruthy();
    const inst = (a: string) => [{ key: 'k', label: 'Cuối' as const, amount: a, due: '' }];
    expect(validateCost(draft({ agreed: '100', paid: '40', installments: inst('61') })).errors['schedule']).toBeTruthy();
    expect(validateCost(draft({ agreed: '100', paid: '40', installments: inst('60') })).payload?.installments[0]?.amount_vnd).toBe(60);
  });
  it('cap must be positive', () => { expect(validateCap('0')).toBeTypeOf('string'); expect(validateCap('80.000.000')).toBe(80_000_000); });
});

describe('tasks', () => {
  it('suggestions dedupe by template id, not title', () => {
    expect(missingTemplates(['s1', 's2', 's2'], ['s1', null])).toEqual(['s2']);
  });
  it('status mapping and truthful due for blank dates', () => {
    expect(toStatusUi('waiting')).toBe('Chờ chốt');
    expect(taskDue({ due: '', status: 'Cần làm' }, '2027-10-01').label).toBe('Chưa đặt hạn');
  });
  it('Sắp hạn boundary: overdue + 1..14 days, not today, not done', () => {
    const t = (due: string, status: DemoTask['status'] = 'Cần làm'): DemoTask => ({ id: 'x', title: 'x', event: '', due, owner: '', status });
    const today = '2027-10-01';
    expect(inTaskFilter(t('2027-09-30'), 'Sắp hạn', today)).toBe(true);
    expect(inTaskFilter(t('2027-10-01'), 'Sắp hạn', today)).toBe(false);
    expect(inTaskFilter(t('2027-10-15'), 'Sắp hạn', today)).toBe(true);
    expect(inTaskFilter(t('2027-10-16'), 'Sắp hạn', today)).toBe(false);
    expect(inTaskFilter(t('2027-09-30', 'Xong'), 'Sắp hạn', today)).toBe(false);
  });
  it('table count allows 0 reserve, done needs planned>0', () => {
    expect(validateTableCount('table-count', '12', '0', 'Xong')).toBe('');
    expect(validateTableCount('table-count', '0', '', 'Xong')).toBeTruthy();
  });
});
