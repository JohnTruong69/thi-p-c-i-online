-- Extend the existing guest book; do not replace Planner or discard old responses.
ALTER TABLE public.guest_event_assignments
  ADD COLUMN invitation_method text NOT NULL DEFAULT 'not_invited'
    CHECK (invitation_method IN ('not_invited','met','called','link_sent')),
  ADD COLUMN attendance_intent text NOT NULL DEFAULT 'unknown'
    CHECK (attendance_intent IN ('unknown','maybe','confirmed','declined')),
  ADD COLUMN expected_count integer CHECK (expected_count IS NULL OR expected_count BETWEEN 1 AND 50),
  ADD COLUMN response_source text NOT NULL DEFAULT 'none'
    CHECK (response_source IN ('none','in_person','phone','online_rsvp','manual')),
  ADD COLUMN responded_at timestamptz,
  ADD COLUMN response_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.guest_event_assignments SET
  invitation_method = CASE WHEN invite_status = 'sent' THEN 'link_sent' ELSE 'not_invited' END,
  attendance_intent = CASE rsvp_status WHEN 'attending' THEN 'confirmed' WHEN 'declined' THEN 'declined' ELSE 'unknown' END,
  response_source = CASE WHEN rsvp_status = 'pending' THEN 'none' ELSE 'manual' END,
  responded_at = CASE WHEN rsvp_status = 'pending' THEN NULL ELSE updated_at END;

ALTER TABLE public.guest_event_assignments ADD CONSTRAINT gea_intent_matches_rsvp CHECK (
  (attendance_intent IN ('unknown','maybe') AND rsvp_status = 'pending') OR
  (attendance_intent = 'confirmed' AND rsvp_status = 'attending') OR
  (attendance_intent = 'declined' AND rsvp_status = 'declined')
);
ALTER TABLE public.guest_event_assignments ADD CONSTRAINT gea_source_matches_intent CHECK (
  (attendance_intent = 'unknown' AND response_source = 'none') OR
  (attendance_intent <> 'unknown' AND response_source <> 'none')
);
ALTER TABLE public.guest_event_assignments ADD CONSTRAINT gea_link_method_matches_status CHECK (
  (invitation_method = 'link_sent' AND invite_status = 'sent') OR
  (invitation_method <> 'link_sent' AND invite_status = 'not_sent')
);
ALTER TABLE public.guest_event_assignments ADD CONSTRAINT gea_confirmed_within_expected CHECK (
  expected_count IS NULL OR attending_count IS NULL OR attending_count <= expected_count
);

-- Auth identity is set by the database, never trusted from the browser payload.
CREATE OR REPLACE FUNCTION public.stamp_guest_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE verify_online boolean := TG_OP = 'INSERT';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    verify_online := NEW.response_source IS DISTINCT FROM OLD.response_source
      OR (NEW.attendance_intent, NEW.attending_count, NEW.expected_count)
         IS DISTINCT FROM (OLD.attendance_intent, OLD.attending_count, OLD.expected_count);
  END IF;
  -- Only a linked, active RSVP with the same answer may be labelled as an online reply.
  IF NEW.response_source = 'online_rsvp' AND verify_online THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.rsvp_responses r
      JOIN public.rsvp_answers a ON a.response_id = r.id
      WHERE r.guest_id = NEW.guest_id AND r.wedding_id = NEW.wedding_id
        AND r.superseded_at IS NULL AND a.event_id = NEW.event_id
        AND ((a.attending AND NEW.attendance_intent = 'confirmed'
              AND NEW.attending_count = least(a.party_size, coalesce(NEW.expected_count,
                (SELECT party_size FROM public.guests WHERE id = NEW.guest_id))))
          OR (NOT a.attending AND NEW.attendance_intent = 'declined' AND NEW.attending_count IS NULL))
    ) THEN RAISE EXCEPTION 'online RSVP source requires matching reply' USING ERRCODE = '23514'; END IF;
  END IF;
  NEW.updated_by := auth.uid();
  IF TG_OP = 'INSERT' THEN
    IF NEW.attendance_intent <> 'unknown' THEN
      NEW.responded_at := now(); NEW.response_by := auth.uid();
    ELSE
      NEW.responded_at := NULL; NEW.response_by := NULL;
    END IF;
  ELSIF (NEW.attendance_intent, NEW.response_source, NEW.attending_count)
      IS DISTINCT FROM (OLD.attendance_intent, OLD.response_source, OLD.attending_count) THEN
    NEW.responded_at := now(); NEW.response_by := auth.uid();
  ELSE
    NEW.responded_at := OLD.responded_at; NEW.response_by := OLD.response_by;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guest_assignment_stamp BEFORE INSERT OR UPDATE ON public.guest_event_assignments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_guest_assignment();
