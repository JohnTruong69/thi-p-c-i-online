# Project architecture
- Phase 1 is a frontend-only TanStack Start route set using shared screen rendering and static demo fixtures; this prevents demo interactions from implying persisted data.
- Product entity contracts live in a standalone client-safe module; later server adapters can implement them without changing screen types.
- Owner and guest screens use separate shells; public invitation pages must never inherit owner navigation.
- RSVP demo choices are scoped to a browser tab and invitation token, validated on read, and never sent to a server; this lets the receipt reflect selections without implying a real submission.
- Phase 1 screen fixtures and edits share browser-tab sessionStorage with guarded read and reset; this lets users compare routes without suggesting server persistence.
- Budget planned totals use agreed price when available, otherwise estimates, once per item; supplier payments and schedules are separate from Wedding checkout.

- Ceremony removal previews affected demo records and reassigns task/cost links while removing guest invitations; session writes occur outside React state updaters so replay cannot duplicate records.
- V1 membership is at most two equal managers (creator is metadata only; server auth by Wedding membership, audit revoke/delete, never zero managers); invitation and role states are browser-tab-only demos, never evidence of email delivery or actual access.
- Owner navigation groups persistent desktop child links by task while mobile keeps exactly five primary tabs and exposes child routes inside their parent screens; this preserves discoverability without changing V3 structure.
- Phase 2 state logic (CSV parse/validate/dedupe, 43 suggested tasks, RSVP matching, order transitions, link readiness) lives in pure src/lib/phase2.ts with vitest tests; UI never marks an order paid client-side and ambiguous RSVP names are never auto-merged.
- CSV files are parsed in the browser only (never uploaded); imported guests and undo live in the tab session.
- Event date edits go through a computed impact review (tasks shift only on consent, payment dates warn only, enabled links flagged); link versions live in tab session and publication is always 'unpublished' client-side; invitation photos are object URLs in tab memory only.
- Dynamic owner routes (/wedding/events/$id, /plan/budget/$id, /guests/$id, /plan/tasks/suggestions) reuse list screens and open the matching dialog from the URL via useDeepLink; unknown ids show an alert, closing returns focus to the item's Sửa button.
- Guest pages, preview, RSVP and receipt all resolve events via linkView/viewForToken in src/lib/phase2d.ts (same links session config); only DEMO_TOKENS open, off/unknown show a neutral page — keeps preview = guest.
- RSVP status is stored per guest per Event (rsvp-status session); manual entries are never overwritten by responses; CSV undo removes only guests unchanged since import (fingerprint snapshot).
- Link readiness requires date, time, venue and address — same rule as the Check screen.
