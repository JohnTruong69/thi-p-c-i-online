-- 0020: Email reminders (nhắc việc / nhắc buổi lễ).
-- reminder_prefs: one row per wedding (missing row = defaults ON).
-- reminder_log: dedupe so each (wedding, kind, ref, days_before, recipient) sends once.

CREATE TABLE public.reminder_prefs (
  wedding_id uuid PRIMARY KEY REFERENCES public.weddings(id) ON DELETE CASCADE,
  task_reminders boolean NOT NULL DEFAULT true,
  event_reminders boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('task', 'event')),
  ref_id text NOT NULL,
  days_before integer NOT NULL,
  recipient text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  error text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wedding_id, kind, ref_id, days_before, recipient)
);
CREATE INDEX reminder_log_wedding_idx ON public.reminder_log (wedding_id);

ALTER TABLE public.reminder_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reminder_prefs: managers read" ON public.reminder_prefs FOR SELECT TO authenticated
  USING (public.is_wedding_manager(wedding_id));
CREATE POLICY "reminder_prefs: managers insert" ON public.reminder_prefs FOR INSERT TO authenticated
  WITH CHECK (public.is_wedding_manager(wedding_id));
CREATE POLICY "reminder_prefs: managers update" ON public.reminder_prefs FOR UPDATE TO authenticated
  USING (public.is_wedding_manager(wedding_id)) WITH CHECK (public.is_wedding_manager(wedding_id));
CREATE POLICY "reminder_prefs: managers delete" ON public.reminder_prefs FOR DELETE TO authenticated
  USING (public.is_wedding_manager(wedding_id));

-- The log is written by the edge function (service role); managers can read their own.
CREATE POLICY "reminder_log: managers read" ON public.reminder_log FOR SELECT TO authenticated
  USING (public.is_wedding_manager(wedding_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_prefs TO authenticated;
GRANT SELECT ON public.reminder_log TO authenticated;
GRANT ALL ON public.reminder_prefs, public.reminder_log TO service_role;

REVOKE ALL ON public.reminder_prefs, public.reminder_log FROM anon;
