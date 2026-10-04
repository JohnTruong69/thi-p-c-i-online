-- GĐ D: lead tracking for the vendor directory ("Nhà cung cấp đề xuất").
-- Couples request a consultation from a vendor; admins use the lead list to
-- reconcile commissions with vendors.
CREATE TABLE public.affiliate_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.affiliate_vendors(id) ON DELETE CASCADE,
  wedding_id uuid REFERENCES public.weddings(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  phone text NOT NULL CHECK (phone ~ '^[+\d\s.()-]{8,20}$'),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'done', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_leads_vendor_idx ON public.affiliate_leads (vendor_id, created_at DESC);
CREATE INDEX affiliate_leads_created_idx ON public.affiliate_leads (created_at DESC);

GRANT SELECT, INSERT ON public.affiliate_leads TO authenticated;
GRANT UPDATE (status) ON public.affiliate_leads TO authenticated;
GRANT ALL ON public.affiliate_leads TO service_role;
-- No client grants on raw contact details beyond the policies below.

ALTER TABLE public.affiliate_leads ENABLE ROW LEVEL SECURITY;

-- Members insert leads for weddings they belong to (wedding_id optional).
CREATE POLICY "affiliate leads: members insert" ON public.affiliate_leads
  FOR INSERT TO authenticated WITH CHECK (
    wedding_id IS NULL OR EXISTS (
      SELECT 1 FROM public.wedding_memberships m
      WHERE m.wedding_id = affiliate_leads.wedding_id AND m.user_id = auth.uid()
    )
  );
-- Admins read all leads and update their status (commission reconciliation).
CREATE POLICY "affiliate leads: admins all" ON public.affiliate_leads
  FOR ALL TO authenticated
  USING (public.is_affiliate_admin())
  WITH CHECK (public.is_affiliate_admin());
