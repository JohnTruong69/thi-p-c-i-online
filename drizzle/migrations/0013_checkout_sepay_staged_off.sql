-- Phase 3: staged checkout / SePay foundation. Additive only.
-- Everything is OFF until a service-role operator installs an approved offer,
-- terms version, enabled recipient account and flips live_enabled; the web
-- server additionally requires SEPAY_WEBHOOK_SECRET and CHECKOUT_GO_LIVE=true.
-- No rows are inserted here: with no settings row, checkout is unavailable.

DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles: read own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE TABLE public.billing_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  offer_version text NOT NULL CHECK (offer_version ~ '^[a-z0-9_.-]{3,40}$'),
  plan_version text NOT NULL DEFAULT 'one_payment_36m' CHECK (plan_version = 'one_payment_36m'),
  price_vnd bigint NOT NULL CHECK (price_vnd > 0 AND price_vnd <= 100000000),
  terms_version text NOT NULL CHECK (length(terms_version) BETWEEN 1 AND 40),
  terms_url text CHECK (terms_url IS NULL OR terms_url ~ '^https://'),
  terms_approved_at timestamptz,
  terms_approved_by text,
  bank_gateway text,
  bank_account_number text CHECK (bank_account_number IS NULL OR bank_account_number ~ '^[0-9A-Za-z]{4,30}$'),
  bank_account_name text,
  account_enabled boolean NOT NULL DEFAULT false,
  live_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT live_enabled OR (terms_approved_at IS NOT NULL AND terms_approved_by IS NOT NULL
    AND bank_gateway IS NOT NULL AND bank_account_number IS NOT NULL AND bank_account_name IS NOT NULL AND account_enabled))
);
REVOKE ALL ON public.billing_settings FROM anon, authenticated;
GRANT ALL ON public.billing_settings TO service_role;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.billing_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  code text NOT NULL UNIQUE CHECK (code ~ '^TCO[A-Z0-9]{8}$'),
  offer_version text NOT NULL,
  plan_version text NOT NULL CHECK (plan_version = 'one_payment_36m'),
  terms_version text NOT NULL,
  amount_vnd bigint NOT NULL CHECK (amount_vnd > 0),
  currency text NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  bank_gateway text NOT NULL,
  bank_account_number text NOT NULL,
  bank_account_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'cancelled')),
  expires_at timestamptz NOT NULL,
  paid_at timestamptz,
  entitlement_expires_at timestamptz,
  sepay_transaction_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'paid') = (paid_at IS NOT NULL AND entitlement_expires_at IS NOT NULL AND sepay_transaction_id IS NOT NULL))
);
CREATE UNIQUE INDEX billing_orders_one_pending ON public.billing_orders (wedding_id) WHERE status = 'pending';
CREATE UNIQUE INDEX billing_orders_one_paid ON public.billing_orders (wedding_id) WHERE status = 'paid';
CREATE INDEX billing_orders_wedding_idx ON public.billing_orders (wedding_id, created_at DESC);
REVOKE ALL ON public.billing_orders FROM anon, authenticated;
GRANT SELECT ON public.billing_orders TO authenticated;
GRANT ALL ON public.billing_orders TO service_role;
ALTER TABLE public.billing_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing_orders: managers read" ON public.billing_orders FOR SELECT TO authenticated
  USING (public.is_wedding_manager(wedding_id));

CREATE TABLE public.sepay_transactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sepay_id bigint NOT NULL UNIQUE CHECK (sepay_id > 0),
  gateway text NOT NULL,
  transaction_date text NOT NULL,
  account_number text NOT NULL,
  code text,
  content text NOT NULL,
  transfer_type text NOT NULL,
  transfer_amount bigint NOT NULL CHECK (transfer_amount >= 0),
  reference_code text,
  raw jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  match_status text NOT NULL DEFAULT 'received' CHECK (match_status IN ('received', 'matched', 'unmatched')),
  unmatched_reason text,
  order_id uuid REFERENCES public.billing_orders(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text
);
CREATE INDEX sepay_transactions_unmatched ON public.sepay_transactions (received_at DESC) WHERE match_status <> 'matched';
REVOKE ALL ON public.sepay_transactions FROM anon, authenticated;
GRANT ALL ON public.sepay_transactions TO service_role;
ALTER TABLE public.sepay_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_orders
  ADD CONSTRAINT billing_orders_tx_fk FOREIGN KEY (sepay_transaction_id) REFERENCES public.sepay_transactions(id);

