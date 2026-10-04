-- GĐ B: Affiliate foundation. Free app monetised via affiliate links.
-- Tables: affiliate_vendors, affiliate_products, affiliate_clicks, affiliate_admins.
-- Public redirect /r/:code resolves via track_affiliate_click() (SECURITY DEFINER),
-- which logs the click (wedding derived from caller membership) and returns the target URL.
-- Vendors/products are readable by authenticated users (active only); admins manage via RLS.

-- ============ Vendors ============
CREATE TABLE public.affiliate_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  category text NOT NULL CHECK (char_length(btrim(category)) BETWEEN 1 AND 60),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  affiliate_url text NOT NULL CHECK (affiliate_url ~ '^https://'),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9-]{3,32}$'),
  coupon_code text CHECK (coupon_code IS NULL OR char_length(coupon_code) <= 40),
  commission_note text NOT NULL DEFAULT '' CHECK (char_length(commission_note) <= 200),
  logo_url text CHECK (logo_url IS NULL OR logo_url ~ '^https://'),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ Products ============
CREATE TABLE public.affiliate_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES public.affiliate_vendors(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  target_url text NOT NULL CHECK (target_url ~ '^https://'),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9-]{3,32}$'),
  price_hint text CHECK (price_hint IS NULL OR char_length(price_hint) <= 60),
  budget_category text CHECK (budget_category IS NULL OR budget_category IN ('tiec','le','anh','trangtri','khac')),
  task_template_id text CHECK (task_template_id IS NULL OR task_template_id ~ '^s[0-9]{1,3}$'),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_products_budget_cat_idx ON public.affiliate_products (budget_category) WHERE is_active AND budget_category IS NOT NULL;
CREATE INDEX affiliate_products_task_tpl_idx ON public.affiliate_products (task_template_id) WHERE is_active AND task_template_id IS NOT NULL;

-- ============ Clicks (RPC-only writes) ============
CREATE TABLE public.affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  vendor_id uuid REFERENCES public.affiliate_vendors(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.affiliate_products(id) ON DELETE SET NULL,
  wedding_id uuid REFERENCES public.weddings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_clicks_code_idx ON public.affiliate_clicks (code, created_at DESC);
CREATE INDEX affiliate_clicks_created_idx ON public.affiliate_clicks (created_at DESC);

-- ============ Admins (service-role managed) ============
CREATE TABLE public.affiliate_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ Grants & RLS ============
GRANT SELECT ON public.affiliate_vendors, public.affiliate_products TO authenticated;
-- Anon sees the marketing catalogue only: no raw affiliate URLs (redirect via /r/:code logs the click)
-- and no internal commission notes.
GRANT SELECT (id, name, category, description, code, coupon_code, logo_url, is_active, sort_order)
  ON public.affiliate_vendors TO anon;
GRANT SELECT (id, vendor_id, name, code, price_hint, budget_category, task_template_id, is_active, sort_order)
  ON public.affiliate_products TO anon;
GRANT ALL ON public.affiliate_vendors, public.affiliate_products, public.affiliate_clicks TO service_role;
-- No client grants on affiliate_clicks / affiliate_admins: clicks via RPC, admins via service role.

ALTER TABLE public.affiliate_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_admins ENABLE ROW LEVEL SECURITY;

-- Public/active catalogue readable by everyone; inactive rows are admin-only.
CREATE POLICY "affiliate vendors: public read active" ON public.affiliate_vendors
  FOR SELECT TO anon, authenticated USING (is_active);
CREATE POLICY "affiliate products: public read active" ON public.affiliate_products
  FOR SELECT TO anon, authenticated USING (is_active);
-- Admins manage everything.
CREATE POLICY "affiliate vendors: admins all" ON public.affiliate_vendors
  FOR ALL TO authenticated USING (public.is_affiliate_admin()) WITH CHECK (public.is_affiliate_admin());
CREATE POLICY "affiliate products: admins all" ON public.affiliate_products
  FOR ALL TO authenticated USING (public.is_affiliate_admin()) WITH CHECK (public.is_affiliate_admin());
CREATE POLICY "affiliate clicks: admins read" ON public.affiliate_clicks
  FOR SELECT TO authenticated USING (public.is_affiliate_admin());
-- affiliate_admins: no policies — clients can neither read nor write it.

CREATE TRIGGER affiliate_vendors_touch BEFORE UPDATE ON public.affiliate_vendors
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER affiliate_products_touch BEFORE UPDATE ON public.affiliate_products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ Functions ============
CREATE OR REPLACE FUNCTION public.is_affiliate_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.affiliate_admins WHERE user_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.is_affiliate_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_affiliate_admin() TO authenticated, service_role;

-- Codes must be unique across vendors AND products (resolver checks products first).
CREATE OR REPLACE FUNCTION public.check_affiliate_code_unique()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'affiliate_products' THEN
    IF EXISTS (SELECT 1 FROM public.affiliate_vendors WHERE code = NEW.code) THEN
      RAISE EXCEPTION 'affiliate code already used by a vendor' USING ERRCODE = '23505'; END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.affiliate_products WHERE code = NEW.code) THEN
      RAISE EXCEPTION 'affiliate code already used by a product' USING ERRCODE = '23505'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER affiliate_products_code_uniq BEFORE INSERT OR UPDATE OF code ON public.affiliate_products
  FOR EACH ROW EXECUTE FUNCTION public.check_affiliate_code_unique();
