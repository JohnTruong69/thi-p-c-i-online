/** Pure rules for the seating chart (xếp bàn tiệc). Seats are counted in people (party_size). No I/O. */

export type SeatingTable = {
  id: string; wedding_id: string; event_id: string;
  name: string; capacity: number; position: number;
};

export type TableLoad = { table: SeatingTable; people: number; records: number; over: boolean };

/** People seated per table, in table order. */
export function tableLoads(tables: SeatingTable[], rows: { table_id: string | null; party_size: number }[]): TableLoad[] {
  return tables.map(t => {
    const seated = rows.filter(r => r.table_id === t.id);
    const people = seated.reduce((s, r) => s + r.party_size, 0);
    return { table: t, people, records: seated.length, over: people > t.capacity };
  });
}

export function unseatedPeople(rows: { table_id: string | null; party_size: number }[]): number {
  return rows.filter(r => !r.table_id).reduce((s, r) => s + r.party_size, 0);
}

export function validateTable(name: string, capacity: string): Record<string, string> {
  const e: Record<string, string> = {};
  if (!name.trim()) e['name'] = 'Hãy đặt tên bàn.';
  if (name.trim().length > 40) e['name'] = 'Tên bàn tối đa 40 ký tự.';
  const n = Number(capacity);
  if (capacity.trim() === '' || !Number.isInteger(n) || n < 1 || n > 50) e['capacity'] = 'Sức chứa từ 1 đến 50 người.';
  return e;
}