CREATE OR REPLACE FUNCTION public.billing_is_service() RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT auth.role() IS NOT DISTINCT FROM 'service_role' OR (current_user = 'postgres' AND auth.uid() IS NULL)
$$;
REVOKE ALL ON FUNCTION public.billing_is_service() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.billing_offer_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.billing_settings;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM public.billing_settings WHERE id;
  IF NOT FOUND OR NOT s.live_enabled THEN
    RETURN jsonb_build_object('live', false, 'terms_approved', FOUND AND s.terms_approved_at IS NOT NULL,
      'account_enabled', FOUND AND s.account_enabled);
  END IF;
  RETURN jsonb_build_object('live', true, 'terms_approved', true, 'account_enabled', true,
    'offer_version', s.offer_version, 'plan_version', s.plan_version, 'price_vnd', s.price_vnd,
    'duration_months', 36, 'terms_version', s.terms_version, 'terms_url', s.terms_url);
END $$;
REVOKE ALL ON FUNCTION public.billing_offer_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_offer_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_billing_order(p_wedding_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.billing_settings; o public.billing_orders; v_code text; i int;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  IF NOT public.billing_is_service() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.wedding_memberships WHERE wedding_id = p_wedding_id AND user_id = p_user_id AND role = 'manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.billing_settings WHERE id;
  IF NOT FOUND OR NOT s.live_enabled THEN RAISE EXCEPTION 'checkout unavailable' USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM public.weddings WHERE id = p_wedding_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.wedding_entitlements WHERE wedding_id = p_wedding_id) THEN
    RAISE EXCEPTION 'already entitled' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.billing_orders SET status = 'expired', updated_at = now()
   WHERE wedding_id = p_wedding_id AND status = 'pending' AND expires_at <= now();
  SELECT * INTO o FROM public.billing_orders WHERE wedding_id = p_wedding_id AND status = 'pending';
  IF FOUND THEN RETURN jsonb_build_object('order_id', o.id, 'reused', true); END IF;
  LOOP
    v_code := 'TCO';
    FOR i IN 1..8 LOOP
      v_code := v_code || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.billing_orders WHERE code = v_code);
  END LOOP;
  INSERT INTO public.billing_orders (wedding_id, created_by, code, offer_version, plan_version, terms_version,
    amount_vnd, bank_gateway, bank_account_number, bank_account_name, expires_at)
  VALUES (p_wedding_id, p_user_id, v_code, s.offer_version, s.plan_version, s.terms_version,
    s.price_vnd, s.bank_gateway, s.bank_account_number, s.bank_account_name, now() + interval '24 hours')
  RETURNING * INTO o;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail)
  VALUES (p_wedding_id, p_user_id, 'billing.order_created', jsonb_build_object('order_id', o.id, 'code', o.code,
    'amount_vnd', o.amount_vnd, 'offer_version', o.offer_version, 'terms_version', o.terms_version));
  RETURN jsonb_build_object('order_id', o.id, 'reused', false);
