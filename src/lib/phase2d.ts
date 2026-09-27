/**
 * Phase 2 QA fixes — pure, client-safe logic (no I/O).
 * Shared link selector (preview = guest = RSVP = receipt), CSV paging,
 * CSV undo that keeps edited guests, and per-Event RSVP status.
 */
import type { EventSide } from './contracts';
import { PREVIEW_LIMIT } from './phase2';

// ---------- Demo tokens + shared link selector ----------
/** Only these illustrative tokens open a guest page. No public link is created. */
export const DEMO_TOKENS: Record<string, EventSide> = { demo: 'chung', 'demo-chung': 'chung', 'demo-nha-gai': 'nha-gai', 'demo-nha-trai': 'nha-trai' };
export const TOKEN_FOR_SIDE: Record<EventSide, string> = { chung: 'demo-chung', 'nha-gai': 'demo-nha-gai', 'nha-trai': 'demo-nha-trai' };

export type LinkCfg = { side: EventSide; enabled: boolean; eventIds: string[] };
export type LinkView<E> =
  | { kind: 'unknown' }
  | { kind: 'off'; side: EventSide }
  | { kind: 'ok'; side: EventSide; events: E[] };

/** Events a link shows: only enabled links, only chosen Events that still exist, in Event order. */
export function linkView<E extends { id: string }>(side: EventSide | undefined, links: LinkCfg[], events: E[]): LinkView<E> {
  if (!side) return { kind: 'unknown' };
  const l = links.find(x => x.side === side);
  if (!l) return { kind: 'unknown' };
  if (!l.enabled) return { kind: 'off', side };
  return { kind: 'ok', side, events: events.filter(e => l.eventIds.includes(e.id)) };
}
export const viewForToken = <E extends { id: string }>(token: string, links: LinkCfg[], events: E[]) =>
  linkView(Object.prototype.hasOwnProperty.call(DEMO_TOKENS, token) ? DEMO_TOKENS[token] : undefined, links, events);

export const mapUrl = (address: string) => `https://maps.google.com/?q=${encodeURIComponent(address.trim())}`;

// ---------- CSV paging ----------
export const pageCount = (total: number, size = PREVIEW_LIMIT) => Math.max(1, Math.ceil(total / size));
export const pageSlice = <T>(rows: T[], page: number, size = PREVIEW_LIMIT) => {
  const p = Math.min(Math.max(0, page), pageCount(rows.length, size) - 1);
  return { page: p, from: p * size + 1, to: Math.min(rows.length, (p + 1) * size), rows: rows.slice(p * size, (p + 1) * size) };
};

// ---------- CSV undo ----------
export type GuestLike = { id: string; name: string; phone: string; side: string; events: string[]; party: number; state: string };
export const guestFingerprint = (g: GuestLike) => JSON.stringify([g.name, g.phone, g.side, [...g.events].sort(), g.party, g.state]);
/** Removes only imported guests unchanged since import; edited ones are kept. */
export function planUndo(snapshot: Record<string, string>, guests: GuestLike[]) {
  const removeIds: string[] = []; const keptIds: string[] = [];
  for (const g of guests) {
    const fp = snapshot[g.id];
    if (fp === undefined) continue;
    (fp === guestFingerprint(g) ? removeIds : keptIds).push(g.id);
  }
  const alreadyGone = Object.keys(snapshot).filter(id => !guests.some(g => g.id === id)).length;
  return { removeIds, keptIds, alreadyGone };
}

// ---------- RSVP per Event ----------
export type Answer = { choice: 'yes' | 'no'; count: number };
export type EventStatus = { choice: 'yes' | 'no'; count: number; source: 'rsvp' | 'manual'; at: string; from?: string };
export type StatusMap = Record<string, Record<string, EventStatus>>; // guestId -> eventId -> status

/** Applies a response per Event; never overwrites a manual entry. Returns the conflicts it skipped. */
export function applyResponse(map: StatusMap, guestId: string, answers: Record<string, Answer>, at: string, from: string) {
  const cur = { ...(map[guestId] ?? {}) }; const skipped: string[] = []; const applied: string[] = [];
  for (const [eventId, a] of Object.entries(answers)) {
    if (cur[eventId]?.source === 'manual') { skipped.push(eventId); continue; }
    cur[eventId] = { choice: a.choice, count: a.choice === 'yes' ? a.count : 0, source: 'rsvp', at, from };
    applied.push(eventId);
  }
  return { map: { ...map, [guestId]: cur }, applied, skipped };
}
export function setManual(map: StatusMap, guestId: string, eventId: string, choice: 'yes' | 'no' | '', at: string): StatusMap {
  const cur = { ...(map[guestId] ?? {}) };
  if (!choice) delete cur[eventId]; else cur[eventId] = { choice, count: choice === 'yes' ? cur[eventId]?.count || 1 : 0, source: 'manual', at };
  return { ...map, [guestId]: cur };
}
/** Guest-level summary label from per-Event statuses; mixed answers stay mixed. */
export function summaryState(perEvent: Record<string, EventStatus> | undefined, eventIds: string[], fallback: string) {
  const vals = eventIds.map(id => perEvent?.[id]?.choice);
  if (!vals.length || vals.every(v => !v)) return fallback;
  if (vals.some(v => !v)) return 'Trả lời một phần';
  if (vals.every(v => v === 'yes')) return 'Có đến';
  if (vals.every(v => v === 'no')) return 'Không đến';
  return 'Trả lời từng buổi';
}