REVOKE ALL ON FUNCTION public.stamp_guest_assignment() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.audit_guest_assignment_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (NEW.invitation_method, NEW.attendance_intent, NEW.expected_count, NEW.attending_count, NEW.response_source)
     IS DISTINCT FROM (OLD.invitation_method, OLD.attendance_intent, OLD.expected_count, OLD.attending_count, OLD.response_source) THEN
    INSERT INTO public.audit_log (wedding_id, actor_id, action, detail)
      VALUES (NEW.wedding_id, auth.uid(), 'guest.assignment_changed',
        jsonb_build_object('guest_id', NEW.guest_id, 'event_id', NEW.event_id,
          'before', jsonb_build_object('method', OLD.invitation_method, 'intent', OLD.attendance_intent, 'expected', OLD.expected_count, 'attending', OLD.attending_count, 'source', OLD.response_source),
          'after', jsonb_build_object('method', NEW.invitation_method, 'intent', NEW.attendance_intent, 'expected', NEW.expected_count, 'attending', NEW.attending_count, 'source', NEW.response_source)));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guest_assignment_audit AFTER UPDATE ON public.guest_event_assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_guest_assignment_change();
REVOKE ALL ON FUNCTION public.audit_guest_assignment_change() FROM PUBLIC, anon, authenticated;

