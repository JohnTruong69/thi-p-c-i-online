-- Phase 3: trial / read-only write gate, staged OFF.
-- A wedding is only gated when a row exists in wedding_write_gate. Only the
-- service role can create that row (no client grant, no automatic activation),
-- so every existing and new wedding keeps full write access until a verified
-- checkout path exists. When gated, owner writes are allowed only during an
-- active 7-day trial (server clock) or an active paid entitlement (incl. legacy).

CREATE TABLE public.wedding_write_gate (
  wedding_id uuid PRIMARY KEY REFERENCES public.weddings(id) ON DELETE CASCADE,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  note text
);
GRANT ALL ON public.wedding_write_gate TO service_role;
ALTER TABLE public.wedding_write_gate ENABLE ROW LEVEL SECURITY;
-- No policies and no anon/authenticated grants: clients can neither read nor write it.

CREATE OR REPLACE FUNCTION public.wedding_write_allowed(p_wedding_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.wedding_write_gate g WHERE g.wedding_id = p_wedding_id)
    OR EXISTS (SELECT 1 FROM public.wedding_entitlements e
               WHERE e.wedding_id = p_wedding_id AND e.paid_at <= now() AND e.expires_at > now())
    OR EXISTS (SELECT 1 FROM public.weddings w
               WHERE w.id = p_wedding_id AND w.trial_started_at <= now() AND w.trial_ends_at > now())
$$;
REVOKE ALL ON FUNCTION public.wedding_write_allowed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wedding_write_allowed(uuid) TO service_role;

-- Row trigger. Runs for direct table writes AND for writes made inside
-- SECURITY DEFINER / invoker RPCs, so no RPC can bypass it. TG_ARGV[0] names the
-- wedding column. Exempt: service role and privileged sessions without a JWT role
-- (migrations, admin maintenance, cascaded cleanup by service role).
CREATE OR REPLACE FUNCTION public.enforce_wedding_write_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE col text := coalesce(TG_ARGV[0], 'wedding_id'); w_old uuid; w_new uuid; r text := auth.role();
BEGIN
  IF r IS NOT DISTINCT FROM 'service_role'
     OR (auth.uid() IS NULL AND coalesce(r, '') NOT IN ('anon', 'authenticated')) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP <> 'INSERT' THEN w_old := (to_jsonb(OLD) ->> col)::uuid; END IF;
  IF TG_OP <> 'DELETE' THEN w_new := (to_jsonb(NEW) ->> col)::uuid; END IF;
  IF (w_old IS NOT NULL AND NOT public.wedding_write_allowed(w_old))
     OR (w_new IS NOT NULL AND w_new IS DISTINCT FROM w_old AND NOT public.wedding_write_allowed(w_new)) THEN
    RAISE EXCEPTION 'wedding is read-only' USING ERRCODE = '42501',
      HINT = 'trial or paid access has ended';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.enforce_wedding_write_gate() FROM PUBLIC, anon, authenticated;

-- Owner data surfaces: every write.
CREATE TRIGGER a_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.events FOR EACH ROW EXECUTE FUNCTION public.enforce_wedding_write_gate('wedding_id');
CREATE TRIGGER a_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.enforce_wedding_write_gate('wedding_id');
CREATE TRIGGER a_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.budget_items FOR EACH ROW EXECUTE FUNCTION public.enforce_wedding_write_gate('wedding_id');
CREATE TRIGGER a_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.budget_installments FOR EACH ROW EXECUTE FUNCTION public.enforce_wedding_write_gate('wedding_id');
CREATE TRIGGER a_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.guests FOR EACH ROW EXECUTE FUNCTION public.enforce_wedding_write_gate('wedding_id');
CREATE TRIGGER a_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.guest_event_assignments FOR EACH ROW EXECUTE FUNCTION public.enforce_wedding_write_gate('wedding_id');
CREATE TRIGGER a_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.guest_import_batches FOR EACH ROW EXECUTE FUNCTION public.enforce_wedding_write_gate('wedding_id');
CREATE TRIGGER a_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.guest_import_rows FOR EACH ROW EXECUTE FUNCTION public.enforce_wedding_write_gate('wedding_id');
CREATE TRIGGER a_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.invitations FOR EACH ROW EXECUTE FUNCTION public.enforce_wedding_write_gate('wedding_id');
CREATE TRIGGER a_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.invitation_links FOR EACH ROW EXECUTE FUNCTION public.enforce_wedding_write_gate('wedding_id');
CREATE TRIGGER a_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.invitation_photos FOR EACH ROW EXECUTE FUNCTION public.enforce_wedding_write_gate('wedding_id');
CREATE TRIGGER a_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.invitation_revisions FOR EACH ROW EXECUTE FUNCTION public.enforce_wedding_write_gate('wedding_id');
CREATE TRIGGER a_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.rsvp_responses FOR EACH ROW EXECUTE FUNCTION public.enforce_wedding_write_gate('wedding_id');
CREATE TRIGGER a_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.rsvp_answers FOR EACH ROW EXECUTE FUNCTION public.enforce_wedding_write_gate('wedding_id');
CREATE TRIGGER a_write_gate BEFORE UPDATE ON public.weddings FOR EACH ROW EXECUTE FUNCTION public.enforce_wedding_write_gate('id');
-- Team growth is a write; revocation/removal/acceptance stay possible so access can always be reduced.
CREATE TRIGGER a_write_gate BEFORE INSERT ON public.wedding_invites FOR EACH ROW EXECUTE FUNCTION public.enforce_wedding_write_gate('wedding_id');
CREATE TRIGGER a_write_gate BEFORE INSERT ON public.wedding_viewer_invites FOR EACH ROW EXECUTE FUNCTION public.enforce_wedding_write_gate('wedding_id');
CREATE TRIGGER a_write_gate BEFORE UPDATE ON public.wedding_viewers FOR EACH ROW
  WHEN (OLD.modules IS DISTINCT FROM NEW.modules OR OLD.sides IS DISTINCT FROM NEW.sides)
  EXECUTE FUNCTION public.enforce_wedding_write_gate('wedding_id');
