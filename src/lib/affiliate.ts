/** Affiliate foundation: vendors, products, click tracking. Client data layer over RLS + RPCs.
 *  Note: src/integrations/supabase/types.ts is generated from the live DB; until
 *  migration 0014 is applied there, row types are declared locally (not via Database). */
import { queryOptions, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type AffiliateVendor = {
  id: string; name: string; category: string; description: string;
  affiliate_url: string; code: string; coupon_code: string | null;
  commission_note: string; logo_url: string | null;
  is_active: boolean; sort_order: number; created_at: string; updated_at: string;
};
export type AffiliateProduct = {
  id: string; vendor_id: string | null; vendor_name?: string | undefined; name: string; target_url: string;
  code: string; price_hint: string | null;
  budget_category: 'tiec' | 'le' | 'anh' | 'trangtri' | 'khac' | null;
  task_template_id: string | null;
  is_active: boolean; sort_order: number; created_at: string; updated_at: string;
};
export type VendorInput = {
  name: string; category: string; description: string; affiliate_url: string; code: string;
  coupon_code: string; commission_note: string; logo_url: string;
  is_active: boolean; sort_order: number;
};
export type ProductInput = {
  vendor_id: string; name: string; target_url: string; code: string; price_hint: string;
  budget_category: string; task_template_id: string;
  is_active: boolean; sort_order: number;
};
export type ClickStat = { code: string; label: string; kind: 'product' | 'vendor'; total: number; recent: number };

const must = <T,>(r: { data: T | null; error: unknown }): T => { if (r.error) throw r.error; return (r.data ?? (null as unknown)) as T; };

/* ---------- catalogue (active only, RLS) ---------- */
export const vendorsQuery = queryOptions({
  queryKey: ['affiliate-vendors'],
  queryFn: async (): Promise<AffiliateVendor[]> =>
    must(await supabase.from('affiliate_vendors').select('*').eq('is_active', true).order('sort_order').order('name')),
});
export const useVendors = () => useQuery(vendorsQuery);

export const productsQuery = (f: { budgetCategory?: string; taskTemplateId?: string; vendorId?: string } = {}) => queryOptions({
  queryKey: ['affiliate-products', f],
  queryFn: async (): Promise<AffiliateProduct[]> => {
    let q = supabase.from('affiliate_products').select('*, affiliate_vendors(name)').eq('is_active', true);
    if (f.budgetCategory) q = q.eq('budget_category', f.budgetCategory);
    if (f.taskTemplateId) q = q.eq('task_template_id', f.taskTemplateId);
    if (f.vendorId) q = q.eq('vendor_id', f.vendorId);
    const rows = must(await q.order('sort_order').order('name')) as (AffiliateProduct & { affiliate_vendors: { name: string } | null })[];
    return rows.map(r => ({ ...r, vendor_name: r.affiliate_vendors?.name }));
  },
});
export const useProducts = (f?: { budgetCategory?: string; taskTemplateId?: string; vendorId?: string }) => useQuery(productsQuery(f));

/* ---------- batched lookups for Planner integration (GĐ C) ---------- */
type ProductRow = AffiliateProduct & { affiliate_vendors: { name: string } | null };
const withVendor = (r: ProductRow): AffiliateProduct => ({ ...r, vendor_name: r.affiliate_vendors?.name });

/** Pure grouping helper (tested): products → key → list, preserving sort_order. */
export function groupProducts<K extends string>(rows: (AffiliateProduct & Record<K, string | null>)[], key: K): Record<string, AffiliateProduct[]> {
  const out: Record<string, AffiliateProduct[]> = {};
  for (const r of rows) { const k = r[key]; if (!k) continue; (out[k] ??= []).push(r); }
  return out;
}

async function fetchActiveProducts(filter: { in: string; values: string[] }): Promise<ProductRow[]> {
  const q = supabase.from('affiliate_products').select('*, affiliate_vendors(name)').eq('is_active', true).in(filter.in, filter.values).order('sort_order').order('name');
  return must(await q) as ProductRow[];
}

/** Products linked to suggested-task template ids (s1..s43), grouped by template id. */
export const productsByTaskTemplatesQuery = (ids: string[]) => queryOptions({
  queryKey: ['affiliate-products', 'by-tasks', [...new Set(ids)].sort()],
  queryFn: async (): Promise<Record<string, AffiliateProduct[]>> => {
    const uniq = [...new Set(ids)];
    if (!uniq.length) return {};
    return groupProducts((await fetchActiveProducts({ in: 'task_template_id', values: uniq })).map(withVendor), 'task_template_id');
  },
  enabled: ids.length > 0,
});

/** Products linked to budget categories, grouped by category. */
export const productsByBudgetCategoriesQuery = (categories: string[]) => queryOptions({
  queryKey: ['affiliate-products', 'by-categories', [...new Set(categories)].sort()],
  queryFn: async (): Promise<Record<string, AffiliateProduct[]>> => {
    const uniq = [...new Set(categories)];
    if (!uniq.length) return {};
    return groupProducts((await fetchActiveProducts({ in: 'budget_category', values: uniq })).map(withVendor), 'budget_category');
  },
  enabled: categories.length > 0,
});

/* ---------- click tracking: resolve + log via RPC, returns target URL ---------- */
export async function trackAffiliateClick(code: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('track_affiliate_click', { p_code: code.trim().toLowerCase() });
  if (error) return null;
  return (data as string | null) ?? null;
}

/* ---------- admin ---------- */
export async function isAffiliateAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_affiliate_admin');
  if (error) return false;
  return !!data;
}
export const adminQuery = queryOptions({ queryKey: ['affiliate-admin'], queryFn: isAffiliateAdmin, staleTime: 60_000 });

