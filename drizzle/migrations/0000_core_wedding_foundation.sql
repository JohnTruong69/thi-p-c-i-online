-- Phase 3 slice 1: core wedding foundation (auth-backed, membership-scoped RLS)

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '' CHECK (char_length(display_name) <= 80),
  email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.weddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT, -- metadata only, never a privilege
  partner_one_name text NOT NULL CHECK (char_length(btrim(partner_one_name)) BETWEEN 1 AND 60),
  partner_two_name text NOT NULL CHECK (char_length(btrim(partner_two_name)) BETWEEN 1 AND 60),
  planned_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wedding_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'manager' CHECK (role = 'manager'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wedding_id, user_id)
);

CREATE TABLE public.wedding_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND char_length(email) <= 255),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wedding_invites_wedding_idx ON public.wedding_invites (wedding_id, status);

CREATE TABLE public.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_wedding_idx ON public.audit_log (wedding_id, created_at DESC);

CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  side text NOT NULL DEFAULT 'chung' CHECK (side IN ('chung','nha-trai','nha-gai')),
  event_date date,
  event_time time,
  venue text CHECK (venue IS NULL OR char_length(venue) <= 120),
  address text CHECK (address IS NULL OR char_length(address) <= 240),
  status text NOT NULL DEFAULT 'tentative' CHECK (status IN ('tentative','confirmed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, wedding_id),
  CHECK (status = 'tentative' OR (event_date IS NOT NULL AND event_time IS NOT NULL AND coalesce(btrim(venue),'') <> '' AND coalesce(btrim(address),'') <> ''))
);
CREATE INDEX events_wedding_idx ON public.events (wedding_id);

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  event_id uuid,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  due_date date,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','waiting','done')),
  kind text NOT NULL DEFAULT 'standard' CHECK (kind IN ('standard','table-count')),
  planned_tables integer CHECK (planned_tables IS NULL OR planned_tables >= 0),
  reserve_tables integer CHECK (reserve_tables IS NULL OR reserve_tables >= 0),
  outcome text CHECK (outcome IS NULL OR char_length(outcome) <= 500),
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','suggested')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (event_id, wedding_id) REFERENCES public.events(id, wedding_id) ON DELETE SET NULL (event_id),
  CHECK (kind = 'table-count' OR (planned_tables IS NULL AND reserve_tables IS NULL))
);
CREATE INDEX tasks_wedding_idx ON public.tasks (wedding_id);

CREATE TABLE public.budget_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  event_id uuid,
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 120),
  category text NOT NULL DEFAULT 'khac' CHECK (char_length(category) <= 40),
  estimate_vnd bigint NOT NULL DEFAULT 0 CHECK (estimate_vnd >= 0),
  agreed_vnd bigint CHECK (agreed_vnd IS NULL OR agreed_vnd >= 0),
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, wedding_id),
  FOREIGN KEY (event_id, wedding_id) REFERENCES public.events(id, wedding_id) ON DELETE SET NULL (event_id)
);
CREATE INDEX budget_items_wedding_idx ON public.budget_items (wedding_id);

CREATE TABLE public.budget_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  budget_item_id uuid NOT NULL,
  due_date date,
  amount_vnd bigint NOT NULL CHECK (amount_vnd > 0),
  paid_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (budget_item_id, wedding_id) REFERENCES public.budget_items(id, wedding_id) ON DELETE CASCADE
);
CREATE INDEX budget_installments_wedding_idx ON public.budget_installments (wedding_id);

CREATE TABLE public.guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  phone text CHECK (phone IS NULL OR char_length(phone) <= 30), -- text keeps leading zero
  side text NOT NULL DEFAULT 'chung' CHECK (side IN ('chung','nha-trai','nha-gai')),
  party_size integer NOT NULL DEFAULT 1 CHECK (party_size BETWEEN 1 AND 50),
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, wedding_id)
);
CREATE INDEX guests_wedding_idx ON public.guests (wedding_id);

