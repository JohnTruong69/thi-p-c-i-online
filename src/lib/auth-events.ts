/** Distinguishes a deliberate sign-out from an expired/revoked session so the login page can explain which happened. */
let manual = false;
export function markManualSignOut() { manual = true; }
export function consumeManualSignOut() { const m = manual; manual = false; return m; }

/** First path segments of owner routes under src/routes/_authenticated. Only these redirect on session expiry; everything else (/, /goi, /pay, login, invites, guest pages) stays public. */
const PROTECTED_SEGMENTS = new Set(['home', 'wedding', 'plan', 'guests', 'invitation', 'plans', 'checkout', 'publish', 'rsvp', 'settings', 'account', 'admin', 'view', 'claim']);
export function isProtectedPath(pathname: string): boolean {
  const seg = pathname.split('/').filter(Boolean)[0] ?? '';
  return PROTECTED_SEGMENTS.has(seg);
}
