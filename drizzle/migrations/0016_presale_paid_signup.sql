-- New-customer flow: pay (SePay only) BEFORE creating a wedding. Additive only; sales stay OFF
-- until billing_settings.live_enabled (terms + account + sandbox) AND server env go-live are all true.

CREATE TABLE public.presale_policy (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  legacy_cutoff timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.presale_policy TO service_role;
ALTER TABLE public.presale_policy ENABLE ROW LEVEL SECURITY;
INSERT INTO public.presale_policy (id) VALUES (true);
COMMENT ON TABLE public.presale_policy IS 'Accounts created before legacy_cutoff keep the old self-serve wedding creation; newer accounts need a paid, claimed presale order.';

CREATE TABLE public.presale_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^TCP[A-Z0-9]{8}$'),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  email text NOT NULL CHECK (email = lower(btrim(email)) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(email) <= 255),
  ip_hash text NOT NULL,
  offer_version text NOT NULL,
  plan_version text NOT NULL DEFAULT 'one_payment_36m' CHECK (plan_version = 'one_payment_36m'),
  terms_version text NOT NULL,
  terms_accepted_at timestamptz NOT NULL DEFAULT now(),
  amount_vnd bigint NOT NULL CHECK (amount_vnd > 0),
  bank_gateway text NOT NULL,
  bank_account_number text NOT NULL,
  bank_account_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'claimed', 'expired')),
  expires_at timestamptz NOT NULL,
  paid_at timestamptz,
  claim_expires_at timestamptz,
  sepay_transaction_id bigint UNIQUE REFERENCES public.sepay_transactions(id),
  claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  claimed_wedding_id uuid REFERENCES public.weddings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status IN ('paid', 'claimed')) = (paid_at IS NOT NULL AND sepay_transaction_id IS NOT NULL AND claim_expires_at IS NOT NULL)),
  CHECK ((status = 'claimed') = (claimed_at IS NOT NULL))
);
CREATE INDEX presale_orders_ip_idx ON public.presale_orders (ip_hash, created_at DESC);
CREATE INDEX presale_orders_email_idx ON public.presale_orders (email, created_at DESC);
CREATE UNIQUE INDEX presale_orders_one_per_claimer ON public.presale_orders (claimed_by) WHERE claimed_by IS NOT NULL;
REVOKE ALL ON public.presale_orders FROM anon, authenticated;
GRANT ALL ON public.presale_orders TO service_role;
ALTER TABLE public.presale_orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sepay_transactions ADD COLUMN presale_order_id uuid REFERENCES public.presale_orders(id) ON DELETE SET NULL;

-- Wedding creation guard: fires for every insert path (create_wedding_draft is the only one today).
CREATE OR REPLACE FUNCTION public.require_paid_wedding_creation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u record; cutoff timestamptz;
BEGIN
  IF public.billing_is_service() THEN RETURN NEW; END IF;
  SELECT created_at, raw_app_meta_data INTO u FROM auth.users WHERE id = NEW.created_by;
  SELECT legacy_cutoff INTO cutoff FROM public.presale_policy WHERE id;
  IF u.created_at < cutoff OR coalesce(u.raw_app_meta_data->>'presale_exempt', '') = 'true' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.presale_orders WHERE claimed_by = NEW.created_by AND status = 'claimed' AND claimed_wedding_id IS NULL) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'payment required' USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION public.require_paid_wedding_creation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER a_require_paid_wedding BEFORE INSERT ON public.weddings FOR EACH ROW EXECUTE FUNCTION public.require_paid_wedding_creation();

