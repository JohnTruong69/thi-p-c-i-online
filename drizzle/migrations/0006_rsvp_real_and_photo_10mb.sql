-- Phase 3: real RSVP per Event + 10 MB photo limit.
ALTER TABLE public.invitation_photos DROP CONSTRAINT invitation_photos_size_bytes_check;
ALTER TABLE public.invitation_photos ADD CONSTRAINT invitation_photos_size_bytes_check CHECK (size_bytes > 0 AND size_bytes <= 10485760);

CREATE OR REPLACE FUNCTION public.register_invitation_photo(p_wedding_id uuid, p_path text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE uid uuid := auth.uid(); iid uuid; o record; h text; mt text; sz bigint; pid uuid;
BEGIN
  IF uid IS NULL OR NOT public.is_wedding_manager(p_wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_path !~ ('^' || p_wedding_id::text || '/[0-9a-f]{64}\.(jpg|png|webp)$') THEN RAISE EXCEPTION 'invalid photo path' USING ERRCODE = '22023'; END IF;
  SELECT id INTO pid FROM public.invitation_photos WHERE storage_path = p_path;
  IF pid IS NOT NULL THEN RETURN pid; END IF;
  SELECT name, metadata INTO o FROM storage.objects WHERE bucket_id = 'invitation-photos' AND name = p_path;
  IF NOT FOUND THEN RAISE EXCEPTION 'photo not uploaded' USING ERRCODE = 'P0002'; END IF;
  mt := o.metadata->>'mimetype'; sz := nullif(o.metadata->>'size','')::bigint;
  IF mt IS NULL OR mt NOT IN ('image/jpeg','image/png','image/webp') THEN RAISE EXCEPTION 'invalid photo type' USING ERRCODE = '22023'; END IF;
  IF p_path !~ (CASE mt WHEN 'image/jpeg' THEN '\.jpg$' WHEN 'image/png' THEN '\.png$' ELSE '\.webp$' END) THEN RAISE EXCEPTION 'invalid photo type' USING ERRCODE = '22023'; END IF;
  IF sz IS NULL OR sz <= 0 OR sz > 10485760 THEN RAISE EXCEPTION 'invalid photo size' USING ERRCODE = '22023'; END IF;
  h := substring(p_path from '/([0-9a-f]{64})\.');
  iid := public.ensure_invitation(p_wedding_id);
  INSERT INTO public.invitation_photos (wedding_id, invitation_id, storage_path, content_hash, mime, size_bytes, created_by)
    VALUES (p_wedding_id, iid, p_path, h, mt, sz, uid) RETURNING id INTO pid;
  RETURN pid;
END $$;

-- Responses: immutable rows; an edit creates a new row and marks the previous one superseded (only active rows count).
CREATE TABLE public.rsvp_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  link_id uuid NOT NULL REFERENCES public.invitation_links(id) ON DELETE CASCADE,
  link_side text NOT NULL CHECK (link_side IN ('chung','nha-trai','nha-gai')),
  revision_id uuid NOT NULL REFERENCES public.invitation_revisions(id),
  request_key uuid NOT NULL UNIQUE,
  edit_code_hash text NOT NULL,
  guest_name text NOT NULL CHECK (char_length(btrim(guest_name)) BETWEEN 1 AND 120),
  phone text CHECK (phone IS NULL OR char_length(phone) <= 30),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  replaces_id uuid REFERENCES public.rsvp_responses(id),
  superseded_at timestamptz,
  guest_id uuid,
  matched_by uuid,
  matched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (guest_id) REFERENCES public.guests(id) ON DELETE SET NULL
);
CREATE INDEX rsvp_responses_wedding_idx ON public.rsvp_responses (wedding_id, created_at DESC);
CREATE INDEX rsvp_responses_guest_idx ON public.rsvp_responses (guest_id);
CREATE UNIQUE INDEX rsvp_responses_one_successor ON public.rsvp_responses (replaces_id) WHERE replaces_id IS NOT NULL;

CREATE TABLE public.rsvp_answers (
  response_id uuid NOT NULL REFERENCES public.rsvp_responses(id) ON DELETE CASCADE,
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  event_name text NOT NULL,
  attending boolean NOT NULL,
  party_size integer,
  PRIMARY KEY (response_id, event_id),
  CHECK ((attending AND party_size BETWEEN 1 AND 20) OR (NOT attending AND party_size IS NULL))
);

GRANT SELECT ON public.rsvp_responses, public.rsvp_answers TO authenticated;
GRANT ALL ON public.rsvp_responses, public.rsvp_answers TO service_role;
ALTER TABLE public.rsvp_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rsvp_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rsvp responses: managers read" ON public.rsvp_responses FOR SELECT TO authenticated USING (public.is_wedding_manager(wedding_id));
CREATE POLICY "rsvp answers: managers read" ON public.rsvp_answers FOR SELECT TO authenticated USING (public.is_wedding_manager(wedding_id));

-- Resolves an open link to (link, invitation, published snapshot, link event ids); NULL when any gate fails.
CREATE OR REPLACE FUNCTION public.rsvp_link_context(p_token text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.invitation_links%ROWTYPE; i public.invitations%ROWTYPE; snap jsonb; lk jsonb;
BEGIN
  IF (public.public_invitation(p_token)->>'open') IS DISTINCT FROM 'true' THEN RETURN NULL; END IF;
  SELECT * INTO l FROM public.invitation_links WHERE token = p_token;
  SELECT * INTO i FROM public.invitations WHERE id = l.invitation_id;
  SELECT snapshot INTO snap FROM public.invitation_revisions WHERE id = i.published_revision_id;
  SELECT x INTO lk FROM jsonb_array_elements(snap->'links') x WHERE x->>'side' = l.side LIMIT 1;
  RETURN jsonb_build_object('link_id', l.id, 'side', l.side, 'wedding_id', i.wedding_id, 'revision_id', i.published_revision_id,
    'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', e->>'id', 'name', e->>'name')), '[]'::jsonb)
      FROM jsonb_array_elements(snap->'events') e WHERE (lk->'event_ids') ? (e->>'id')));
