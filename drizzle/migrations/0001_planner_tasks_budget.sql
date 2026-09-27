-- Phase 3 slice 2a: persisted Planner (tasks + budget) and transactional Event impact.
ALTER TABLE public.tasks
  ADD COLUMN template_id text CHECK (template_id IS NULL OR template_id ~ '^s[0-9]{1,3}$'),
  ADD COLUMN assignee text NOT NULL DEFAULT 'both' CHECK (assignee IN ('both','one','two'));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_template_is_suggested CHECK (template_id IS NULL OR source = 'suggested');
CREATE UNIQUE INDEX tasks_wedding_template_uniq ON public.tasks (wedding_id, template_id) WHERE template_id IS NOT NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_tables_cap CHECK ((planned_tables IS NULL OR planned_tables <= 10000) AND (reserve_tables IS NULL OR reserve_tables <= 10000));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_done_needs_tables CHECK (kind <> 'table-count' OR status <> 'done' OR coalesce(planned_tables, 0) > 0);

ALTER TABLE public.weddings ADD COLUMN budget_cap_vnd bigint CHECK (budget_cap_vnd IS NULL OR (budget_cap_vnd > 0 AND budget_cap_vnd <= 10000000000));
GRANT UPDATE (budget_cap_vnd) ON public.weddings TO authenticated;

ALTER TABLE public.budget_items
  ADD COLUMN payer text NOT NULL DEFAULT 'couple' CHECK (payer IN ('couple','nha-trai','nha-gai','chung')),
  ADD COLUMN category_detail text CHECK (category_detail IS NULL OR char_length(category_detail) <= 120),
  ADD COLUMN paid_vnd bigint NOT NULL DEFAULT 0 CHECK (paid_vnd >= 0 AND paid_vnd <= 10000000000),
  ADD COLUMN deposit_vnd bigint NOT NULL DEFAULT 0 CHECK (deposit_vnd >= 0),
  ADD COLUMN extra_vnd bigint NOT NULL DEFAULT 0 CHECK (extra_vnd >= 0 AND extra_vnd <= 10000000000),
  ADD COLUMN vendor text CHECK (vendor IS NULL OR char_length(vendor) <= 200);
ALTER TABLE public.budget_items ADD CONSTRAINT budget_category_known CHECK (category IN ('tiec','le','anh','trangtri','khac'));
ALTER TABLE public.budget_items ADD CONSTRAINT budget_khac_detail CHECK (category <> 'khac' OR coalesce(btrim(category_detail), '') <> '');
ALTER TABLE public.budget_items ADD CONSTRAINT budget_money_caps CHECK (estimate_vnd <= 10000000000 AND (agreed_vnd IS NULL OR agreed_vnd <= 10000000000));
ALTER TABLE public.budget_items ADD CONSTRAINT budget_deposit_le_paid CHECK (deposit_vnd <= paid_vnd);
ALTER TABLE public.budget_items ADD CONSTRAINT budget_paid_le_agreed CHECK (
  (agreed_vnd IS NULL AND paid_vnd = 0 AND extra_vnd = 0) OR (agreed_vnd IS NOT NULL AND paid_vnd <= agreed_vnd + extra_vnd));

ALTER TABLE public.budget_installments
  ADD COLUMN label text NOT NULL DEFAULT 'Đợt tiếp' CHECK (label IN ('Cọc','Đợt tiếp','Cuối'));
ALTER TABLE public.budget_installments ADD CONSTRAINT installment_amount_cap CHECK (amount_vnd <= 10000000000);

-- Unpaid scheduled installments may never exceed what is still owed. Deferred so one transaction can edit item + schedule.
CREATE OR REPLACE FUNCTION public.check_budget_schedule() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE item_id uuid; owed bigint; scheduled bigint;
BEGIN
  item_id := CASE WHEN TG_TABLE_NAME = 'budget_items' THEN NEW.id ELSE NEW.budget_item_id END;
  SELECT CASE WHEN agreed_vnd IS NULL THEN 0 ELSE greatest(0, agreed_vnd + extra_vnd - paid_vnd) END INTO owed FROM public.budget_items WHERE id = item_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT coalesce(sum(amount_vnd), 0) INTO scheduled FROM public.budget_installments WHERE budget_item_id = item_id AND paid_at IS NULL;
  IF scheduled > owed THEN RAISE EXCEPTION 'schedule exceeds unpaid' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER budget_items_schedule AFTER INSERT OR UPDATE ON public.budget_items
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_budget_schedule();
CREATE CONSTRAINT TRIGGER budget_installments_schedule AFTER INSERT OR UPDATE ON public.budget_installments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_budget_schedule();

