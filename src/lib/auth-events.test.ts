import { describe, expect, it } from 'vitest';
import { isProtectedPath } from './auth-events';
import { readdirSync } from 'node:fs';

describe('isProtectedPath', () => {
  it('keeps public/presale/invite routes public', () => {
    for (const p of ['/', '/goi', '/pay/' + 'a'.repeat(64), '/login', '/register', '/forgot-password', '/reset-password', '/invite/x', '/viewer-invite/x', '/i/x', '/i/x/rsvp', '/start', '/api/public/sepay/webhook'])
      expect(isProtectedPath(p), p).toBe(false);
  });
  it('protects owner routes', () => {
    for (const p of ['/home', '/plan/tasks', '/guests/1', '/invitation/content', '/settings/data', '/admin', '/view', '/view/abc', '/claim/t', '/wedding/new'])
      expect(isProtectedPath(p), p).toBe(true);
  });
  it('covers every _authenticated route file', () => {
    for (const f of readdirSync('src/routes/_authenticated').filter(f => f !== 'route.tsx')) {
      const seg = f.replace(/\.tsx$/, '').split(/[._]/)[0]!;
      expect(isProtectedPath('/' + seg), f).toBe(true);
    }
  });
});
