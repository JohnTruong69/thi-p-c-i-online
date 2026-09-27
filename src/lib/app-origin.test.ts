import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { accountRedirectUrl, resolveAppOrigin } from './app-origin';

describe('resolveAppOrigin (server-configured only)', () => {
  it('fails closed when not configured', () => {
    expect(resolveAppOrigin({})).toBeNull();
    expect(resolveAppOrigin({ APP_ORIGIN: '  ' })).toBeNull();
  });
  it('accepts the canonical https origin', () => {
    expect(resolveAppOrigin({ APP_ORIGIN: 'https://thiep-hoa-online.lovable.app' })).toBe('https://thiep-hoa-online.lovable.app');
    expect(resolveAppOrigin({ APP_ORIGIN: 'https://thiep.vn/', APP_ORIGIN_ALLOWLIST: 'thiep.vn' })).toBe('https://thiep.vn');
  });
  it('rejects non-https, paths, credentials, ports, query and hosts off the allowlist', () => {
    for (const v of ['http://thiep-hoa-online.lovable.app', 'https://thiep-hoa-online.lovable.app/x', 'https://a:b@thiep-hoa-online.lovable.app',
      'https://thiep-hoa-online.lovable.app:8443', 'https://thiep-hoa-online.lovable.app?x=1', 'https://evil.example', 'https://lovable.app.evil.example', 'javascript:alert(1)'])
      expect(resolveAppOrigin({ APP_ORIGIN: v }), v).toBeNull();
    expect(resolveAppOrigin({ APP_ORIGIN: 'https://evil.lovable.app', APP_ORIGIN_ALLOWLIST: 'thiep.vn' })).toBeNull();
  });
  it('ignores spoofed request headers entirely: the resolver has no request input and the server fn reads none', () => {
    const spoofed = { host: 'evil.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'http' };
    const env = { APP_ORIGIN: 'https://thiep-hoa-online.lovable.app', ...spoofed } as never;
    const origin = resolveAppOrigin(env)!;
    const link = accountRedirectUrl(origin, '/claim/' + 'a'.repeat(64));
    expect(new URL(link).origin).toBe('https://thiep-hoa-online.lovable.app');
    expect(link).not.toContain('evil');
    const src = readFileSync('src/lib/account-provision.functions.ts', 'utf8') + readFileSync('src/lib/account-provision.server.ts', 'utf8');
    expect(src).not.toMatch(/getRequestHeader|x-forwarded|headers\.get\(['"]host/i);
  });
  it('token pages send no referrer', () => {
    for (const f of ['pay.$token', '_authenticated/claim.$token', 'invite.$token', 'viewer-invite.$token', 'reset-password', 'register'])
      expect(readFileSync(`src/routes/${f}.tsx`, 'utf8'), f).toContain('no-referrer');
  });
});
