import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { WriteButton } from './AccessStateBanner';
import { DemoDialog, FormField, Header, Note, Panel, SmallLabel, inputCls } from './PhaseOne';
import { CATEGORIES } from '@/lib/planner';
import {
  adminQuery, clickStats, deleteProduct, deleteVendor, saveProduct, saveVendor,
  validateProductInput, validateVendorInput,
  type AffiliateProduct, type AffiliateVendor, type ClickStat, type ProductInput, type VendorInput,
} from '@/lib/affiliate';
import { supabase } from '@/integrations/supabase/client';

function Loading({ label = 'Đang tải…' }: { label?: string }) {
  return <p role="status" className="py-6 text-sm text-muted-foreground">{label}</p>;
}

const emptyVendor: VendorInput = { name: '', category: '', description: '', affiliate_url: '', code: '', coupon_code: '', commission_note: '', logo_url: '', is_active: true, sort_order: 0 };
const emptyProduct: ProductInput = { vendor_id: '', name: '', target_url: '', code: '', price_hint: '', budget_category: '', task_template_id: '', is_active: true, sort_order: 0 };

function VendorManager() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['affiliate-vendors-admin'], queryFn: async () => {
    const { data, error } = await supabase.from('affiliate_vendors').select('*').order('sort_order').order('name');
    if (error) throw error; return data as AffiliateVendor[];
  } });
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState<VendorInput>(emptyVendor);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<AffiliateVendor | null>(null);

  const save = useMutation({
    mutationFn: async () => { const n = validateVendorInput(f); setErrs(n); if (Object.keys(n).length) throw new Error('validation'); await saveVendor(editId, f); },
    onSuccess: () => { setOpen(false); qc.invalidateQueries({ queryKey: ['affiliate-vendors-admin'] }); qc.invalidateQueries({ queryKey: ['affiliate-vendors'] }); },
  });
  const del = useMutation({
    mutationFn: async (v: AffiliateVendor) => { await deleteVendor(v.id); },
    onSuccess: () => { setConfirm(null); qc.invalidateQueries({ queryKey: ['affiliate-vendors-admin'] }); qc.invalidateQueries({ queryKey: ['affiliate-vendors'] }); },
  });

  const startAdd = () => { setEditId(null); setF(emptyVendor); setErrs({}); setOpen(true); };
  const startEdit = (v: AffiliateVendor) => {
    setEditId(v.id);
    setF({ name: v.name, category: v.category, description: v.description, affiliate_url: v.affiliate_url, code: v.code, coupon_code: v.coupon_code ?? '', commission_note: v.commission_note, logo_url: v.logo_url ?? '', is_active: v.is_active, sort_order: v.sort_order });
    setErrs({}); setOpen(true);
  };

  return <div>
    <div className="mb-4 flex items-center justify-between">
      <SmallLabel>NHÀ CUNG CẤP · {q.data?.length ?? 0}</SmallLabel>
      <WriteButton size="lg" className="min-h-11" onClick={startAdd}><Plus className="size-4" /> Thêm</WriteButton>
    </div>
    {q.isPending ? <Loading /> : q.isError ? <Note tone="copper">Không tải được danh sách.</Note> :
      <Panel>{q.data.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có nhà cung cấp nào.</p> :
        q.data.map(v => <div key={v.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border py-3 last:border-0">
          <div className="min-w-0"><div className="font-semibold">{v.name} {!v.is_active && <span className="text-xs font-normal text-muted-foreground">(đang tắt)</span>}</div>
            <p className="text-xs text-muted-foreground">{v.category} · <span className="font-mono">/r/{v.code}</span>{v.coupon_code ? ` · mã ${v.coupon_code}` : ''}</p></div>
          <div className="flex gap-1">
            <WriteButton variant="ghost" size="sm" className="min-h-11" onClick={() => startEdit(v)} aria-label={`Sửa ${v.name}`}><Pencil className="size-4" /></WriteButton>
            <WriteButton variant="ghost" size="sm" className="min-h-11 text-destructive" onClick={() => setConfirm(v)} aria-label={`Xóa ${v.name}`}><Trash2 className="size-4" /></WriteButton>
          </div>
        </div>)}
      </Panel>}

    <DemoDialog real open={open} onOpenChange={setOpen} title={editId ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'}
      description="Thông tin hiển thị cho người dùng trong app." submitLabel="Lưu"
      busy={save.isPending} onSubmit={e => { e.preventDefault(); save.mutate(); }}>
      {save.isError && (save.error as Error).message !== 'validation' && <Note tone="copper">Không lưu được. Mã link có thể đã bị trùng.</Note>}
      <FormField label="Tên *" id="v-name" error={errs['name']}><input id="v-name" className={inputCls} value={f.name} maxLength={120} onChange={e => setF({ ...f, name: e.target.value })} /></FormField>
      <FormField label="Hạng mục *" id="v-cat" error={errs['category']}><input id="v-cat" className={inputCls} value={f.category} maxLength={60} placeholder="Ví dụ: Studio ảnh cưới" onChange={e => setF({ ...f, category: e.target.value })} /></FormField>
      <FormField label="Link giới thiệu (affiliate) *" id="v-url" error={errs['affiliate_url']}><input id="v-url" className={inputCls} value={f.affiliate_url} inputMode="url" placeholder="https://…" onChange={e => setF({ ...f, affiliate_url: e.target.value })} /></FormField>
      <FormField label="Mã link * (/r/mã)" id="v-code" error={errs['code']}><input id="v-code" className={inputCls} value={f.code} maxLength={32} placeholder="vd: studio-anh-sang" onChange={e => setF({ ...f, code: e.target.value })} /></FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Mã giảm giá" id="v-coupon"><input id="v-coupon" className={inputCls} value={f.coupon_code} maxLength={40} onChange={e => setF({ ...f, coupon_code: e.target.value })} /></FormField>
        <FormField label="Thứ tự" id="v-sort"><input id="v-sort" type="number" className={inputCls} value={f.sort_order} onChange={e => setF({ ...f, sort_order: Number(e.target.value) || 0 })} /></FormField>
      </div>
      <FormField label="Ghi chú hoa hồng (nội bộ)" id="v-comm"><input id="v-comm" className={inputCls} value={f.commission_note} maxLength={200} placeholder="Ví dụ: 8% qua ACCESSTRADE" onChange={e => setF({ ...f, commission_note: e.target.value })} /></FormField>
      <FormField label="Mô tả ngắn" id="v-desc"><textarea id="v-desc" rows={2} className={`${inputCls} h-auto py-3`} value={f.description} maxLength={500} onChange={e => setF({ ...f, description: e.target.value })} /></FormField>
      <FormField label="Logo (link https)" id="v-logo" error={errs['logo_url']}><input id="v-logo" className={inputCls} value={f.logo_url} inputMode="url" onChange={e => setF({ ...f, logo_url: e.target.value })} /></FormField>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={f.is_active} onChange={e => setF({ ...f, is_active: e.target.checked })} /> Đang hoạt động (hiển thị trong app)</label>
    </DemoDialog>

    <DemoDialog real open={!!confirm} onOpenChange={o => !o && setConfirm(null)} title="Xóa nhà cung cấp?"
      description={`“${confirm?.name}” sẽ bị xóa. Sản phẩm thuộc nhà cung cấp này giữ lại nhưng mất liên kết.`} submitLabel="Xóa"
      busy={del.isPending} onSubmit={e => { e.preventDefault(); if (confirm) del.mutate(confirm); }}>
      <></>
    </DemoDialog>
  </div>;
}

function ProductManager() {
  const qc = useQueryClient();
  const vendors = useQuery({ queryKey: ['affiliate-vendors-admin'], queryFn: async () => {
    const { data, error } = await supabase.from('affiliate_vendors').select('id,name').order('name');
    if (error) throw error; return data as { id: string; name: string }[];
  } });
  const q = useQuery({ queryKey: ['affiliate-products-admin'], queryFn: async () => {
    const { data, error } = await supabase.from('affiliate_products').select('*, affiliate_vendors(name)').order('sort_order').order('name');
    if (error) throw error; return data as (AffiliateProduct & { affiliate_vendors: { name: string } | null })[];
  } });
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState<ProductInput>(emptyProduct);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<AffiliateProduct | null>(null);

  const save = useMutation({
    mutationFn: async () => { const n = validateProductInput(f); setErrs(n); if (Object.keys(n).length) throw new Error('validation'); await saveProduct(editId, f); },
    onSuccess: () => { setOpen(false); qc.invalidateQueries({ queryKey: ['affiliate-products-admin'] }); qc.invalidateQueries({ queryKey: ['affiliate-products'] }); },
  });
  const del = useMutation({
    mutationFn: async (p: AffiliateProduct) => { await deleteProduct(p.id); },
    onSuccess: () => { setConfirm(null); qc.invalidateQueries({ queryKey: ['affiliate-products-admin'] }); qc.invalidateQueries({ queryKey: ['affiliate-products'] }); },
  });

  const startAdd = () => { setEditId(null); setF(emptyProduct); setErrs({}); setOpen(true); };
  const startEdit = (p: AffiliateProduct) => {
    setEditId(p.id);
    setF({ vendor_id: p.vendor_id ?? '', name: p.name, target_url: p.target_url, code: p.code, price_hint: p.price_hint ?? '', budget_category: p.budget_category ?? '', task_template_id: p.task_template_id ?? '', is_active: p.is_active, sort_order: p.sort_order });
    setErrs({}); setOpen(true);
  };

  return <div>
    <div className="mb-4 flex items-center justify-between">
      <SmallLabel>SẢN PHẨM · {q.data?.length ?? 0}</SmallLabel>
      <WriteButton size="lg" className="min-h-11" onClick={startAdd}><Plus className="size-4" /> Thêm</WriteButton>
    </div>
    {q.isPending ? <Loading /> : q.isError ? <Note tone="copper">Không tải được danh sách.</Note> :
      <Panel>{q.data.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có sản phẩm nào.</p> :
        q.data.map(p => <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border py-3 last:border-0">
          <div className="min-w-0"><div className="font-semibold">{p.name} {!p.is_active && <span className="text-xs font-normal text-muted-foreground">(đang tắt)</span>}</div>
            <p className="text-xs text-muted-foreground">{p.affiliate_vendors?.name ?? '—'} · <span className="font-mono">/r/{p.code}</span>{p.budget_category ? ` · nhóm ${p.budget_category}` : ''}{p.task_template_id ? ` · việc ${p.task_template_id}` : ''}</p></div>
          <div className="flex gap-1">
            <WriteButton variant="ghost" size="sm" className="min-h-11" onClick={() => startEdit(p)} aria-label={`Sửa ${p.name}`}><Pencil className="size-4" /></WriteButton>
            <WriteButton variant="ghost" size="sm" className="min-h-11 text-destructive" onClick={() => setConfirm(p)} aria-label={`Xóa ${p.name}`}><Trash2 className="size-4" /></WriteButton>
          </div>
        </div>)}
      </Panel>}

    <DemoDialog real open={open} onOpenChange={setOpen} title={editId ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}
      description="Sản phẩm có thể gắn vào nhóm ngân sách hoặc việc mẫu để hiển thị đúng ngữ cảnh." submitLabel="Lưu"
      busy={save.isPending} onSubmit={e => { e.preventDefault(); save.mutate(); }}>
      {save.isError && (save.error as Error).message !== 'validation' && <Note tone="copper">Không lưu được. Mã link có thể đã bị trùng.</Note>}
      <FormField label="Tên sản phẩm *" id="p-name" error={errs['name']}><input id="p-name" className={inputCls} value={f.name} maxLength={160} onChange={e => setF({ ...f, name: e.target.value })} /></FormField>
      <FormField label="Nhà cung cấp" id="p-vendor"><select id="p-vendor" className={inputCls} value={f.vendor_id} onChange={e => setF({ ...f, vendor_id: e.target.value })}>
        <option value="">— Không gắn —</option>{(vendors.data ?? []).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select></FormField>
      <FormField label="Link sản phẩm (affiliate) *" id="p-url" error={errs['target_url']}><input id="p-url" className={inputCls} value={f.target_url} inputMode="url" placeholder="https://…" onChange={e => setF({ ...f, target_url: e.target.value })} /></FormField>
      <FormField label="Mã link * (/r/mã)" id="p-code" error={errs['code']}><input id="p-code" className={inputCls} value={f.code} maxLength={32} placeholder="vd: vay-cuoi-cong-chua" onChange={e => setF({ ...f, code: e.target.value })} /></FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Gợi ý giá" id="p-price"><input id="p-price" className={inputCls} value={f.price_hint} maxLength={60} placeholder="Ví dụ: từ 299.000đ" onChange={e => setF({ ...f, price_hint: e.target.value })} /></FormField>
        <FormField label="Thứ tự" id="p-sort"><input id="p-sort" type="number" className={inputCls} value={f.sort_order} onChange={e => setF({ ...f, sort_order: Number(e.target.value) || 0 })} /></FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Nhóm ngân sách" id="p-cat"><select id="p-cat" className={inputCls} value={f.budget_category} onChange={e => setF({ ...f, budget_category: e.target.value })}>
          <option value="">— Không gắn —</option>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select></FormField>
        <FormField label="Mã việc mẫu" id="p-task" error={errs['task_template_id']}><input id="p-task" className={inputCls} value={f.task_template_id} placeholder="vd: s7" onChange={e => setF({ ...f, task_template_id: e.target.value })} /></FormField>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={f.is_active} onChange={e => setF({ ...f, is_active: e.target.checked })} /> Đang hoạt động (hiển thị trong app)</label>
    </DemoDialog>

    <DemoDialog real open={!!confirm} onOpenChange={o => !o && setConfirm(null)} title="Xóa sản phẩm?"
      description={`“${confirm?.name}” sẽ bị xóa.`} submitLabel="Xóa"
      busy={del.isPending} onSubmit={e => { e.preventDefault(); if (confirm) del.mutate(confirm); }}>
      <></>
    </DemoDialog>
  </div>;
}

function ClickStats() {
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ['affiliate-click-stats', days], queryFn: () => clickStats(days) });
  return <div>
    <div className="mb-4 flex items-center justify-between">
      <SmallLabel>THỐNG KÊ CLICK</SmallLabel>
      <select className={`${inputCls} mt-0 w-auto`} value={days} onChange={e => setDays(Number(e.target.value))} aria-label="Khoảng thời gian">
        <option value={7}>7 ngày qua</option><option value={30}>30 ngày qua</option><option value={90}>90 ngày qua</option>
      </select>
    </div>
    {q.isPending ? <Loading /> : q.isError ? <Note tone="copper">Không tải được thống kê.</Note> :
      <Panel>{q.data.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có click nào.</p> :
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3">Mã link</th><th className="py-2 pr-3">Tên</th><th className="py-2 pr-3">Loại</th>
            <th className="py-2 pr-3 text-right">Tổng</th><th className="py-2 text-right">{days} ngày</th>
          </tr></thead>
          <tbody>{(q.data as ClickStat[]).map(s => <tr key={s.code} className="border-b border-border last:border-0">
            <td className="py-2 pr-3 font-mono text-xs">/r/{s.code}</td><td className="py-2 pr-3">{s.label}</td>
            <td className="py-2 pr-3 text-xs text-muted-foreground">{s.kind === 'product' ? 'Sản phẩm' : 'Nhà cung cấp'}</td>
            <td className="py-2 pr-3 text-right font-semibold">{s.total}</td><td className="py-2 text-right">{s.recent}</td>
          </tr>)}</tbody>
        </table></div>}
      </Panel>}
  </div>;
}

