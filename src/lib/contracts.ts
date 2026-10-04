/** Phase 1 contracts only. No persistence, payments or public publishing is implemented. */
export type ID = string;
export type EventSide = 'chung' | 'nha-trai' | 'nha-gai';
export type EventStatus = 'tentative' | 'confirmed';
export interface Wedding { id: ID; /** Creator only: metadata / contact / audit, NOT a privileged role. */ creatorId: ID; partnerName: string; creatorName: string; plannedDate?: string; status: 'draft' | 'active'; }
export interface WeddingMembership { weddingId: ID; email: string; role: 'manager'; status: 'pending' | 'accepted'; }
/* Backend rules (later phase): max 2 accepted/pending members per Wedding; both managers have identical rights in every module incl. export and deletion. Authorize server-side by Wedding membership, never by creatorId. Revoke/delete require confirmation + audit log. Never leave a Wedding with zero managers. No dual-approval unless product owner requests it. Pending = no access yet. */
export interface Event { id: ID; weddingId: ID; name: string; side: EventSide; date?: string; time?: string; venue?: string; address?: string; status: EventStatus; }
export interface Task { id: ID; weddingId: ID; eventId?: ID; title: string; assigneeId?: ID; dueAt?: string; status: 'todo' | 'doing' | 'waiting' | 'done'; source: 'suggested' | 'manual'; kind?: 'table-count'; plannedTables?: number; reserveTables?: number; outcome?: string; note?: string; }
export interface Budget { id: ID; weddingId: ID; eventId?: ID; label: string; committed: number; paid: number; installments?: { dueAt: string; amount: number }[]; }
export interface Guest { id: ID; weddingId: ID; name: string; phone?: string; side: EventSide; eventIds: ID[]; }
export interface CsvBatch { id: ID; weddingId: ID; filename: string; valid: number; invalid: number; possibleDuplicates: number; status: 'mapping' | 'review' | 'committed'; }
/** Future API boundary shapes. These are types, not active requests. */
export interface ApiResult<T> { data?: T; error?: { code: string; message: string; field?: string }; }
export interface WeddingDraftInput { creatorName: string; partnerName: string; plannedDate?: string; }
export interface EventInput { name: string; side: EventSide; date?: string; time?: string; venue?: string; address?: string; status: EventStatus; }
export interface CsvPreviewInput { filename: string; columnMap: Record<'name'|'phone'|'side', string>; eventIds: ID[]; }
export interface CsvPreviewResult { batch: CsvBatch; rowErrors: { row: number; reason: string }[]; suspectedDuplicates: { row: number; guestId: ID }[]; }
