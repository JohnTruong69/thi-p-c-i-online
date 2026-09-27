import { createFileRoute } from '@tanstack/react-router';
import { handleSepayWebhook } from '@/lib/sepay-webhook';

/** SePay-only webhook. Requires SEPAY_WEBHOOK_SECRET, a valid HMAC signature and CHECKOUT_GO_LIVE=true before any DB write. */
export const Route = createFileRoute('/api/public/sepay/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => handleSepayWebhook(
        request,
        { secret: process.env['SEPAY_WEBHOOK_SECRET'], goLive: process.env['CHECKOUT_GO_LIVE'] },
        async (p) => {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
          const { error } = await supabaseAdmin.rpc('record_sepay_transaction', { p: p as never });
          if (error) console.error('sepay record failed', error.code);
          return { error };
        },
      ),
    },
  },
});
