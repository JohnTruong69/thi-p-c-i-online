import { describe, expect, it } from 'vitest';
import { claimErrorText, maskEmail, sepayQrUrl, PRESALE_PRICE_VND } from './presale';

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
