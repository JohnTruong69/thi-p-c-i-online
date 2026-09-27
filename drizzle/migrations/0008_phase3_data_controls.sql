-- Phase 3: coarse, server-enforced RSVP abuse limit and Wedding data controls.
-- This migration runs inside the existing Lovable Cloud database. No external backend.

CREATE TABLE public.rsvp_rate_buckets (
  link_id uuid NOT NULL REFERENCES public.invitation_links(id) ON DELETE CASCADE,
  window_kind text NOT NULL CHECK (window_kind IN ('minute', 'day')),
  window_start timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits > 0),
  PRIMARY KEY (link_id, window_kind, window_start)
);
CREATE INDEX rsvp_rate_buckets_window_idx ON public.rsvp_rate_buckets (window_start);
ALTER TABLE public.rsvp_rate_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rsvp_rate_buckets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rsvp_rate_buckets TO service_role;

-- A trigger protects the public RPC itself, including callers that bypass the UI.
-- Replaying an existing request_key never inserts a row and therefore costs no quota.
CREATE OR REPLACE FUNCTION public.limit_rsvp_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE bucket record; seen integer;
BEGIN
  FOR bucket IN
    SELECT 'minute'::text AS kind, date_trunc('minute', now()) AS starts, 120 AS ceiling
    UNION ALL
    SELECT 'day'::text, date_trunc('day', now()), 2000
  LOOP
    seen := NULL;
    INSERT INTO public.rsvp_rate_buckets (link_id, window_kind, window_start, hits)
      VALUES (NEW.link_id, bucket.kind, bucket.starts, 1)
    ON CONFLICT (link_id, window_kind, window_start)
      DO UPDATE SET hits = public.rsvp_rate_buckets.hits + 1
      WHERE public.rsvp_rate_buckets.hits < bucket.ceiling
    RETURNING hits INTO seen;
    IF seen IS NULL THEN
      RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0003';
    END IF;
  END LOOP;
  -- Only aggregate counters are kept. No IP address or phone number is recorded.
  DELETE FROM public.rsvp_rate_buckets WHERE window_start < now() - interval '3 days';
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.limit_rsvp_insert() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER rsvp_responses_rate_limit BEFORE INSERT ON public.rsvp_responses
  FOR EACH ROW EXECUTE FUNCTION public.limit_rsvp_insert();

CREATE TABLE public.data_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'withdrawn', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX data_deletion_requests_wedding_idx ON public.data_deletion_requests (wedding_id, created_at DESC);
CREATE TRIGGER data_deletion_requests_touch BEFORE UPDATE ON public.data_deletion_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.data_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.data_deletion_requests TO authenticated;
GRANT ALL ON public.data_deletion_requests TO service_role;
CREATE POLICY "deletion requests: managers read" ON public.data_deletion_requests
  FOR SELECT TO authenticated USING (public.is_wedding_manager(wedding_id));

