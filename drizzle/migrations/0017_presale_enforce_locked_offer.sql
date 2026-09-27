-- Presale must match the public locked package: 199000 VND, one_payment_36m, approved https terms URL.
CREATE OR REPLACE FUNCTION public.presale_settings_valid(s public.billing_settings)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT s.id IS NOT NULL AND s.live_enabled AND s.price_vnd = 199000 AND s.plan_version = 'one_payment_36m'
    AND s.terms_url IS NOT NULL AND s.terms_url ~ '^https://' AND s.terms_approved_at IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.presale_settings_valid(public.billing_settings) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_presale_order(p_email text, p_terms_version text, p_ip_hash text, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.billing_settings; o public.presale_orders; v_code text; i int; em text := lower(btrim(p_email));
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  IF NOT public.billing_is_service() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM public.billing_settings WHERE id;
  IF NOT FOUND OR NOT s.live_enabled THEN RAISE EXCEPTION 'checkout unavailable' USING ERRCODE = 'P0001'; END IF;
  IF NOT public.presale_settings_valid(s) THEN RAISE EXCEPTION 'checkout unavailable: offer misconfigured' USING ERRCODE = 'P0001'; END IF;
  IF p_terms_version IS DISTINCT FROM s.terms_version THEN RAISE EXCEPTION 'terms changed' USING ERRCODE = 'P0001'; END IF;
  IF em IS NULL OR em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(em) > 255 THEN RAISE EXCEPTION 'invalid email' USING ERRCODE = '22023'; END IF;
  IF p_token IS NULL OR length(p_token) < 40 THEN RAISE EXCEPTION 'invalid token' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('presale-ip:' || p_ip_hash, 0));
  IF (SELECT count(*) FROM public.presale_orders WHERE ip_hash = p_ip_hash AND created_at > now() - interval '1 hour') >= 5
     OR (SELECT count(*) FROM public.presale_orders WHERE email = em AND status = 'pending' AND expires_at > now()) >= 3 THEN
    RAISE EXCEPTION 'rate limited' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.presale_orders SET status = 'expired' WHERE email = em AND status = 'pending' AND expires_at <= now();
  LOOP
    v_code := 'TCP';
    FOR i IN 1..8 LOOP v_code := v_code || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.presale_orders WHERE code = v_code);
  END LOOP;
  INSERT INTO public.presale_orders (code, token_hash, email, ip_hash, offer_version, terms_version, amount_vnd,
    bank_gateway, bank_account_number, bank_account_name, expires_at)
  VALUES (v_code, encode(sha256(convert_to(p_token, 'UTF8')), 'hex'), em, p_ip_hash, s.offer_version, s.terms_version, 199000,
    s.bank_gateway, s.bank_account_number, s.bank_account_name, now() + interval '24 hours')
  RETURNING * INTO o;
  RETURN jsonb_build_object('code', o.code, 'expires_at', o.expires_at);
END $$;
REVOKE ALL ON FUNCTION public.create_presale_order(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_presale_order(text, text, text, text) TO service_role;

-- Belt and braces: any presale order row must carry the locked amount.
ALTER TABLE public.presale_orders ADD CONSTRAINT presale_orders_locked_amount CHECK (amount_vnd = 199000 AND plan_version = 'one_payment_36m') NOT VALID;