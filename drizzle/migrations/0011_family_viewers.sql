-- Phase 3: read-only family viewers (max 2 per wedding). Additive only: no existing table, policy or function changes.
-- Viewers get NO direct table access; all reads go through viewer_projection(), which whitelists fields and filters modules/sides.

CREATE TABLE public.wedding_viewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  modules text[] NOT NULL CHECK (cardinality(modules) BETWEEN 1 AND 5 AND modules <@ ARRAY['events','tasks','budget','guests','rsvp']::text[]),
  sides text[] NOT NULL CHECK (cardinality(sides) BETWEEN 1 AND 3 AND sides <@ ARRAY['chung','nha-trai','nha-gai']::text[]),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (wedding_id, user_id)
);
CREATE INDEX wedding_viewers_user_idx ON public.wedding_viewers (user_id) WHERE revoked_at IS NULL;

CREATE TABLE public.wedding_viewer_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  modules text[] NOT NULL CHECK (cardinality(modules) BETWEEN 1 AND 5 AND modules <@ ARRAY['events','tasks','budget','guests','rsvp']::text[]),
  sides text[] NOT NULL CHECK (cardinality(sides) BETWEEN 1 AND 3 AND sides <@ ARRAY['chung','nha-trai','nha-gai']::text[]),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  invited_by uuid,
  accepted_by uuid,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wedding_viewer_invites_wedding_idx ON public.wedding_viewer_invites (wedding_id, status);

GRANT SELECT ON public.wedding_viewers, public.wedding_viewer_invites TO authenticated;
GRANT ALL ON public.wedding_viewers, public.wedding_viewer_invites TO service_role;
ALTER TABLE public.wedding_viewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wedding_viewer_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "viewers: managers read" ON public.wedding_viewers FOR SELECT TO authenticated USING (public.is_wedding_manager(wedding_id));
CREATE POLICY "viewer invites: managers read" ON public.wedding_viewer_invites FOR SELECT TO authenticated USING (public.is_wedding_manager(wedding_id));

CREATE TRIGGER wedding_viewers_touch BEFORE UPDATE ON public.wedding_viewers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER wedding_viewer_invites_touch BEFORE UPDATE ON public.wedding_viewer_invites FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER wedding_viewers_no_move BEFORE UPDATE ON public.wedding_viewers FOR EACH ROW EXECUTE FUNCTION public.forbid_wedding_move();
CREATE TRIGGER wedding_viewer_invites_no_move BEFORE UPDATE ON public.wedding_viewer_invites FOR EACH ROW EXECUTE FUNCTION public.forbid_wedding_move();

-- Grant arrays are normalised (dedup, sorted) and validated here so RPCs raise a clear error instead of a CHECK failure.
CREATE OR REPLACE FUNCTION public.viewer_norm(p text[], p_allowed text[])
RETURNS text[] LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE r text[];
BEGIN
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') INTO r FROM unnest(coalesce(p, '{}')) x;
  IF cardinality(r) = 0 OR NOT r <@ p_allowed THEN RAISE EXCEPTION 'invalid viewer grants' USING ERRCODE = '22023'; END IF;
  RETURN r;
END $$;

-- Slot count: active viewers + unexpired pending invites. Caller must hold the wedding row lock.
CREATE OR REPLACE FUNCTION public.viewer_slots_used(p_wedding_id uuid, p_except_email text)
RETURNS integer LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (SELECT count(*) FROM public.wedding_viewers WHERE wedding_id = p_wedding_id AND revoked_at IS NULL AND email IS DISTINCT FROM p_except_email)::int
       + (SELECT count(*) FROM public.wedding_viewer_invites WHERE wedding_id = p_wedding_id AND status = 'pending' AND expires_at > now() AND email IS DISTINCT FROM p_except_email)::int
$$;

CREATE OR REPLACE FUNCTION public.create_viewer_invite(p_wedding_id uuid, p_email text, p_modules text[], p_sides text[])
RETURNS TABLE (invite_id uuid, token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); em text := lower(btrim(coalesce(p_email, ''))); tok text; iid uuid; exp timestamptz := now() + interval '7 days';
  mods text[]; sds text[];
