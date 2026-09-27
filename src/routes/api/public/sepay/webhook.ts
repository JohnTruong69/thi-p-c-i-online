import { createFileRoute } from '@tanstack/react-router';
import { sepayPayloadSchema, verifySepaySignature } from '@/lib/sepay';

const json = (body: unknown, status = 200) => Response.json(body, { status });

/**
 * SePay webhook (HMAC-SHA256). Unsigned, stale or tampered requests are rejected before any DB access.
 * Verified notifications are stored first (dedupe on SePay id), then matched in one DB transaction.
 * Activation only happens when billing_settings.live_enabled is true (operator-installed, human-approved terms).
 */
export const Route = createFileRoute('/api/public/sepay/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env['SEPAY_WEBHOOK_SECRET'];
        if (!secret || secret.length < 16) return json({ success: false, message: 'not configured' }, 503);
        const rawBody = await request.text();
        if (rawBody.length > 20_000) return json({ success: false }, 413);
        const v = await verifySepaySignature({
          rawBody, secret, nowSec: Math.floor(Date.now() / 1000),
          signature: request.headers.get('x-sepay-signature'), timestamp: request.headers.get('x-sepay-timestamp'),
        });
        if (!v.ok) return json({ success: false, message: 'unauthorized' }, 401);
        let parsed;
        try { parsed = sepayPayloadSchema.safeParse(JSON.parse(rawBody)); } catch { return json({ success: false }, 400); }
        if (!parsed.success) return json({ success: false }, 400);
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { error } = await supabaseAdmin.rpc('record_sepay_transaction', { p: parsed.data as never });
        if (error) { console.error('sepay record failed', error.code); return json({ success: false }, 500); }
        return json({ success: true });
      },
    },
  },
});
