/** SePay webhook request handling with injected storage, so the gates are unit-testable. No secrets here. */
import { checkoutEnvReady, sepayPayloadSchema, verifySepaySignature, type SepayPayload } from './sepay';

export type WebhookEnv = { secret?: string | undefined; goLive?: string | undefined };
export type RecordFn = (p: SepayPayload) => Promise<{ error: unknown }>;
const json = (body: unknown, status = 200) => Response.json(body, { status });

/**
 * Order of gates: webhook secret → HMAC signature/timestamp → server go-live switch → payload validation → store+match.
 * While CHECKOUT_GO_LIVE is not "true" nothing is stored, matched or activated (503 so SePay may retry after go-live).
 */
export async function handleSepayWebhook(request: Request, env: WebhookEnv, record: RecordFn, nowSec = Math.floor(Date.now() / 1000)): Promise<Response> {
  const ready = checkoutEnvReady(env);
  if (!ready.webhookSecret) return json({ success: false, message: 'not configured' }, 503);
  const rawBody = await request.text();
  if (rawBody.length > 20_000) return json({ success: false }, 413);
  const v = await verifySepaySignature({
    rawBody, secret: env.secret, nowSec,
    signature: request.headers.get('x-sepay-signature'), timestamp: request.headers.get('x-sepay-timestamp'),
  });
  if (!v.ok) return json({ success: false, message: 'unauthorized' }, 401);
  if (!ready.goLive) return json({ success: false, message: 'checkout not live' }, 503);
  let parsed;
  try { parsed = sepayPayloadSchema.safeParse(JSON.parse(rawBody)); } catch { return json({ success: false }, 400); }
  if (!parsed.success) return json({ success: false }, 400);
  const { error } = await record(parsed.data);
  if (error) return json({ success: false }, 500);
  return json({ success: true });
}
