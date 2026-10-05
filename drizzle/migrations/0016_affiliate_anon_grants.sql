-- 0016: Siết quyền anon trên các bảng affiliate.
-- Lovable Cloud mặc định GRANT ALL cho anon/authenticated trên mọi bảng,
-- trong khi thiết kế ở 0014 chỉ cho anon đọc một số cột (không có affiliate URL
-- thô và ghi chú hoa hồng nội bộ). Migration này khôi phục đúng thiết kế đó.
-- authenticated giữ nguyên quyền (RLS policies vẫn là cửa kiểm soát ghi).

REVOKE ALL ON public.affiliate_vendors FROM anon;
REVOKE ALL ON public.affiliate_products FROM anon;
REVOKE ALL ON public.affiliate_clicks FROM anon;

-- Anon chỉ thấy catalogue marketing: không target_url/affiliate_url/commission_note.
GRANT SELECT (id, name, category, description, code, coupon_code, logo_url, is_active, sort_order)
  ON public.affiliate_vendors TO anon;
GRANT SELECT (id, vendor_id, name, code, price_hint, budget_category, task_template_id, is_active, sort_order)
  ON public.affiliate_products TO anon;
-- affiliate_clicks: không cấp quyền client (click ghi qua RPC track_affiliate_click,
-- hàm này đã GRANT EXECUTE cho anon).
