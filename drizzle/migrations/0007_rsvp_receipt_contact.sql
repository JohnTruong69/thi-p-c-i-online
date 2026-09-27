-- Receipt (only readable with the guest's own edit code) also returns phone/note so an edit can prefill them instead of clearing.
CREATE OR REPLACE FUNCTION public.rsvp_receipt_json(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('receipt_id', r.id, 'guest_name', r.guest_name, 'phone', r.phone, 'note', r.note, 'submitted_at', r.created_at, 'edited', r.replaces_id IS NOT NULL,
    'answers', coalesce((SELECT jsonb_agg(jsonb_build_object('event_id', a.event_id, 'event_name', a.event_name, 'attending', a.attending, 'party_size', a.party_size) ORDER BY a.event_name) FROM public.rsvp_answers a WHERE a.response_id = r.id), '[]'::jsonb))
  FROM public.rsvp_responses r WHERE r.id = p_id
$$;
REVOKE ALL ON FUNCTION public.rsvp_receipt_json(uuid) FROM PUBLIC, anon, authenticated;
