/** Pure Planner rules shared by the real (persisted) tasks + budget screens. Money is exact integer VND. */
import type { DemoTask } from './task-demo';
import { shiftDate } from './phase2';

/** Rolling windows in local calendar dates. A missing date is never treated as zero or overdue. */
export function dueWindow(date: string | null, today: string): 'unknown' | 'overdue' | 'seven_days' | 'thirty_days' | 'later' {
  if (!date || !today) return 'unknown';
  if (date < today) return 'overdue';
  if (date <= shiftDate(today, 7)) return 'seven_days';
  if (date <= shiftDate(today, 30)) return 'thirty_days';
  return 'later';
}

export type TaskStatusDb = 'todo' | 'doing' | 'waiting' | 'done';
export const STATUS_TO_UI: Record<TaskStatusDb, DemoTask['status']> = { todo: 'Cần làm', doing: 'Đang làm', waiting: 'Chờ chốt', done: 'Xong' };
export const STATUS_FROM_UI: Record<DemoTask['status'], TaskStatusDb> = { 'Cần làm': 'todo', 'Đang làm': 'doing', 'Chờ chốt': 'waiting', 'Xong': 'done' };
export const toStatusUi = (s: string): DemoTask['status'] => STATUS_TO_UI[s as TaskStatusDb] ?? 'Cần làm';

/** Suggestions already in the wedding, matched by template id only (never by title). */
export function missingTemplates(picked: string[], existingTemplateIds: (string | null)[]): string[] {
  const have = new Set(existingTemplateIds.filter(Boolean));
  return [...new Set(picked)].filter(id => !have.has(id));
}

export const MAX_VND = 10_000_000_000;

/** Market reference prices (VNĐ) so couples can sanity-check their budget. 2025–2026 market; varies by city and choices. */
export const PRICE_REFERENCES = [
  { id: 'tiec', label: 'Tiệc & địa điểm', range: '5–8 triệu/bàn', detail: 'Tiệc 20–30 bàn thường hết 100–240 triệu tùy nhà hàng và thực đơn.' },
  { id: 'le', label: 'Lễ gia tiên/ăn hỏi', range: '8–20 triệu', detail: 'Tráp lễ truyền thống; chưa gồm sính lễ hai gia đình chuẩn bị.' },
  { id: 'anh', label: 'Ảnh & trang phục', range: '15–50 triệu', detail: 'Chụp ảnh cưới 8–20 triệu; thuê váy 2,5–10 triệu; vest 1–5 triệu; nhẫn cưới 5–40 triệu/cặp.' },
  { id: 'trangtri', label: 'Di chuyển/hoa/trang trí', range: '10–25 triệu', detail: 'Hoa và trang trí 7–10 triệu; xe hoa 3–8 triệu tùy quãng đường.' },
] as const;
export const PRICE_NOTE = 'Giá tham khảo thị trường 2025–2026; thực tế chênh lệch theo tỉnh thành, thời điểm và lựa chọn của hai bạn.';
export const CATEGORIES = [
  { id: 'tiec', label: 'Tiệc & địa điểm' }, { id: 'le', label: 'Lễ gia tiên/ăn hỏi' }, { id: 'anh', label: 'Ảnh & trang phục' },
  { id: 'trangtri', label: 'Di chuyển/hoa/trang trí' }, { id: 'khac', label: 'Khác' },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]['id'];
export const PAYERS = [
  { id: 'couple', label: 'Cặp đôi' }, { id: 'nha-trai', label: 'Nhà trai' }, { id: 'nha-gai', label: 'Nhà gái' }, { id: 'chung', label: 'Chung' },
] as const;
export type PayerId = (typeof PAYERS)[number]['id'];
export const payerLabel = (p: string) => PAYERS.find(x => x.id === p)?.label ?? 'Cặp đôi';
export const categoryLabel = (c: string) => CATEGORIES.find(x => x.id === c)?.label ?? 'Khác';
export const INSTALLMENT_LABELS = ['Cọc', 'Đợt tiếp', 'Cuối'] as const;

export type CostMoney = { estimate: number; agreed: number | null; paid: number; deposit: number; extra: number };
/** Confirmed extras raise the agreed supplier price. */
export const agreedCost = (x: CostMoney) => (x.agreed === null ? 0 : x.agreed + x.extra);
/** Planned total: agreed price when present, otherwise the estimate — once per item. */
export const plannedCost = (x: CostMoney) => (x.agreed === null ? x.estimate : agreedCost(x));
export const unpaidCost = (x: CostMoney) => Math.max(0, agreedCost(x) - x.paid);
export function budgetTotals(items: CostMoney[]) {
  return items.reduce((s, x) => ({ planned: s.planned + plannedCost(x), agreed: s.agreed + agreedCost(x), paid: s.paid + x.paid, unpaid: s.unpaid + unpaidCost(x) }), { planned: 0, agreed: 0, paid: 0, unpaid: 0 });
}

