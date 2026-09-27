/** New-customer flow: package → SePay order → verified payment → confirmed-email account → claim creates wedding + 36-month access. */
import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { PublicShell } from './AuthScreens';
import { Header, Panel, Note, SmallLabel, inputCls } from './PhaseOne';
import { createPresaleOrder, getPresaleStatus, getPublicOffer } from '@/lib/presale.functions';
import { requestAccountEmail } from '@/lib/account-provision.functions';
import { PRESALE_MONTHS, PRESALE_PRICE_VND, claimErrorText } from '@/lib/presale';

const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ';
const vnTime = (v: string | null | undefined) => v ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(v)) : '—';

const INCLUDED = [
  'Một đám cưới, tối đa 2 người cùng quản lý với quyền như nhau (người thứ hai tham gia qua lời mời, không trả thêm).',
  'Kế hoạch cưới: việc cần làm, 43 việc gợi ý, ngân sách chi tiết.',
  'Sổ khách theo từng buổi lễ, nhập/xuất file CSV.',
  'Thiệp Đường Hẹn (một mẫu), tối đa 3 link: chung, nhà trai, nhà gái; tối đa 50 ảnh, mỗi ảnh ≤ 10 MB.',
  'Khách trả lời tham dự theo từng buổi; tối đa 2 người thân được xem.',
];

export function PackagePage() {
  const fn = useServerFn(getPublicOffer); const create = useServerFn(createPresaleOrder); const navigate = useNavigate();
  const q = useQuery({ queryKey: ['public-offer'], queryFn: () => fn() });
  const [email, setEmail] = useState(''); const [agree, setAgree] = useState(false); const [msg, setMsg] = useState('');
  const m = useMutation({
    mutationFn: () => create({ data: { email: email.trim(), termsVersion: q.data!.termsVersion!, acceptTerms: true } }),
    onSuccess: r => {
      if (r.ok) { navigate({ to: '/pay/$token', params: { token: r.token } }); return; }
      setMsg(r.error === 'rate_limited' ? 'Bạn đã tạo quá nhiều đơn trong thời gian ngắn. Hãy thử lại sau.' : r.error === 'terms_changed' ? 'Điều khoản vừa được cập nhật, hãy tải lại trang.' : r.error === 'unavailable' ? 'Gói chưa mở bán.' : 'Chưa tạo được đơn, hãy thử lại.');
    },
    onError: () => setMsg('Chưa tạo được đơn, hãy thử lại.'),
  });
  const live = q.data?.live === true;
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  return <PublicShell><Header name="Gói Thiệp Cưới" subtitle="THANH TOÁN TRƯỚC, RỒI TẠO TÀI KHOẢN" />
    <Panel>
      <div className="font-display text-3xl">{vnd(PRESALE_PRICE_VND)}</div>
      <p className="mt-1 text-sm text-muted-foreground">Một lần cho một đám cưới · dùng {PRESALE_MONTHS} tháng kể từ lúc SePay xác nhận thanh toán · không tự gia hạn.</p>
      <SmallLabel>GỒM</SmallLabel>
      <ul className="list-disc space-y-1 pl-5 text-sm">{INCLUDED.map(x => <li key={x}>{x}</li>)}</ul>
      <SmallLabel>KHI HẾT HẠN</SmallLabel>
      <p className="text-sm">Sau {PRESALE_MONTHS} tháng, thiệp ngừng hiển thị với khách và đám cưới chuyển sang chỉ xem. Hai bạn vẫn tải được dữ liệu đã nhập trong ít nhất 90 ngày.</p>
      <p className="mt-2 text-xs text-muted-foreground">Không có kho mẫu, nhạc hay thiết kế riêng. Thanh toán chỉ qua chuyển khoản SePay, không nhận tiền mặt hay cổng khác.</p>
    </Panel>
    {q.isPending ? <p className="mt-4 text-sm text-muted-foreground">Đang tải…</p> : !live ? <div className="mt-4"><Note tone="warm"><strong>Gói chưa mở bán.</strong> Điều khoản, chính sách hoàn tiền và tài khoản nhận tiền đang được hoàn thiện, nên chưa thể tạo đơn hay thanh toán lúc này.</Note></div> :
      <Panel className="mt-4"><form noValidate onSubmit={e => { e.preventDefault(); if (emailOk && agree && !m.isPending) m.mutate(); }}>
        <label className="block text-xs font-semibold">Email của bạn (dùng để tạo tài khoản sau khi thanh toán)<input type="email" autoComplete="email" maxLength={255} className={inputCls} value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={agree} onChange={e => setAgree(e.target.checked)} /><span>Tôi đã đọc và đồng ý <a className="font-semibold text-primary underline" href={q.data?.termsUrl ?? '#'} target="_blank" rel="noreferrer">điều khoản (bản {q.data?.termsVersion})</a>, gồm chính sách hoàn tiền.</span></label>
        {msg && <p role="alert" className="mt-2 text-xs text-destructive">{msg}</p>}
        <Button type="submit" className="mt-4 w-full" disabled={!emailOk || !agree || m.isPending}>{m.isPending ? 'Đang tạo đơn…' : 'Tạo đơn thanh toán'}</Button>
      </form></Panel>}
    <p className="mt-4 text-center text-sm"><Link to="/login" className="font-semibold text-primary">Đã có tài khoản? Đăng nhập</Link></p>
  </PublicShell>;
}

