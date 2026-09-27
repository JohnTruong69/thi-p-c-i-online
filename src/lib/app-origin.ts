/**
 * Canonical app origin for links inside Auth emails. Comes ONLY from server config (APP_ORIGIN), never from request headers.
 * Strict: https, bare origin (no path/query/hash/credentials/port), hostname in APP_ORIGIN_ALLOWLIST or a *.lovable.app host.
 */
export function resolveAppOrigin(env: { APP_ORIGIN?: string | undefined; APP_ORIGIN_ALLOWLIST?: string | undefined }): string | null {
  const raw = (env.APP_ORIGIN ?? '').trim();
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) return null;
  if (raw.replace(/\/$/, '') !== u.origin) return null;
  const host = u.hostname.toLowerCase();
  const allow = (env.APP_ORIGIN_ALLOWLIST ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const ok = allow.length ? allow.includes(host) : /^[a-z0-9-]+(\.[a-z0-9-]+)*\.lovable\.app$/.test(host);
  return ok ? u.origin : null;
}

export function accountRedirectUrl(origin: string, nextPath: string) {
  return `${origin}/reset-password?next=${encodeURIComponent(nextPath)}`;
}