END $$;

CREATE OR REPLACE FUNCTION public.rsvp_receipt_json(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('receipt_id', r.id, 'guest_name', r.guest_name, 'submitted_at', r.created_at, 'edited', r.replaces_id IS NOT NULL,
    'answers', coalesce((SELECT jsonb_agg(jsonb_build_object('event_id', a.event_id, 'event_name', a.event_name, 'attending', a.attending, 'party_size', a.party_size) ORDER BY a.event_name) FROM public.rsvp_answers a WHERE a.response_id = r.id), '[]'::jsonb))
  FROM public.rsvp_responses r WHERE r.id = p_id
$$;

/* Public submit. Token/Event list come from the server-side published snapshot; client only supplies answers keyed by event id.
   Same request_key = same receipt (retry-safe). p_edit_code (from an earlier receipt) replaces that response; otherwise a new response. */
CREATE OR REPLACE FUNCTION public.submit_rsvp(p_token text, p_request_key uuid, p_name text, p_phone text, p_note text, p_answers jsonb, p_edit_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ctx jsonb; ev jsonb; x jsonb; rid uuid; prev public.rsvp_responses%ROWTYPE; code text; ph text := nullif(btrim(coalesce(p_phone,'')),''); n int := 0; party int; ex public.rsvp_responses%ROWTYPE;
BEGIN
  ctx := public.rsvp_link_context(p_token);
  IF ctx IS NULL THEN RAISE EXCEPTION 'closed' USING ERRCODE = 'P0001'; END IF;
  IF p_request_key IS NULL THEN RAISE EXCEPTION 'invalid request' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('rsvp:' || p_request_key::text, 0));
  SELECT * INTO ex FROM public.rsvp_responses WHERE request_key = p_request_key;
  IF FOUND THEN
    IF ex.link_id <> (ctx->>'link_id')::uuid THEN RAISE EXCEPTION 'invalid request' USING ERRCODE = '22023'; END IF;
    RETURN public.rsvp_receipt_json(ex.id) || jsonb_build_object('replay', true);
  END IF;
  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'invalid name' USING ERRCODE = '22023'; END IF;
  IF ph IS NOT NULL AND regexp_replace(ph, '[\s.\-()]', '', 'g') !~ '^\+?[0-9]{8,15}$' THEN RAISE EXCEPTION 'invalid phone' USING ERRCODE = '22023'; END IF;
  IF char_length(coalesce(p_note,'')) > 500 THEN RAISE EXCEPTION 'invalid note' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_answers) <> 'object' THEN RAISE EXCEPTION 'invalid answers' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_answers) k WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(ctx->'events') e WHERE e->>'id' = k)) THEN
    RAISE EXCEPTION 'event not on link' USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(ctx->'events') = 0 THEN RAISE EXCEPTION 'closed' USING ERRCODE = 'P0001'; END IF;
  IF p_edit_code IS NOT NULL THEN
    SELECT * INTO prev FROM public.rsvp_responses WHERE link_id = (ctx->>'link_id')::uuid AND superseded_at IS NULL
      AND edit_code_hash = encode(sha256(convert_to(p_edit_code, 'UTF8')), 'hex') FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'edit code invalid' USING ERRCODE = 'P0002'; END IF;
    code := p_edit_code;
  ELSE
    code := replace(gen_random_uuid()::text, '-', '');
  END IF;
  INSERT INTO public.rsvp_responses (wedding_id, link_id, link_side, revision_id, request_key, edit_code_hash, guest_name, phone, note, replaces_id)
    VALUES ((ctx->>'wedding_id')::uuid, (ctx->>'link_id')::uuid, ctx->>'side', (ctx->>'revision_id')::uuid, p_request_key,
      encode(sha256(convert_to(code, 'UTF8')), 'hex'), btrim(p_name), ph, nullif(btrim(coalesce(p_note,'')),''), prev.id)
    RETURNING id INTO rid;
  FOR ev IN SELECT * FROM jsonb_array_elements(ctx->'events') LOOP
    x := p_answers->(ev->>'id');
    IF x IS NULL OR jsonb_typeof(x->'attending') <> 'boolean' THEN RAISE EXCEPTION 'missing answer' USING ERRCODE = '22023'; END IF;
    IF (x->>'attending')::boolean THEN
      IF jsonb_typeof(x->'party_size') <> 'number' OR (x->>'party_size')::numeric <> floor((x->>'party_size')::numeric) THEN RAISE EXCEPTION 'invalid party size' USING ERRCODE = '22023'; END IF;
      party := (x->>'party_size')::int;
      IF party < 1 OR party > 20 THEN RAISE EXCEPTION 'invalid party size' USING ERRCODE = '22023'; END IF;
    ELSE party := NULL; END IF;
    INSERT INTO public.rsvp_answers (response_id, wedding_id, event_id, event_name, attending, party_size)
      VALUES (rid, (ctx->>'wedding_id')::uuid, (ev->>'id')::uuid, ev->>'name', (x->>'attending')::boolean, party);
  END LOOP;
  IF prev.id IS NOT NULL THEN
    UPDATE public.rsvp_responses SET superseded_at = now() WHERE id = prev.id;
    INSERT INTO public.audit_log (wedding_id, actor_id, action, detail) VALUES ((ctx->>'wedding_id')::uuid, NULL, 'rsvp.edited', jsonb_build_object('response_id', rid, 'replaces', prev.id));
  ELSE
    INSERT INTO public.audit_log (wedding_id, actor_id, action, detail) VALUES ((ctx->>'wedding_id')::uuid, NULL, 'rsvp.received', jsonb_build_object('response_id', rid));
  END IF;
  RETURN public.rsvp_receipt_json(rid) || jsonb_build_object('edit_code', code, 'replay', false);
