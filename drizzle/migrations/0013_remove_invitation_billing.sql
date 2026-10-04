-- GĐ A4: Remove the invitation / public-RSVP / billing model.
-- The app is now free (affiliate monetisation); there is no paid entitlement,
-- no public invitation, no public RSVP and no trial/write-gate anymore.
--
-- Drops everything created by 0004 (invitation), 0005 (hardening),
-- 0006 (rsvp + 10MB), 0007 (rsvp receipt), 0008 (rsvp rate buckets),
-- 0010 (trial columns + access state) and 0012 (write gate), then repairs the
-- functions that referenced the dropped tables: undo_guest_batch (back to the
-- pre-RSVP version), export_wedding_data (no invitation/rsvp keys) and the
-- family-viewer module lists + viewer_projection (no 'rsvp' module).

-- ============ 1. Storage: policies, objects, bucket ============
DROP POLICY IF EXISTS "invitation photos: managers read" ON storage.objects;
DROP POLICY IF EXISTS "invitation photos: managers upload" ON storage.objects;
DROP POLICY IF EXISTS "invitation photos: managers delete" ON storage.objects;
DELETE FROM storage.objects WHERE bucket_id = 'invitation-photos';
DELETE FROM storage.buckets WHERE id = 'invitation-photos';

-- ============ 2. Triggers on RETAINED tables (0010, 0012) ============
-- Must go before the functions/tables they depend on; planner + guests stay writable.
DROP TRIGGER IF EXISTS a_write_gate ON public.events;
DROP TRIGGER IF EXISTS a_write_gate ON public.tasks;
DROP TRIGGER IF EXISTS a_write_gate ON public.budget_items;
DROP TRIGGER IF EXISTS a_write_gate ON public.budget_installments;
DROP TRIGGER IF EXISTS a_write_gate ON public.guests;
DROP TRIGGER IF EXISTS a_write_gate ON public.guest_event_assignments;
DROP TRIGGER IF EXISTS a_write_gate ON public.guest_import_batches;
DROP TRIGGER IF EXISTS a_write_gate ON public.guest_import_rows;
DROP TRIGGER IF EXISTS a_write_gate ON public.weddings;
DROP TRIGGER IF EXISTS a_write_gate ON public.wedding_invites;
DROP TRIGGER IF EXISTS a_write_gate ON public.wedding_viewer_invites;
DROP TRIGGER IF EXISTS a_write_gate ON public.wedding_viewers;
DROP TRIGGER IF EXISTS weddings_protect_trial_clock ON public.weddings;

-- ============ 3. Functions (invitation / rsvp / billing / write gate) ============
-- Invitation (0004, 0005)
DROP FUNCTION IF EXISTS public.check_link_events();
DROP FUNCTION IF EXISTS public.enforce_photo_limit();
DROP FUNCTION IF EXISTS public.ensure_invitation(uuid);
DROP FUNCTION IF EXISTS public.photo_slot_available(text);
DROP FUNCTION IF EXISTS public.can_manage_photo_path(text);
DROP FUNCTION IF EXISTS public.register_invitation_photo(uuid, text);
DROP FUNCTION IF EXISTS public.remove_invitation_photo(uuid);
DROP FUNCTION IF EXISTS public.invitation_snapshot(uuid);
DROP FUNCTION IF EXISTS public.save_invitation_revision(uuid, text);
DROP FUNCTION IF EXISTS public.has_valid_entitlement(uuid);
DROP FUNCTION IF EXISTS public.snapshot_link_ready(jsonb, text);
DROP FUNCTION IF EXISTS public.publish_invitation(uuid);
DROP FUNCTION IF EXISTS public.public_invitation(text);
DROP FUNCTION IF EXISTS public.public_invitation_photo_paths(text);
-- RSVP (0006, 0007, 0008)
DROP FUNCTION IF EXISTS public.rsvp_link_context(text);
DROP FUNCTION IF EXISTS public.rsvp_receipt_json(uuid);
DROP FUNCTION IF EXISTS public.submit_rsvp(text, uuid, text, text, text, jsonb, text);
DROP FUNCTION IF EXISTS public.get_rsvp_receipt(text, text);
DROP FUNCTION IF EXISTS public.reconcile_rsvp(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS public.unmatch_rsvp(uuid);
DROP FUNCTION IF EXISTS public.limit_rsvp_insert();
-- Trial / billing / write gate (0010, 0012)
DROP FUNCTION IF EXISTS public.protect_wedding_trial_clock();
DROP FUNCTION IF EXISTS public.wedding_write_allowed(uuid);
DROP FUNCTION IF EXISTS public.enforce_wedding_write_gate();
DROP FUNCTION IF EXISTS public.can_write_photo_path(text);
DROP FUNCTION IF EXISTS public.wedding_access_state_internal(uuid);
DROP FUNCTION IF EXISTS public.enable_wedding_write_gate(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.wedding_access_state(uuid);

-- ============ 4. Tables ============
DROP TABLE IF EXISTS public.rsvp_rate_buckets;
DROP TABLE IF EXISTS public.rsvp_answers;
DROP TABLE IF EXISTS public.rsvp_responses;
DROP TABLE IF EXISTS public.invitation_photos;
DROP TABLE IF EXISTS public.invitation_links;
DROP TABLE IF EXISTS public.invitation_revisions;
DROP TABLE IF EXISTS public.invitations;
DROP TABLE IF EXISTS public.wedding_entitlements;
DROP TABLE IF EXISTS public.wedding_write_gate;

-- ============ 5. Trial columns on weddings (0010) ============
ALTER TABLE public.weddings DROP COLUMN IF EXISTS trial_started_at;
ALTER TABLE public.weddings DROP COLUMN IF EXISTS trial_ends_at;
-- (weddings_trial_seven_days check drops automatically with its columns)

-- ============ 6. Repair: undo_guest_batch back to the pre-RSVP version (0003) ============
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

-- ============ 7. Repair: export_wedding_data without invitation/rsvp keys (0008) ============
CREATE OR REPLACE FUNCTION public.export_wedding_data(p_wedding_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); payload jsonb;
BEGIN
  IF uid IS NULL OR NOT public.is_wedding_manager(p_wedding_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'schema_version', 2, 'exported_at', now(),
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
    'deletion_requests', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb) FROM public.data_deletion_requests x WHERE x.wedding_id = p_wedding_id),
    'audit_log', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb) FROM public.audit_log x WHERE x.wedding_id = p_wedding_id)
  ) INTO payload;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail)
    VALUES (p_wedding_id, uid, 'data.exported', '{}'::jsonb);
  RETURN payload;
