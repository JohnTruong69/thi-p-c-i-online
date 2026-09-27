import { describe, expect, it } from 'vitest';
import { checkoutEnvReady, extractOrderCode, hmacSha256Hex, sepayPayloadSchema, verifySepaySignature } from './sepay';

const secret = 'test-secret-0123456789abcdef';
const body = '{"id":92704,"gateway":"Vietcombank","transactionDate":"2024-07-02 11:08:33","accountNumber":"1017588888","code":null,"content":"TCOABCD2345 chuyen tien","transferType":"in","transferAmount":5000,"accumulated":0,"referenceCode":"FT1"}';
const now = 1_800_000_000;

describe('verifySepaySignature', () => {
  it('accepts the official canonical form', async () => {
    const sig = 'sha256=' + await hmacSha256Hex(secret, `${now}.${body}`);
    expect(await verifySepaySignature({ rawBody: body, signature: sig, timestamp: String(now), secret, nowSec: now + 299 })).toEqual({ ok: true });
  });
  it('rejects missing secret, headers, stale, tampered body and wrong prefix', async () => {
    const sig = 'sha256=' + await hmacSha256Hex(secret, `${now}.${body}`);
    expect((await verifySepaySignature({ rawBody: body, signature: sig, timestamp: String(now), secret: undefined, nowSec: now })).ok).toBe(false);
    expect((await verifySepaySignature({ rawBody: body, signature: null, timestamp: String(now), secret, nowSec: now }))).toEqual({ ok: false, reason: 'missing_headers' });
    expect((await verifySepaySignature({ rawBody: body, signature: sig, timestamp: String(now), secret, nowSec: now + 301 }))).toEqual({ ok: false, reason: 'stale' });
    expect((await verifySepaySignature({ rawBody: body.replace('5000', '5001'), signature: sig, timestamp: String(now), secret, nowSec: now }))).toEqual({ ok: false, reason: 'bad_signature' });
    expect((await verifySepaySignature({ rawBody: body, signature: sig.slice(7), timestamp: String(now), secret, nowSec: now }))).toEqual({ ok: false, reason: 'bad_signature' });
    expect((await verifySepaySignature({ rawBody: JSON.stringify(JSON.parse(body), null, 1), signature: sig, timestamp: String(now), secret, nowSec: now })).ok).toBe(false);
  });
});

describe('payload + code', () => {
  it('parses official payload and extracts code', () => {
    const p = sepayPayloadSchema.parse(JSON.parse(body));
    expect(extractOrderCode(p)).toBe('TCOABCD2345');
    expect(extractOrderCode({ code: 'tcozzzz9999', content: '' })).toBe('TCOZZZZ9999');
    expect(extractOrderCode({ code: null, content: 'khong co ma' })).toBeNull();
  });
  it('rejects client paid flags / wrong types', () => {
    expect(sepayPayloadSchema.safeParse({ ...JSON.parse(body), transferAmount: '5000' }).success).toBe(false);
    expect(sepayPayloadSchema.safeParse({ ...JSON.parse(body), transferType: 'paid' }).success).toBe(false);
  });
  it('env switches require both secret and explicit go-live', () => {
    expect(checkoutEnvReady({})).toEqual({ webhookSecret: false, goLive: false });
    expect(checkoutEnvReady({ secret: 'x'.repeat(32), goLive: '1' })).toEqual({ webhookSecret: true, goLive: false });
  });
});