export function AffiliateAdminScreen() {
  const admin = useQuery(adminQuery);
  const [tab, setTab] = useState<'vendors' | 'products' | 'stats'>('vendors');

  if (admin.isPending) return <div className="max-w-4xl"><Header name="Quản trị affiliate" subtitle="QUẢN TRỊ" /><Loading /></div>;
  if (!admin.data) return <div className="mx-auto max-w-xl"><Header name="Quản trị affiliate" subtitle="QUẢN TRỊ" />
    <Note tone="warm">Tài khoản này không có quyền quản trị affiliate. Nếu bạn là chủ ứng dụng, hãy thêm user vào bảng <span className="font-mono">affiliate_admins</span> bằng service role.</Note></div>;

  return <div className="max-w-4xl"><Header name="Quản trị affiliate" subtitle="QUẢN TRỊ" />
    <div className="mb-6 flex gap-2" role="tablist" aria-label="Quản trị affiliate">
      {([['vendors', 'Nhà cung cấp'], ['products', 'Sản phẩm'], ['stats', 'Thống kê click']] as const).map(([id, label]) =>
        <WriteButton key={id} variant={tab === id ? 'default' : 'outline'} size="lg" className="min-h-11" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</WriteButton>)}
    </div>
    {tab === 'vendors' && <VendorManager />}
    {tab === 'products' && <ProductManager />}
    {tab === 'stats' && <ClickStats />}
  </div>;
}
