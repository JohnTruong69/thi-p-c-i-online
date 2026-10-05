/** Pure rules for the gift money ledger (sổ tiền mừng). No I/O. */

export type GiftMethod = 'phong_bi' | 'chuyen_khoan' | 'hien_vat';
export type GiftSide = 'chung' | 'nha-trai' | 'nha-gai';
export const GIFT_METHODS: { id: GiftMethod; label: string }[] = [
  { id: 'phong_bi', label: 'Phong bì' },
  { id: 'chuyen_khoan', label: 'Chuyển khoản' },
  { id: 'hien_vat', label: 'Hiện vật' },
];
export const methodLabel = (m: string) => GIFT_METHODS.find(x => x.id === m)?.label ?? m;
export const giftSideLabel = (s: string) => s === 'nha-trai' ? 'Nhà trai' : s === 'nha-gai' ? 'Nhà gái' : 'Chung';

export type GiftRecord = {
  id: string; wedding_id: string; guest_id: string | null; giver_name: string;
  amount_vnd: number; event_id: string | null; side: GiftSide; method: GiftMethod;
  gift_detail: string | null; thanked: boolean; note: string | null; created_at: string;
};

export type GiftDraft = {
  giver_name: string; guest_id: string | null; amount: string; event_id: string;
  side: GiftSide; method: GiftMethod; gift_detail: string; thanked: boolean; note: string;
};
export const emptyGiftDraft = (): GiftDraft => ({ giver_name: '', guest_id: null, amount: '', event_id: '', side: 'chung', method: 'phong_bi', gift_detail: '', thanked: false, note: '' });

export function validateGiftDraft(d: GiftDraft): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.giver_name.trim()) e['giver_name'] = 'Hãy nhập tên người mừng.';
  if (d.giver_name.trim().length > 120) e['giver_name'] = 'Tên tối đa 120 ký tự.';
  const n = Number(d.amount);
  if (d.amount.trim() === '' || !Number.isInteger(n) || n < 0) e['amount'] = 'Số tiền phải là số nguyên từ 0 trở lên.';
  else if (n > 10_000_000_000) e['amount'] = 'Số tiền quá lớn.';
  if (d.method === 'hien_vat' && !d.gift_detail.trim()) e['gift_detail'] = 'Hãy ghi rõ hiện vật (ví dụ: bộ ấm chén).';
  if (d.note.trim().length > 500) e['note'] = 'Ghi chú tối đa 500 ký tự.';
  return e;
}

export const giftTotals = (rs: GiftRecord[]) => ({
  total: rs.reduce((s, r) => s + r.amount_vnd, 0),
  count: rs.length,
  unthanked: rs.filter(r => !r.thanked).length,
});

/** CSV for the "đi lại" notebook: who gave what, per event. */
export function giftsToCsv(rs: GiftRecord[], eventName: (id: string | null) => string): string {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = ['\uFEFFNgười mừng,Số tiền (đ),Buổi lễ,Nhà,Hình thức,Chi tiết hiện vật,Đã cảm ơn,Ghi chú'];
  for (const r of rs) lines.push([q(r.giver_name), r.amount_vnd, q(eventName(r.event_id)), q(giftSideLabel(r.side)), q(methodLabel(r.method)), q(r.gift_detail ?? ''), r.thanked ? 'Rồi' : 'Chưa', q(r.note ?? '')].join(','));
  lines.push(`Tổng cộng,${rs.reduce((s, r) => s + r.amount_vnd, 0)},,,,,,`);
  return lines.join('\n');
}
