-- Phase 3 slice 2b: per-Event guest status + CSV batch provenance, atomic RPCs.
ALTER TABLE public.guest_event_assignments
  ADD COLUMN invite_status text NOT NULL DEFAULT 'not_sent' CHECK (invite_status IN ('not_sent','sent')),
  ADD COLUMN rsvp_status text NOT NULL DEFAULT 'pending' CHECK (rsvp_status IN ('pending','attending','declined')),
  ADD COLUMN attending_count integer CHECK (attending_count IS NULL OR attending_count BETWEEN 1 AND 50),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.guest_event_assignments
  ADD CONSTRAINT gea_count_only_when_attending CHECK (attending_count IS NULL OR rsvp_status = 'attending');
CREATE TRIGGER guest_event_assignments_touch BEFORE UPDATE ON public.guest_event_assignments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS gea_event_idx ON public.guest_event_assignments (event_id);

CREATE TABLE public.guest_import_batches (
  id uuid PRIMARY KEY,
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  created_by uuid,
  filename text NOT NULL DEFAULT '' CHECK (char_length(filename) <= 200),
  event_ids uuid[] NOT NULL DEFAULT '{}',
  added_count integer NOT NULL DEFAULT 0 CHECK (added_count >= 0),
  skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  invalid_count integer NOT NULL DEFAULT 0 CHECK (invalid_count >= 0),
  undone_at timestamptz,
  undo_removed integer,
  undo_kept integer,
  undo_missing integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, wedding_id)
);
CREATE INDEX guest_import_batches_wedding_idx ON public.guest_import_batches (wedding_id, created_at DESC);

CREATE TABLE public.guest_import_rows (
  batch_id uuid NOT NULL,
  wedding_id uuid NOT NULL,
  source_row integer NOT NULL CHECK (source_row >= 1),
  guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL,
  fingerprint text NOT NULL,
  PRIMARY KEY (batch_id, source_row),
  FOREIGN KEY (batch_id, wedding_id) REFERENCES public.guest_import_batches(id, wedding_id) ON DELETE CASCADE
);
CREATE INDEX guest_import_rows_guest_idx ON public.guest_import_rows (guest_id);

GRANT SELECT ON public.guest_import_batches, public.guest_import_rows TO authenticated;
GRANT ALL ON public.guest_import_batches, public.guest_import_rows TO service_role;
ALTER TABLE public.guest_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "import batches: managers read" ON public.guest_import_batches FOR SELECT TO authenticated USING (public.is_wedding_manager(wedding_id));
CREATE POLICY "import rows: managers read" ON public.guest_import_rows FOR SELECT TO authenticated USING (public.is_wedding_manager(wedding_id));

