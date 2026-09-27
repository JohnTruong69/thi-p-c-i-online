-- Phase 3 slice 3: one Đường Hẹn invitation draft per wedding, photos (private bucket), up to 3 links, revisions, entitlement gate.
CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id uuid NOT NULL UNIQUE REFERENCES public.weddings(id) ON DELETE CASCADE,
  template text NOT NULL DEFAULT 'duong-hen' CHECK (template = 'duong-hen'),
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 80),
  message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 1200),
  cover_photo_id uuid,
  published_revision_id uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, wedding_id)
);
CREATE TABLE public.invitation_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  invitation_id uuid NOT NULL,
  storage_path text NOT NULL UNIQUE,
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 8388608),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wedding_id, content_hash),
  UNIQUE (id, wedding_id),
  FOREIGN KEY (invitation_id, wedding_id) REFERENCES public.invitations(id, wedding_id) ON DELETE CASCADE,
  CHECK (storage_path = wedding_id::text || '/' || content_hash || CASE mime WHEN 'image/jpeg' THEN '.jpg' WHEN 'image/png' THEN '.png' ELSE '.webp' END)
);
ALTER TABLE public.invitations ADD CONSTRAINT invitations_cover_fk FOREIGN KEY (cover_photo_id, wedding_id) REFERENCES public.invitation_photos(id, wedding_id) ON DELETE SET NULL (cover_photo_id);

CREATE TABLE public.invitation_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  invitation_id uuid NOT NULL,
  side text NOT NULL CHECK (side IN ('chung','nha-trai','nha-gai')),
  token text NOT NULL UNIQUE DEFAULT (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')) CHECK (token ~ '^[0-9a-f]{64}$'),
  enabled boolean NOT NULL DEFAULT false,
  event_ids uuid[] NOT NULL DEFAULT '{}' CHECK (coalesce(array_length(event_ids,1),0) <= 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wedding_id, side),
  FOREIGN KEY (invitation_id, wedding_id) REFERENCES public.invitations(id, wedding_id) ON DELETE CASCADE
);
CREATE TABLE public.invitation_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  invitation_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  kind text NOT NULL DEFAULT 'saved' CHECK (kind IN ('saved','published')),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 200),
  snapshot jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invitation_id, revision),
  UNIQUE (id, wedding_id),
  FOREIGN KEY (invitation_id, wedding_id) REFERENCES public.invitations(id, wedding_id) ON DELETE CASCADE
);
ALTER TABLE public.invitations ADD CONSTRAINT invitations_published_fk FOREIGN KEY (published_revision_id, wedding_id) REFERENCES public.invitation_revisions(id, wedding_id) ON DELETE SET NULL (published_revision_id);

-- Paid entitlement: written only by the verified payment system (Phase 4). No client write grants.
CREATE TABLE public.wedding_entitlements (
  wedding_id uuid PRIMARY KEY REFERENCES public.weddings(id) ON DELETE CASCADE,
  paid_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > paid_at AND expires_at <= paid_at + interval '24 months')
);

GRANT SELECT ON public.invitations, public.invitation_photos, public.invitation_links, public.invitation_revisions, public.wedding_entitlements TO authenticated;
GRANT UPDATE (title, message, cover_photo_id) ON public.invitations TO authenticated;
GRANT UPDATE (enabled, event_ids) ON public.invitation_links TO authenticated;
GRANT ALL ON public.invitations, public.invitation_photos, public.invitation_links, public.invitation_revisions, public.wedding_entitlements TO service_role;

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wedding_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitations: managers read" ON public.invitations FOR SELECT TO authenticated USING (public.is_wedding_manager(wedding_id));
CREATE POLICY "invitations: managers update" ON public.invitations FOR UPDATE TO authenticated USING (public.is_wedding_manager(wedding_id)) WITH CHECK (public.is_wedding_manager(wedding_id));
CREATE POLICY "photos: managers read" ON public.invitation_photos FOR SELECT TO authenticated USING (public.is_wedding_manager(wedding_id));
CREATE POLICY "links: managers read" ON public.invitation_links FOR SELECT TO authenticated USING (public.is_wedding_manager(wedding_id));
CREATE POLICY "links: managers update" ON public.invitation_links FOR UPDATE TO authenticated USING (public.is_wedding_manager(wedding_id)) WITH CHECK (public.is_wedding_manager(wedding_id));
CREATE POLICY "revisions: managers read" ON public.invitation_revisions FOR SELECT TO authenticated USING (public.is_wedding_manager(wedding_id));
CREATE POLICY "entitlements: managers read" ON public.wedding_entitlements FOR SELECT TO authenticated USING (public.is_wedding_manager(wedding_id));

