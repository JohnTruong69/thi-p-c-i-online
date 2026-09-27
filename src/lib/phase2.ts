/**
 * Phase 2 pure state logic (client-safe, no I/O). Phase 3/4 server adapters
 * should reuse these shapes; nothing here sends data anywhere.
 */
import type { Order } from './contracts';

// ---------- CSV ----------
export type CsvTable = { headers: string[]; rows: string[][] };

/** RFC4180-style parser: quotes, escaped quotes, CRLF, BOM. Cells stay strings so leading zeros survive. */
export function parseCsv(text: string): CsvTable {
  const src = text.replace(/^\uFEFF/, '');
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const delim = (src.split(/\r?\n/)[0] ?? '').split(';').length > (src.split(/\r?\n/)[0] ?? '').split(',').length ? ';' : ',';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c.trim() !== '')) out.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim() !== '')) out.push(row);
  const [headers = [], ...rows] = out;
  return { headers: headers.map(h => h.trim()), rows };
}

export const normalizeText = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
export const normalizePhone = (s: string) => s.replace(/[^\d+]/g, '');

export type ColumnMap = { name: string; phone: string; side: string; party: string };
const GUESS: Record<keyof ColumnMap, string[]> = {
  name: ['ten', 'ho ten', 'ho va ten', 'ten khach', 'name'],
  phone: ['dien thoai', 'so dien thoai', 'sdt', 'phone'],
  side: ['nha', 'ben', 'nha moi', 'side'],
  party: ['so nguoi', 'so luong', 'party'],
};
export function guessColumns(headers: string[]): ColumnMap {
  const pick = (k: keyof ColumnMap) => headers.find(h => GUESS[k].includes(normalizeText(h))) ?? '';
  return { name: pick('name'), phone: pick('phone'), side: pick('side'), party: pick('party') };
}

export type ExistingGuest = { id: string; name: string; phone: string };
export type CsvRow = {
  row: number; name: string; phone: string; side: 'Nhà gái' | 'Nhà trai' | 'Cả hai'; party: number;
  errors: string[]; duplicateOf?: string; duplicateReason?: 'phone' | 'name'; decision: 'add' | 'skip';
};
export const PREVIEW_LIMIT = 100;

function toSide(v: string): CsvRow['side'] {
  const n = normalizeText(v);
  if (n.includes('trai')) return 'Nhà trai';
  if (n.includes('gai')) return 'Nhà gái';
  return 'Cả hai';
}

/** Validates rows; possible duplicates are flagged and default to 'skip' — never auto-merged. */
export function buildPreview(table: CsvTable, map: ColumnMap, existing: ExistingGuest[]): CsvRow[] {
  const idx = (h: string) => (h ? table.headers.indexOf(h) : -1);
  const [ni, pi, si, qi] = [idx(map.name), idx(map.phone), idx(map.side), idx(map.party)];
  const seen: ExistingGuest[] = [...existing];
  return table.rows.map((cells, i) => {
    const name = (cells[ni] ?? '').trim();
    const phone = (cells[pi] ?? '').trim();
    const partyRaw = (cells[qi] ?? '').trim();
    const party = partyRaw === '' ? 1 : Number(partyRaw);
    const errors: string[] = [];
    if (!name) errors.push('Thiếu tên khách');
    if (phone && !/^\+?\d{8,15}$/.test(normalizePhone(phone))) errors.push('Số điện thoại chưa hợp lệ');
    if (!Number.isInteger(party) || party < 1 || party > 50) errors.push('Số người phải là số nguyên từ 1 đến 50');
    const dup = errors.length ? undefined : seen.find(g =>
      (phone && g.phone && normalizePhone(g.phone) === normalizePhone(phone)) || normalizeText(g.name) === normalizeText(name));
    const r: CsvRow = { row: i + 2, name, phone, side: toSide(cells[si] ?? ''), party: Number.isFinite(party) ? party : 1, errors, decision: errors.length || dup ? 'skip' : 'add' };
    if (dup) { r.duplicateOf = dup.name; r.duplicateReason = phone && dup.phone && normalizePhone(dup.phone) === normalizePhone(phone) ? 'phone' : 'name'; }
    if (!errors.length) seen.push({ id: `row${r.row}`, name, phone });
    return r;
  });
}

export function summarize(rows: CsvRow[]) {
  return {
    valid: rows.filter(r => !r.errors.length && !r.duplicateOf).length,
    invalid: rows.filter(r => r.errors.length).length,
    possibleDuplicates: rows.filter(r => r.duplicateOf).length,
    toAdd: rows.filter(r => r.decision === 'add' && !r.errors.length).length,
  };
}

export const SAMPLE_CSV = '\uFEFFHọ và tên,Số điện thoại,Nhà mời,Số người\n"Nguyễn Thị Hạnh",0912345678,Nhà gái,2\n"Trần Văn Bình",0987654321,Nhà trai,1\n"Hà My",0901112223,Nhà gái,1\n,0933444555,Nhà trai,1\n';