BEGIN
  IF uid IS NULL OR NOT public.is_wedding_manager(p_wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.weddings WHERE id = p_wedding_id FOR UPDATE;
  IF em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'invalid email' USING ERRCODE = '22023'; END IF;
  mods := public.viewer_norm(p_modules, ARRAY['budget','events','guests','rsvp','tasks']);
  sds := public.viewer_norm(p_sides, ARRAY['chung','nha-gai','nha-trai']);
  IF EXISTS (SELECT 1 FROM public.wedding_memberships m JOIN auth.users u ON u.id = m.user_id WHERE m.wedding_id = p_wedding_id AND lower(u.email) = em) THEN
    RAISE EXCEPTION 'already a manager' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.wedding_viewers WHERE wedding_id = p_wedding_id AND email = em AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'already a viewer' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.wedding_viewer_invites SET status = 'expired' WHERE wedding_id = p_wedding_id AND status = 'pending' AND wedding_viewer_invites.expires_at <= now();
  IF public.viewer_slots_used(p_wedding_id, em) >= 2 THEN RAISE EXCEPTION 'no viewer slot' USING ERRCODE = 'P0001'; END IF;
  -- Re-invite of the same email replaces the previous pending link (old token stops working) and keeps one slot.
  UPDATE public.wedding_viewer_invites SET status = 'revoked' WHERE wedding_id = p_wedding_id AND email = em AND status = 'pending';
  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.wedding_viewer_invites (wedding_id, email, token_hash, modules, sides, invited_by, expires_at)
    VALUES (p_wedding_id, em, encode(sha256(convert_to(tok, 'UTF8')), 'hex'), mods, sds, uid, exp) RETURNING id INTO iid;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail)
    VALUES (p_wedding_id, uid, 'viewer.invited', jsonb_build_object('invite_id', iid, 'email', em, 'modules', mods, 'sides', sds));
  RETURN QUERY SELECT iid, tok, exp;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_viewer_invite(p_invite_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); wid uuid;
BEGIN
  SELECT wedding_id INTO wid FROM public.wedding_viewer_invites WHERE id = p_invite_id FOR UPDATE;
  IF uid IS NULL OR wid IS NULL OR NOT public.is_wedding_manager(wid) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.wedding_viewer_invites SET status = 'revoked' WHERE id = p_invite_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'invite is not pending' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail) VALUES (wid, uid, 'viewer.invite_revoked', jsonb_build_object('invite_id', p_invite_id));
END $$;

CREATE OR REPLACE FUNCTION public.revoke_viewer(p_viewer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); v public.wedding_viewers%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.wedding_viewers WHERE id = p_viewer_id FOR UPDATE;
  IF uid IS NULL OR NOT FOUND OR NOT public.is_wedding_manager(v.wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF v.revoked_at IS NOT NULL THEN RETURN; END IF;
  UPDATE public.wedding_viewers SET revoked_at = now() WHERE id = p_viewer_id;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail) VALUES (v.wedding_id, uid, 'viewer.revoked', jsonb_build_object('viewer_id', v.id, 'user_id', v.user_id));
END $$;

CREATE OR REPLACE FUNCTION public.update_viewer_grants(p_viewer_id uuid, p_modules text[], p_sides text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); v public.wedding_viewers%ROWTYPE; mods text[]; sds text[];
BEGIN
  SELECT * INTO v FROM public.wedding_viewers WHERE id = p_viewer_id FOR UPDATE;
  IF uid IS NULL OR NOT FOUND OR NOT public.is_wedding_manager(v.wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF v.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'viewer is revoked' USING ERRCODE = 'P0001'; END IF;
  mods := public.viewer_norm(p_modules, ARRAY['budget','events','guests','rsvp','tasks']);
  sds := public.viewer_norm(p_sides, ARRAY['chung','nha-gai','nha-trai']);
  UPDATE public.wedding_viewers SET modules = mods, sides = sds WHERE id = p_viewer_id;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail)
    VALUES (v.wedding_id, uid, 'viewer.grants_changed', jsonb_build_object('viewer_id', v.id, 'modules', mods, 'sides', sds));
END $$;

