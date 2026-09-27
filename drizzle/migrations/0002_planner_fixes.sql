-- Full unique constraint (NULL template ids stay distinct) so upsert ON CONFLICT (wedding_id, template_id) works.
DROP INDEX IF EXISTS public.tasks_wedding_template_uniq;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_wedding_template_key UNIQUE (wedding_id, template_id);

CREATE OR REPLACE FUNCTION public.check_budget_schedule() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE item_id uuid; owed bigint; scheduled bigint;
BEGIN
  IF TG_TABLE_NAME = 'budget_items' THEN item_id := NEW.id; ELSE item_id := NEW.budget_item_id; END IF;
  SELECT CASE WHEN agreed_vnd IS NULL THEN 0 ELSE greatest(0, agreed_vnd + extra_vnd - paid_vnd) END INTO owed FROM public.budget_items WHERE id = item_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT coalesce(sum(amount_vnd), 0) INTO scheduled FROM public.budget_installments WHERE budget_item_id = item_id AND paid_at IS NULL;
  IF scheduled > owed THEN RAISE EXCEPTION 'schedule exceeds unpaid' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.check_budget_schedule() FROM PUBLIC, anon, authenticated;