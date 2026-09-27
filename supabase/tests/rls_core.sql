-- Phase 3 slice 1 RLS / transaction verification. Runs inside one transaction and ROLLS BACK.
-- Usage (after creating the test accounts): psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_core.sql
BEGIN;
SET LOCAL client_min_messages = notice;

CREATE TEMP TABLE t_ids (k text PRIMARY KEY, v uuid);
GRANT ALL ON t_ids TO authenticated;
-- Requires three confirmed accounts rlstest-{a,b,c}@example.test (created via the Auth admin API before running).
INSERT INTO t_ids SELECT split_part(split_part(email,'@',1),'-',2), id FROM auth.users WHERE email IN ('rlstest-a@example.test','rlstest-b@example.test','rlstest-c@example.test');

CREATE OR REPLACE FUNCTION pg_temp.act(k text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT v FROM t_ids WHERE t_ids.k = act.k), 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT cond THEN RAISE EXCEPTION 'FAIL: %', label; END IF; RAISE NOTICE 'PASS: %', label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.fails(sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PASS: % (%)', label, SQLERRM; RETURN; END;
  RAISE EXCEPTION 'FAIL: % did not error', label;
END $$;

-- profiles created by signup trigger
SELECT pg_temp.ok((SELECT count(*) FROM public.profiles WHERE email LIKE 'rlstest-%') = 3, 'profile trigger');

-- A creates wedding; retry returns same id
SELECT pg_temp.act('a');
CREATE TEMP TABLE IF NOT EXISTS t_w (k text, v uuid);
INSERT INTO t_ids SELECT 'wa', public.create_wedding_draft('Lan', 'Minh', NULL, 'Lễ cưới');
SELECT pg_temp.ok(public.create_wedding_draft('X', 'Y', NULL, 'Z') = (SELECT v FROM t_ids WHERE k = 'wa'), 'duplicate create returns same wedding');
SELECT pg_temp.ok((SELECT count(*) FROM public.weddings) = 1, 'A sees exactly one wedding');
SELECT pg_temp.ok((SELECT count(*) FROM public.events) = 1, 'first event created');
RESET ROLE;

-- C creates own wedding
SELECT pg_temp.act('c');
INSERT INTO t_ids SELECT 'wc', public.create_wedding_draft('Hoa', 'Nam', NULL, 'Tiệc');
SELECT pg_temp.ok((SELECT count(*) FROM public.weddings) = 1, 'C sees only own wedding');
SELECT pg_temp.ok((SELECT count(*) FROM public.events WHERE wedding_id = (SELECT v FROM t_ids WHERE k = 'wa')) = 0, 'C cannot read A events by id');
SELECT pg_temp.fails(format('INSERT INTO public.events (wedding_id, name) VALUES (%L, %L)', (SELECT v FROM t_ids WHERE k = 'wa'), 'hack'), 'C cannot insert into A wedding');
UPDATE public.events SET name = 'hacked' WHERE wedding_id = (SELECT v FROM t_ids WHERE k = 'wa');
SELECT pg_temp.fails(format('SELECT public.create_partner_invite(%L, %L)', (SELECT v FROM t_ids WHERE k = 'wa'), 'x@example.test'), 'C cannot invite into A wedding');
SELECT pg_temp.fails('INSERT INTO public.audit_log (wedding_id, action) SELECT v, ''forged'' FROM t_ids WHERE k = ''wc''', 'audit log not insertable by client');
SELECT pg_temp.fails('DELETE FROM public.audit_log', 'audit log not deletable by client');
SELECT pg_temp.fails('INSERT INTO public.wedding_memberships (wedding_id, user_id) SELECT (SELECT v FROM t_ids WHERE k=''wa''), (SELECT v FROM t_ids WHERE k=''c'')', 'no direct membership insert');
SELECT pg_temp.fails('UPDATE public.weddings SET created_by = (SELECT v FROM t_ids WHERE k=''a'')', 'created_by not client-updatable');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*) FROM public.events WHERE name = 'hacked') = 0, 'cross-wedding update affected 0 rows');

