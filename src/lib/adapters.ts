/** Typed adapters from Phase 2 tab-session shapes to Phase 3/4 API payloads (contracts.ts). No requests are made. */
import type { EventInput, EventSide, Guest, Link, RsvpInput } from './contracts';
import { linkReadiness, type ReadinessEvent } from './phase2';

export const toSide = (label: string): EventSide => (label === 'Nhà trai' ? 'nha-trai' : label === 'Nhà gái' ? 'nha-gai' : 'chung');
export type SessionEvent = { id: string; name: string; side: string; date: string; time: string; venue: string; address: string; confirmed: boolean };
export function toEventInput(e: SessionEvent): EventInput {
  const out: EventInput = { name: e.name.trim(), side: toSide(e.side), status: e.confirmed ? 'confirmed' : 'tentative' };
  if (e.date) out.date = e.date; if (e.time) out.time = e.time; if (e.venue) out.venue = e.venue; if (e.address) out.address = e.address;
  return out;
}
export type SessionGuest = { id: string; name: string; phone: string; side: string; events: string[] };
export function toGuest(g: SessionGuest, weddingId: string): Guest {
  const out: Guest = { id: g.id, weddingId, name: g.name, side: toSide(g.side), eventIds: g.events };
  if (g.phone) out.phone = g.phone; // stays a string: leading zero preserved
  return out;
}
export type SessionLink = { side: EventSide; enabled: boolean; eventIds: string[] };
/** Publication is always 'unpublished' from the client; only the server may set published. */
export function toLink(l: SessionLink, invitationId: string, events: ReadinessEvent[]): Link {
  return { id: `${invitationId}-${l.side}`, invitationId, side: l.side, token: '', enabled: l.enabled, eventIds: l.eventIds, readiness: linkReadiness(l.enabled, l.eventIds, events).readiness, publication: 'unpublished' };
}
export function toRsvpInput(token: string, name: string, answers: Record<string, { choice: 'yes' | 'no'; count: number }>): RsvpInput {
  return { token, guestName: name.trim(), answers: Object.entries(answers).map(([eventId, a]) => (a.choice === 'yes' ? { eventId, attending: true, partySize: a.count } : { eventId, attending: false })) };
}
