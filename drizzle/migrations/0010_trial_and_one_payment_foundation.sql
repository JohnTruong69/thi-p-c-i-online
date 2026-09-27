-- V1 transition foundation. This migration provides trial fields and versions
-- paid rights. A later coordinated rollout starts clocks and enables the write
-- gate only when checkout and read-only/export states are ready.

ALTER TABLE public.weddings
  ADD COLUMN trial_started_at timestamptz,
  ADD COLUMN trial_ends_at timestamptz;

ALTER TABLE public.weddings
  ADD CONSTRAINT weddings_trial_seven_days
    CHECK (
      (trial_started_at IS NULL AND trial_ends_at IS NULL)
      OR (trial_started_at IS NOT NULL AND trial_ends_at = trial_started_at + interval '7 days')
    );

-- Authenticated clients currently have a table-level UPDATE grant on weddings.
-- A trigger, rather than a column grant, makes the trial clock immutable to them.
CREATE OR REPLACE FUNCTION public.protect_wedding_trial_clock()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.trial_started_at, NEW.trial_ends_at)
     IS DISTINCT FROM (OLD.trial_started_at, OLD.trial_ends_at)
     AND NOT (auth.role() IS NOT DISTINCT FROM 'service_role'
       OR (current_user = 'postgres' AND auth.uid() IS NULL)) THEN
    RAISE EXCEPTION 'trial clock is managed by the server' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER weddings_protect_trial_clock
  BEFORE UPDATE ON public.weddings FOR EACH ROW
  EXECUTE FUNCTION public.protect_wedding_trial_clock();
REVOKE ALL ON FUNCTION public.protect_wedding_trial_clock() FROM PUBLIC, anon, authenticated;

-- All existing entitlements retain their original 24-month maximum. Only a
-- server-created entitlement explicitly marked one_payment_36m can last 36 months.
ALTER TABLE public.wedding_entitlements
  ADD COLUMN plan_version text NOT NULL DEFAULT 'legacy_wedding_24m',
  ADD CONSTRAINT wedding_entitlements_plan_version_check
    CHECK (plan_version IN ('legacy_wedding_24m', 'one_payment_36m'));
ALTER TABLE public.wedding_entitlements
  DROP CONSTRAINT wedding_entitlements_check;
ALTER TABLE public.wedding_entitlements
  ADD CONSTRAINT wedding_entitlements_duration_by_plan_check CHECK (
    expires_at > paid_at AND (
      (plan_version = 'legacy_wedding_24m' AND expires_at <= paid_at + interval '24 months')
      OR
      (plan_version = 'one_payment_36m' AND expires_at =
        ((paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh') + interval '36 months')
          AT TIME ZONE 'Asia/Ho_Chi_Minh')
    )
  );

-- Read-only entitlement state for the two equal managers. The 90-day value is
-- the minimum export window; deletion remains a separate reviewed process.
CREATE OR REPLACE FUNCTION public.wedding_access_state(p_wedding_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE w record; e record; state text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_wedding_manager(p_wedding_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT trial_started_at, trial_ends_at INTO w
  FROM public.weddings WHERE id = p_wedding_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'wedding not found' USING ERRCODE = 'P0002'; END IF;
  SELECT paid_at, expires_at, plan_version INTO e
  FROM public.wedding_entitlements WHERE wedding_id = p_wedding_id;
  IF FOUND AND e.paid_at <= now() AND e.expires_at > now() THEN
    state := CASE WHEN e.plan_version = 'one_payment_36m'
      THEN 'paid_active' ELSE 'legacy_paid_active' END;
  ELSIF FOUND AND e.paid_at <= now() THEN
    state := CASE WHEN e.plan_version = 'one_payment_36m'
      THEN 'paid_expired_read_only' ELSE 'legacy_paid_expired' END;
  ELSIF w.trial_ends_at IS NULL THEN
    state := 'trial_not_started';
  ELSIF w.trial_ends_at > now() THEN
    state := 'trial_active';
  ELSE
    state := 'trial_expired_read_only';
  END IF;
  RETURN jsonb_build_object(
    'state', state,
    'trial_started_at', w.trial_started_at,
    'trial_ends_at', w.trial_ends_at,
    'paid_at', e.paid_at,
    'paid_expires_at', e.expires_at,
    'plan_version', e.plan_version,
    'export_guaranteed_until', CASE WHEN e.paid_at IS NOT NULL
      THEN e.expires_at + interval '90 days'
      WHEN w.trial_ends_at IS NOT NULL THEN w.trial_ends_at + interval '90 days'
      ELSE NULL END
  );
END $$;
REVOKE ALL ON FUNCTION public.wedding_access_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wedding_access_state(uuid) TO authenticated;
