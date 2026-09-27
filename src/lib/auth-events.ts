/** Distinguishes a deliberate sign-out from an expired/revoked session so the login page can explain which happened. */
let manual = false;
export function markManualSignOut() { manual = true; }
export function consumeManualSignOut() { const m = manual; manual = false; return m; }