-- Fingerprint of a guest and all its per-Event fields; used to decide whether Undo may remove it.
CREATE OR REPLACE FUNCTION public.guest_fingerprint(p_guest_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT md5(concat_ws('|', g.name, coalesce(g.phone,''), g.side, g.party_size::text, coalesce(g.note,''),
    coalesce((SELECT string_agg(a.event_id::text || ':' || a.invite_status || ':' || a.rsvp_status || ':' || coalesce(a.attending_count::text,''), ',' ORDER BY a.event_id)
      FROM public.guest_event_assignments a WHERE a.guest_id = g.id), '')))
  FROM public.guests g WHERE g.id = p_guest_id
$$;
REVOKE EXECUTE ON FUNCTION public.guest_fingerprint(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guest_fingerprint(uuid) TO authenticated;

-- Manual create/edit of one guest with its Event assignments in one transaction (runs as the caller; RLS applies).
CREATE OR REPLACE FUNCTION public.save_guest(p_wedding_id uuid, p_guest_id uuid, p_guest jsonb, p_assignments jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE gid uuid; x jsonb; ev uuid; keep uuid[] := '{}'; ph text := nullif(btrim(coalesce(p_guest->>'phone','')),'');
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
    IF (x->>'attending_count') IS NOT NULL AND (x->>'attending_count')::integer > (p_guest->>'party_size')::integer THEN RAISE EXCEPTION 'attending exceeds party' USING ERRCODE = '23514'; END IF;
    keep := keep || ev;
    INSERT INTO public.guest_event_assignments (wedding_id, guest_id, event_id, invite_status, rsvp_status, attending_count)
    VALUES (p_wedding_id, gid, ev, coalesce(x->>'invite_status','not_sent'), coalesce(x->>'rsvp_status','pending'), nullif(x->>'attending_count','')::integer)
    ON CONFLICT (guest_id, event_id) DO UPDATE SET invite_status = EXCLUDED.invite_status, rsvp_status = EXCLUDED.rsvp_status, attending_count = EXCLUDED.attending_count
      WHERE (guest_event_assignments.invite_status, guest_event_assignments.rsvp_status, guest_event_assignments.attending_count)
        IS DISTINCT FROM (EXCLUDED.invite_status, EXCLUDED.rsvp_status, EXCLUDED.attending_count);
  END LOOP;
  DELETE FROM public.guest_event_assignments WHERE guest_id = gid AND wedding_id = p_wedding_id AND NOT (event_id = ANY(keep));
  RETURN gid;
END $$;
REVOKE EXECUTE ON FUNCTION public.save_guest(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_guest(uuid, uuid, jsonb, jsonb) TO authenticated;

-- Atomic, idempotent CSV commit. The client-generated batch UUID is the request key; a repeat returns the first result.
CREATE OR REPLACE FUNCTION public.import_guest_batch(p_batch_id uuid, p_wedding_id uuid, p_filename text, p_event_ids uuid[], p_rows jsonb, p_skipped integer, p_invalid integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); b public.guest_import_batches%ROWTYPE; x jsonb; gid uuid; n integer := 0; ph text; ev uuid; sr integer; party integer; seen integer[] := '{}';
BEGIN
  IF uid IS NULL OR p_batch_id IS NULL OR NOT public.is_wedding_manager(p_wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('guest-import:' || p_batch_id::text, 0));
  SELECT * INTO b FROM public.guest_import_batches WHERE id = p_batch_id;
  IF FOUND THEN
    IF b.wedding_id <> p_wedding_id THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
    RETURN jsonb_build_object('batch_id', b.id, 'added', b.added_count, 'replay', true);
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN RAISE EXCEPTION 'no rows' USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(p_rows) > 1000 THEN RAISE EXCEPTION 'batch too large' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_skipped, -1) < 0 OR coalesce(p_invalid, -1) < 0 THEN RAISE EXCEPTION 'invalid counts' USING ERRCODE = '22023'; END IF;
  IF coalesce(array_length(p_event_ids, 1), 0) = 0 THEN RAISE EXCEPTION 'no events' USING ERRCODE = '22023'; END IF;
  FOREACH ev IN ARRAY p_event_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = ev AND wedding_id = p_wedding_id) THEN RAISE EXCEPTION 'event not in wedding' USING ERRCODE = '42501'; END IF;
  END LOOP;
  INSERT INTO public.guest_import_batches (id, wedding_id, created_by, filename, event_ids, skipped_count, invalid_count)
  VALUES (p_batch_id, p_wedding_id, uid, left(coalesce(p_filename,''), 200), (SELECT array_agg(DISTINCT e) FROM unnest(p_event_ids) e), p_skipped, p_invalid);
  FOR x IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    IF coalesce(x->>'decision','') <> 'add' THEN RAISE EXCEPTION 'invalid decision' USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(x->'source_row') <> 'number' OR jsonb_typeof(x->'party_size') <> 'number' THEN RAISE EXCEPTION 'invalid row' USING ERRCODE = '22023'; END IF;
    sr := (x->>'source_row')::integer; party := (x->>'party_size')::integer;
    IF (x->>'party_size')::numeric <> party OR party < 1 OR party > 50 THEN RAISE EXCEPTION 'invalid party size' USING ERRCODE = '23514'; END IF;
    IF sr = ANY(seen) THEN RAISE EXCEPTION 'duplicate source row' USING ERRCODE = '22023'; END IF;
    seen := seen || sr;
    IF coalesce(x->>'side','') NOT IN ('chung','nha-trai','nha-gai') THEN RAISE EXCEPTION 'invalid side' USING ERRCODE = '23514'; END IF;
    ph := nullif(btrim(coalesce(x->>'phone','')),'');
    IF ph IS NOT NULL AND regexp_replace(ph, '[\s.\-()]', '', 'g') !~ '^\+?[0-9]{8,15}$' THEN RAISE EXCEPTION 'invalid phone' USING ERRCODE = '23514'; END IF;
    INSERT INTO public.guests (wedding_id, name, phone, side, party_size) VALUES (p_wedding_id, btrim(x->>'name'), ph, x->>'side', party) RETURNING id INTO gid;
    INSERT INTO public.guest_event_assignments (wedding_id, guest_id, event_id) SELECT p_wedding_id, gid, e FROM unnest(p_event_ids) e GROUP BY e;
    INSERT INTO public.guest_import_rows (batch_id, wedding_id, source_row, guest_id, fingerprint) VALUES (p_batch_id, p_wedding_id, sr, gid, public.guest_fingerprint(gid));
    n := n + 1;
  END LOOP;
  UPDATE public.guest_import_batches SET added_count = n WHERE id = p_batch_id;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail) VALUES (p_wedding_id, uid, 'guests.imported', jsonb_build_object('batch_id', p_batch_id, 'added', n));
  RETURN jsonb_build_object('batch_id', p_batch_id, 'added', n, 'replay', false);
END $$;
REVOKE EXECUTE ON FUNCTION public.import_guest_batch(uuid, uuid, text, uuid[], jsonb, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_guest_batch(uuid, uuid, text, uuid[], jsonb, integer, integer) TO authenticated;

-- Safe Undo: removes only imported guests unchanged since import (same fingerprint, never updated, no per-Event edits).
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
      INTO changed FROM public.guests g WHERE g.id = r.guest_id;
    IF changed IS NULL THEN missing := missing + 1;
    ELSIF changed THEN kept := kept + 1;
    ELSE DELETE FROM public.guests WHERE id = r.guest_id AND wedding_id = b.wedding_id; removed := removed + 1; END IF;
  END LOOP;
  UPDATE public.guest_import_batches SET undone_at = now(), undo_removed = removed, undo_kept = kept, undo_missing = missing WHERE id = p_batch_id;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail) VALUES (b.wedding_id, uid, 'guests.import_undone', jsonb_build_object('batch_id', p_batch_id, 'removed', removed, 'kept', kept, 'missing', missing));
  RETURN jsonb_build_object('removed', removed, 'kept', kept, 'missing', missing, 'already', false);
END $$;
REVOKE EXECUTE ON FUNCTION public.undo_guest_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_guest_batch(uuid) TO authenticated;