CREATE TABLE public.guest_event_assignments (
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL,
  event_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guest_id, event_id),
  FOREIGN KEY (guest_id, wedding_id) REFERENCES public.guests(id, wedding_id) ON DELETE CASCADE,
  FOREIGN KEY (event_id, wedding_id) REFERENCES public.events(id, wedding_id) ON DELETE CASCADE
);
CREATE INDEX gea_wedding_idx ON public.guest_event_assignments (wedding_id);

-- ============ Helpers ============
CREATE OR REPLACE FUNCTION public.is_wedding_manager(_wedding_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.wedding_memberships m
    WHERE m.wedding_id = _wedding_id AND m.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.shares_wedding_with(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.wedding_memberships a JOIN public.wedding_memberships b ON a.wedding_id = b.wedding_id
    WHERE a.user_id = auth.uid() AND b.user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.forbid_wedding_move()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.wedding_id IS DISTINCT FROM OLD.wedding_id THEN
    RAISE EXCEPTION 'wedding_id is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.forbid_wedding_owner_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'created_by is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_two_managers()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM public.weddings WHERE id = NEW.wedding_id FOR UPDATE;
  IF (SELECT count(*) FROM public.wedding_memberships WHERE wedding_id = NEW.wedding_id) >= 2 THEN
    RAISE EXCEPTION 'A wedding has at most two managers' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER memberships_max_two BEFORE INSERT ON public.wedding_memberships FOR EACH ROW EXECUTE FUNCTION public.enforce_two_managers();
CREATE TRIGGER weddings_owner_immutable BEFORE UPDATE ON public.weddings FOR EACH ROW EXECUTE FUNCTION public.forbid_wedding_owner_change();
CREATE TRIGGER weddings_touch BEFORE UPDATE ON public.weddings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['events','tasks','budget_items','budget_installments','guests','guest_event_assignments','wedding_invites'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.forbid_wedding_move()', t || '_no_move', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['events','tasks','budget_items','budget_installments','guests','wedding_invites'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t || '_touch', t);
  END LOOP;
END $$;

-- Profile row on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, lower(coalesce(NEW.email, '')), left(coalesce(NEW.raw_user_meta_data->>'display_name', ''), 80))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ Grants ============
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, UPDATE ON public.weddings TO authenticated;
GRANT SELECT ON public.wedding_memberships TO authenticated;
GRANT SELECT ON public.wedding_invites TO authenticated;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events, public.tasks, public.budget_items, public.budget_installments, public.guests, public.guest_event_assignments TO authenticated;
GRANT ALL ON public.profiles, public.weddings, public.wedding_memberships, public.wedding_invites, public.audit_log, public.events, public.tasks, public.budget_items, public.budget_installments, public.guests, public.guest_event_assignments TO service_role;
-- display_name is the only client-editable profile column
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name) ON public.profiles TO authenticated;
-- created_by/status are server-managed on weddings
REVOKE UPDATE ON public.weddings FROM authenticated;
GRANT UPDATE (partner_one_name, partner_two_name, planned_date) ON public.weddings TO authenticated;

-- ============ RLS ============
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wedding_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wedding_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_event_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: read self or co-manager" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.shares_wedding_with(id));
CREATE POLICY "profiles: update self" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "weddings: managers read" ON public.weddings FOR SELECT TO authenticated USING (public.is_wedding_manager(id));
CREATE POLICY "weddings: managers update" ON public.weddings FOR UPDATE TO authenticated
  USING (public.is_wedding_manager(id)) WITH CHECK (public.is_wedding_manager(id));

CREATE POLICY "memberships: managers read" ON public.wedding_memberships FOR SELECT TO authenticated USING (public.is_wedding_manager(wedding_id));
CREATE POLICY "invites: managers read" ON public.wedding_invites FOR SELECT TO authenticated USING (public.is_wedding_manager(wedding_id));
CREATE POLICY "audit: managers read" ON public.audit_log FOR SELECT TO authenticated USING (public.is_wedding_manager(wedding_id));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['events','tasks','budget_items','budget_installments','guests','guest_event_assignments'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_wedding_manager(wedding_id))', t || ': managers read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_wedding_manager(wedding_id))', t || ': managers insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_wedding_manager(wedding_id)) WITH CHECK (public.is_wedding_manager(wedding_id))', t || ': managers update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_wedding_manager(wedding_id))', t || ': managers delete', t);
  END LOOP;