CREATE TRIGGER invitations_touch BEFORE UPDATE ON public.invitations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER invitation_links_touch BEFORE UPDATE ON public.invitation_links FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Links: newly added Event ids must belong to the same wedding; removed-Event ids already stored stay (shown as needs-fix).
CREATE OR REPLACE FUNCTION public.check_link_events() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ev uuid;
BEGIN
  IF NEW.token IS DISTINCT FROM OLD.token OR NEW.side IS DISTINCT FROM OLD.side OR NEW.wedding_id IS DISTINCT FROM OLD.wedding_id OR NEW.invitation_id IS DISTINCT FROM OLD.invitation_id THEN
    RAISE EXCEPTION 'link identity is immutable' USING ERRCODE = '42501'; END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(NEW.event_ids) x) <> coalesce(array_length(NEW.event_ids,1),0) THEN RAISE EXCEPTION 'duplicate event in link' USING ERRCODE = '22023'; END IF;
  FOREACH ev IN ARRAY NEW.event_ids LOOP
    IF NOT (ev = ANY(OLD.event_ids)) AND NOT EXISTS (SELECT 1 FROM public.events WHERE id = ev AND wedding_id = NEW.wedding_id) THEN
      RAISE EXCEPTION 'event not in wedding' USING ERRCODE = '42501'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER invitation_links_check BEFORE UPDATE ON public.invitation_links FOR EACH ROW EXECUTE FUNCTION public.check_link_events();

CREATE OR REPLACE FUNCTION public.enforce_photo_limit() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM public.weddings WHERE id = NEW.wedding_id FOR UPDATE;
  IF (SELECT count(*) FROM public.invitation_photos WHERE wedding_id = NEW.wedding_id) >= 50 THEN RAISE EXCEPTION 'photo limit reached' USING ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invitation_photos_limit BEFORE INSERT ON public.invitation_photos FOR EACH ROW EXECUTE FUNCTION public.enforce_photo_limit();

