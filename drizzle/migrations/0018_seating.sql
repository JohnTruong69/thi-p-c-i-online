-- 0018: Seating chart (xếp bàn tiệc) per event.
-- Tables belong to one event; guest_event_assignments.table_id points at the guest's table.

CREATE TABLE public.seating_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  capacity integer NOT NULL DEFAULT 10 CHECK (capacity BETWEEN 1 AND 50),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX seating_tables_event_idx ON public.seating_tables (event_id);

ALTER TABLE public.guest_event_assignments
  ADD COLUMN table_id uuid REFERENCES public.seating_tables(id) ON DELETE SET NULL;
CREATE INDEX gea_table_idx ON public.guest_event_assignments (table_id);

ALTER TABLE public.seating_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seating_tables: managers read" ON public.seating_tables FOR SELECT TO authenticated
  USING (public.is_wedding_manager(wedding_id));
CREATE POLICY "seating_tables: managers insert" ON public.seating_tables FOR INSERT TO authenticated
  WITH CHECK (public.is_wedding_manager(wedding_id));
CREATE POLICY "seating_tables: managers update" ON public.seating_tables FOR UPDATE TO authenticated
  USING (public.is_wedding_manager(wedding_id)) WITH CHECK (public.is_wedding_manager(wedding_id));
CREATE POLICY "seating_tables: managers delete" ON public.seating_tables FOR DELETE TO authenticated
  USING (public.is_wedding_manager(wedding_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seating_tables TO authenticated;
GRANT ALL ON public.seating_tables TO service_role;

-- No anon access: seating is private planning data.
REVOKE ALL ON public.seating_tables FROM anon;