CREATE OR REPLACE FUNCTION public.inspect_viewer_invite(p_token text)
RETURNS TABLE (status text, email_matches boolean, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.wedding_viewer_invites%ROWTYPE; my_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.wedding_viewer_invites WHERE token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text, false, NULL::timestamptz; RETURN; END IF;
  SELECT lower(email) INTO my_email FROM auth.users WHERE id = auth.uid();
  RETURN QUERY SELECT CASE WHEN r.status = 'pending' AND r.expires_at <= now() THEN 'expired' ELSE r.status END, (my_email = r.email), r.expires_at;
END $$;

CREATE OR REPLACE FUNCTION public.accept_viewer_invite(p_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r public.wedding_viewer_invites%ROWTYPE; u record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.wedding_viewer_invites WHERE token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  IF NOT FOUND THEN RAISE EXCEPTION 'invite not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM 1 FROM public.weddings WHERE id = r.wedding_id FOR UPDATE;   -- same lock order as create_viewer_invite
  SELECT * INTO r FROM public.wedding_viewer_invites WHERE id = r.id FOR UPDATE;
  IF r.status = 'accepted' AND r.accepted_by = uid THEN RETURN r.wedding_id; END IF;   -- idempotent replay
  IF r.status = 'pending' AND r.expires_at <= now() THEN
    UPDATE public.wedding_viewer_invites SET status = 'expired' WHERE id = r.id;
    INSERT INTO public.audit_log (wedding_id, actor_id, action, detail) VALUES (r.wedding_id, uid, 'viewer.invite_expired', jsonb_build_object('invite_id', r.id));
    RETURN NULL;
  END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'invite is %', r.status USING ERRCODE = 'P0001'; END IF;
  SELECT email, email_confirmed_at INTO u FROM auth.users WHERE id = uid;
  IF u.email_confirmed_at IS NULL OR lower(u.email) <> r.email THEN RAISE EXCEPTION 'email mismatch' USING ERRCODE = '42501'; END IF;
  IF public.is_wedding_manager(r.wedding_id) THEN RAISE EXCEPTION 'already a manager' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.wedding_viewers (wedding_id, user_id, email, modules, sides, created_by)
    VALUES (r.wedding_id, uid, r.email, r.modules, r.sides, r.invited_by)
    ON CONFLICT (wedding_id, user_id) DO UPDATE SET modules = EXCLUDED.modules, sides = EXCLUDED.sides, email = EXCLUDED.email, revoked_at = NULL, created_by = EXCLUDED.created_by;
  UPDATE public.wedding_viewer_invites SET status = 'accepted', accepted_by = uid WHERE id = r.id;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail)
    VALUES (r.wedding_id, uid, 'viewer.accepted', jsonb_build_object('invite_id', r.id, 'user_id', uid, 'modules', r.modules, 'sides', r.sides));
  RETURN r.wedding_id;
END $$;

CREATE OR REPLACE FUNCTION public.viewer_weddings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('wedding_id', w.id, 'partner_one_name', w.partner_one_name, 'partner_two_name', w.partner_two_name,
    'planned_date', w.planned_date, 'modules', v.modules, 'sides', v.sides) ORDER BY v.created_at), '[]'::jsonb)
  FROM public.wedding_viewers v JOIN public.weddings w ON w.id = v.wedding_id
  WHERE auth.uid() IS NOT NULL AND v.user_id = auth.uid() AND v.revoked_at IS NULL
$$;

