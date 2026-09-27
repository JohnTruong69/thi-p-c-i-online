ALTER TABLE public.billing_settings ADD COLUMN sandbox_verified_at timestamptz;
ALTER TABLE public.billing_settings ADD CONSTRAINT billing_settings_live_needs_sandbox
  CHECK (NOT live_enabled OR sandbox_verified_at IS NOT NULL);
COMMENT ON COLUMN public.billing_settings.sandbox_verified_at IS 'Set by operator only after a SePay sandbox end-to-end run passed; live checkout cannot be enabled without it.';
COMMENT ON FUNCTION public.match_sepay_transaction(bigint, uuid, uuid, text) IS 'Matches only stored, HMAC-verified SePay transactions. Operator reconciliation may relink an exceptional verified SePay transaction to an order; there is no manual mark-paid path.';