-- Export only the requesting Wedding, after a fresh server-side membership check.
-- Secret RSVP edit hashes and import fingerprints are intentionally excluded.
CREATE OR REPLACE FUNCTION public.export_wedding_data(p_wedding_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); payload jsonb;
BEGIN
  IF uid IS NULL OR NOT public.is_wedding_manager(p_wedding_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'schema_version', 1, 'exported_at', now(),
    'wedding', (SELECT to_jsonb(w) FROM public.weddings w WHERE w.id = p_wedding_id),
    'managers', (SELECT coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role, 'display_name', p.display_name, 'email', p.email) ORDER BY m.created_at), '[]'::jsonb)
      FROM public.wedding_memberships m LEFT JOIN public.profiles p ON p.id = m.user_id WHERE m.wedding_id = p_wedding_id),
    'events', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb) FROM public.events x WHERE x.wedding_id = p_wedding_id),
    'tasks', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb) FROM public.tasks x WHERE x.wedding_id = p_wedding_id),
    'budget_items', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb) FROM public.budget_items x WHERE x.wedding_id = p_wedding_id),
    'budget_installments', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb) FROM public.budget_installments x WHERE x.wedding_id = p_wedding_id),
    'guests', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb) FROM public.guests x WHERE x.wedding_id = p_wedding_id),
    'guest_event_assignments', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb) FROM public.guest_event_assignments x WHERE x.wedding_id = p_wedding_id),
    'guest_import_batches', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb) FROM public.guest_import_batches x WHERE x.wedding_id = p_wedding_id),
    'guest_import_rows', (SELECT coalesce(jsonb_agg(to_jsonb(x) - 'fingerprint' ORDER BY x.batch_id, x.source_row), '[]'::jsonb) FROM public.guest_import_rows x WHERE x.wedding_id = p_wedding_id),
    'invitation', (SELECT to_jsonb(x) FROM public.invitations x WHERE x.wedding_id = p_wedding_id),
    'invitation_links', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.side), '[]'::jsonb) FROM public.invitation_links x WHERE x.wedding_id = p_wedding_id),
    'invitation_photos', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb) FROM public.invitation_photos x WHERE x.wedding_id = p_wedding_id),
    'invitation_revisions', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.revision), '[]'::jsonb) FROM public.invitation_revisions x WHERE x.wedding_id = p_wedding_id),
    'rsvp_responses', (SELECT coalesce(jsonb_agg(to_jsonb(x) - 'edit_code_hash' - 'request_key' ORDER BY x.created_at), '[]'::jsonb) FROM public.rsvp_responses x WHERE x.wedding_id = p_wedding_id),
    'rsvp_answers', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.response_id, x.event_id), '[]'::jsonb) FROM public.rsvp_answers x WHERE x.wedding_id = p_wedding_id),
    'deletion_requests', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb) FROM public.data_deletion_requests x WHERE x.wedding_id = p_wedding_id),
    'audit_log', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb) FROM public.audit_log x WHERE x.wedding_id = p_wedding_id)
  ) INTO payload;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail)
    VALUES (p_wedding_id, uid, 'data.exported', '{}'::jsonb);
  RETURN payload;
END $$;
REVOKE ALL ON FUNCTION public.export_wedding_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_wedding_data(uuid) TO authenticated;

-- This records a request only. Actual deletion awaits a reviewed retention policy and Admin workflow.
CREATE OR REPLACE FUNCTION public.request_wedding_data_deletion(p_wedding_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); existing uuid; created uuid;
BEGIN
  IF uid IS NULL OR NOT public.is_wedding_manager(p_wedding_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('data-deletion:' || p_wedding_id::text, 0));
  SELECT id INTO existing FROM public.data_deletion_requests
    WHERE wedding_id = p_wedding_id AND status IN ('pending', 'in_review') ORDER BY created_at DESC LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  INSERT INTO public.data_deletion_requests (wedding_id, requested_by)
    VALUES (p_wedding_id, uid) RETURNING id INTO created;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail)
    VALUES (p_wedding_id, uid, 'data.deletion_requested', jsonb_build_object('request_id', created));
  RETURN created;
END $$;
REVOKE ALL ON FUNCTION public.request_wedding_data_deletion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_wedding_data_deletion(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.withdraw_wedding_data_deletion(p_request_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); rec public.data_deletion_requests%ROWTYPE;
BEGIN
  SELECT * INTO rec FROM public.data_deletion_requests WHERE id = p_request_id FOR UPDATE;
  IF uid IS NULL OR NOT FOUND OR NOT public.is_wedding_manager(rec.wedding_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF rec.status <> 'pending' THEN RAISE EXCEPTION 'request already in review' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.data_deletion_requests SET status = 'withdrawn' WHERE id = rec.id;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail)
    VALUES (rec.wedding_id, uid, 'data.deletion_withdrawn', jsonb_build_object('request_id', rec.id));
END $$;
REVOKE ALL ON FUNCTION public.withdraw_wedding_data_deletion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_wedding_data_deletion(uuid) TO authenticated;