CREATE TRIGGER affiliate_vendors_code_uniq BEFORE INSERT OR UPDATE OF code ON public.affiliate_vendors
  FOR EACH ROW EXECUTE FUNCTION public.check_affiliate_code_unique();
REVOKE ALL ON FUNCTION public.check_affiliate_code_unique() FROM PUBLIC, anon, authenticated;

-- Resolve a short code, log the click, return the target URL (NULL when unknown/inactive).
-- wedding_id is derived server-side from the caller's membership; NULL for anon.
CREATE OR REPLACE FUNCTION public.track_affiliate_click(p_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t_url text; v_id uuid; p_id uuid; w_id uuid;
BEGIN
  IF p_code IS NULL OR p_code = '' THEN RETURN NULL; END IF;
  SELECT p.target_url, p.id, p.vendor_id INTO t_url, p_id, v_id
    FROM public.affiliate_products p WHERE p.code = p_code AND p.is_active;
  IF t_url IS NULL THEN
    SELECT v.affiliate_url, v.id INTO t_url, v_id
      FROM public.affiliate_vendors v WHERE v.code = p_code AND v.is_active;
  END IF;
  IF t_url IS NULL THEN RETURN NULL; END IF;
  IF auth.uid() IS NOT NULL THEN
    SELECT m.wedding_id INTO w_id FROM public.wedding_memberships m WHERE m.user_id = auth.uid() LIMIT 1;
  END IF;
  INSERT INTO public.affiliate_clicks (code, vendor_id, product_id, wedding_id)
    VALUES (p_code, v_id, p_id, w_id);
  RETURN t_url;
END $$;
REVOKE ALL ON FUNCTION public.track_affiliate_click(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_affiliate_click(text) TO anon, authenticated, service_role;

-- Admin click stats: totals + last N days per code.
CREATE OR REPLACE FUNCTION public.affiliate_click_stats(p_days integer DEFAULT 30)
RETURNS TABLE (code text, label text, kind text, total bigint, recent bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_affiliate_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  WITH c AS (
    SELECT cl.code, count(*) AS total,
      count(*) FILTER (WHERE cl.created_at > now() - make_interval(days => greatest(p_days, 1))) AS recent
    FROM public.affiliate_clicks cl GROUP BY cl.code
  )
  SELECT c.code, coalesce(p.name, v.name, c.code),
    CASE WHEN p.id IS NOT NULL THEN 'product' ELSE 'vendor' END,
    c.total, c.recent
  FROM c
  LEFT JOIN public.affiliate_products p ON p.code = c.code
  LEFT JOIN public.affiliate_vendors v ON v.code = c.code
  ORDER BY c.total DESC;
END $$;
REVOKE ALL ON FUNCTION public.affiliate_click_stats(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.affiliate_click_stats(integer) TO authenticated, service_role;
