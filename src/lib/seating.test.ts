import { describe, expect, it } from 'vitest';
import { tableLoads, unseatedPeople, validateTable, type SeatingTable } from './seating';

const t = (id: string, name: string, capacity: number): SeatingTable =>
  ({ id, wedding_id: 'w', event_id: 'e', name, capacity, position: 0 });

describe('tableLoads', () => {
  it('counts people (party_size) per table and flags over-capacity', () => {
    const loads = tableLoads([t('a', 'Bàn 1', 10), t('b', 'Bàn 2', 2)], [
      { table_id: 'a', party_size: 3 }, { table_id: 'a', party_size: 2 }, { table_id: 'b', party_size: 3 }, { table_id: null, party_size: 1 },
    ]);
    expect(loads[0]!).toMatchObject({ people: 5, records: 2, over: false });
    expect(loads[1]!).toMatchObject({ people: 3, records: 1, over: true });
  });
  it('keeps table order and zeroes empty tables', () => {
    const loads = tableLoads([t('a', 'Bàn 1', 10)], []);
    expect(loads).toHaveLength(1); expect(loads[0]!.people).toBe(0); expect(loads[0]!.over).toBe(false);
  });
});

describe('unseatedPeople', () => {
  it('sums party_size of guests without a table', () => {
    expect(unseatedPeople([{ table_id: 'a', party_size: 2 }, { table_id: null, party_size: 3 }, { table_id: null, party_size: 1 }])).toBe(4);
  });
});

describe('validateTable', () => {
  it('requires a name and a capacity between 1 and 50', () => {
    expect(validateTable('', '10')).toHaveProperty('name');
    expect(validateTable('Bàn 1', '0')).toHaveProperty('capacity');
    expect(validateTable('Bàn 1', '51')).toHaveProperty('capacity');
    expect(validateTable('Bàn 1', 'abc')).toHaveProperty('capacity');
    expect(validateTable('Bàn 1', '10')).toEqual({});
  });
});