CREATE OR REPLACE FUNCTION public.create_presale_order(p_email text, p_terms_version text, p_ip_hash text, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.billing_settings; o public.presale_orders; v_code text; i int; em text := lower(btrim(p_email));
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  IF NOT public.billing_is_service() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM public.billing_settings WHERE id;
  IF NOT FOUND OR NOT s.live_enabled THEN RAISE EXCEPTION 'checkout unavailable' USING ERRCODE = 'P0001'; END IF;
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
  VALUES (v_code, encode(sha256(convert_to(p_token, 'UTF8')), 'hex'), em, p_ip_hash, s.offer_version, s.terms_version, s.price_vnd,
    s.bank_gateway, s.bank_account_number, s.bank_account_name, now() + interval '24 hours')
  RETURNING * INTO o;
  RETURN jsonb_build_object('code', o.code, 'expires_at', o.expires_at);
END $$;
REVOKE ALL ON FUNCTION public.create_presale_order(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_presale_order(text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.match_presale_transaction(p_tx bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.sepay_transactions; s public.billing_settings; o public.presale_orders; v_code text; v_reason text; v_now timestamptz := now();
BEGIN
  IF NOT public.billing_is_service() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO t FROM public.sepay_transactions WHERE id = p_tx FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transaction not found' USING ERRCODE = 'P0002'; END IF;
  IF t.match_status = 'matched' THEN RETURN jsonb_build_object('result', 'already_matched'); END IF;
  SELECT * INTO s FROM public.billing_settings WHERE id;
  v_code := upper(coalesce(substring(upper(coalesce(t.code, '')) FROM 'TCP[A-Z0-9]{8}'), substring(upper(t.content) FROM 'TCP[A-Z0-9]{8}')));
  IF v_code IS NOT NULL THEN SELECT * INTO o FROM public.presale_orders WHERE code = v_code FOR UPDATE; END IF;
  IF s.id IS NULL OR NOT s.live_enabled THEN v_reason := 'checkout_not_live';
  ELSIF t.transfer_type <> 'in' THEN v_reason := 'not_inbound';
  ELSIF t.account_number <> s.bank_account_number THEN v_reason := 'account_mismatch';
  ELSIF o.id IS NULL THEN v_reason := CASE WHEN v_code IS NULL THEN 'no_code' ELSE 'unknown_code' END;
  ELSIF o.bank_account_number <> t.account_number THEN v_reason := 'account_mismatch';
  ELSIF t.transfer_amount <> o.amount_vnd THEN v_reason := 'amount_mismatch';
  ELSIF o.status IN ('paid', 'claimed') THEN v_reason := 'order_already_paid';
  ELSIF o.status <> 'pending' OR o.expires_at <= v_now THEN v_reason := 'order_expired';
  END IF;
  IF v_reason IS NOT NULL THEN
    UPDATE public.sepay_transactions SET match_status = 'unmatched', unmatched_reason = v_reason, presale_order_id = COALESCE(o.id, presale_order_id) WHERE id = t.id;
    RETURN jsonb_build_object('result', 'unmatched', 'reason', v_reason);
  END IF;
  UPDATE public.presale_orders SET status = 'paid', paid_at = v_now, claim_expires_at = v_now + interval '90 days', sepay_transaction_id = t.id WHERE id = o.id;
  UPDATE public.sepay_transactions SET match_status = 'matched', unmatched_reason = NULL, presale_order_id = o.id WHERE id = t.id;
  RETURN jsonb_build_object('result', 'matched', 'presale_order_id', o.id);
END $$;
REVOKE ALL ON FUNCTION public.match_presale_transaction(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_presale_transaction(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.record_sepay_transaction(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tx bigint; v_presale boolean;
BEGIN
  IF NOT public.billing_is_service() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.sepay_transactions (sepay_id, gateway, transaction_date, account_number, code, content,
    transfer_type, transfer_amount, reference_code, raw)
  VALUES ((p->>'id')::bigint, p->>'gateway', p->>'transactionDate', p->>'accountNumber', nullif(p->>'code', ''),
    coalesce(p->>'content', ''), p->>'transferType', (p->>'transferAmount')::bigint, nullif(p->>'referenceCode', ''), p)
  ON CONFLICT (sepay_id) DO NOTHING
  RETURNING id INTO v_tx;
  IF v_tx IS NULL THEN RETURN jsonb_build_object('result', 'duplicate'); END IF;
  v_presale := upper(coalesce(p->>'code', '') || ' ' || coalesce(p->>'content', '')) ~ 'TCP[A-Z0-9]{8}';
  BEGIN
    IF v_presale THEN RETURN public.match_presale_transaction(v_tx); END IF;
    RETURN public.match_sepay_transaction(v_tx, NULL, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.sepay_transactions SET match_status = 'unmatched', unmatched_reason = 'match_error' WHERE id = v_tx;
    RETURN jsonb_build_object('result', 'unmatched', 'reason', 'match_error');
  END;
END $$;
REVOKE ALL ON FUNCTION public.record_sepay_transaction(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_sepay_transaction(jsonb) TO service_role;

-- Claim: possession of the order token + a CONFIRMED Auth email equal to the order email.
CREATE OR REPLACE FUNCTION public.claim_presale_order(p_token text, p_partner_one text, p_partner_two text,
  p_planned_date date, p_event_name text, p_event_side text DEFAULT 'chung', p_event_date date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); u record; o public.presale_orders; wid uuid; v_exp timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT lower(email) AS email, email_confirmed_at INTO u FROM auth.users WHERE id = uid;
  IF u.email_confirmed_at IS NULL THEN RAISE EXCEPTION 'email not confirmed' USING ERRCODE = '42501'; END IF;
  SELECT * INTO o FROM public.presale_orders WHERE token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid claim' USING ERRCODE = '42501'; END IF;
  IF o.status = 'claimed' THEN
    IF o.claimed_by = uid AND o.claimed_wedding_id IS NOT NULL THEN RETURN o.claimed_wedding_id; END IF;
    RAISE EXCEPTION 'already claimed' USING ERRCODE = 'P0001';
  END IF;
  IF o.status <> 'paid' THEN RAISE EXCEPTION 'not paid' USING ERRCODE = 'P0001'; END IF;
  IF o.claim_expires_at <= now() THEN RAISE EXCEPTION 'claim expired' USING ERRCODE = 'P0001'; END IF;
  IF o.email <> u.email THEN RAISE EXCEPTION 'email mismatch' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.wedding_memberships WHERE user_id = uid) THEN RAISE EXCEPTION 'already has wedding' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.presale_orders WHERE claimed_by = uid) THEN RAISE EXCEPTION 'already claimed' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.presale_orders SET status = 'claimed', claimed_by = uid, claimed_at = now() WHERE id = o.id;
  wid := public.create_wedding_draft(p_partner_one, p_partner_two, p_planned_date, p_event_name, p_event_side, p_event_date);
  UPDATE public.presale_orders SET claimed_wedding_id = wid WHERE id = o.id;
  v_exp := ((o.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh') + interval '36 months') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  INSERT INTO public.wedding_entitlements (wedding_id, paid_at, expires_at, source, plan_version)
  VALUES (wid, o.paid_at, v_exp, 'sepay_presale:' || o.code, 'one_payment_36m');
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail)
  VALUES (wid, uid, 'billing.presale_claimed', jsonb_build_object('code', o.code, 'amount_vnd', o.amount_vnd, 'paid_at', o.paid_at, 'expires_at', v_exp));
  RETURN wid;
END $$;
REVOKE ALL ON FUNCTION public.claim_presale_order(text, text, text, date, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_presale_order(text, text, text, date, text, text, date) TO authenticated;

-- Lets the app know whether the signed-in account may start a wedding without a claim (legacy/exempt).
CREATE OR REPLACE FUNCTION public.account_can_self_create()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users u, public.presale_policy p
    WHERE u.id = auth.uid() AND (u.created_at < p.legacy_cutoff OR coalesce(u.raw_app_meta_data->>'presale_exempt', '') = 'true'))
$$;
REVOKE ALL ON FUNCTION public.account_can_self_create() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_can_self_create() TO authenticated;