// ---------- Suggested tasks (43) ----------
export type SuggestedTask = { id: string; title: string; phase: 'Sớm' | '3 tháng trước' | '1 tháng trước' | 'Tuần cưới' };
const T = (phase: SuggestedTask['phase'], titles: string[], start: number): SuggestedTask[] =>
  titles.map((title, i) => ({ id: `s${start + i}`, title, phase }));
export const SUGGESTED_TASKS: SuggestedTask[] = [
  ...T('Sớm', ['Chốt ngày cưới với hai gia đình', 'Xem ngày tốt', 'Ước tính ngân sách chung', 'Lập danh sách khách sơ bộ', 'Chọn nơi tổ chức tiệc', 'Đặt cọc nhà hàng', 'Chọn studio ảnh cưới', 'Chọn váy cưới và áo dài', 'Chọn vest chú rể', 'Thống nhất số buổi lễ', 'Hỏi ý kiến gia đình về nghi lễ'], 1),
  ...T('3 tháng trước', ['Chụp ảnh cưới', 'Đặt nhẫn cưới', 'Chọn người dẫn chương trình', 'Đặt ban nhạc hoặc âm thanh', 'Đặt hoa và trang trí', 'Đặt xe hoa', 'Chọn đội bưng quả', 'Đặt tráp ăn hỏi', 'Chọn thực đơn tiệc', 'Đặt trang điểm cô dâu', 'Soạn lời mời'], 12),
  ...T('1 tháng trước', ['Chốt danh sách khách', 'Gửi thiệp cho khách', 'Theo dõi phản hồi tham dự', 'Xếp bàn tiệc', 'Chuẩn bị quà cảm ơn', 'Thử lại trang phục', 'Chốt kịch bản buổi lễ', 'Đặt phòng cho khách ở xa', 'Chuẩn bị phong bì và sổ ghi mừng', 'Làm giấy đăng ký kết hôn', 'Xác nhận lại các bên cung cấp'], 23),
  ...T('Tuần cưới', ['Báo số khách cuối cho nhà hàng', 'Thanh toán các khoản còn lại', 'Chuẩn bị tiền lẻ, lì xì', 'Phân công người đón khách', 'Tổng duyệt với MC', 'Kiểm tra xe hoa', 'Chuẩn bị đồ lễ gia tiên', 'Sắp xếp đồ dùng cá nhân', 'Nghỉ ngơi trước ngày cưới', 'Nhắn khách giờ và địa điểm'], 34),
];

// ---------- RSVP reconciliation ----------
export type MatchResult =
  | { kind: 'exact'; guestId: string; reason: string }
  | { kind: 'ambiguous'; guestIds: string[]; reason: string }
  | { kind: 'none'; reason: string };
/** Phone match is exact; a unique name is only a suggestion; several same names are ambiguous and never auto-merged. */
export function matchResponse(r: { name: string; phone?: string }, guests: ExistingGuest[]): MatchResult {
  if (r.phone) {
    const byPhone = guests.filter(g => g.phone && normalizePhone(g.phone) === normalizePhone(r.phone!));
    if (byPhone.length === 1) return { kind: 'exact', guestId: byPhone[0]!.id, reason: 'Trùng số điện thoại' };
  }
  const byName = guests.filter(g => normalizeText(g.name) === normalizeText(r.name));
  if (byName.length > 1) return { kind: 'ambiguous', guestIds: byName.map(g => g.id), reason: `${byName.length} khách cùng tên — cần chọn đúng người` };
  if (byName.length === 1) return { kind: 'ambiguous', guestIds: [byName[0]!.id], reason: 'Chỉ trùng tên — cần hai bạn xác nhận' };
  return { kind: 'none', reason: 'Không có khách trùng trong sổ' };
}

// ---------- Order (demo) ----------
export type OrderStatus = Order['status'];
/** Client-side demo transitions. 'paid_verified' can only come from a server-verified payment. */
export const CLIENT_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  order_pending: ['verifying', 'needs_support'],
  verifying: ['needs_support', 'order_pending'],
  needs_support: ['order_pending'],
  paid_verified: [],
};
export function canClientSet(from: OrderStatus, to: OrderStatus) {
  return to !== 'paid_verified' && CLIENT_TRANSITIONS[from].includes(to);
}