export function PayStatusPage({ token }: { token: string }) {
  const fn = useServerFn(getPresaleStatus);
  const valid = /^[0-9a-f]{64}$/.test(token);
  const q = useQuery({ queryKey: ['presale', token], queryFn: () => fn({ data: { token } }), enabled: valid, refetchInterval: d => (d.state.data?.found && d.state.data.status === 'pending' ? 10_000 : false) });
  const claim = `/claim/${token}`;
  return <PublicShell><Header name="Đơn thanh toán" subtitle="GÓI THIỆP CƯỚI" />
    <Note tone="warm">Hãy lưu lại địa chỉ trang này. Đây là cách duy nhất để xem đơn và tạo đám cưới sau khi thanh toán; đừng chia sẻ cho người khác.</Note>
    <div className="mt-4">{!valid || (q.data && !q.data.found) ? <Panel><p className="text-sm">Không tìm thấy đơn.</p></Panel> : q.isPending ? <p className="text-sm text-muted-foreground">Đang tải…</p> : q.isError ? <Panel><p className="text-sm">Chưa tải được đơn. <button className="font-semibold text-primary" onClick={() => q.refetch()}>Thử lại</button></p></Panel> : q.data.found && <Panel>
      <p className="text-sm">Email: <strong>{q.data.maskedEmail}</strong> · Số tiền: <strong>{vnd(q.data.amountVnd)}</strong></p>
      {q.data.status === 'pending' && (q.data.payment ? <div className="mt-3">
        <img src={q.data.payment.qr} alt="Mã QR chuyển khoản SePay" className="mx-auto h-56 w-56" />
        <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm"><dt>Ngân hàng</dt><dd>{q.data.payment.bank}</dd><dt>Số tài khoản</dt><dd className="font-semibold">{q.data.payment.account}</dd><dt>Chủ tài khoản</dt><dd>{q.data.payment.accountName}</dd><dt>Số tiền</dt><dd className="font-semibold">{vnd(q.data.amountVnd)}</dd><dt>Nội dung</dt><dd className="font-semibold">{q.data.payment.code}</dd></dl>
        <p className="mt-2 text-xs text-muted-foreground">Chuyển đúng số tiền và nội dung trước {vnTime(q.data.expiresAt)}. Trang tự cập nhật khi SePay xác nhận.</p>
      </div> : <p className="mt-3 text-sm">Thanh toán đang tạm đóng, chưa hiển thị thông tin chuyển khoản.</p>)}
      {q.data.status === 'expired' && <p className="mt-3 text-sm">Đơn đã hết hạn thanh toán. <Link to="/goi" className="font-semibold text-primary">Tạo đơn mới</Link></p>}
      {q.data.status === 'paid' && <div className="mt-3"><p className="text-sm font-semibold">SePay đã xác nhận thanh toán lúc {vnTime(q.data.paidAt)}.</p>
        <p className="mt-1 text-sm">Tạo tài khoản bằng đúng email {q.data.maskedEmail}, xác nhận email, rồi quay lại để tạo đám cưới (trước {vnTime(q.data.claimExpiresAt)}).</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2"><Button asChild><Link to="/register" search={{ redirect: claim }}>Tạo tài khoản</Link></Button><Button asChild variant="outline"><Link to="/login" search={{ redirect: claim }}>Đã có tài khoản</Link></Button></div><AccountEmailButton kind="presale" token={token} /></div>}
      {q.data.status === 'claimed' && <p className="mt-3 text-sm">Đơn đã được dùng để tạo đám cưới. <Link to="/login" className="font-semibold text-primary">Đăng nhập</Link></p>}
    </Panel>}</div>
  </PublicShell>;
}

export function ClaimScreen({ token }: { token: string }) {
  const navigate = useNavigate(); const qc = useQueryClient();
  const [f, setF] = useState({ one: '', two: '', eventName: 'Lễ cưới', eventDate: '' }); const [msg, setMsg] = useState('');
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('claim_presale_order', { p_token: token, p_partner_one: f.one.trim(), p_partner_two: f.two.trim(), p_planned_date: null as never, p_event_name: f.eventName.trim(), p_event_side: 'chung', p_event_date: (f.eventDate || null) as never });
      if (error) throw new Error(error.message); return data;
    },
    onSuccess: async () => { await qc.invalidateQueries(); navigate({ to: '/home' }); },
    onError: e => setMsg(claimErrorText((e as Error).message)),
  });
  const ok = f.one.trim() && f.two.trim() && f.eventName.trim();
  return <div className="max-w-2xl"><Header name="Tạo đám cưới từ đơn đã thanh toán" subtitle="GÓI THIỆP CƯỚI" />
    <Panel><form noValidate onSubmit={e => { e.preventDefault(); if (ok && !m.isPending) m.mutate(); }} className="space-y-3">
      <label className="block text-xs font-semibold">Tên cô dâu *<input className={inputCls} maxLength={80} value={f.one} onChange={e => setF({ ...f, one: e.target.value })} /></label>
      <label className="block text-xs font-semibold">Tên chú rể *<input className={inputCls} maxLength={80} value={f.two} onChange={e => setF({ ...f, two: e.target.value })} /></label>
      <label className="block text-xs font-semibold">Buổi lễ đầu tiên *<input className={inputCls} maxLength={120} value={f.eventName} onChange={e => setF({ ...f, eventName: e.target.value })} /></label>
      <label className="block text-xs font-semibold">Ngày (chưa chốt có thể bỏ trống)<input type="date" className={inputCls} value={f.eventDate} onChange={e => setF({ ...f, eventDate: e.target.value })} /></label>
      {msg && <p role="alert" className="text-xs text-destructive">{msg}</p>}
      <Button type="submit" className="w-full" disabled={!ok || m.isPending}>{m.isPending ? 'Đang tạo…' : 'Tạo đám cưới'}</Button>
    </form></Panel></div>;
}

