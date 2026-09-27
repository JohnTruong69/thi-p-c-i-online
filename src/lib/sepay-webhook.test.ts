import { describe, expect, it, vi } from 'vitest';
import { handleSepayWebhook } from './sepay-webhook';
import { hmacSha256Hex } from './sepay';

const secret = 'whsec-test-0123456789abcdef';
const now = 1_800_000_000;
const body = JSON.stringify({ id: 555, gateway: 'QA', transactionDate: '2026-09-27 10:00:00', accountNumber: '9990001112', code: 'TCOABCD2345', content: 'TCOABCD2345', transferType: 'in', transferAmount: 199000, referenceCode: 'R' });
async function signed(b = body, ts = now) {
  return new Request('http://x/api/public/sepay/webhook', { method: 'POST', body: b, headers: { 'x-sepay-timestamp': String(ts), 'x-sepay-signature': 'sha256=' + await hmacSha256Hex(secret, `${ts}.${b}`) } });
}

describe('handleSepayWebhook gates', () => {
  it('validly signed callback while CHECKOUT_GO_LIVE is off never reaches storage/matching', async () => {
    for (const goLive of [undefined, 'false', '1', 'TRUE']) {
      const record = vi.fn(async () => ({ error: null }));
      const res = await handleSepayWebhook(await signed(), { secret, goLive }, record, now);
      expect(res.status).toBe(503);
      expect(record).not.toHaveBeenCalled();
    }
  });
  it('missing secret or bad signature is rejected before storage even when live', async () => {
    const record = vi.fn(async () => ({ error: null }));
    expect((await handleSepayWebhook(await signed(), { goLive: 'true' }, record, now)).status).toBe(503);
    const tampered = await signed(); const bad = new Request(tampered.url, { method: 'POST', body: body.replace('199000', '199001'), headers: tampered.headers });
    expect((await handleSepayWebhook(bad, { secret, goLive: 'true' }, record, now)).status).toBe(401);
    expect((await handleSepayWebhook(await signed(body, now - 400), { secret, goLive: 'true' }, record, now)).status).toBe(401);
    expect(record).not.toHaveBeenCalled();
  });
  it('only when secret + signature + go-live all pass is the payload stored, answering SePay {"success":true}', async () => {
    const record = vi.fn(async () => ({ error: null }));
    const res = await handleSepayWebhook(await signed(), { secret, goLive: 'true' }, record, now);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(record).toHaveBeenCalledTimes(1);
  });
});