// ---------- Link readiness ----------
export type ReadinessEvent = { id: string; name: string; date?: string; time?: string; venue?: string; address?: string };
/** Ngày, giờ, nơi và địa chỉ đều bắt buộc — cùng quy tắc với trang Kiểm tra thiệp. */
export function linkReadiness(enabled: boolean, eventIds: string[], events: ReadinessEvent[]) {
  if (!enabled) return { readiness: 'off' as const, missing: [] as string[] };
  if (!eventIds.length) return { readiness: 'needs-fix' as const, missing: ['Chưa chọn buổi nào'] };
  const missing = eventIds.flatMap(id => {
    const e = events.find(x => x.id === id);
    if (!e) return ['Buổi đã bị bỏ — cần chọn lại'];
    return [!e.date && `${e.name}: ngày`, !e.time && `${e.name}: giờ`, !e.venue?.trim() && `${e.name}: nơi tổ chức`, !e.address?.trim() && `${e.name}: địa chỉ`].filter((x): x is string => !!x);
  });
  return { readiness: missing.length ? ('needs-fix' as const) : ('ready' as const), missing };
}

export const MAX_PHOTOS = 50;
export const MAX_LINKS = 3;

// ---------- Event date change impact ----------
export const dayDiff = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
export const shiftDate = (d: string, days: number) => new Date(Date.parse(d + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
export type ImpactTask = { id: string; title: string; event: string; due: string };
export type ImpactCost = { id: string; title: string; event: string; installments: { label: string; due: string }[] };
export type ImpactLink = { side: string; enabled: boolean; eventIds: string[] };
export type DateImpact = {
  deltaDays: number;
  /** Tasks tied to the event with a due date: shifted by the same number of days (relative to the event), only if the user accepts. */
  tasks: { id: string; title: string; from: string; to: string }[];
  /** Deposits / fixed-date payments: warning only, never changed automatically. */
  costWarnings: { title: string; label: string; due: string }[];
  /** Enabled links containing the event: need review before any public update. */
  linksToReview: string[];
  /** The date was cleared: task due dates are kept, never shifted. */
  cleared: boolean;
};
export function computeDateImpact(eventId: string, oldDate: string, newDate: string, tasks: ImpactTask[], costs: ImpactCost[], links: ImpactLink[]): DateImpact {
  const deltaDays = oldDate && newDate ? dayDiff(oldDate, newDate) : 0;
  return {
    deltaDays,
    tasks: deltaDays ? tasks.filter(t => t.event === eventId && t.due).map(t => ({ id: t.id, title: t.title, from: t.due, to: shiftDate(t.due, deltaDays) })) : [],
    costWarnings: costs.filter(c => c.event === eventId).flatMap(c => c.installments.filter(i => i.due).map(i => ({ title: c.title, label: i.label, due: i.due }))),
    linksToReview: links.filter(l => l.enabled && l.eventIds.includes(eventId)).map(l => l.side),
    cleared: !!oldDate && !newDate,
  };
}

// ---------- Photos ----------
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export function checkPhotos(files: { name: string; type: string; size: number }[], current: number) {
  const accepted: number[] = []; const rejected: { name: string; reason: string }[] = [];
  files.forEach((f, i) => {
    if (!PHOTO_TYPES.includes(f.type)) rejected.push({ name: f.name, reason: 'Chỉ nhận JPG, PNG hoặc WEBP' });
    else if (f.size > MAX_PHOTO_BYTES) rejected.push({ name: f.name, reason: 'Ảnh lớn hơn 10 MB' });
    else if (current + accepted.length >= MAX_PHOTOS) rejected.push({ name: f.name, reason: `Đã đủ ${MAX_PHOTOS} ảnh` });
    else accepted.push(i);
  });
  return { accepted, rejected };
}

// ---------- Invitation snapshot diff ----------
export type Snapshot = { revision: number; title: string; message: string; events: { id: string; name: string; date: string; time: string; venue: string; address: string }[] };
export type Change = { field: string; before: string; after: string; eventId?: string };
export function diffSnapshot(sent: Snapshot, current: Omit<Snapshot, 'revision'>): Change[] {
  const out: Change[] = [];
  if (sent.title !== current.title) out.push({ field: 'Tên hiển thị', before: sent.title, after: current.title });
  if (sent.message !== current.message) out.push({ field: 'Lời mời', before: sent.message, after: current.message });
  const keys = [['name', 'Tên buổi'], ['date', 'Ngày'], ['time', 'Giờ'], ['venue', 'Nơi'], ['address', 'Địa chỉ']] as const;
  for (const e of sent.events) {
    const now = current.events.find(x => x.id === e.id);
    if (!now) { out.push({ field: `${e.name}`, before: 'Có trong thiệp', after: 'Đã bỏ buổi', eventId: e.id }); continue; }
    for (const [k, l] of keys) if (e[k] !== now[k]) out.push({ field: `${now.name} · ${l}`, before: e[k] || '(trống)', after: now[k] || '(trống)', eventId: e.id });
  }
  for (const n of current.events) if (!sent.events.some(e => e.id === n.id)) out.push({ field: n.name, before: '(chưa có)', after: 'Buổi mới', eventId: n.id });
  return out;
}