-- Idempotent: the one draft + its 3 links.
CREATE OR REPLACE FUNCTION public.ensure_invitation(p_wedding_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE iid uuid; w public.weddings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_wedding_manager(p_wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT id INTO iid FROM public.invitations WHERE wedding_id = p_wedding_id;
  IF iid IS NOT NULL THEN RETURN iid; END IF;
  SELECT * INTO w FROM public.weddings WHERE id = p_wedding_id FOR UPDATE;
  SELECT id INTO iid FROM public.invitations WHERE wedding_id = p_wedding_id;
  IF iid IS NOT NULL THEN RETURN iid; END IF;
  INSERT INTO public.invitations (wedding_id, title, message)
    VALUES (p_wedding_id, left(w.partner_one_name || ' & ' || w.partner_two_name, 80), 'Trân trọng mời bạn đến chung vui cùng gia đình chúng mình.') RETURNING id INTO iid;
  INSERT INTO public.invitation_links (wedding_id, invitation_id, side) VALUES (p_wedding_id, iid, 'chung'), (p_wedding_id, iid, 'nha-trai'), (p_wedding_id, iid, 'nha-gai');
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail) VALUES (p_wedding_id, auth.uid(), 'invitation.created', jsonb_build_object('invitation_id', iid));
  RETURN iid;
END $$;

-- Storage-side slot count (security definer so the storage policy does not recurse).
CREATE OR REPLACE FUNCTION public.photo_slot_available(p_wedding text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, storage AS $$
  SELECT (SELECT count(*) FROM storage.objects WHERE bucket_id = 'invitation-photos' AND name LIKE p_wedding || '/%') < 50
$$;
CREATE OR REPLACE FUNCTION public.can_manage_photo_path(p_name text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_name !~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.(jpg|png|webp)$' THEN RETURN false; END IF;
  RETURN public.is_wedding_manager(split_part(p_name, '/', 1)::uuid);
END $$;

-- Register an uploaded object: re-checks path, owner, the object's stored mime/size, distinct hash and the 50 limit.
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
  IF sz IS NULL OR sz <= 0 OR sz > 8388608 THEN RAISE EXCEPTION 'invalid photo size' USING ERRCODE = '22023'; END IF;
  h := substring(p_path from '/([0-9a-f]{64})\.');
  iid := public.ensure_invitation(p_wedding_id);
  INSERT INTO public.invitation_photos (wedding_id, invitation_id, storage_path, content_hash, mime, size_bytes, created_by)
    VALUES (p_wedding_id, iid, p_path, h, mt, sz, uid) RETURNING id INTO pid;
  RETURN pid;
END $$;

CREATE OR REPLACE FUNCTION public.remove_invitation_photo(p_photo_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.invitation_photos%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.invitation_photos WHERE id = p_photo_id;
  IF auth.uid() IS NULL OR NOT FOUND OR NOT public.is_wedding_manager(p.wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.invitation_photos WHERE id = p_photo_id;
  RETURN p.storage_path;
END $$;

-- Snapshot of the current draft (content, photos, links, events).
CREATE OR REPLACE FUNCTION public.invitation_snapshot(p_invitation_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'title', i.title, 'message', i.message,
    'cover', (SELECT storage_path FROM public.invitation_photos WHERE id = i.cover_photo_id),
    'photos', coalesce((SELECT jsonb_agg(storage_path ORDER BY created_at, id) FROM public.invitation_photos WHERE invitation_id = i.id), '[]'::jsonb),
    'links', coalesce((SELECT jsonb_agg(jsonb_build_object('side', l.side, 'enabled', l.enabled, 'event_ids', to_jsonb(l.event_ids)) ORDER BY l.side) FROM public.invitation_links l WHERE l.invitation_id = i.id), '[]'::jsonb),
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'side', e.side, 'date', e.event_date, 'time', to_char(e.event_time, 'HH24:MI'), 'venue', e.venue, 'address', e.address) ORDER BY e.event_date NULLS LAST, e.created_at) FROM public.events e WHERE e.wedding_id = i.wedding_id), '[]'::jsonb))
  FROM public.invitations i WHERE i.id = p_invitation_id
$$;

CREATE OR REPLACE FUNCTION public.save_invitation_revision(p_wedding_id uuid, p_note text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); iid uuid; snap jsonb; last public.invitation_revisions%ROWTYPE; n integer;
BEGIN
  IF uid IS NULL OR NOT public.is_wedding_manager(p_wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  iid := public.ensure_invitation(p_wedding_id);
  PERFORM 1 FROM public.invitations WHERE id = iid FOR UPDATE;
  snap := public.invitation_snapshot(iid);
  SELECT * INTO last FROM public.invitation_revisions WHERE invitation_id = iid ORDER BY revision DESC LIMIT 1;
  IF FOUND AND last.snapshot = snap THEN RETURN jsonb_build_object('revision', last.revision, 'unchanged', true); END IF;
  n := coalesce(last.revision, 0) + 1;
  INSERT INTO public.invitation_revisions (wedding_id, invitation_id, revision, kind, note, snapshot, created_by) VALUES (p_wedding_id, iid, n, 'saved', left(coalesce(p_note,''),200), snap, uid);
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail) VALUES (p_wedding_id, uid, 'invitation.revision_saved', jsonb_build_object('revision', n));
  RETURN jsonb_build_object('revision', n, 'unchanged', false);
END $$;

CREATE OR REPLACE FUNCTION public.has_valid_entitlement(p_wedding_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.wedding_entitlements WHERE wedding_id = p_wedding_id AND paid_at <= now() AND expires_at > now())
$$;

-- Readiness of one link inside a snapshot: every chosen Event exists with date, time, venue and address.
CREATE OR REPLACE FUNCTION public.snapshot_link_ready(p_snap jsonb, p_side text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce((
    SELECT (l->>'enabled')::boolean AND jsonb_array_length(l->'event_ids') > 0 AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(l->'event_ids') eid
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_snap->'events') e WHERE e->>'id' = eid
        AND coalesce(e->>'date','') <> '' AND coalesce(e->>'time','') <> '' AND btrim(coalesce(e->>'venue','')) <> '' AND btrim(coalesce(e->>'address','')) <> ''))
    FROM jsonb_array_elements(p_snap->'links') l WHERE l->>'side' = p_side LIMIT 1), false)
$$;