export function PayFirstNote() {
  return <Note tone="warm"><strong>Tài khoản mới cần thanh toán gói trước.</strong> Tài khoản này chưa gắn với đơn đã thanh toán nên chưa tạo được đám cưới. Nếu bạn được mời cùng quản lý, hãy mở liên kết lời mời. <Link to="/goi" className="font-semibold text-primary underline">Xem gói</Link></Note>;
}

const EMAIL_REASON: Record<string, string> = {
  existing_account: 'Email này đã có tài khoản. Hãy đăng nhập (hoặc dùng "Quên mật khẩu").',
  wait: 'Vừa gửi xong. Hãy đợi một phút rồi thử lại.', too_many: 'Đã gửi quá nhiều lần. Hãy liên hệ hỗ trợ.',
  not_paid: 'Đơn chưa được SePay xác nhận.', already_claimed: 'Đơn đã được dùng.', claim_expired: 'Đơn đã quá hạn tạo tài khoản.',
  invite_inactive: 'Lời mời đã hết hạn hoặc bị hủy.', not_found: 'Liên kết không hợp lệ.', send_failed: 'Chưa gửi được email. Hãy thử lại.', not_configured: 'Tính năng gửi email tạo tài khoản chưa được bật. Hãy dùng các nút phía trên.',
};
/** Server sends the account email to the address stored on the paid order / partner invite (never a typed address). */
export function AccountEmailButton({ kind, token }: { kind: 'presale' | 'partner'; token: string }) {
  const fn = useServerFn(requestAccountEmail);
  const m = useMutation({ mutationFn: () => fn({ data: { kind, token } }) });
  return <div className="mt-3">
    <Button type="button" variant="outline" className="w-full" disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? 'Đang gửi…' : 'Gửi email tạo tài khoản'}</Button>
    {m.data?.ok && <p role="status" className="mt-2 text-xs text-muted-foreground">Đã gửi email tới địa chỉ đã đăng ký. Mở thư, bấm liên kết và đặt mật khẩu.</p>}
    {m.data && !m.data.ok && <p role="alert" className="mt-2 text-xs text-destructive">{EMAIL_REASON[m.data.reason] ?? EMAIL_REASON['send_failed']}</p>}
    {m.isError && <p role="alert" className="mt-2 text-xs text-destructive">{EMAIL_REASON['send_failed']}</p>}
  </div>;
}