-- Not gated on purpose: audit_log (append-only by server), data_deletion_requests,
-- profiles (account), wedding_memberships (accept/remove), revocations.

-- Private photo storage: upload and delete also require write access.
CREATE OR REPLACE FUNCTION public.can_write_photo_path(p_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_photo_path(p_name) THEN RETURN false; END IF;
  RETURN public.wedding_write_allowed(split_part(p_name, '/', 1)::uuid);
END $$;
REVOKE ALL ON FUNCTION public.can_write_photo_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_photo_path(text) TO authenticated;

ALTER POLICY "invitation photos: managers upload" ON storage.objects
  WITH CHECK (bucket_id = 'invitation-photos' AND public.can_write_photo_path(name)
    AND public.photo_slot_available(split_part(name, '/', 1)));
ALTER POLICY "invitation photos: managers delete" ON storage.objects
  USING (bucket_id = 'invitation-photos' AND public.can_write_photo_path(name));

-- Shared state computation (no auth check; callers check).
CREATE OR REPLACE FUNCTION public.wedding_access_state_internal(p_wedding_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE w record; e record; state text; has_e boolean;
BEGIN
  SELECT trial_started_at, trial_ends_at INTO w FROM public.weddings WHERE id = p_wedding_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'wedding not found' USING ERRCODE = 'P0002'; END IF;
  SELECT paid_at, expires_at, plan_version INTO e FROM public.wedding_entitlements WHERE wedding_id = p_wedding_id;
  has_e := FOUND;
  IF has_e AND e.paid_at <= now() AND e.expires_at > now() THEN
    state := CASE WHEN e.plan_version = 'one_payment_36m' THEN 'paid_active' ELSE 'legacy_paid_active' END;
  ELSIF has_e AND e.paid_at <= now() THEN
    state := CASE WHEN e.plan_version = 'one_payment_36m' THEN 'paid_expired_read_only' ELSE 'legacy_paid_expired' END;
  ELSIF w.trial_ends_at IS NULL THEN state := 'trial_not_started';
  ELSIF w.trial_ends_at > now() THEN state := 'trial_active';
  ELSE state := 'trial_expired_read_only';
  END IF;
  RETURN jsonb_build_object(
    'state', state,
    'trial_started_at', w.trial_started_at,
    'trial_ends_at', w.trial_ends_at,
    'paid_at', e.paid_at,
    'paid_expires_at', e.expires_at,
    'plan_version', e.plan_version,
    'export_guaranteed_until', CASE WHEN e.paid_at IS NOT NULL THEN e.expires_at + interval '90 days'
      WHEN w.trial_ends_at IS NOT NULL THEN w.trial_ends_at + interval '90 days' ELSE NULL END,
    'write_gate_enabled', EXISTS (SELECT 1 FROM public.wedding_write_gate g WHERE g.wedding_id = p_wedding_id),
    'writable', public.wedding_write_allowed(p_wedding_id)
  );
END $$;
REVOKE ALL ON FUNCTION public.wedding_access_state_internal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wedding_access_state_internal(uuid) TO service_role;

-- Service-role-only activation. Optionally starts the immutable 7-day clock
-- from server time; never moves an existing clock.
CREATE OR REPLACE FUNCTION public.enable_wedding_write_gate(p_wedding_id uuid, p_start_trial boolean DEFAULT false, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT (auth.uid() IS NULL AND auth.role() IS NULL) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.weddings WHERE id = p_wedding_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wedding not found' USING ERRCODE = 'P0002'; END IF;
  IF p_start_trial THEN
    UPDATE public.weddings SET trial_started_at = now(), trial_ends_at = now() + interval '7 days'
      WHERE id = p_wedding_id AND trial_started_at IS NULL;
  END IF;
  INSERT INTO public.wedding_write_gate (wedding_id, note) VALUES (p_wedding_id, p_note)
    ON CONFLICT (wedding_id) DO NOTHING;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail)
    VALUES (p_wedding_id, NULL, 'access.write_gate_enabled', jsonb_build_object('start_trial', p_start_trial));
  RETURN public.wedding_access_state_internal(p_wedding_id);
END $$;
REVOKE ALL ON FUNCTION public.enable_wedding_write_gate(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enable_wedding_write_gate(uuid, boolean, text) TO service_role;

-- Same signature and existing keys; adds write_gate_enabled / writable.
CREATE OR REPLACE FUNCTION public.wedding_access_state(p_wedding_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_wedding_manager(p_wedding_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN public.wedding_access_state_internal(p_wedding_id);
END $$;
REVOKE ALL ON FUNCTION public.wedding_access_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wedding_access_state(uuid) TO authenticated;
