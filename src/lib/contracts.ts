/** Phase 1 contracts only. No persistence, payments or public publishing is implemented. */
export type ID = string;
export type EventSide = 'chung' | 'nha-trai' | 'nha-gai';
export type EventStatus = 'tentative' | 'confirmed';
export interface Wedding { id: ID; ownerId: ID; partnerName: string; ownerName: string; plannedDate?: string; status: 'draft' | 'active'; }
export interface WeddingMembership { weddingId: ID; email: string; role: 'co-manager'; status: 'pending' | 'accepted'; } // Only one partner slot; owner is recorded on Wedding.
export interface Event { id: ID; weddingId: ID; name: string; side: EventSide; date?: string; time?: string; venue?: string; address?: string; status: EventStatus; }
export interface Task { id: ID; weddingId: ID; eventId?: ID; title: string; assigneeId?: ID; dueAt?: string; status: 'todo' | 'doing' | 'done'; source: 'suggested' | 'manual'; }
export interface Budget { id: ID; weddingId: ID; eventId?: ID; label: string; committed: number; paid: number; installments?: { dueAt: string; amount: number }[]; }
export interface Guest { id: ID; weddingId: ID; name: string; phone?: string; side: EventSide; eventIds: ID[]; }
export interface CsvBatch { id: ID; weddingId: ID; filename: string; valid: number; invalid: number; possibleDuplicates: number; status: 'mapping' | 'review' | 'committed'; }
export interface Invitation { id: ID; weddingId: ID; template: 'duong-hen'; title: string; message: string; photoIds: ID[]; revision: number; }
export interface Link { id: ID; invitationId: ID; side: EventSide; token: string; enabled: boolean; eventIds: ID[]; readiness: 'off' | 'needs-fix' | 'ready'; publication: 'unpublished' | 'published' | 'expired'; }
export interface RSVP { id: ID; linkId: ID; guestName: string; answers: { eventId: ID; attending: boolean; partySize?: number }[]; reconciliation: 'unmatched' | 'needs-review' | 'confirmed'; }
export interface Order { id: ID; weddingId: ID; amount: number; currency: 'VND'; status: 'order_pending' | 'verifying' | 'paid_verified' | 'needs_support'; }
export interface Payment { id: ID; orderId: ID; providerReference: string; verifiedAt?: string; status: 'unmatched' | 'verified' | 'rejected'; }
export interface Entitlement { id: ID; weddingId: ID; paidAt: string; expiresAt: string; maxLinks: 3; maxPhotos: 50; status: 'active' | 'expired'; }
/** Future API boundary shapes. These are types, not active requests. */
export interface ApiResult<T> { data?: T; error?: { code: string; message: string; field?: string }; }
export interface WeddingDraftInput { ownerName: string; partnerName: string; plannedDate?: string; }
export interface EventInput { name: string; side: EventSide; date?: string; time?: string; venue?: string; address?: string; status: EventStatus; }
export interface CsvPreviewInput { filename: string; columnMap: Record<'name'|'phone'|'side', string>; eventIds: ID[]; }
export interface CsvPreviewResult { batch: CsvBatch; rowErrors: { row: number; reason: string }[]; suspectedDuplicates: { row: number; guestId: ID }[]; }
export interface PublishReview { readyLinks: Link[]; blockedLinks: { link: Link; eventId: ID; missingFields: string[] }[]; }
export interface RsvpInput { token: string; guestName: string; answers: RSVP['answers']; }
export interface CheckoutStatus { order: Order; payment?: Payment; entitlement?: Entitlement; }