END $$;
REVOKE ALL ON FUNCTION public.export_wedding_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_wedding_data(uuid) TO authenticated;

-- ============ 8. Repair: family viewers lose the 'rsvp' module (0011) ============
-- Existing grants keep working: 'rsvp' is stripped, never leaving an empty module list.
UPDATE public.wedding_viewers
  SET modules = coalesce(nullif(array_remove(modules, 'rsvp'), '{}'), ARRAY['events'])
  WHERE 'rsvp' = ANY(modules);
UPDATE public.wedding_viewer_invites
  SET modules = coalesce(nullif(array_remove(modules, 'rsvp'), '{}'), ARRAY['events'])
  WHERE 'rsvp' = ANY(modules);
ALTER TABLE public.wedding_viewers DROP CONSTRAINT IF EXISTS wedding_viewers_modules_check;
ALTER TABLE public.wedding_viewers ADD CONSTRAINT wedding_viewers_modules_check
  CHECK (cardinality(modules) BETWEEN 1 AND 4 AND modules <@ ARRAY['events','tasks','budget','guests']::text[]);
ALTER TABLE public.wedding_viewer_invites DROP CONSTRAINT IF EXISTS wedding_viewer_invites_modules_check;
ALTER TABLE public.wedding_viewer_invites ADD CONSTRAINT wedding_viewer_invites_modules_check
  CHECK (cardinality(modules) BETWEEN 1 AND 4 AND modules <@ ARRAY['events','tasks','budget','guests']::text[]);

CREATE OR REPLACE FUNCTION public.create_viewer_invite(p_wedding_id uuid, p_email text, p_modules text[], p_sides text[])
RETURNS TABLE (invite_id uuid, token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); em text := lower(btrim(coalesce(p_email, ''))); tok text; iid uuid; exp timestamptz := now() + interval '7 days';
  mods text[]; sds text[];
BEGIN
  IF uid IS NULL OR NOT public.is_wedding_manager(p_wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.weddings WHERE id = p_wedding_id FOR UPDATE;
  IF em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'invalid email' USING ERRCODE = '22023'; END IF;
  mods := public.viewer_norm(p_modules, ARRAY['budget','events','guests','tasks']);
  sds := public.viewer_norm(p_sides, ARRAY['chung','nha-gai','nha-trai']);
  IF EXISTS (SELECT 1 FROM public.wedding_memberships m JOIN auth.users u ON u.id = m.user_id WHERE m.wedding_id = p_wedding_id AND lower(u.email) = em) THEN
    RAISE EXCEPTION 'already a manager' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.wedding_viewers WHERE wedding_id = p_wedding_id AND email = em AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'already a viewer' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.wedding_viewer_invites SET status = 'expired' WHERE wedding_id = p_wedding_id AND status = 'pending' AND wedding_viewer_invites.expires_at <= now();
  IF public.viewer_slots_used(p_wedding_id, em) >= 2 THEN RAISE EXCEPTION 'no viewer slot' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.wedding_viewer_invites SET status = 'revoked' WHERE wedding_id = p_wedding_id AND email = em AND status = 'pending';
  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.wedding_viewer_invites (wedding_id, email, token_hash, modules, sides, invited_by, expires_at)
    VALUES (p_wedding_id, em, encode(sha256(convert_to(tok, 'UTF8')), 'hex'), mods, sds, uid, exp) RETURNING id INTO iid;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail)
    VALUES (p_wedding_id, uid, 'viewer.invited', jsonb_build_object('invite_id', iid, 'email', em, 'modules', mods, 'sides', sds));
  RETURN QUERY SELECT iid, tok, exp;
END $$;

CREATE OR REPLACE FUNCTION public.update_viewer_grants(p_viewer_id uuid, p_modules text[], p_sides text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); v public.wedding_viewers%ROWTYPE; mods text[]; sds text[];
BEGIN
  SELECT * INTO v FROM public.wedding_viewers WHERE id = p_viewer_id FOR UPDATE;
  IF uid IS NULL OR NOT FOUND OR NOT public.is_wedding_manager(v.wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF v.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'viewer is revoked' USING ERRCODE = 'P0001'; END IF;
  mods := public.viewer_norm(p_modules, ARRAY['budget','events','guests','tasks']);
  sds := public.viewer_norm(p_sides, ARRAY['chung','nha-gai','nha-trai']);
  UPDATE public.wedding_viewers SET modules = mods, sides = sds WHERE id = p_viewer_id;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail)
    VALUES (v.wedding_id, uid, 'viewer.grants_changed', jsonb_build_object('viewer_id', v.id, 'modules', mods, 'sides', sds));
END $$;

-- Whitelisted, side/module-filtered read model. Never returns phone, notes, vendor or CSV provenance.
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
  RETURN res;
END $$;