export const fmtVnd = (n: number) => `${n.toLocaleString('vi-VN')} đ`;
const MONEY_RE = /^\d[\d.\s]*$/;
/** Exact integer VND from "1.500.000" / "1500000"; null for blank; NaN for invalid. */
export function parseVnd(v: string): number | null {
  const t = v.trim(); if (!t) return null;
  if (!MONEY_RE.test(t)) return NaN;
  const n = Number(t.replace(/[.\s]/g, ''));
  return Number.isSafeInteger(n) ? n : NaN;
}

export type CostDraft = {
  title: string; category: CategoryId; categoryDetail: string; eventId: string; payer: PayerId;
  estimate: string; agreed: string; paid: string; deposit: string; extra: string; vendor: string;
  installments: { key: string; label: (typeof INSTALLMENT_LABELS)[number]; amount: string; due: string }[];
};
export type CostPayload = {
  label: string; category: CategoryId; category_detail: string | null; event_id: string | null; payer: PayerId;
  estimate_vnd: number; agreed_vnd: number | null; paid_vnd: number; deposit_vnd: number; extra_vnd: number; vendor: string | null;
  installments: { label: string; amount_vnd: number; due_date: string | null }[];
};

/** Same rules the database enforces (CHECKs + deferred schedule trigger); errors keyed by field. */
export function validateCost(f: CostDraft): { errors: Record<string, string>; payload?: CostPayload } {
  const n: Record<string, string> = {};
  if (!f.title.trim()) n['title'] = 'Hãy nhập tên khoản chi.';
  else if (f.title.trim().length > 120) n['title'] = 'Tên khoản chi tối đa 120 ký tự.';
  if (f.category === 'khac' && !f.categoryDetail.trim()) n['categoryDetail'] = 'Hãy ghi cụ thể khoản chi thuộc nhóm Khác.';
  const money: Record<string, number | null> = {};
  for (const key of ['estimate', 'agreed', 'paid', 'deposit', 'extra'] as const) {
    const v = parseVnd(f[key]); money[key] = v;
    if (Number.isNaN(v)) n[key] = 'Chỉ nhập số tiền không âm (đồng).';
    else if ((v ?? 0) > MAX_VND) n[key] = 'Số tiền quá lớn.';
  }
  const estimate = money['estimate'] ?? null, agreed = money['agreed'] ?? null;
  const paid = money['paid'] ?? 0, deposit = money['deposit'] ?? 0, extra = money['extra'] ?? 0;
  if (!n['estimate'] && !n['agreed'] && estimate === null && agreed === null) n['estimate'] = 'Nhập tiền dự tính hoặc giá đã chốt.';
  if (!n['paid'] && paid > 0 && agreed === null) n['paid'] = 'Cần ghi giá đã chốt trước khi ghi tiền đã trả.';
  if (!n['extra'] && extra > 0 && agreed === null) n['extra'] = 'Chỉ ghi phát sinh đã xác nhận sau khi có giá chốt.';
  if (!n['paid'] && agreed !== null && paid > agreed + extra) n['paid'] = 'Đã thanh toán không thể vượt giá đã chốt gồm phát sinh.';
  if (!n['deposit'] && deposit > paid) n['deposit'] = 'Tiền cọc không thể lớn hơn tiền đã thanh toán.';
  let scheduled = 0;
  const inst = f.installments.map((i, index) => {
    const a = parseVnd(i.amount);
    if (a === null || Number.isNaN(a) || a <= 0 || a > MAX_VND) n[`installment-${index}`] = 'Nhập số tiền đợt trả hợp lệ.';
    else scheduled += a;
    return { label: i.label, amount_vnd: a ?? 0, due_date: i.due || null };
  });
  if (f.installments.length && agreed === null) n['schedule'] = 'Cần ghi giá đã chốt để lập lịch trả.';
  else if (scheduled > Math.max(0, (agreed ?? 0) + extra - paid)) n['schedule'] = 'Tổng các đợt vượt phần còn phải trả.';
  if (Object.keys(n).length) return { errors: n };
  return { errors: {}, payload: {
    label: f.title.trim(), category: f.category, category_detail: f.category === 'khac' ? f.categoryDetail.trim() : null,
    event_id: f.eventId || null, payer: f.payer, estimate_vnd: estimate ?? 0, agreed_vnd: agreed, paid_vnd: paid, deposit_vnd: deposit, extra_vnd: extra,
    vendor: f.vendor.trim() || null, installments: inst,
  } };
}

export function validateCap(v: string): number | string {
  const n = parseVnd(v);
  return n === null || Number.isNaN(n) || n <= 0 || n > MAX_VND ? 'Nhập mức dự định chi hợp lệ, lớn hơn 0.' : n;
}