export async function clickStats(days = 30): Promise<ClickStat[]> {
  const rows = must(await supabase.rpc('affiliate_click_stats', { p_days: days }));
  return (rows as { code: string; label: string; kind: string; total: number; recent: number }[])
    .map(r => ({ ...r, kind: r.kind === 'product' ? 'product' : 'vendor' as const, total: Number(r.total), recent: Number(r.recent) }));
}

const cleanVendor = (v: VendorInput) => ({
  name: v.name.trim(), category: v.category.trim(), description: v.description.trim(),
  affiliate_url: v.affiliate_url.trim(), code: v.code.trim().toLowerCase(),
  coupon_code: v.coupon_code.trim() || null, commission_note: v.commission_note.trim(),
  logo_url: v.logo_url.trim() || null, is_active: v.is_active, sort_order: v.sort_order || 0,
});
const cleanProduct = (p: ProductInput) => ({
  vendor_id: p.vendor_id || null, name: p.name.trim(), target_url: p.target_url.trim(),
  code: p.code.trim().toLowerCase(), price_hint: p.price_hint.trim() || null,
  budget_category: p.budget_category || null, task_template_id: p.task_template_id.trim() || null,
  is_active: p.is_active, sort_order: p.sort_order || 0,
});

export function validateVendorInput(v: VendorInput): Record<string, string> {
  const n: Record<string, string> = {};
  if (!v.name.trim()) n['name'] = 'Hãy nhập tên nhà cung cấp.';
  if (!v.category.trim()) n['category'] = 'Hãy nhập hạng mục (ví dụ: Studio ảnh cưới).';
  if (!/^https:\/\/.+\..+/.test(v.affiliate_url.trim())) n['affiliate_url'] = 'Link giới thiệu phải bắt đầu bằng https://';
  if (!/^[a-z0-9-]{3,32}$/.test(v.code.trim().toLowerCase())) n['code'] = 'Mã link: 3–32 ký tự, chỉ chữ thường, số và gạch ngang.';
  if (v.logo_url.trim() && !/^https:\/\//.test(v.logo_url.trim())) n['logo_url'] = 'Logo phải là link https://';
  return n;
}
export function validateProductInput(p: ProductInput): Record<string, string> {
  const n: Record<string, string> = {};
  if (!p.name.trim()) n['name'] = 'Hãy nhập tên sản phẩm.';
  if (!/^https:\/\/.+\..+/.test(p.target_url.trim())) n['target_url'] = 'Link sản phẩm phải bắt đầu bằng https://';
  if (!/^[a-z0-9-]{3,32}$/.test(p.code.trim().toLowerCase())) n['code'] = 'Mã link: 3–32 ký tự, chỉ chữ thường, số và gạch ngang.';
  if (p.task_template_id.trim() && !/^s[0-9]{1,3}$/.test(p.task_template_id.trim())) n['task_template_id'] = 'Mã việc mẫu có dạng s1…s43.';
  return n;
}

export async function saveVendor(id: string | null, v: VendorInput) {
  const row = cleanVendor(v);
  if (id) must(await supabase.from('affiliate_vendors').update(row).eq('id', id));
  else must(await supabase.from('affiliate_vendors').insert(row));
}
export async function deleteVendor(id: string) { must(await supabase.from('affiliate_vendors').delete().eq('id', id)); }
export async function saveProduct(id: string | null, p: ProductInput) {
  const row = cleanProduct(p);
  if (id) must(await supabase.from('affiliate_products').update(row).eq('id', id));
  else must(await supabase.from('affiliate_products').insert(row));
}
export async function deleteProduct(id: string) { must(await supabase.from('affiliate_products').delete().eq('id', id)); }
