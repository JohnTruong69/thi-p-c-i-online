REVOKE ALL ON public.invitations, public.invitation_photos, public.invitation_links, public.invitation_revisions, public.wedding_entitlements FROM anon, authenticated;
GRANT SELECT ON public.invitations, public.invitation_photos, public.invitation_links, public.invitation_revisions, public.wedding_entitlements TO authenticated;
GRANT UPDATE (title, message, cover_photo_id) ON public.invitations TO authenticated;
GRANT UPDATE (enabled, event_ids) ON public.invitation_links TO authenticated;

-- Public projection no longer returns storage paths (they contain the wedding id); only counts.
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
  RETURN jsonb_build_object('open', true, 'side', l.side, 'title', snap->'title', 'message', snap->'message',
    'has_cover', snap->'cover' IS NOT NULL AND snap->'cover' <> 'null'::jsonb, 'photo_count', jsonb_array_length(coalesce(snap->'photos','[]'::jsonb)),
    'events', (SELECT coalesce(jsonb_agg(e - 'side' || jsonb_build_object('side', e->'side')), '[]'::jsonb) FROM jsonb_array_elements(snap->'events') e WHERE (lk->'event_ids') ? (e->>'id')));
END $$;

-- Paths for signing, server-only (service role), same gates.
CREATE OR REPLACE FUNCTION public.public_invitation_photo_paths(p_token text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.invitation_links%ROWTYPE; i public.invitations%ROWTYPE; snap jsonb;
BEGIN
  IF (public.public_invitation(p_token)->>'open') IS DISTINCT FROM 'true' THEN RETURN '{}'::jsonb; END IF;
  SELECT * INTO l FROM public.invitation_links WHERE token = p_token;
  SELECT * INTO i FROM public.invitations WHERE id = l.invitation_id;
  SELECT snapshot INTO snap FROM public.invitation_revisions WHERE id = i.published_revision_id;
  RETURN jsonb_build_object('cover', snap->'cover', 'photos', snap->'photos');
END $$;
REVOKE ALL ON FUNCTION public.public_invitation_photo_paths(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_invitation_photo_paths(text) TO service_role;
