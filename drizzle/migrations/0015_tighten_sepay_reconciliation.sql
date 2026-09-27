CREATE OR REPLACE FUNCTION public.match_sepay_transaction(p_tx bigint, p_order_id uuid, p_actor uuid, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.sepay_transactions; s public.billing_settings; o public.billing_orders;
  v_code text; v_reason text; v_now timestamptz := now(); v_exp timestamptz; v_manual boolean := p_order_id IS NOT NULL;
BEGIN
  IF NOT public.billing_is_service() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF v_manual THEN
    IF p_actor IS NULL OR NOT public.has_role(p_actor, 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  ELSIF p_actor IS NOT NULL OR p_note IS NOT NULL THEN
    RAISE EXCEPTION 'invalid call' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO t FROM public.sepay_transactions WHERE id = p_tx FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transaction not found' USING ERRCODE = 'P0002'; END IF;
  IF t.match_status = 'matched' THEN RETURN jsonb_build_object('result', 'already_matched', 'order_id', t.order_id); END IF;
  -- Operators may only relink a stored SePay transaction that the automatic matcher already rejected.
  IF v_manual AND t.match_status <> 'unmatched' THEN
    RETURN jsonb_build_object('result', 'unmatched', 'reason', 'not_in_queue');
  END IF;
  SELECT * INTO s FROM public.billing_settings WHERE id;
  v_code := upper(coalesce(nullif(t.code, ''), substring(upper(t.content) FROM 'TCO[A-Z0-9]{8}')));
  IF v_manual THEN
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
  ELSIF o.status <> 'pending' OR o.expires_at <= v_now THEN v_reason := 'order_expired';
  ELSIF v_manual AND v_code IS DISTINCT FROM o.code AND length(btrim(coalesce(p_note, ''))) < 15 THEN v_reason := 'reason_required';
  ELSIF v_manual AND v_code IS NOT NULL AND v_code <> o.code AND EXISTS (SELECT 1 FROM public.billing_orders WHERE code = v_code) THEN v_reason := 'code_belongs_to_other_order';
  ELSIF EXISTS (SELECT 1 FROM public.wedding_entitlements WHERE wedding_id = o.wedding_id) THEN v_reason := 'existing_entitlement';
  END IF;

  IF v_reason IS NOT NULL THEN
    IF NOT v_manual THEN
      UPDATE public.sepay_transactions SET match_status = 'unmatched', unmatched_reason = v_reason,
        order_id = COALESCE(o.id, order_id) WHERE id = t.id;
    END IF;
    IF o.id IS NOT NULL THEN
      INSERT INTO public.audit_log (wedding_id, actor_id, action, detail)
      VALUES (o.wedding_id, p_actor, CASE WHEN v_manual THEN 'billing.reconcile_refused' ELSE 'billing.payment_unmatched' END,
        jsonb_build_object('order_id', o.id, 'sepay_id', t.sepay_id, 'reason', v_reason));
    END IF;
    RETURN jsonb_build_object('result', 'unmatched', 'reason', v_reason);
  END IF;

  v_exp := ((v_now AT TIME ZONE 'Asia/Ho_Chi_Minh') + interval '36 months') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  INSERT INTO public.wedding_entitlements (wedding_id, paid_at, expires_at, source, plan_version)
  VALUES (o.wedding_id, v_now, v_exp, 'sepay:' || t.sepay_id, 'one_payment_36m');
  UPDATE public.billing_orders SET status = 'paid', paid_at = v_now, entitlement_expires_at = v_exp,
    sepay_transaction_id = t.id, updated_at = v_now WHERE id = o.id;
  UPDATE public.sepay_transactions SET match_status = 'matched', unmatched_reason = NULL, order_id = o.id,
    resolved_at = CASE WHEN v_manual THEN v_now END, resolved_by = p_actor, resolution_note = p_note
   WHERE id = t.id;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail)
  VALUES (o.wedding_id, p_actor, CASE WHEN v_manual THEN 'billing.order_paid_reconciled' ELSE 'billing.order_paid' END,
    jsonb_build_object('order_id', o.id, 'code', o.code, 'sepay_id', t.sepay_id, 'amount_vnd', t.transfer_amount,
      'transfer_code', v_code, 'paid_at', v_now, 'expires_at', v_exp, 'note', p_note));
  RETURN jsonb_build_object('result', 'matched', 'order_id', o.id);
END $$;
REVOKE ALL ON FUNCTION public.match_sepay_transaction(bigint, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_sepay_transaction(bigint, uuid, uuid, text) TO service_role;