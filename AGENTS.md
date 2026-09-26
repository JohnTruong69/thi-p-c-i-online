# Project architecture
- Phase 1 is a frontend-only TanStack Start route set using shared screen rendering and static demo fixtures; this prevents demo interactions from implying persisted data.
- Product entity contracts live in a standalone client-safe module; later server adapters can implement them without changing screen types.
- Owner and guest screens use separate shells; public invitation pages must never inherit owner navigation.
- RSVP demo choices are scoped to a browser tab and invitation token, validated on read, and never sent to a server; this lets the receipt reflect selections without implying a real submission.
