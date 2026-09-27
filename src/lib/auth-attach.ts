import { createMiddleware } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';

/** Client-side: attach the signed-in user's bearer token to server function calls. */
export const attachAuthToken = createMiddleware({ type: 'function' }).client(async ({ next }) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return next(token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
});