END $$;
REVOKE ALL ON FUNCTION public.create_billing_order(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_billing_order(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.match_sepay_transaction(p_tx bigint, p_order_id uuid, p_actor uuid, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.sepay_transactions; s public.billing_settings; o public.billing_orders;
  v_code text; v_reason text; v_now timestamptz := now(); v_exp timestamptz;
BEGIN
  IF NOT public.billing_is_service() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO t FROM public.sepay_transactions WHERE id = p_tx FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transaction not found' USING ERRCODE = 'P0002'; END IF;
  IF t.match_status = 'matched' THEN RETURN jsonb_build_object('result', 'already_matched', 'order_id', t.order_id); END IF;
  SELECT * INTO s FROM public.billing_settings WHERE id;
  v_code := upper(coalesce(nullif(t.code, ''), substring(upper(t.content) FROM 'TCO[A-Z0-9]{8}')));
  IF p_order_id IS NOT NULL THEN
    SELECT * INTO o FROM public.billing_orders WHERE id = p_order_id FOR UPDATE;
  ELSIF v_code IS NOT NULL THEN
    SELECT * INTO o FROM public.billing_orders WHERE code = v_code FOR UPDATE;
  END IF;

  IF s.id IS NULL OR NOT s.live_enabled THEN v_reason := 'checkout_not_live';
  ELSIF t.transfer_type <> 'in' THEN v_reason := 'not_inbound';
  ELSIF t.account_number <> s.bank_account_number THEN v_reason := 'account_mismatch';
  ELSIF o.id IS NULL THEN v_reason := CASE WHEN v_code IS NULL THEN 'no_code' ELSE 'unknown_code' END;
  ELSIF o.bank_account_number <> t.account_number THEN v_reason := 'account_mismatch';
  ELSIF o.currency <> 'VND' THEN v_reason := 'currency_mismatch';
  ELSIF t.transfer_amount <> o.amount_vnd THEN v_reason := 'amount_mismatch';
  ELSIF o.status = 'paid' THEN v_reason := 'order_already_paid';
  ELSIF o.status = 'cancelled' THEN v_reason := 'order_cancelled';
  ELSIF p_order_id IS NULL AND (o.status <> 'pending' OR o.expires_at <= v_now) THEN v_reason := 'order_expired';
  ELSIF EXISTS (SELECT 1 FROM public.wedding_entitlements WHERE wedding_id = o.wedding_id) THEN v_reason := 'existing_entitlement';
  END IF;

  IF v_reason IS NOT NULL THEN
    UPDATE public.sepay_transactions SET match_status = 'unmatched', unmatched_reason = v_reason,
      order_id = COALESCE(o.id, order_id) WHERE id = t.id;
    IF o.id IS NOT NULL THEN
      INSERT INTO public.audit_log (wedding_id, actor_id, action, detail)
      VALUES (o.wedding_id, p_actor, 'billing.payment_unmatched', jsonb_build_object('order_id', o.id, 'sepay_id', t.sepay_id, 'reason', v_reason));
    END IF;
    RETURN jsonb_build_object('result', 'unmatched', 'reason', v_reason);
  END IF;

  v_exp := ((v_now AT TIME ZONE 'Asia/Ho_Chi_Minh') + interval '36 months') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  INSERT INTO public.wedding_entitlements (wedding_id, paid_at, expires_at, source, plan_version)
  VALUES (o.wedding_id, v_now, v_exp, 'sepay:' || t.sepay_id, 'one_payment_36m');
  UPDATE public.billing_orders SET status = 'paid', paid_at = v_now, entitlement_expires_at = v_exp,
    sepay_transaction_id = t.id, updated_at = v_now WHERE id = o.id;
  UPDATE public.sepay_transactions SET match_status = 'matched', unmatched_reason = NULL, order_id = o.id,
    resolved_at = CASE WHEN p_actor IS NOT NULL THEN v_now END, resolved_by = p_actor, resolution_note = p_note
   WHERE id = t.id;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail)
  VALUES (o.wedding_id, p_actor, CASE WHEN p_actor IS NULL THEN 'billing.order_paid' ELSE 'billing.order_paid_reconciled' END,
    jsonb_build_object('order_id', o.id, 'code', o.code, 'sepay_id', t.sepay_id, 'amount_vnd', t.transfer_amount,
      'paid_at', v_now, 'expires_at', v_exp, 'note', p_note));
  RETURN jsonb_build_object('result', 'matched', 'order_id', o.id);
END $$;
REVOKE ALL ON FUNCTION public.match_sepay_transaction(bigint, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_sepay_transaction(bigint, uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_sepay_transaction(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tx bigint;
BEGIN
  IF NOT public.billing_is_service() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.sepay_transactions (sepay_id, gateway, transaction_date, account_number, code, content,
    transfer_type, transfer_amount, reference_code, raw)
  VALUES ((p->>'id')::bigint, p->>'gateway', p->>'transactionDate', p->>'accountNumber', nullif(p->>'code', ''),
    coalesce(p->>'content', ''), p->>'transferType', (p->>'transferAmount')::bigint, nullif(p->>'referenceCode', ''), p)
  ON CONFLICT (sepay_id) DO NOTHING
  RETURNING id INTO v_tx;
  IF v_tx IS NULL THEN RETURN jsonb_build_object('result', 'duplicate'); END IF;
  BEGIN
    RETURN public.match_sepay_transaction(v_tx, NULL, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.sepay_transactions SET match_status = 'unmatched', unmatched_reason = 'match_error' WHERE id = v_tx;
    RETURN jsonb_build_object('result', 'unmatched', 'reason', 'match_error');
  END;
END $$;
REVOKE ALL ON FUNCTION public.record_sepay_transaction(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_sepay_transaction(jsonb) TO service_role;