END $$;

-- ============ Transactional RPCs ============
CREATE OR REPLACE FUNCTION public.create_wedding_draft(
  p_partner_one text, p_partner_two text, p_planned_date date,
  p_event_name text, p_event_side text DEFAULT 'chung', p_event_date date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); wid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  -- serialize per user so double-clicks / retries / other tabs never create two drafts
  PERFORM pg_advisory_xact_lock(hashtextextended('wedding-draft:' || uid::text, 0));
  SELECT wedding_id INTO wid FROM public.wedding_memberships WHERE user_id = uid ORDER BY created_at LIMIT 1;
  IF wid IS NOT NULL THEN RETURN wid; END IF;
  INSERT INTO public.weddings (created_by, partner_one_name, partner_two_name, planned_date)
    VALUES (uid, btrim(p_partner_one), btrim(p_partner_two), p_planned_date) RETURNING id INTO wid;
  INSERT INTO public.wedding_memberships (wedding_id, user_id) VALUES (wid, uid);
  INSERT INTO public.events (wedding_id, name, side, event_date, status)
    VALUES (wid, btrim(p_event_name), coalesce(p_event_side, 'chung'), p_event_date, 'tentative');
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail) VALUES (wid, uid, 'wedding.created', '{}'::jsonb);
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail) VALUES (wid, uid, 'membership.added', jsonb_build_object('user_id', uid, 'via', 'creator'));
  RETURN wid;
END $$;

CREATE OR REPLACE FUNCTION public.create_partner_invite(p_wedding_id uuid, p_email text)
RETURNS TABLE (invite_id uuid, token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); em text := lower(btrim(p_email)); tok text; iid uuid; exp timestamptz := now() + interval '7 days'; my_email text;
BEGIN
  IF uid IS NULL OR NOT public.is_wedding_manager(p_wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.weddings WHERE id = p_wedding_id FOR UPDATE;
  UPDATE public.wedding_invites SET status = 'expired' WHERE wedding_id = p_wedding_id AND status = 'pending' AND wedding_invites.expires_at <= now();
  SELECT lower(email) INTO my_email FROM auth.users WHERE id = uid;
  IF em IS NULL OR em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'invalid email' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.wedding_memberships m JOIN auth.users u ON u.id = m.user_id WHERE m.wedding_id = p_wedding_id AND lower(u.email) = em) THEN
    RAISE EXCEPTION 'already a manager' USING ERRCODE = 'P0001'; END IF;
  IF (SELECT count(*) FROM public.wedding_memberships WHERE wedding_id = p_wedding_id)
     + (SELECT count(*) FROM public.wedding_invites WHERE wedding_id = p_wedding_id AND status = 'pending') >= 2 THEN
    RAISE EXCEPTION 'no free slot' USING ERRCODE = 'P0001'; END IF;
  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.wedding_invites (wedding_id, email, token_hash, invited_by, expires_at)
    VALUES (p_wedding_id, em, encode(sha256(convert_to(tok, 'UTF8')), 'hex'), uid, exp) RETURNING id INTO iid;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail) VALUES (p_wedding_id, uid, 'invite.created', jsonb_build_object('invite_id', iid, 'email', em));
  RETURN QUERY SELECT iid, tok, exp;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_partner_invite(p_invite_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); wid uuid;