-- Save one cost and replace its schedule atomically. Runs as the caller: RLS still applies.
CREATE OR REPLACE FUNCTION public.save_budget_item(p_wedding_id uuid, p_item_id uuid, p_item jsonb, p_installments jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE iid uuid; x jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_wedding_manager(p_wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_item_id IS NULL THEN
    INSERT INTO public.budget_items (wedding_id, event_id, label, category, category_detail, payer, estimate_vnd, agreed_vnd, paid_vnd, deposit_vnd, extra_vnd, vendor)
    VALUES (p_wedding_id, nullif(p_item->>'event_id','')::uuid, btrim(p_item->>'label'), p_item->>'category', nullif(btrim(coalesce(p_item->>'category_detail','')),''),
      p_item->>'payer', (p_item->>'estimate_vnd')::bigint, nullif(p_item->>'agreed_vnd','')::bigint, (p_item->>'paid_vnd')::bigint,
      (p_item->>'deposit_vnd')::bigint, (p_item->>'extra_vnd')::bigint, nullif(btrim(coalesce(p_item->>'vendor','')),''))
    RETURNING id INTO iid;
  ELSE
    UPDATE public.budget_items SET event_id = nullif(p_item->>'event_id','')::uuid, label = btrim(p_item->>'label'), category = p_item->>'category',
      category_detail = nullif(btrim(coalesce(p_item->>'category_detail','')),''), payer = p_item->>'payer', estimate_vnd = (p_item->>'estimate_vnd')::bigint,
      agreed_vnd = nullif(p_item->>'agreed_vnd','')::bigint, paid_vnd = (p_item->>'paid_vnd')::bigint, deposit_vnd = (p_item->>'deposit_vnd')::bigint,
      extra_vnd = (p_item->>'extra_vnd')::bigint, vendor = nullif(btrim(coalesce(p_item->>'vendor','')),'')
    WHERE id = p_item_id AND wedding_id = p_wedding_id RETURNING id INTO iid;
    IF iid IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
    DELETE FROM public.budget_installments WHERE budget_item_id = iid;
  END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_installments, '[]'::jsonb)) LOOP
    INSERT INTO public.budget_installments (wedding_id, budget_item_id, label, amount_vnd, due_date)
    VALUES (p_wedding_id, iid, x->>'label', (x->>'amount_vnd')::bigint, nullif(x->>'due_date','')::date);
  END LOOP;
  RETURN iid;
END $$;

-- Edit an Event and shift only the tasks the user explicitly consented to, in one transaction.
CREATE OR REPLACE FUNCTION public.update_event_with_impact(p_event_id uuid, p_fields jsonb, p_shift_task_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE e public.events%ROWTYPE; new_date date := nullif(p_fields->>'event_date','')::date; delta integer; n integer := 0;
BEGIN
  SELECT * INTO e FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF auth.uid() IS NULL OR NOT FOUND OR NOT public.is_wedding_manager(e.wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.events SET name = btrim(p_fields->>'name'), side = p_fields->>'side', event_date = new_date,
    event_time = nullif(p_fields->>'event_time','')::time, venue = nullif(btrim(coalesce(p_fields->>'venue','')),''),
    address = nullif(btrim(coalesce(p_fields->>'address','')),''), status = p_fields->>'status'
  WHERE id = p_event_id;
  IF e.event_date IS NOT NULL AND new_date IS NOT NULL AND new_date <> e.event_date AND coalesce(array_length(p_shift_task_ids, 1), 0) > 0 THEN
    delta := new_date - e.event_date;
    UPDATE public.tasks SET due_date = due_date + delta
      WHERE id = ANY(p_shift_task_ids) AND event_id = p_event_id AND wedding_id = e.wedding_id AND due_date IS NOT NULL AND status <> 'done';
    GET DIAGNOSTICS n = ROW_COUNT;
  END IF;
  RETURN n;
END $$;

-- Remove an Event: tasks/costs stay (unassigned), guest invitations to it are removed, audited — all or nothing.
CREATE OR REPLACE FUNCTION public.remove_event(p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); e public.events%ROWTYPE; nt integer; nb integer; ng integer;
BEGIN
  SELECT * INTO e FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF uid IS NULL OR NOT FOUND OR NOT public.is_wedding_manager(e.wedding_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.tasks SET event_id = NULL WHERE event_id = p_event_id AND wedding_id = e.wedding_id; GET DIAGNOSTICS nt = ROW_COUNT;
  UPDATE public.budget_items SET event_id = NULL WHERE event_id = p_event_id AND wedding_id = e.wedding_id; GET DIAGNOSTICS nb = ROW_COUNT;
  DELETE FROM public.guest_event_assignments WHERE event_id = p_event_id AND wedding_id = e.wedding_id; GET DIAGNOSTICS ng = ROW_COUNT;
  DELETE FROM public.events WHERE id = p_event_id;
  INSERT INTO public.audit_log (wedding_id, actor_id, action, detail)
    VALUES (e.wedding_id, uid, 'event.removed', jsonb_build_object('event_id', p_event_id, 'name', e.name, 'tasks', nt, 'budget', nb, 'guest_assignments', ng));
  RETURN jsonb_build_object('tasks', nt, 'budget', nb, 'guests', ng);
END $$;

REVOKE ALL ON FUNCTION public.save_budget_item(uuid,uuid,jsonb,jsonb), public.update_event_with_impact(uuid,jsonb,uuid[]), public.remove_event(uuid), public.check_budget_schedule() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_budget_item(uuid,uuid,jsonb,jsonb), public.update_event_with_impact(uuid,jsonb,uuid[]), public.remove_event(uuid) TO authenticated;