END $$;

-- Public read of one's own receipt: requires the link still open and the edit code; returns only that response.
CREATE OR REPLACE FUNCTION public.get_rsvp_receipt(p_token text, p_edit_code text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE ctx jsonb; rid uuid;
BEGIN
  ctx := public.rsvp_link_context(p_token);
  IF ctx IS NULL OR p_edit_code IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO rid FROM public.rsvp_responses WHERE link_id = (ctx->>'link_id')::uuid AND superseded_at IS NULL
    AND edit_code_hash = encode(sha256(convert_to(p_edit_code, 'UTF8')), 'hex');
  IF rid IS NULL THEN RETURN NULL; END IF;
  RETURN public.rsvp_receipt_json(rid);
END $$;

-- Owner: link an active response to a Guest (manual). p_apply copies answers into that Guest's matching Event assignments only when asked.
CREATE OR REPLACE FUNCTION public.reconcile_rsvp(p_response_id uuid, p_guest_id uuid, p_apply boolean DEFAULT false) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r public.rsvp_responses%ROWTYPE; n int := 0;
BEGIN
  SELECT * INTO r FROM public.rsvp_responses WHERE id = p_response_id FOR UPDATE;
  IF uid IS NULL OR NOT FOUND OR NOT public.is_wedding_manager(r.wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF r.superseded_at IS NOT NULL THEN RAISE EXCEPTION 'response superseded' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.guests WHERE id = p_guest_id AND wedding_id = r.wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.rsvp_responses SET guest_id = p_guest_id, matched_by = uid, matched_at = now() WHERE id = r.id;
  IF p_apply THEN
    UPDATE public.guest_event_assignments g SET rsvp_status = CASE WHEN a.attending THEN 'attending' ELSE 'declined' END,
      attending_count = CASE WHEN a.attending THEN least(a.party_size, (SELECT party_size FROM public.guests WHERE id = p_guest_id)) ELSE NULL END
    FROM public.rsvp_answers a WHERE a.response_id = r.id AND g.guest_id = p_guest_id AND g.event_id = a.event_id AND g.wedding_id = r.wedding_id;
    GET DIAGNOSTICS n = ROW_COUNT;
  END IF;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail) VALUES (r.wedding_id, uid, 'rsvp.matched', jsonb_build_object('response_id', r.id, 'guest_id', p_guest_id, 'applied', n));
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.unmatch_rsvp(p_response_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r public.rsvp_responses%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.rsvp_responses WHERE id = p_response_id FOR UPDATE;
  IF uid IS NULL OR NOT FOUND OR NOT public.is_wedding_manager(r.wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.rsvp_responses SET guest_id = NULL, matched_by = NULL, matched_at = NULL WHERE id = r.id;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail) VALUES (r.wedding_id, uid, 'rsvp.unmatched', jsonb_build_object('response_id', r.id, 'guest_id', r.guest_id));
END $$;

-- CSV undo also keeps guests that have ever been matched to an RSVP response.
CREATE OR REPLACE FUNCTION public.undo_guest_batch(p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); b public.guest_import_batches%ROWTYPE; r record; removed integer := 0; kept integer := 0; missing integer := 0; changed boolean;
BEGIN
  SELECT * INTO b FROM public.guest_import_batches WHERE id = p_batch_id FOR UPDATE;
  IF uid IS NULL OR NOT FOUND OR NOT public.is_wedding_manager(b.wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF b.undone_at IS NOT NULL THEN
    RETURN jsonb_build_object('removed', b.undo_removed, 'kept', b.undo_kept, 'missing', b.undo_missing, 'already', true);
  END IF;
  FOR r IN SELECT ir.guest_id, ir.fingerprint FROM public.guest_import_rows ir WHERE ir.batch_id = p_batch_id LOOP
    IF r.guest_id IS NULL THEN missing := missing + 1; CONTINUE; END IF;
    PERFORM 1 FROM public.guests WHERE id = r.guest_id FOR UPDATE;
    SELECT (g.updated_at <> g.created_at)
        OR public.guest_fingerprint(g.id) IS DISTINCT FROM r.fingerprint
        OR EXISTS (SELECT 1 FROM public.guest_event_assignments a WHERE a.guest_id = g.id AND a.updated_at <> a.created_at)
        OR EXISTS (SELECT 1 FROM public.rsvp_responses rr WHERE rr.guest_id = g.id)
        OR EXISTS (SELECT 1 FROM public.audit_log al WHERE al.wedding_id = b.wedding_id AND al.action = 'rsvp.matched' AND al.detail->>'guest_id' = g.id::text)
      INTO changed FROM public.guests g WHERE g.id = r.guest_id;
    IF changed IS NULL THEN missing := missing + 1;
    ELSIF changed THEN kept := kept + 1;
    ELSE DELETE FROM public.guests WHERE id = r.guest_id AND wedding_id = b.wedding_id; removed := removed + 1; END IF;
  END LOOP;
  UPDATE public.guest_import_batches SET undone_at = now(), undo_removed = removed, undo_kept = kept, undo_missing = missing WHERE id = p_batch_id;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail) VALUES (b.wedding_id, uid, 'guests.import_undone', jsonb_build_object('batch_id', p_batch_id, 'removed', removed, 'kept', kept, 'missing', missing));
  RETURN jsonb_build_object('removed', removed, 'kept', kept, 'missing', missing, 'already', false);
END $$;

REVOKE ALL ON FUNCTION public.rsvp_link_context(text), public.rsvp_receipt_json(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_rsvp(text, uuid, text, text, text, jsonb, text), public.get_rsvp_receipt(text, text), public.reconcile_rsvp(uuid, uuid, boolean), public.unmatch_rsvp(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_rsvp(text, uuid, text, text, text, jsonb, text), public.get_rsvp_receipt(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_rsvp(uuid, uuid, boolean), public.unmatch_rsvp(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.undo_guest_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_guest_batch(uuid) TO authenticated;
