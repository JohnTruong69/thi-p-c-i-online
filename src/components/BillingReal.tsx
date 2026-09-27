/** Truthful plan/checkout/receipt/operations screens. Checkout is staged OFF until approved terms + config are installed server-side. */
import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useAccessState } from './AccessStateBanner';
import { PRESALE_MONTHS, PRESALE_PRICE_VND } from '@/lib/presale';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Header, Panel, Note, SmallLabel, Row, Status, Action, InvitationTabs, inputCls } from './PhaseOne';
import { useMyWedding } from '@/lib/wedding-api';
import { createCheckoutOrder, getBillingAdminOverview, getCheckoutAvailability, reconcileSepayTransaction, saveBillingSettings } from '@/lib/billing.functions';

const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ';
const vnTime = (v: string | null | undefined) => v ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(v)) : '—';

function useAvailability() {
  const fn = useServerFn(getCheckoutAvailability);
  return useQuery({ queryKey: ['checkout-availability'], queryFn: () => fn(), staleTime: 60_000 });
}

function NotOnSale() {
  return <Note tone="warm"><strong>Gói chưa mở bán, hiện chưa thể thanh toán.</strong><br />Điều khoản, chính sách hoàn tiền và tài khoản nhận tiền SePay đang được hoàn tất, nên ứng dụng chưa tạo đơn và chưa nhận tiền. Khi mở, thanh toán chỉ qua SePay và quyền được mở tự động sau khi SePay xác nhận.</Note>;
}

/** The single locked package — always shown with its real price; sale state is separate. */
function LockedPackage({ onSale }: { onSale: boolean }) {
  return <Panel className="mt-4 border-l-[3px] border-l-primary">
    <div className="flex flex-wrap items-start justify-between gap-2"><SmallLabel>GÓI THIỆP CƯỚI · MỘT ĐÁM CƯỚI</SmallLabel><Status tone={onSale ? 'sage' : 'warm'}>{onSale ? 'Đang mở bán' : 'Chưa mở bán'}</Status></div>
    <h2 className="text-3xl">{vnd(PRESALE_PRICE_VND)}</h2>
    <p className="mt-1 text-sm">Thanh toán một lần · dùng {PRESALE_MONTHS} tháng kể từ lúc SePay xác nhận · không tự gia hạn.</p>
    <div className="mt-3 border-t border-border">
      <Row title="Kế hoạch cưới, sổ khách, nhập CSV" detail="Hai người cùng quản lý với quyền như nhau" />
      <Row title="Thiệp Đường Hẹn, tối đa 3 link" detail="Chung, nhà trai và nhà gái" />
      <Row title="Tối đa 50 ảnh" detail="Mỗi ảnh gốc tối đa 10 MB" />
      <Row title="Phản hồi tham dự theo từng buổi" detail="Khách trả lời không cần đăng nhập" />
    </div>
    <p className="mt-3 text-xs text-muted-foreground">Sau {PRESALE_MONTHS} tháng, thiệp ngừng hiển thị với khách và đám cưới chuyển sang chỉ xem; hai bạn vẫn tải được dữ liệu.</p>
  </Panel>;
}

/** What this account should do about the package: already covered, existing wedding waiting for sale, or no wedding yet (go to /goi). */
function OwnerPackageStatus() {
  const w = useMyWedding(); const acc = useAccessState(w.data?.id);
  if (w.isPending || (w.data && acc.isPending)) return null;
  if (!w.data) return <Note tone="warm">Tài khoản này chưa có đám cưới. Khách hàng mới thanh toán gói trước ở trang gói, sau đó dùng đường dẫn đơn để tạo đám cưới. <Link to="/goi" className="font-semibold text-primary underline">Xem gói và cách thanh toán</Link></Note>;
  const st = acc.data?.state;
  if (st === 'paid_active' || st === 'legacy_paid_active') return <Note tone="sage"><strong>Đám cưới này đã có quyền sử dụng</strong> đến {vnTime(acc.data?.paid_expires_at)} (giờ Việt Nam). Hai bạn không cần thanh toán thêm.</Note>;
  return <Note tone="sage"><strong>Đám cưới của hai bạn vẫn dùng bình thường.</strong> Hai bạn chưa phải trả khoản nào; dữ liệu được giữ nguyên. Khi gói mở bán, việc thanh toán để công bố thiệp sẽ thực hiện ngay tại đây.</Note>;
}

