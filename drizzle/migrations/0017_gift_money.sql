-- 0017: Sổ tiền mừng (gift money ledger).
-- Vietnamese couples record every cash gift to reciprocate ("đi lại") later.
-- Managers only: amounts are sensitive and stay hidden from family viewers.

CREATE TABLE public.gift_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL,
  giver_name text NOT NULL CHECK (char_length(btrim(giver_name)) BETWEEN 1 AND 120),
  amount_vnd integer NOT NULL CHECK (amount_vnd >= 0),
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  side text NOT NULL DEFAULT 'chung' CHECK (side IN ('chung','nha-trai','nha-gai')),
  method text NOT NULL DEFAULT 'phong_bi' CHECK (method IN ('phong_bi','chuyen_khoan','hien_vat')),
  gift_detail text CHECK (gift_detail IS NULL OR char_length(gift_detail) <= 200),
  thanked boolean NOT NULL DEFAULT false,
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gift_records_wedding_idx ON public.gift_records (wedding_id);
CREATE INDEX gift_records_guest_idx ON public.gift_records (guest_id);

ALTER TABLE public.gift_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gift_records: managers read" ON public.gift_records FOR SELECT TO authenticated
  USING (public.is_wedding_manager(wedding_id));
CREATE POLICY "gift_records: managers insert" ON public.gift_records FOR INSERT TO authenticated
  WITH CHECK (public.is_wedding_manager(wedding_id));
CREATE POLICY "gift_records: managers update" ON public.gift_records FOR UPDATE TO authenticated
  USING (public.is_wedding_manager(wedding_id)) WITH CHECK (public.is_wedding_manager(wedding_id));
CREATE POLICY "gift_records: managers delete" ON public.gift_records FOR DELETE TO authenticated
  USING (public.is_wedding_manager(wedding_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gift_records TO authenticated;
GRANT ALL ON public.gift_records TO service_role;

-- No anon access: gift amounts must never leak through the public catalogue role.
REVOKE ALL ON public.gift_records FROM anon;