BEGIN
  SELECT wedding_id INTO wid FROM public.wedding_invites WHERE id = p_invite_id FOR UPDATE;
  IF uid IS NULL OR wid IS NULL OR NOT public.is_wedding_manager(wid) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.wedding_invites SET status = 'revoked' WHERE id = p_invite_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'invite is not pending' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail) VALUES (wid, uid, 'invite.revoked', jsonb_build_object('invite_id', p_invite_id));
END $$;

-- Pending invitees get no wedding data: only the invite state and whether the signed-in email matches.
CREATE OR REPLACE FUNCTION public.inspect_invite(p_token text)
RETURNS TABLE (status text, email_matches boolean, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.wedding_invites%ROWTYPE; my_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.wedding_invites WHERE token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text, false, NULL::timestamptz; RETURN; END IF;
  SELECT lower(email) INTO my_email FROM auth.users WHERE id = auth.uid();
  RETURN QUERY SELECT CASE WHEN r.status = 'pending' AND r.expires_at <= now() THEN 'expired' ELSE r.status END, (my_email = r.email), r.expires_at;
END $$;

CREATE OR REPLACE FUNCTION public.accept_partner_invite(p_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r public.wedding_invites%ROWTYPE; u record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.wedding_invites WHERE token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM 1 FROM public.weddings WHERE id = r.wedding_id FOR UPDATE;
  IF r.status = 'pending' AND r.expires_at <= now() THEN
    UPDATE public.wedding_invites SET status = 'expired' WHERE id = r.id;
    INSERT INTO public.audit_log (wedding_id, actor_id, action, detail) VALUES (r.wedding_id, uid, 'invite.expired', jsonb_build_object('invite_id', r.id));
    RETURN NULL;
  END IF;
  IF r.status = 'accepted' AND r.accepted_by = uid THEN RETURN r.wedding_id; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'invite is %', r.status USING ERRCODE = 'P0001'; END IF;
  SELECT email, email_confirmed_at INTO u FROM auth.users WHERE id = uid;
  IF u.email_confirmed_at IS NULL OR lower(u.email) <> r.email THEN RAISE EXCEPTION 'email mismatch' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.wedding_memberships WHERE user_id = uid) THEN RAISE EXCEPTION 'already manages a wedding' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.wedding_memberships (wedding_id, user_id) VALUES (r.wedding_id, uid);
  UPDATE public.wedding_invites SET status = 'accepted', accepted_by = uid WHERE id = r.id;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail) VALUES (r.wedding_id, uid, 'membership.added', jsonb_build_object('user_id', uid, 'via', 'invite', 'invite_id', r.id));
  RETURN r.wedding_id;
END $$;

CREATE OR REPLACE FUNCTION public.remove_manager(p_membership_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); m public.wedding_memberships%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.wedding_memberships WHERE id = p_membership_id;
  IF uid IS NULL OR NOT FOUND OR NOT public.is_wedding_manager(m.wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.weddings WHERE id = m.wedding_id FOR UPDATE;
  IF (SELECT count(*) FROM public.wedding_memberships WHERE wedding_id = m.wedding_id) <= 1 THEN
    RAISE EXCEPTION 'last manager cannot be removed' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM public.wedding_memberships WHERE id = p_membership_id;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail) VALUES (m.wedding_id, uid, 'membership.removed', jsonb_build_object('user_id', m.user_id, 'self', m.user_id = uid));
END $$;

REVOKE ALL ON FUNCTION public.is_wedding_manager(uuid), public.shares_wedding_with(uuid), public.create_wedding_draft(text,text,date,text,text,date),
  public.create_partner_invite(uuid,text), public.revoke_partner_invite(uuid), public.inspect_invite(text), public.accept_partner_invite(text), public.remove_manager(uuid),
  public.handle_new_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_wedding_manager(uuid), public.shares_wedding_with(uuid), public.create_wedding_draft(text,text,date,text,text,date),
  public.create_partner_invite(uuid,text), public.revoke_partner_invite(uuid), public.inspect_invite(text), public.accept_partner_invite(text), public.remove_manager(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;
