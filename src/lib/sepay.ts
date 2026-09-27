/** Pure SePay webhook helpers (no secrets, no I/O). Used by the webhook server route and tests. */
import { z } from 'zod';

export const SEPAY_TOLERANCE_SEC = 300;

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'missing_secret' | 'missing_headers' | 'bad_timestamp' | 'stale' | 'bad_signature' };

/** Official SePay HMAC: X-SePay-Signature = "sha256=" + hex(HMAC_SHA256(secret, `${timestamp}.${raw_body}`)), ±300 s. */
export async function verifySepaySignature(opts: { rawBody: string; signature: string | null; timestamp: string | null; secret: string | undefined; nowSec: number }): Promise<VerifyResult> {
  const { rawBody, signature, timestamp, secret, nowSec } = opts;
  if (!secret) return { ok: false, reason: 'missing_secret' };
  if (!signature || !timestamp) return { ok: false, reason: 'missing_headers' };
  if (!/^\d{9,11}$/.test(timestamp)) return { ok: false, reason: 'bad_timestamp' };
  if (Math.abs(nowSec - Number(timestamp)) > SEPAY_TOLERANCE_SEC) return { ok: false, reason: 'stale' };
  const m = /^sha256=([0-9a-f]{64})$/i.exec(signature.trim());
  if (!m) return { ok: false, reason: 'bad_signature' };
  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  return safeEqual(expected, m[1]!.toLowerCase()) ? { ok: true } : { ok: false, reason: 'bad_signature' };
}

export const sepayPayloadSchema = z.object({
  id: z.number().int().positive(),
  gateway: z.string().min(1).max(100),
  transactionDate: z.string().min(1).max(40),
  accountNumber: z.string().min(1).max(40),
  subAccount: z.string().max(60).nullable().optional(),
  code: z.string().max(60).nullable().optional(),
  content: z.string().max(1000),
  transferType: z.enum(['in', 'out']),
  description: z.string().max(1000).nullable().optional(),
  transferAmount: z.number().int().nonnegative().max(1e12),
  accumulated: z.number().nullable().optional(),
  referenceCode: z.string().max(100).nullable().optional(),
});
export type SepayPayload = z.infer<typeof sepayPayloadSchema>;

export const ORDER_CODE_RE = /TCO[A-Z0-9]{8}/;
/** Same rule as the database matcher: SePay `code` first, else the first TCO code in the transfer content. */
export function extractOrderCode(p: Pick<SepayPayload, 'code' | 'content'>): string | null {
  if (p.code) return p.code.toUpperCase();
  return ORDER_CODE_RE.exec(p.content.toUpperCase())?.[0] ?? null;
}

/** Server env switches. Both must be present; neither is ever sent to the browser. */
export function checkoutEnvReady(env: { secret?: string | undefined; goLive?: string | undefined }) {
  return { webhookSecret: !!env.secret && env.secret.length >= 16, goLive: env.goLive === 'true' };
}