-- Whitelisted, side/module-filtered read model. Never returns phone, notes, vendor, CSV provenance, photos, tokens, entitlements or checkout data.
CREATE OR REPLACE FUNCTION public.viewer_projection(p_wedding_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); v public.wedding_viewers%ROWTYPE; w public.weddings%ROWTYPE; res jsonb; vis uuid[]; chung boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v FROM public.wedding_viewers WHERE wedding_id = p_wedding_id AND user_id = uid AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'not granted' USING ERRCODE = '42501'; END IF;
  SELECT * INTO w FROM public.weddings WHERE id = p_wedding_id;
  chung := 'chung' = ANY(v.sides);
  SELECT coalesce(array_agg(id), '{}') INTO vis FROM public.events WHERE wedding_id = p_wedding_id AND side = ANY(v.sides);
  res := jsonb_build_object('wedding', jsonb_build_object('partner_one_name', w.partner_one_name, 'partner_two_name', w.partner_two_name, 'planned_date', w.planned_date),
                            'modules', to_jsonb(v.modules), 'sides', to_jsonb(v.sides));
  IF 'events' = ANY(v.modules) THEN
    res := res || jsonb_build_object('events', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'side', e.side, 'date', e.event_date,
      'time', to_char(e.event_time, 'HH24:MI'), 'venue', e.venue, 'address', e.address, 'status', e.status) ORDER BY e.event_date NULLS LAST, e.created_at), '[]'::jsonb)
      FROM public.events e WHERE e.id = ANY(vis)));
  END IF;
  IF 'tasks' = ANY(v.modules) THEN
    res := res || jsonb_build_object('tasks', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status, 'due_date', t.due_date,
      'kind', t.kind, 'planned_tables', t.planned_tables, 'reserve_tables', t.reserve_tables, 'event_name', e.name) ORDER BY t.due_date NULLS LAST, t.created_at), '[]'::jsonb)
      FROM public.tasks t LEFT JOIN public.events e ON e.id = t.event_id
      WHERE t.wedding_id = p_wedding_id AND ((t.event_id IS NULL AND chung) OR t.event_id = ANY(vis))));
  END IF;
  IF 'budget' = ANY(v.modules) THEN
    res := res || jsonb_build_object('budget', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'label', b.label, 'category', b.category, 'payer', b.payer,
      'planned_vnd', coalesce(b.agreed_vnd, b.estimate_vnd), 'paid_vnd', b.paid_vnd, 'event_name', e.name) ORDER BY b.created_at), '[]'::jsonb)
      FROM public.budget_items b LEFT JOIN public.events e ON e.id = b.event_id
      WHERE b.wedding_id = p_wedding_id AND ((b.event_id IS NULL AND chung) OR b.event_id = ANY(vis))));
  END IF;
  IF 'guests' = ANY(v.modules) THEN
    res := res || jsonb_build_object('guests', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'side', g.side, 'party_size', g.party_size,
      'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event_name', e.name, 'invite_status', a.invite_status, 'rsvp_status', a.rsvp_status, 'attending_count', a.attending_count) ORDER BY e.event_date NULLS LAST), '[]'::jsonb)
                 FROM public.guest_event_assignments a JOIN public.events e ON e.id = a.event_id WHERE a.guest_id = g.id AND a.event_id = ANY(vis))) ORDER BY g.name), '[]'::jsonb)
      FROM public.guests g WHERE g.wedding_id = p_wedding_id AND g.side = ANY(v.sides)));
  END IF;
  IF 'rsvp' = ANY(v.modules) THEN
    res := res || jsonb_build_object('rsvp', (SELECT coalesce(jsonb_agg(jsonb_build_object('event_name', e.name, 'yes', c.yes, 'no', c.no, 'people', c.people) ORDER BY e.event_date NULLS LAST), '[]'::jsonb)
      FROM public.events e JOIN LATERAL (
        SELECT count(*) FILTER (WHERE a.attending) AS yes, count(*) FILTER (WHERE NOT a.attending) AS no, coalesce(sum(a.party_size) FILTER (WHERE a.attending), 0) AS people
        FROM public.rsvp_answers a JOIN public.rsvp_responses r ON r.id = a.response_id
        WHERE a.event_id = e.id AND r.superseded_at IS NULL AND r.wedding_id = p_wedding_id) c ON true
      WHERE e.id = ANY(vis)));
  END IF;
  RETURN res;
END $$;

REVOKE ALL ON FUNCTION public.viewer_norm(text[], text[]), public.viewer_slots_used(uuid, text),
  public.create_viewer_invite(uuid, text, text[], text[]), public.revoke_viewer_invite(uuid), public.revoke_viewer(uuid),
  public.update_viewer_grants(uuid, text[], text[]), public.inspect_viewer_invite(text), public.accept_viewer_invite(text),
  public.viewer_weddings(), public.viewer_projection(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.viewer_norm(text[], text[]), public.viewer_slots_used(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_viewer_invite(uuid, text, text[], text[]), public.revoke_viewer_invite(uuid), public.revoke_viewer(uuid),
  public.update_viewer_grants(uuid, text[], text[]), public.inspect_viewer_invite(text), public.accept_viewer_invite(text),
  public.viewer_weddings(), public.viewer_projection(uuid) TO authenticated;