export function RealPlansScreen() {
  const a = useAvailability(); const onSale = !!(a.data?.available && a.data.offer);
  return <div className="max-w-3xl"><Header name="Gói thiệp cưới" subtitle="CÔNG BỐ THIỆP" /><InvitationTabs active="publish" />
    <OwnerPackageStatus />
    <LockedPackage onSale={onSale} />
    {onSale ? <Action to="/checkout" className="mt-4 w-full">Xem đơn và thanh toán</Action> : <div className="mt-4"><NotOnSale /></div>}
  </div>;
}

export function RealCheckoutScreen() {
  const a = useAvailability(); const w = useMyWedding(); const qc = useQueryClient(); const navigate = useNavigate();
  const create = useServerFn(createCheckoutOrder);
  const [agree, setAgree] = useState(false);
  const orders = useQuery({ enabled: !!w.data, queryKey: ['billing-orders', w.data?.id], queryFn: async () => {
    const r = await supabase.from('billing_orders').select('id, code, status, amount_vnd, created_at, paid_at, entitlement_expires_at').eq('wedding_id', w.data!.id).order('created_at', { ascending: false });
    if (r.error) throw r.error; return r.data;
  } });
  const m = useMutation({ mutationFn: () => create({ data: { weddingId: w.data!.id, acceptTermsVersion: a.data!.offer!.terms_version } }),
    onSuccess: r => { qc.invalidateQueries({ queryKey: ['billing-orders'] }); navigate({ to: '/checkout/status/$id', params: { id: r.order_id } }); } });
  const offer = a.data?.available ? a.data.offer : null;
  return <div className="max-w-3xl"><Header name="Thanh toán gói Wedding" subtitle="ĐƠN HÀNG" />
    {a.isPending ? <p className="text-sm text-muted-foreground">Đang kiểm tra…</p> : a.isError ? <Note tone="copper">Chưa kiểm tra được trạng thái thanh toán. <button className="font-semibold underline" onClick={() => a.refetch()}>Thử lại</button></Note>
      : !offer ? <><OwnerPackageStatus /><LockedPackage onSale={false} /><div className="mt-4"><NotOnSale /></div></>
      : <Panel><SmallLabel>ĐIỀU KHOẢN {offer.terms_version}</SmallLabel><h2 className="text-3xl">{vnd(offer.price_vnd)}</h2><p className="text-sm">Một lần · {offer.duration_months} tháng từ lúc xác minh</p>
        {offer.terms_url && <a href={offer.terms_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold underline">Đọc điều khoản</a>}
        <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-1" />Tôi đã đọc và đồng ý điều khoản {offer.terms_version}.</label>
        {m.isError && <p role="alert" className="mt-2 text-xs font-semibold text-destructive">{String((m.error as Error).message).includes('already') ? 'Đám cưới đã có quyền sử dụng.' : 'Chưa tạo được đơn. Hãy thử lại.'}</p>}
        <Button className="mt-3 min-h-11 w-full" disabled={!agree || m.isPending || !w.data} onClick={() => m.mutate()}>{m.isPending ? 'Đang tạo…' : 'Tạo đơn thanh toán qua SePay'}</Button></Panel>}
    {!!orders.data?.length && <Panel className="mt-4"><SmallLabel>LỊCH SỬ ĐƠN</SmallLabel>{orders.data.map(o => <Row key={o.id} to={`/checkout/status/${o.id}`} title={o.code} detail={`${vnd(o.amount_vnd)} · tạo ${vnTime(o.created_at)}`} right={<Status tone={o.status === 'paid' ? 'sage' : 'warm'}>{STATUS[o.status] ?? o.status}</Status>} />)}</Panel>}
  </div>;
}
const STATUS: Record<string, string> = { pending: 'Chờ SePay xác nhận', paid: 'Đã xác minh', expired: 'Hết hạn', cancelled: 'Đã hủy' };

export function RealOrderStatusScreen({ id }: { id?: string | undefined }) {
  const q = useQuery({ enabled: !!id, queryKey: ['billing-order', id], refetchInterval: d => d.state.data?.status === 'pending' ? 10_000 : false, queryFn: async () => {
    const r = await supabase.from('billing_orders').select('*').eq('id', id!).maybeSingle(); if (r.error) throw r.error; return r.data;
  } });
  const o = q.data;
  return <div className="max-w-3xl"><Header name="Trạng thái đơn" subtitle="ĐƠN HÀNG" />
    {q.isPending ? <p className="text-sm text-muted-foreground">Đang tải…</p> : !o ? <Note tone="warm">Không tìm thấy đơn này, hoặc bạn không có quyền xem.</Note>
      : o.status === 'paid' ? <Panel className="bg-sage"><SmallLabel>ĐÃ XÁC MINH THANH TOÁN</SmallLabel><h2 className="text-2xl">{o.code}</h2>
          <div className="mt-2 border-t border-border"><Row title="Số tiền" detail={vnd(o.amount_vnd)} /><Row title="Xác minh lúc" detail={`${vnTime(o.paid_at)} (giờ Việt Nam)`} /><Row title="Quyền dùng đến" detail={`${vnTime(o.entitlement_expires_at)} (giờ Việt Nam)`} /><Row title="Điều khoản" detail={o.terms_version} /></div></Panel>
      : o.status === 'pending' ? <Panel><SmallLabel>CHỜ THANH TOÁN QUA SEPAY · HẾT HẠN {vnTime(o.expires_at)}</SmallLabel>
          <div className="border-t border-border"><Row title="Ngân hàng" detail={o.bank_gateway} /><Row title="Số tài khoản" detail={o.bank_account_number} /><Row title="Chủ tài khoản" detail={o.bank_account_name} /><Row title="Số tiền chính xác" detail={vnd(o.amount_vnd)} /><Row title="Nội dung chuyển khoản" detail={o.code} /></div>
          <img alt={`Mã QR SePay cho đơn ${o.code}`} className="mx-auto mt-3 w-56" src={`https://qr.sepay.vn/img?acc=${encodeURIComponent(o.bank_account_number)}&bank=${encodeURIComponent(o.bank_gateway)}&amount=${o.amount_vnd}&des=${o.code}`} />
          <p className="mt-2 text-xs text-muted-foreground">Trang tự cập nhật khi hệ thống nhận và xác minh giao dịch. Chỉ thanh toán qua SePay. Chuyển đúng số tiền và nội dung; quyền mở tự động khi SePay xác nhận giao dịch. Nếu sai lệch, bộ phận hỗ trợ chỉ đối soát giao dịch đã được SePay xác nhận.</p></Panel>
      : <Note tone="warm">Đơn {o.code}: {STATUS[o.status]}. Chưa có thanh toán nào được xác minh cho đơn này.</Note>}
    <Action to="/checkout" variant="outline" className="mt-4 w-full">Về trang đơn hàng</Action>
  </div>;
}

export function RealAdminScreen() {
  const fn = useServerFn(getBillingAdminOverview); const rec = useServerFn(reconcileSepayTransaction); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['billing-admin'], queryFn: () => fn(), retry: false });
  const [form, setForm] = useState<{ tx: number; code: string; note: string } | null>(null);
  const m = useMutation({ mutationFn: () => rec({ data: { txId: form!.tx, orderCode: form!.code.trim().toUpperCase(), note: form!.note } }), onSuccess: () => { setForm(null); qc.invalidateQueries({ queryKey: ['billing-admin'] }); } });
  if (q.isPending) return <p className="text-sm text-muted-foreground">Đang tải…</p>;
  if (q.isError) return <div className="max-w-3xl"><Header name="Vận hành" subtitle="QUẢN TRỊ" /><Note tone="warm">Bạn không có quyền vận hành thanh toán.</Note></div>;
  const c = q.data.checklist;
  const item = (ok: boolean, label: string) => <Row title={label} detail={ok ? 'Đã có' : 'Chưa có'} right={<Status tone={ok ? 'sage' : 'warm'}>{ok ? 'OK' : 'Thiếu'}</Status>} />;
  return <div className="max-w-3xl"><Header name="Vận hành thanh toán" subtitle="QUẢN TRỊ" />
    <Panel><SmallLabel>ĐIỀU KIỆN MỞ THANH TOÁN (CHỈ ĐỌC)</SmallLabel>
      {item(c.offerInstalled, 'Giá và phiên bản gói')}{item(c.termsApproved, 'Điều khoản đã duyệt')}{item(c.accountEnabled, `Tài khoản nhận tiền${c.accountLast4 ? ' ••' + c.accountLast4 : ''}`)}{item(c.webhookSecret, 'Khóa ký webhook SePay')}{item(c.sandboxVerified, 'Đã kiểm tra SePay sandbox đầu-cuối')}{item(c.goLive, 'Công tắc mở bán trên máy chủ')}{item(c.liveEnabled, 'Công tắc mở bán trong dữ liệu')}
      <p className="mt-2 text-xs text-muted-foreground">Duyệt điều khoản, xác nhận sandbox, khóa webhook và công tắc mở bán do người vận hành cài ngoài ứng dụng.</p></Panel>
    <SepaySettingsForm initial={q.data.settings} />
    <Panel className="mt-4"><SmallLabel>GIAO DỊCH SEPAY CẦN ĐỐI SOÁT</SmallLabel><p className="mb-2 text-xs text-muted-foreground">Chỉ gồm giao dịch SePay đã xác thực chữ ký. Chỉ gắn lại vào đơn còn hiệu lực, đúng số tiền và tài khoản; không có cách đánh dấu đã trả thủ công.</p>{q.data.unmatched.length === 0 ? <p className="text-sm text-muted-foreground">Không có giao dịch chờ.</p> : q.data.unmatched.map(t => <div key={t.id} className="border-b border-border py-3 last:border-0"><div className="font-semibold">#{t.sepay_id} · {vnd(t.transfer_amount)} · {t.unmatched_reason ?? t.match_status}</div><p className="text-xs text-muted-foreground break-words">{t.transaction_date} · {t.content}</p><Button variant="outline" className="mt-2" onClick={() => setForm({ tx: t.id, code: t.code ?? '', note: '' })}>Gắn giao dịch SePay này với đơn</Button></div>)}</Panel>
    {form && <Panel className="mt-4"><label className="block text-xs font-semibold">Mã đơn<input className={inputCls} value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></label><label className="mt-2 block text-xs font-semibold">Lý do ngoại lệ (tối thiểu 15 ký tự, lưu nhật ký)<input className={inputCls} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></label>
      {m.data && m.data.result !== 'matched' && m.data.result !== 'already_matched' && <p role="alert" className="mt-2 text-xs font-semibold text-destructive">Không khớp: {m.data.reason}</p>}{m.isError && <p role="alert" className="mt-2 text-xs text-destructive">Chưa đối soát được.</p>}
      <Button className="mt-3" disabled={m.isPending || form.note.trim().length < 15} onClick={() => m.mutate()}>Xác nhận đối soát</Button></Panel>}
    <Panel className="mt-4"><SmallLabel>ĐƠN GẦN ĐÂY</SmallLabel>{q.data.orders.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có đơn.</p> : q.data.orders.map(o => <Row key={o.id} title={o.code} detail={`${vnd(o.amount_vnd)} · ${vnTime(o.created_at)}`} right={<Status>{STATUS[o.status] ?? o.status}</Status>} />)}</Panel>
  </div>;
}

type Settings = { offerVersion: string; priceVnd: number; termsVersion: string; termsUrl: string | null; bankGateway: string | null; bankAccountNumber: string | null; bankAccountName: string | null; accountEnabled: boolean };
function SepaySettingsForm({ initial }: { initial: Settings | null }) {
  const save = useServerFn(saveBillingSettings); const qc = useQueryClient();
  const [f, setF] = useState({ offerVersion: initial?.offerVersion ?? 'test-36m-v1', price: String(initial?.priceVnd ?? ''), termsVersion: initial?.termsVersion ?? '', termsUrl: initial?.termsUrl ?? '', bankGateway: initial?.bankGateway ?? '', acc: initial?.bankAccountNumber ?? '', accName: initial?.bankAccountName ?? '', accountEnabled: initial?.accountEnabled ?? false });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const price = Number(f.price.replace(/\D/g, ''));
  const errs: string[] = [];
  if (!/^[a-z0-9_.-]{3,40}$/.test(f.offerVersion)) errs.push('Phiên bản gói: 3–40 ký tự a-z, 0-9, dấu chấm, gạch.');
  if (!(price > 0 && price <= 100000000)) errs.push('Giá phải là số đồng lớn hơn 0.');
  if (!f.termsVersion.trim()) errs.push('Cần phiên bản điều khoản.');
  if (f.termsUrl && !/^https:\/\//.test(f.termsUrl)) errs.push('Link điều khoản phải bắt đầu bằng https://');
  if (f.acc && !/^[0-9A-Za-z]{4,30}$/.test(f.acc)) errs.push('Số tài khoản: 4–30 chữ/số, không dấu cách.');
  if (f.accountEnabled && (!f.bankGateway.trim() || !f.acc || !f.accName.trim())) errs.push('Bật tài khoản nhận tiền cần đủ ngân hàng, số và tên chủ tài khoản.');
  const m = useMutation({ mutationFn: () => save({ data: { offerVersion: f.offerVersion, priceVnd: price, termsVersion: f.termsVersion.trim(), termsUrl: f.termsUrl.trim() || null, bankGateway: f.bankGateway.trim() || null, bankAccountNumber: f.acc || null, bankAccountName: f.accName.trim() || null, accountEnabled: f.accountEnabled } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-admin'] }) });
  const field = (label: string, k: keyof typeof f, extra?: React.InputHTMLAttributes<HTMLInputElement>) => <label className="mt-2 block text-xs font-semibold">{label}<input className={inputCls} value={f[k] as string} onChange={set(k)} {...extra} /></label>;
  return <Panel className="mt-4"><SmallLabel>CÀI ĐẶT SEPAY</SmallLabel>
    <Note tone="warm">Lưu ở đây không mở bán. Giá gói khóa ở 199.000 đ; giá khác sẽ bị từ chối khi mở bán. Đổi giá, điều khoản hoặc tài khoản sẽ xóa dấu "đã duyệt điều khoản" và "đã kiểm tra sandbox" để phải làm lại.</Note>
    <form onSubmit={e => { e.preventDefault(); if (!errs.length) m.mutate(); }}>
      {field('Phiên bản gói', 'offerVersion')}
      {field('Giá (khóa 199.000 đồng)', 'price', { inputMode: 'numeric' })}
      {field('Phiên bản điều khoản', 'termsVersion')}
      {field('Link điều khoản (https://, không bắt buộc)', 'termsUrl', { type: 'url' })}
      {field('Ngân hàng liên kết SePay (ví dụ MBBank)', 'bankGateway')}
      {field('Số tài khoản nhận', 'acc', { autoComplete: 'off' })}
      {field('Tên chủ tài khoản', 'accName')}
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.accountEnabled} onChange={set('accountEnabled')} />Tài khoản đã liên kết với SePay</label>
      {errs.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-destructive">{errs.map(x => <li key={x}>{x}</li>)}</ul>}
      {m.isError && <p role="alert" className="mt-2 text-xs text-destructive">Chưa lưu được, thử lại.</p>}
      {m.isSuccess && <p role="status" className="mt-2 text-xs text-muted-foreground">Đã lưu. Mở bán vẫn tắt.{m.data.clearedApproval ? ' Điều khoản cần duyệt lại.' : ''}{m.data.clearedSandbox ? ' Cần chạy lại sandbox.' : ''}</p>}
      <Button type="submit" className="mt-3" disabled={m.isPending || errs.length > 0}>{m.isPending ? 'Đang lưu…' : 'Lưu cài đặt'}</Button>
    </form>
    <p className="mt-2 text-xs text-muted-foreground">Khóa ký webhook SePay được lưu trong cài đặt bảo mật máy chủ, không nhập ở đây.</p>
  </Panel>;
}
