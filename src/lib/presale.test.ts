import { describe, expect, it } from 'vitest';
import { presaleLive, claimErrorText, maskEmail, sepayQrUrl, PRESALE_PRICE_VND } from './presale';

describe('presale helpers', () => {
  it('locks the price', () => expect(PRESALE_PRICE_VND).toBe(199000));
  it('masks email without leaking the local part', () => {
    expect(maskEmail('lanminh@gmail.com')).toBe('l••••••@gmail.com');
    expect(maskEmail('a@x.vn')).toBe('a••@x.vn');
  });
  it('builds the SePay QR with exact amount and code', () => {
    const u = new URL(sepayQrUrl('0123', 'MBBank', 199000, 'TCPABCDEFGH'));
    expect(u.host).toBe('qr.sepay.vn');
    expect(u.searchParams.get('amount')).toBe('199000');
    expect(u.searchParams.get('des')).toBe('TCPABCDEFGH');
  });
  it('explains wrong-email claims', () => expect(claimErrorText('email mismatch')).toMatch(/khác email/));
});

describe('presaleLive gate', () => {
  const env = { goLive: true, webhookSecret: true };
  const good = { live_enabled: true, price_vnd: 199000, plan_version: 'one_payment_36m', terms_url: 'https://x.vn/terms', terms_approved_at: '2026-01-01' };
  it('opens only for the exact locked offer', () => expect(presaleLive(good, env)).toBe(true));
  it('refuses a misconfigured price', () => { expect(presaleLive({ ...good, price_vnd: 149000 }, env)).toBe(false); expect(presaleLive({ ...good, price_vnd: '199001' }, env)).toBe(false); });
  it('refuses missing or non-https terms URL', () => { expect(presaleLive({ ...good, terms_url: null }, env)).toBe(false); expect(presaleLive({ ...good, terms_url: 'http://x.vn' }, env)).toBe(false); });
  it('refuses unapproved terms or server gates off', () => { expect(presaleLive({ ...good, terms_approved_at: null }, env)).toBe(false); expect(presaleLive(good, { goLive: false, webhookSecret: true })).toBe(false); expect(presaleLive(null, env)).toBe(false); });
});