-- A cannot move own event into C wedding
SELECT pg_temp.act('a');
SELECT pg_temp.fails(format('UPDATE public.events SET wedding_id = %L', (SELECT v FROM t_ids WHERE k = 'wc')), 'cannot move row to another wedding');
SELECT pg_temp.fails('SELECT public.remove_manager((SELECT id FROM public.wedding_memberships LIMIT 1))', 'last manager cannot remove self');
-- invite B
CREATE TEMP TABLE t_tok AS SELECT * FROM public.create_partner_invite((SELECT v FROM t_ids WHERE k = 'wa'), 'RLSTEST-B@example.test');
SELECT pg_temp.fails(format('SELECT public.create_partner_invite(%L, %L)', (SELECT v FROM t_ids WHERE k = 'wa'), 'third@example.test'), 'no third slot while invite pending');
RESET ROLE;

-- B pending: zero data access; wrong user cannot accept
SELECT pg_temp.act('b');
SELECT pg_temp.ok((SELECT count(*) FROM public.weddings) = 0 AND (SELECT count(*) FROM public.events) = 0 AND (SELECT count(*) FROM public.wedding_invites) = 0, 'pending invitee has zero data access');
RESET ROLE;
SELECT pg_temp.act('c');
SELECT pg_temp.fails('SELECT public.accept_partner_invite((SELECT token FROM t_tok))', 'other email cannot accept');
RESET ROLE;
SELECT pg_temp.act('b');
SELECT pg_temp.ok((SELECT email_matches FROM public.inspect_invite((SELECT token FROM t_tok))), 'invitee email matches');
SELECT pg_temp.ok(public.accept_partner_invite((SELECT token FROM t_tok)) = (SELECT v FROM t_ids WHERE k = 'wa'), 'B accepts');
SELECT pg_temp.ok((SELECT count(*) FROM public.events) = 1, 'B now reads events');
UPDATE public.events SET venue = 'Nhà hàng B' WHERE wedding_id = (SELECT v FROM t_ids WHERE k = 'wa');
SELECT pg_temp.ok((SELECT count(*) FROM public.events WHERE venue = 'Nhà hàng B') = 1, 'B has equal write rights');
SELECT pg_temp.ok((SELECT count(*) FROM public.wedding_memberships) = 2, 'two managers');
RESET ROLE;

-- A: no more slots; B removes A (allowed, leaves one); B cannot remove self now
SELECT pg_temp.act('a');
SELECT pg_temp.fails(format('SELECT public.create_partner_invite(%L, %L)', (SELECT v FROM t_ids WHERE k = 'wa'), 'third@example.test'), 'no third manager');
RESET ROLE;
SELECT pg_temp.act('b');
SELECT public.remove_manager((SELECT id FROM public.wedding_memberships WHERE user_id = (SELECT v FROM t_ids WHERE k = 'a')));
SELECT pg_temp.fails('SELECT public.remove_manager((SELECT id FROM public.wedding_memberships LIMIT 1))', 'cannot leave zero managers');
SELECT pg_temp.ok((SELECT count(*) FROM public.audit_log WHERE action IN ('invite.created','membership.added','membership.removed')) >= 4, 'membership changes audited');
RESET ROLE;
SELECT pg_temp.act('a');
SELECT pg_temp.ok((SELECT count(*) FROM public.weddings) = 0, 'removed manager loses access');
RESET ROLE;

-- anon has nothing
SET LOCAL ROLE anon;
SELECT pg_temp.fails('SELECT count(*) FROM public.weddings', 'anon cannot read weddings');
SELECT pg_temp.fails('SELECT public.create_wedding_draft(''a'',''b'',NULL,''c'')', 'anon cannot call RPC');
RESET ROLE;

-- expired / revoked invites
SELECT pg_temp.act('c');
CREATE TEMP TABLE t_tok2 AS SELECT * FROM public.create_partner_invite((SELECT v FROM t_ids WHERE k = 'wc'), 'late@example.test');
SELECT public.revoke_partner_invite((SELECT invite_id FROM t_tok2));
SELECT pg_temp.ok((SELECT status FROM public.inspect_invite((SELECT token FROM t_tok2))) = 'revoked', 'revoked invite reported');
RESET ROLE;
UPDATE public.wedding_invites SET status = 'pending', expires_at = now() - interval '1 minute' WHERE id = (SELECT invite_id FROM t_tok2);
SELECT pg_temp.act('c');
SELECT pg_temp.ok((SELECT status FROM public.inspect_invite((SELECT token FROM t_tok2))) = 'expired', 'expired invite reported');
RESET ROLE;

ROLLBACK;