-- Publishing requires a server-verified entitlement. No entitlement is ever created client-side.
CREATE OR REPLACE FUNCTION public.publish_invitation(p_wedding_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); iid uuid; snap jsonb; n integer; rid uuid;
BEGIN
  IF uid IS NULL OR NOT public.is_wedding_manager(p_wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_valid_entitlement(p_wedding_id) THEN RAISE EXCEPTION 'entitlement required' USING ERRCODE = 'P0001'; END IF;
  iid := public.ensure_invitation(p_wedding_id);
  PERFORM 1 FROM public.invitations WHERE id = iid FOR UPDATE;
  snap := public.invitation_snapshot(iid);
  IF NOT (public.snapshot_link_ready(snap,'chung') OR public.snapshot_link_ready(snap,'nha-trai') OR public.snapshot_link_ready(snap,'nha-gai')) THEN
    RAISE EXCEPTION 'no ready link' USING ERRCODE = 'P0001'; END IF;
  n := coalesce((SELECT max(revision) FROM public.invitation_revisions WHERE invitation_id = iid), 0) + 1;
  INSERT INTO public.invitation_revisions (wedding_id, invitation_id, revision, kind, snapshot, created_by) VALUES (p_wedding_id, iid, n, 'published', snap, uid) RETURNING id INTO rid;
  UPDATE public.invitations SET published_revision_id = rid, published_at = now() WHERE id = iid;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail) VALUES (p_wedding_id, uid, 'invitation.published', jsonb_build_object('revision', n));
  RETURN jsonb_build_object('revision', n);
END $$;

-- Public read-only projection of the PUBLISHED revision. Any failing gate returns the same neutral closed value.
CREATE OR REPLACE FUNCTION public.public_invitation(p_token text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.invitation_links%ROWTYPE; i public.invitations%ROWTYPE; snap jsonb; closed jsonb := '{"open":false}'::jsonb; lk jsonb;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN closed; END IF;
  SELECT * INTO l FROM public.invitation_links WHERE token = p_token;
  IF NOT FOUND OR NOT l.enabled THEN RETURN closed; END IF;
  SELECT * INTO i FROM public.invitations WHERE id = l.invitation_id;
  IF i.published_revision_id IS NULL OR NOT public.has_valid_entitlement(i.wedding_id) THEN RETURN closed; END IF;
  SELECT snapshot INTO snap FROM public.invitation_revisions WHERE id = i.published_revision_id;
  IF snap IS NULL OR NOT public.snapshot_link_ready(snap, l.side) THEN RETURN closed; END IF;
  SELECT x INTO lk FROM jsonb_array_elements(snap->'links') x WHERE x->>'side' = l.side LIMIT 1;
  RETURN jsonb_build_object('open', true, 'side', l.side, 'title', snap->'title', 'message', snap->'message', 'cover', snap->'cover', 'photos', snap->'photos',
    'events', (SELECT coalesce(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements(snap->'events') e WHERE (lk->'event_ids') ? (e->>'id')));
END $$;

REVOKE ALL ON FUNCTION public.check_link_events(), public.enforce_photo_limit(), public.invitation_snapshot(uuid), public.snapshot_link_ready(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_invitation(uuid), public.register_invitation_photo(uuid, text), public.remove_invitation_photo(uuid), public.save_invitation_revision(uuid, text), public.publish_invitation(uuid), public.has_valid_entitlement(uuid), public.photo_slot_available(text), public.can_manage_photo_path(text), public.public_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_invitation(uuid), public.register_invitation_photo(uuid, text), public.remove_invitation_photo(uuid), public.save_invitation_revision(uuid, text), public.publish_invitation(uuid), public.has_valid_entitlement(uuid), public.photo_slot_available(text), public.can_manage_photo_path(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_invitation(text) TO anon, authenticated, service_role;

-- Storage: private bucket; only managers of the wedding in the path's first folder; strict path; 50-object cap; no overwrite (no UPDATE policy).
CREATE POLICY "invitation photos: managers read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'invitation-photos' AND public.can_manage_photo_path(name));
CREATE POLICY "invitation photos: managers upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invitation-photos' AND public.can_manage_photo_path(name) AND public.photo_slot_available(split_part(name, '/', 1)));
CREATE POLICY "invitation photos: managers delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'invitation-photos' AND public.can_manage_photo_path(name));
