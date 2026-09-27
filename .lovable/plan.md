# Phase 3: Family viewers (up to 2 per wedding), read-only

## What was reviewed
- Branch HEAD `11f5696`, migrations `0000`–`0010`.
- Every private table (weddings, events, tasks, budget_*, guests, assignments, invitations, links, photos, revisions, rsvp_*, entitlements, audit, memberships, invites) uses `is_wedding_manager(wedding_id)` in its RLS. `wedding_memberships` has a max-two trigger (`enforce_two_managers`).
- `/settings/team` renders `TeamPanel` (PhaseThree.tsx) through PhaseOne's owner shell. Every owner route sits under `_authenticated` (client-only gate → `/login?redirect`). `WeddingGate` and `myWeddingQuery` read `weddings` through RLS.

## Architectural decision (and why it isn't a blocker)
Viewers must not be added to `wedding_memberships` or to any existing policy, because:
- `wedding_memberships` gives full manager rights and is capped at 2 by trigger;
- adding a "viewer can read" policy to raw tables would expose phone numbers, CSV provenance, notes and private photo paths.

So viewers get **no direct table access**. Everything they read comes from one SECURITY DEFINER function that returns cleaned-up data for their granted scope only. All existing policies, the Planner code and the manager RPCs stay unchanged.

Risk to handle: a viewer who opens owner routes would hit `WeddingGate` with no wedding and be offered `/wedding/new`. That's allowed: they could create their own wedding, because viewing is not managing. The viewer area is a separate route and shell, so owner navigation never shows it.

## Data model (new migration `0011_family_viewers.sql`, additive only)
```text
wedding_viewers        id, wedding_id FK, user_id FK auth.users, modules text[], sides text[],
                       created_by, created_at, revoked_at   UNIQUE(wedding_id,user_id)
wedding_viewer_invites id, wedding_id, email, token_hash (sha256 hex), modules text[], sides text[],
                       status pending|accepted|revoked|expired, invited_by, accepted_by,
                       expires_at (7 days), created_at, updated_at
```
- CHECKs: modules ⊆ {events, tasks, budget, guests, rsvp}, non-empty; sides ⊆ {chung, nha-trai, nha-gai}, non-empty.
- Trigger `enforce_two_viewers`: active viewers + pending unexpired invites ≤ 2 per wedding, with an advisory lock.
- Existing `forbid_wedding_move` and `touch_updated_at` triggers are reused.
- GRANTs: authenticated SELECT only; service_role ALL. RLS: managers read both tables (`is_wedding_manager`), and a viewer reads their own `wedding_viewers` row. No client INSERT, UPDATE or DELETE.

## RPCs (SECURITY DEFINER, `search_path=public`, explicit `auth.uid()` checks)
- `create_viewer_invite(wedding, email, modules, sides)`: manager only. Returns the raw token once and stores only its hash. Audit `viewer.invited`.
- `revoke_viewer_invite(invite_id)` and `revoke_viewer(viewer_id)`: manager only; sets `revoked_at`. Audit.
- `update_viewer_grants(viewer_id, modules, sides)`: manager only. Audit `viewer.grants_changed`.
- `inspect_viewer_invite(token)`: returns status and whether the email matches, like `inspect_invite`.
- `accept_viewer_invite(token)`: needs a confirmed email that matches the invite. Rejected if the user already manages this wedding, and idempotent. Audit `viewer.accepted`.
- `viewer_weddings()`: lists `{wedding_id, couple names, modules, sides}` for the caller's active grants.
- `viewer_projection(wedding_id)`: returns one JSON object, with only the granted modules included:
  - events: name, side, date, time, venue, address, status (filtered by granted sides)
  - tasks: title, status, due_date, kind, planned/reserve tables, linked event name. No note or outcome. Filtered to tasks whose event side is granted; tasks without an event only if `chung` is granted.
  - budget: label, category, payer, planned/paid totals per item, linked event. No vendor, note or installment schedule. Same side rule.
  - guests: name, side, party_size, per-event invite and reply status for granted-side events. **No phone, note or import data.**
  - rsvp: per-event counts only (latest replies), no guest names or contact details.
  - Never included: photos, invitation draft, links and tokens, entitlements, checkout, audit, other viewers.
- EXECUTE for these goes to authenticated only; anon is revoked.

## Frontend
- `src/lib/viewers-api.ts`: typed wrappers plus DTO types (the RPCs are called through the browser client; RLS and the definer checks are the security boundary).
- `src/lib/viewers.ts`: pure grant and scope helpers (module/side labels, validation).
- `src/components/TeamPanel` section in `PhaseThree.tsx`: a new "Người thân xem" block below the managers block. It has an invite form (email, module checkboxes, side checkboxes), a shareable link with the "email CHƯA được gửi" note, pending/active lists, and revoke/edit grants with a confirm step. The existing manager UI is untouched.
- New routes: `src/routes/viewer-invite.$token.tsx` (public, ssr:false, noindex; reuses the `InviteAcceptPage` pattern), `src/routes/_authenticated/view.tsx` and `view.$weddingId.tsx`. These use a separate read-only `ViewerShell` (no owner nav, no edit buttons) with tabs only for granted modules, plus head() metadata.
- After sign-in: if the user has no managed wedding but has viewer grants, `/home` shows a link to `/view`. This is a small addition inside `WeddingGate`'s empty state.
- `friendlyError`: add Vietnamese messages for viewer errors (slot full, invite expired, not granted).

## Tests
- `supabase/tests/viewers-check.ts` (live, self-cleaning `rlstest-*` accounts):
  - both managers can invite and revoke; a third viewer or pending invite is rejected
  - a non-manager or viewer cannot invite, revoke or change grants
  - a pending invitee gets an empty projection
  - email mismatch, expired and revoked invites are rejected
  - a viewer's direct SELECT on guests, tasks, budget_items, invitation_photos, rsvp_responses, wedding_entitlements and weddings returns 0 rows; all INSERT, UPDATE and DELETE attempts fail
  - the projection contains no `phone`, `note`, `vendor`, `storage_path` or `token` keys
  - side filtering (a nhà trai-only viewer sees no nhà gái events or guests), module filtering, and access to another wedding denied
  - revoke immediately empties the projection; audit rows exist for every change
- The existing `rls-check`, planner, guests, invitation and rsvp checks rerun unchanged.
- Unit tests `src/lib/viewers.test.ts`. Browser check at 375px and 1280px: invite, accept as a QA account, view, revoke. Only temporary QA accounts and weddings, deleted afterwards.

## Rollout
1. Apply migration `0011` (additive: new tables, functions and policies only; no changes to existing objects).
2. Types regenerate automatically. Add the frontend, run tsgo, vitest and build.
3. Run the DB checks, then the browser QA, then clean up fixtures.
4. Record the viewer rule in AGENTS.md and update roadmap.md.

## Explicitly out of scope
No changes to the Planner, manager memberships, trial clock, entitlements, write gating, pricing, payment or publishing. No real wedding or Auth records are touched. No email sending (share link only).
