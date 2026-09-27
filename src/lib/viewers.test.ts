import { describe, expect, it } from 'vitest';
import { grantSummary, toggle, validateGrants, viewerSlotsUsed } from './viewers';

describe('viewer grants', () => {
  it('requires at least one module and one side', () => {
    expect(validateGrants({ modules: [], sides: ['chung'] })).toMatch(/phần/);
    expect(validateGrants({ modules: ['events'], sides: [] })).toMatch(/bên/);
    expect(validateGrants({ modules: ['events'], sides: ['nha-trai'] })).toBe('');
  });
  it('rejects unknown modules or sides (checkout, photos)', () => {
    expect(validateGrants({ modules: ['events', 'checkout'], sides: ['chung'] })).not.toBe('');
    expect(validateGrants({ modules: ['photos'], sides: ['chung'] })).not.toBe('');
    expect(validateGrants({ modules: ['events'], sides: ['khac'] })).not.toBe('');
  });
  it('toggles', () => { expect(toggle(['a', 'b'], 'a')).toEqual(['b']); expect(toggle(['a'], 'b')).toEqual(['a', 'b']); });
  it('counts active viewers + unexpired pending invites; re-invite same email reuses slot', () => {
    const now = Date.parse('2026-09-27T00:00:00Z');
    const viewers = [{ email: 'a@x.vn', revoked_at: null }, { email: 'b@x.vn', revoked_at: '2026-09-01' }];
    const invites = [
      { email: 'c@x.vn', status: 'pending', expires_at: '2026-10-01T00:00:00Z' },
      { email: 'd@x.vn', status: 'pending', expires_at: '2026-09-20T00:00:00Z' },
      { email: 'e@x.vn', status: 'revoked', expires_at: '2026-10-01T00:00:00Z' },
    ];
    expect(viewerSlotsUsed(viewers, invites, now)).toBe(2);
    expect(viewerSlotsUsed(viewers, invites, now, 'C@x.vn ')).toBe(1);
  });
  it('summarises grants in Vietnamese', () => {
    expect(grantSummary({ modules: ['events', 'guests'], sides: ['nha-trai'] })).toBe('Buổi lễ, Sổ khách · Nhà trai');
  });
});
