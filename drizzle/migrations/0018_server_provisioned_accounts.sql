-- Staged invite-only account provisioning (for a later disable_signup switch). Additive only.
ALTER TABLE public.presale_orders ADD COLUMN account_invite_count integer NOT NULL DEFAULT 0, ADD COLUMN account_invited_at timestamptz;
ALTER TABLE public.wedding_invites ADD COLUMN account_invite_count integer NOT NULL DEFAULT 0, ADD COLUMN account_invited_at timestamptz;

-- Service-only: atomically decide whether the server may send an account email for a paid presale order
-- ('presale') or a pending partner invite ('partner'). The target email always comes from the row, never the caller.
CREATE OR REPLACE FUNCTION public.reserve_account_invite(p_kind text, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h text := encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex'); v_email text; v_count int; v_at timestamptz; v_id uuid; v_state text; u record;
BEGIN
  IF NOT public.billing_is_service() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_kind = 'presale' THEN
    SELECT id, email, account_invite_count, account_invited_at, status INTO v_id, v_email, v_count, v_at, v_state FROM public.presale_orders WHERE token_hash = h FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
    IF v_state <> 'paid' THEN RETURN jsonb_build_object('ok', false, 'reason', CASE WHEN v_state = 'claimed' THEN 'already_claimed' ELSE 'not_paid' END); END IF;
    IF (SELECT claim_expires_at FROM public.presale_orders WHERE id = v_id) <= now() THEN RETURN jsonb_build_object('ok', false, 'reason', 'claim_expired'); END IF;
  ELSIF p_kind = 'partner' THEN
    SELECT id, email, account_invite_count, account_invited_at, status INTO v_id, v_email, v_count, v_at, v_state FROM public.wedding_invites WHERE token_hash = h FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
    IF v_state <> 'pending' OR (SELECT expires_at FROM public.wedding_invites WHERE id = v_id) <= now() THEN RETURN jsonb_build_object('ok', false, 'reason', 'invite_inactive'); END IF;
  ELSE RAISE EXCEPTION 'invalid kind' USING ERRCODE = '22023';
  END IF;
  SELECT id, email_confirmed_at INTO u FROM auth.users WHERE lower(email) = lower(v_email) LIMIT 1;
  IF u.id IS NOT NULL AND u.email_confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'existing_account', 'email', v_email);
  END IF;
  IF v_count >= 5 THEN RETURN jsonb_build_object('ok', false, 'reason', 'too_many'); END IF;
  IF v_at IS NOT NULL AND v_at > now() - interval '60 seconds' THEN RETURN jsonb_build_object('ok', false, 'reason', 'wait'); END IF;
  IF p_kind = 'presale' THEN
    UPDATE public.presale_orders SET account_invite_count = account_invite_count + 1, account_invited_at = now() WHERE id = v_id;
  ELSE
    UPDATE public.wedding_invites SET account_invite_count = account_invite_count + 1, account_invited_at = now() WHERE id = v_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'email', v_email, 'user_exists', u.id IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.reserve_account_invite(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_account_invite(text, text) TO service_role;