-- Same RPC signature so the current UI and CSV import remain compatible.
CREATE OR REPLACE FUNCTION public.save_guest(p_wedding_id uuid, p_guest_id uuid, p_guest jsonb, p_assignments jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE gid uuid; x jsonb; ev uuid; keep uuid[] := '{}'; ph text := nullif(btrim(coalesce(p_guest->>'phone','')),'');
  method text; intent text; source text; expected integer; attending integer; legacy_rsvp text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_wedding_manager(p_wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF ph IS NOT NULL AND regexp_replace(ph, '[\s.\-()]', '', 'g') !~ '^\+?[0-9]{8,15}$' THEN RAISE EXCEPTION 'invalid phone' USING ERRCODE = '23514'; END IF;
  IF jsonb_typeof(coalesce(p_assignments,'[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'invalid assignments' USING ERRCODE = '22023'; END IF;
  IF p_guest_id IS NULL THEN
    INSERT INTO public.guests (wedding_id, name, phone, side, party_size, note)
    VALUES (p_wedding_id, btrim(p_guest->>'name'), ph, p_guest->>'side', (p_guest->>'party_size')::integer, nullif(btrim(coalesce(p_guest->>'note','')),''))
    RETURNING id INTO gid;
  ELSE
    UPDATE public.guests SET name = btrim(p_guest->>'name'), phone = ph, side = p_guest->>'side', party_size = (p_guest->>'party_size')::integer,
      note = nullif(btrim(coalesce(p_guest->>'note','')),'')
    WHERE id = p_guest_id AND wedding_id = p_wedding_id RETURNING id INTO gid;
    IF gid IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_assignments,'[]'::jsonb)) LOOP
    ev := (x->>'event_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = ev AND wedding_id = p_wedding_id) THEN RAISE EXCEPTION 'event not in wedding' USING ERRCODE = '42501'; END IF;
    legacy_rsvp := coalesce(x->>'rsvp_status','pending');
    method := coalesce(x->>'invitation_method', CASE WHEN x->>'invite_status' = 'sent' THEN 'link_sent' ELSE 'not_invited' END);
    intent := coalesce(x->>'attendance_intent', CASE legacy_rsvp WHEN 'attending' THEN 'confirmed' WHEN 'declined' THEN 'declined' ELSE 'unknown' END);
    source := coalesce(x->>'response_source', CASE WHEN intent = 'unknown' THEN 'none' ELSE 'manual' END);
    expected := nullif(x->>'expected_count','')::integer;
    attending := nullif(x->>'attending_count','')::integer;
    IF expected IS NOT NULL AND expected > (p_guest->>'party_size')::integer THEN RAISE EXCEPTION 'expected exceeds party' USING ERRCODE = '23514'; END IF;
    IF attending IS NOT NULL AND attending > coalesce(expected, (p_guest->>'party_size')::integer) THEN RAISE EXCEPTION 'attending exceeds party' USING ERRCODE = '23514'; END IF;
    keep := keep || ev;
    INSERT INTO public.guest_event_assignments
      (wedding_id, guest_id, event_id, invite_status, rsvp_status, attending_count, invitation_method, attendance_intent, expected_count, response_source)
    VALUES
      (p_wedding_id, gid, ev, CASE WHEN method = 'link_sent' THEN 'sent' ELSE 'not_sent' END,
       CASE intent WHEN 'confirmed' THEN 'attending' WHEN 'declined' THEN 'declined' ELSE 'pending' END,
       attending, method, intent, expected, source)
    ON CONFLICT (guest_id, event_id) DO UPDATE SET
      invite_status = EXCLUDED.invite_status, rsvp_status = EXCLUDED.rsvp_status, attending_count = EXCLUDED.attending_count,
      invitation_method = EXCLUDED.invitation_method, attendance_intent = EXCLUDED.attendance_intent,
      expected_count = EXCLUDED.expected_count, response_source = EXCLUDED.response_source
    WHERE (guest_event_assignments.invite_status, guest_event_assignments.rsvp_status, guest_event_assignments.attending_count,
           guest_event_assignments.invitation_method, guest_event_assignments.attendance_intent, guest_event_assignments.expected_count,
           guest_event_assignments.response_source)
      IS DISTINCT FROM
          (EXCLUDED.invite_status, EXCLUDED.rsvp_status, EXCLUDED.attending_count,
           EXCLUDED.invitation_method, EXCLUDED.attendance_intent, EXCLUDED.expected_count, EXCLUDED.response_source);
  END LOOP;
  DELETE FROM public.guest_event_assignments WHERE guest_id = gid AND wedding_id = p_wedding_id AND NOT (event_id = ANY(keep));
  RETURN gid;
END $$;

-- A reconciled online response updates the same per-Event intent, only after manager confirmation.
CREATE OR REPLACE FUNCTION public.reconcile_rsvp(p_response_id uuid, p_guest_id uuid, p_apply boolean DEFAULT false) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r public.rsvp_responses%ROWTYPE; n int := 0;
BEGIN
  SELECT * INTO r FROM public.rsvp_responses WHERE id = p_response_id FOR UPDATE;
  IF uid IS NULL OR NOT FOUND OR NOT public.is_wedding_manager(r.wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF r.superseded_at IS NOT NULL THEN RAISE EXCEPTION 'response superseded' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.guests WHERE id = p_guest_id AND wedding_id = r.wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.rsvp_responses SET guest_id = p_guest_id, matched_by = uid, matched_at = now() WHERE id = r.id;
  IF p_apply THEN
    UPDATE public.guest_event_assignments g SET
      rsvp_status = CASE WHEN a.attending THEN 'attending' ELSE 'declined' END,
      attendance_intent = CASE WHEN a.attending THEN 'confirmed' ELSE 'declined' END,
      response_source = 'online_rsvp',
      attending_count = CASE WHEN a.attending THEN least(a.party_size, coalesce(g.expected_count, (SELECT party_size FROM public.guests WHERE id = p_guest_id))) ELSE NULL END
    FROM public.rsvp_answers a WHERE a.response_id = r.id AND g.guest_id = p_guest_id AND g.event_id = a.event_id AND g.wedding_id = r.wedding_id;
    GET DIAGNOSTICS n = ROW_COUNT;
  END IF;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail)
    VALUES (r.wedding_id, uid, 'rsvp.matched', jsonb_build_object('response_id', r.id, 'guest_id', p_guest_id, 'applied', n));
  RETURN n;
END $$;
