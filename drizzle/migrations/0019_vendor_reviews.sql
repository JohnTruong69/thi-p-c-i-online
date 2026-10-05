-- 0019: Shared vendor reviews (đánh giá nhà cung cấp).
-- One review per couple (wedding) per vendor. Readable by every signed-in
-- couple (social proof for the directory); writable only by the wedding's
-- own managers. No anon access.

CREATE TABLE public.vendor_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.affiliate_vendors(id) ON DELETE CASCADE,
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, wedding_id)
);
CREATE INDEX vendor_reviews_vendor_idx ON public.vendor_reviews (vendor_id);

ALTER TABLE public.vendor_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendor_reviews: authenticated read" ON public.vendor_reviews FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "vendor_reviews: managers insert" ON public.vendor_reviews FOR INSERT TO authenticated
  WITH CHECK (public.is_wedding_manager(wedding_id));
CREATE POLICY "vendor_reviews: managers update" ON public.vendor_reviews FOR UPDATE TO authenticated
  USING (public.is_wedding_manager(wedding_id)) WITH CHECK (public.is_wedding_manager(wedding_id));
CREATE POLICY "vendor_reviews: managers delete" ON public.vendor_reviews FOR DELETE TO authenticated
  USING (public.is_wedding_manager(wedding_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_reviews TO authenticated;
GRANT ALL ON public.vendor_reviews TO service_role;

REVOKE ALL ON public.vendor_reviews FROM anon;
