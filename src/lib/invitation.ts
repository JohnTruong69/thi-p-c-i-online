/** Pure, client-safe rules for the persisted Đường Hẹn invitation (no I/O). */
import { linkReadiness } from './phase2';

export type LinkSide = 'chung' | 'nha-trai' | 'nha-gai';
export const LINK_SIDES: LinkSide[] = ['chung', 'nha-gai', 'nha-trai'];
export const LINK_LABEL: Record<LinkSide, string> = { chung: 'Link chung', 'nha-gai': 'Link nhà gái', 'nha-trai': 'Link nhà trai' };
export const MAX_TITLE = 80;
export const MAX_MESSAGE = 1200;
export const PHOTO_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export type SnapEvent = { id: string; name: string; side: string; date: string | null; time: string | null; venue: string | null; address: string | null };
export type SnapLink = { side: LinkSide; enabled: boolean; event_ids: string[] };
export type InvitationSnapshot = { title: string; message: string; cover: string | null; photos: string[]; links: SnapLink[]; events: SnapEvent[] };

export const readinessEvents = (events: SnapEvent[]) => events.map(e => ({ id: e.id, name: e.name, date: e.date ?? '', time: e.time ?? '', venue: e.venue ?? '', address: e.address ?? '' }));
/** Same rule as the server: every chosen Event exists and has date, time, venue and address. Orphan ids stay visible as needs-fix. */
export const linkState = (l: SnapLink, events: SnapEvent[]) => linkReadiness(l.enabled, l.event_ids, readinessEvents(events));

export function validateContent(title: string, message: string): string {
  if (!title.trim()) return 'Hãy nhập tên hiển thị.';
  if (title.trim().length > MAX_TITLE) return `Tên hiển thị tối đa ${MAX_TITLE} ký tự.`;
  if (!message.trim()) return 'Hãy nhập lời mời.';
  if (message.trim().length > MAX_MESSAGE) return `Lời mời tối đa ${MAX_MESSAGE} ký tự.`;
  return '';
}

/** Magic-number sniffing, mirrored on the server. */
export function sniffImage(b: Uint8Array): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}
export const photoPath = (weddingId: string, hash: string, mime: string) => `${weddingId}/${hash}.${PHOTO_EXT[mime]}`;
export const isPhotoPath = (weddingId: string, p: string) => new RegExp(`^${weddingId}/[0-9a-f]{64}\\.(jpg|png|webp)$`).test(p);

export type InvChange = { field: string; before: string; after: string };
const evText = (e: SnapEvent) => [e.date ?? '', e.time ?? '', e.venue ?? '', e.address ?? ''];
/** Differences between a base revision (published or last saved) and the current draft. */
export function diffInvitation(base: InvitationSnapshot, cur: InvitationSnapshot): InvChange[] {
  const out: InvChange[] = [];
  if (base.title !== cur.title) out.push({ field: 'Tên hiển thị', before: base.title, after: cur.title });
  if (base.message !== cur.message) out.push({ field: 'Lời mời', before: base.message, after: cur.message });
  if (base.cover !== cur.cover) out.push({ field: 'Ảnh bìa', before: base.cover ? 'Có ảnh bìa' : '(chưa có)', after: cur.cover ? (base.cover ? 'Đổi ảnh bìa' : 'Có ảnh bìa') : '(bỏ ảnh bìa)' });
  const added = cur.photos.filter(p => !base.photos.includes(p)).length, removed = base.photos.filter(p => !cur.photos.includes(p)).length;
  if (added || removed) out.push({ field: 'Album ảnh', before: `${base.photos.length} ảnh`, after: `${cur.photos.length} ảnh (+${added} / −${removed})` });
  const labels = ['Ngày', 'Giờ', 'Nơi', 'Địa chỉ'];
  for (const e of base.events) {
    const n = cur.events.find(x => x.id === e.id);
    if (!n) { out.push({ field: e.name, before: 'Có trong thiệp', after: 'Buổi đã bị bỏ' }); continue; }
    if (n.name !== e.name) out.push({ field: `${e.name} · Tên buổi`, before: e.name, after: n.name });
    const a = evText(e), b = evText(n);
    labels.forEach((l, i) => { if (a[i] !== b[i]) out.push({ field: `${n.name} · ${l}`, before: a[i] || '(trống)', after: b[i] || '(trống)' }); });
  }
  for (const n of cur.events) if (!base.events.some(e => e.id === n.id)) out.push({ field: n.name, before: '(chưa có)', after: 'Buổi mới' });
  for (const s of LINK_SIDES) {
    const a = base.links.find(l => l.side === s), b = cur.links.find(l => l.side === s);
    if (!a || !b) continue;
    if (a.enabled !== b.enabled) out.push({ field: LINK_LABEL[s], before: a.enabled ? 'Bật' : 'Tắt', after: b.enabled ? 'Bật' : 'Tắt' });
    const name = (id: string) => cur.events.find(e => e.id === id)?.name ?? base.events.find(e => e.id === id)?.name ?? 'Buổi đã bị bỏ';
    if ([...a.event_ids].sort().join() !== [...b.event_ids].sort().join()) out.push({ field: `${LINK_LABEL[s]} · Buổi`, before: a.event_ids.map(name).join(', ') || '(không có)', after: b.event_ids.map(name).join(', ') || '(không có)' });
  }
  return out;
}

export function toSnapshot(v: unknown): InvitationSnapshot | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Partial<InvitationSnapshot>;
  if (typeof s.title !== 'string' || typeof s.message !== 'string' || !Array.isArray(s.links) || !Array.isArray(s.events)) return null;
  return { title: s.title, message: s.message, cover: s.cover ?? null, photos: Array.isArray(s.photos) ? s.photos : [], links: s.links, events: s.events };
}
