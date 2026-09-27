/** Truthful plan/checkout/receipt/operations screens. Checkout is staged OFF until approved terms + config are installed server-side. */
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Header, Panel, Note, SmallLabel, Row, Status, Action, InvitationTabs, inputCls } from './PhaseOne';
import { useMyWedding } from '@/lib/wedding-api';
import { createCheckoutOrder, getBillingAdminOverview, getCheckoutAvailability, reconcileSepayTransaction } from '@/lib/billing.functions';

const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ';
const vnTime = (v: string | null | undefined) => v ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(v)) : '—';

function useAvailability() {
  const fn = useServerFn(getCheckoutAvailability);
  return useQuery({ queryKey: ['checkout-availability'], queryFn: () => fn(), staleTime: 60_000 });
}

function NotOnSale() {
  return <Note tone="warm"><strong>Gói mới đang hoàn thiện, chưa thể thanh toán.</strong><br />Hiện chưa có giá, điều khoản hay tài khoản nhận tiền được duyệt, nên ứng dụng chưa tạo đơn và chưa nhận thanh toán. Khi mở, thanh toán chỉ qua SePay và quyền được mở tự động sau khi SePay xác nhận. Hai bạn vẫn chuẩn bị miễn phí và dữ liệu được giữ nguyên.</Note>;
}

function ProposedRights() {
  return <Panel className="mt-4 border-l-[3px] border-l-primary">
    <div className="flex flex-wrap items-start justify-between gap-2"><SmallLabel>QUYỀN DỰ KIẾN · BẢN THỬ NGHIỆM</SmallLabel><Status tone="warm">Thử nghiệm · chưa mở bán</Status></div>
    <h2 className="text-2xl">Thanh toán một lần cho một đám cưới</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">Đây là hướng đang cân nhắc, có thể thay đổi. Giá và điều khoản chính thức chỉ hiển thị khi đã được duyệt.</p>
    <div className="mt-3 border-t border-border">
      <Row title="Dự kiến 36 tháng" detail="Tính từ lúc thanh toán được hệ thống xác minh, không gia hạn tự động" />
      <Row title="Công bố tối đa 3 link" detail="Chung, nhà trai và nhà gái" />
      <Row title="Tối đa 50 ảnh" detail="Mỗi ảnh gốc tối đa 10 MB" />
      <Row title="Phản hồi tham dự theo từng buổi" detail="Khách trả lời không cần đăng nhập" />
    </div>
    <p className="mt-3 text-xs text-muted-foreground">Chính sách hủy và hoàn tiền chưa được chốt; sẽ nêu rõ trong điều khoản trước khi mở thanh toán.</p>
  </Panel>;
}

export function RealPlansScreen() {
  const a = useAvailability();
  return <div className="max-w-3xl"><Header name="Chuẩn bị công bố" subtitle="CÔNG BỐ THIỆP" /><InvitationTabs active="publish" />
    <Panel className="mb-4 bg-sage"><SmallLabel>CHUẨN BỊ MIỄN PHÍ</SmallLabel><p className="text-sm">Kế hoạch cưới, sổ khách, nhập CSV và soạn/xem trước thiệp Đường Hẹn.</p></Panel>
    {a.data?.available && a.data.offer ? <Panel className="border-l-[3px] border-l-primary"><SmallLabel>GÓI ĐÃ DUYỆT · ĐIỀU KHOẢN {a.data.offer.terms_version}</SmallLabel><h2 className="text-3xl">{vnd(a.data.offer.price_vnd)}</h2><p className="mt-1 text-sm">Thanh toán một lần · {a.data.offer.duration_months} tháng từ lúc xác minh</p><Action to="/checkout" className="mt-4 w-full">Xem đơn và thanh toán</Action></Panel>
      : <><NotOnSale /><ProposedRights /></>}
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
      : !offer ? <><NotOnSale /><Action to="/plans" variant="outline" className="mt-4 w-full">Xem quyền dự kiến (thử nghiệm)</Action></>
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
          <img alt={`QR chuyển khoản cho đơn ${o.code}`} className="mx-auto mt-3 w-56" src={`https://qr.sepay.vn/img?acc=${encodeURIComponent(o.bank_account_number)}&bank=${encodeURIComponent(o.bank_gateway)}&amount=${o.amount_vnd}&des=${o.code}`} />
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
      <p className="mt-2 text-xs text-muted-foreground">Các mục này chỉ được cài bởi người vận hành ngoài ứng dụng sau khi điều khoản được duyệt.</p></Panel>
    <Panel className="mt-4"><SmallLabel>GIAO DỊCH SEPAY CẦN ĐỐI SOÁT</SmallLabel><p className="mb-2 text-xs text-muted-foreground">Chỉ gồm giao dịch SePay đã xác thực chữ ký. Chỉ gắn lại vào đơn còn hiệu lực, đúng số tiền và tài khoản; không có cách đánh dấu đã trả thủ công.</p>{q.data.unmatched.length === 0 ? <p className="text-sm text-muted-foreground">Không có giao dịch chờ.</p> : q.data.unmatched.map(t => <div key={t.id} className="border-b border-border py-3 last:border-0"><div className="font-semibold">#{t.sepay_id} · {vnd(t.transfer_amount)} · {t.unmatched_reason ?? t.match_status}</div><p className="text-xs text-muted-foreground break-words">{t.transaction_date} · {t.content}</p><Button variant="outline" className="mt-2" onClick={() => setForm({ tx: t.id, code: t.code ?? '', note: '' })}>Gắn giao dịch SePay này với đơn</Button></div>)}</Panel>
    {form && <Panel className="mt-4"><label className="block text-xs font-semibold">Mã đơn<input className={inputCls} value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></label><label className="mt-2 block text-xs font-semibold">Lý do ngoại lệ (tối thiểu 15 ký tự, lưu nhật ký)<input className={inputCls} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></label>
      {m.data && m.data.result !== 'matched' && m.data.result !== 'already_matched' && <p role="alert" className="mt-2 text-xs font-semibold text-destructive">Không khớp: {m.data.reason}</p>}{m.isError && <p role="alert" className="mt-2 text-xs text-destructive">Chưa đối soát được.</p>}
      <Button className="mt-3" disabled={m.isPending || form.note.trim().length < 15} onClick={() => m.mutate()}>Xác nhận đối soát</Button></Panel>}
    <Panel className="mt-4"><SmallLabel>ĐƠN GẦN ĐÂY</SmallLabel>{q.data.orders.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có đơn.</p> : q.data.orders.map(o => <Row key={o.id} title={o.code} detail={`${vnd(o.amount_vnd)} · ${vnTime(o.created_at)}`} right={<Status>{STATUS[o.status] ?? o.status}</Status>} />)}</Panel>
  </div>;
}
