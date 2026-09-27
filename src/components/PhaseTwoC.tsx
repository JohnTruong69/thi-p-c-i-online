import { useState } from 'react';
import { Download, Copy, QrCode } from 'lucide-react';
import { Action, DemoAction, FormField, Header, Note, Panel, Row, SmallLabel, Status, inputCls, initialGuests, validGuests, useEventNames, type DemoGuest } from './PhaseOne';
import { useLinks, SIDE_LABEL } from './PhaseTwoB';
import { useDemoSession } from '@/lib/demo-session';
import { linkReadiness } from '@/lib/phase2';
import { guestsToCsv, validateLogin, validateEmail } from '@/lib/phase2c';

/* F02 — đăng nhập / khôi phục mật khẩu (minh họa) */
export function LoginScreen({ register = false }: { register?: boolean }) {
  const [mode, setMode] = useState<'login' | 'recover'>('login');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setMsg('');
    const n = mode === 'recover' ? validateEmail(f.email) : validateLogin(f, register);
    setErr(n); if (Object.keys(n).length) return;
    setMsg(mode === 'recover'
      ? 'Bản dùng thử không gửi email khôi phục. Khi có tài khoản thật, liên kết đặt lại mật khẩu sẽ được gửi tới email này.'
      : register ? 'Thông tin hợp lệ. Bản dùng thử chưa tạo tài khoản thật; bạn có thể xem ứng dụng minh họa.' : 'Thông tin hợp lệ. Bản dùng thử chưa đăng nhập thật; bạn có thể xem ứng dụng minh họa.');
  };
  return <div className="mx-auto max-w-xl"><Header name={mode === 'recover' ? 'Lấy lại mật khẩu' : register ? 'Tạo tài khoản' : 'Chào mừng trở lại'} subtitle="TÀI KHOẢN · BẢN DÙNG THỬ" />
    <Panel><form noValidate onSubmit={submit} className="space-y-4">
      {register && mode === 'login' && <FormField label="Tên của bạn *" id="lg-name" error={err['name']}><input id="lg-name" className={inputCls} value={f.name} maxLength={80} onChange={e => setF({ ...f, name: e.target.value })} /></FormField>}
      <FormField label="Email *" id="lg-email" error={err['email']}><input id="lg-email" type="email" autoComplete="email" className={inputCls} value={f.email} maxLength={255} onChange={e => setF({ ...f, email: e.target.value })} /></FormField>
      {mode === 'login' && <FormField label="Mật khẩu *" id="lg-pw" error={err['password']}><input id="lg-pw" type="password" autoComplete={register ? 'new-password' : 'current-password'} className={inputCls} value={f.password} maxLength={128} onChange={e => setF({ ...f, password: e.target.value })} /></FormField>}
      <DemoAction className="w-full" onClick={() => undefined}>{mode === 'recover' ? 'Gửi hướng dẫn (minh họa)' : register ? 'Tạo tài khoản (minh họa)' : 'Đăng nhập (minh họa)'}</DemoAction>
    </form>
      {msg && <div role="status"><Note>{msg}</Note></div>}
      {msg && mode === 'login' && <Action to="/home" className="mt-3 w-full">Xem ứng dụng minh họa</Action>}
      {!register && <DemoAction variant="ghost" className="mt-2 w-full" onClick={() => { setMode(mode === 'login' ? 'recover' : 'login'); setErr({}); setMsg(''); }}>{mode === 'login' ? 'Quên mật khẩu?' : 'Quay lại đăng nhập'}</DemoAction>}
      <Action to={register ? '/login' : '/register'} variant="ghost" className="mt-2 w-full">{register ? 'Đã có tài khoản?' : 'Tạo tài khoản'}</Action>
      <Note tone="warm">Chưa có đăng nhập, tạo tài khoản hay gửi email thật trong bản dùng thử.</Note>
    </Panel></div>;
}

/* F16 — xuất danh sách khách từ dữ liệu phiên */
export function GuestsExportScreen() {
  const events = useEventNames();
  const [guests] = useDemoSession<DemoGuest[]>('guests', initialGuests, validGuests);
  const [done, setDone] = useState('');
  const download = () => {
    const csv = guestsToCsv(guests, v => events.find(e => e.id === v || e.name === v)?.name ?? v);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'so-khach-ban-dung-thu.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDone(`Đã tạo file CSV với ${guests.length} hồ sơ khách từ phiên xem này.`);
  };
  return <div className="max-w-3xl"><Header name="Xuất sổ khách" subtitle="KHÁCH · TẢI VỀ" />
    <Panel><p className="text-sm">File CSV được tạo ngay trong trình duyệt từ {guests.length} hồ sơ khách đang có trong phiên xem này. Số điện thoại giữ nguyên số 0 ở đầu.</p>
      <DemoAction className="mt-4 w-full" disabled={!guests.length} onClick={download}><Download /> Tải CSV từ dữ liệu phiên</DemoAction>
      {!guests.length && <p className="mt-2 text-xs text-muted-foreground">Sổ khách đang trống nên chưa có gì để xuất.</p>}
      {done && <div role="status"><Note>{done}</Note></div>}
    </Panel>
    <Note tone="warm">Đây không phải bản xuất dữ liệu tài khoản. Xuất toàn bộ dữ liệu thật nằm ở Tài khoản và dữ liệu và cần hệ thống lưu trữ thật.</Note>
    <Action to="/guests" variant="outline" className="mt-4 w-full">Quay lại danh sách khách</Action>
  </div>;
}

/* F23 — lịch sử link, chia sẻ, QR (chưa công bố) */
export function HistoryScreen() {
  const [links] = useLinks();
  const [snap] = useDemoSession<{ revision: number } | null>('sent-snapshot', null, (v): v is { revision: number } | null => v === null || (!!v && typeof (v as { revision: number }).revision === 'number'));
  return <div className="max-w-3xl"><Header name="Chia sẻ và lịch sử thiệp" subtitle="THIỆP · CHIA SẺ" />
    <Note tone="warm">Chưa có link nào được công bố, nên chưa có địa chỉ để sao chép và chưa có mã QR. Hai việc này chỉ mở sau khi gói thiệp cưới được xác minh thanh toán và hai bạn công bố.</Note>
    <div className="mt-5"><SmallLabel>CÁC LINK</SmallLabel></div>
    <Panel>{links.map(l => <div key={l.side} className="border-b border-border py-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2"><strong>{SIDE_LABEL[l.side]}</strong><Status tone="warm">{l.enabled ? 'Chưa công bố' : 'Đang tắt'}</Status></div>
      <div className="mt-2 flex flex-wrap gap-2"><DemoAction variant="outline" disabled><Copy /> Sao chép link</DemoAction><DemoAction variant="outline" disabled><QrCode /> Tải mã QR</DemoAction></div>
      <p className="mt-1 text-xs text-muted-foreground">Không bấm được: link chưa công bố.</p>
    </div>)}</Panel>
    <div className="mt-5"><SmallLabel>LỊCH SỬ PHIÊN BẢN (MINH HỌA)</SmallLabel></div>
    <Panel>{snap ? <Row title={`Bản ${snap.revision}`} detail="Mốc “bản đã gửi” đặt trong phiên xem này — chưa gửi cho khách." to="/invitation/changes" /> : <Row title="Chưa có phiên bản" detail="Đặt mốc ở trang Thay đổi sau khi gửi để xem lịch sử." to="/invitation/changes" />}</Panel>
    <Action to="/publish" className="mt-5 w-full">Xem lại trước khi công bố</Action>
  </div>;
}

/* F19 — kiểm thiếu thông tin nguồn cho từng link */
export function CheckScreen() {
  const events = useEventNames();
  const [links] = useLinks();
  const rows = links.map(l => ({ l, r: linkReadiness(l.enabled, l.eventIds.filter(id => events.some(e => e.id === id)), events) }));
  const eventGaps = events.map(e => ({ e, gaps: [!e.date && 'ngày', !e.time && 'giờ', !e.venue.trim() && 'nơi tổ chức', !e.address.trim() && 'địa chỉ'].filter(Boolean) as string[] })).filter(x => x.gaps.length);
  return <div className="max-w-3xl"><Header name="Kiểm tra thiệp" subtitle="THIỆP · THÔNG TIN CÒN THIẾU" />
    <p className="-mt-3 mb-5 text-muted-foreground">Những gì cần bổ sung trước khi một link có thể được công bố. Kiểm tra từ dữ liệu trong phiên xem này.</p>
    <SmallLabel>THEO TỪNG LINK</SmallLabel>
    <Panel>{rows.map(({ l, r }) => <Row key={l.side} title={SIDE_LABEL[l.side]} detail={r.readiness === 'ready' ? 'Đủ thông tin' : r.readiness === 'off' ? 'Đang tắt — không công bố' : `Còn thiếu: ${r.missing.join(', ')}`} right={<Status tone={r.readiness === 'ready' ? 'sage' : r.readiness === 'off' ? 'warm' : 'copper'}>{r.readiness === 'ready' ? 'Sẵn sàng' : r.readiness === 'off' ? 'Đang tắt' : 'Cần sửa'}</Status>} to="/invitation/variants" />)}</Panel>
    <div className="mt-5"><SmallLabel>THEO TỪNG BUỔI LỄ</SmallLabel></div>
    <Panel>{eventGaps.length ? eventGaps.map(({ e, gaps }) => <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-3 last:border-0"><div><strong>{e.name}</strong><p className="text-xs text-muted-foreground">Thiếu {gaps.join(', ')}</p></div><Action to="/wedding/events/$id" params={{ id: e.id }} variant="outline">Sửa buổi này</Action></div>) : <p className="text-sm">Mọi buổi lễ đã có ngày, giờ, nơi và địa chỉ.</p>}</Panel>
    <Action to="/invitation/preview" variant="outline" className="mt-5 w-full">Xem trước thiệp</Action>
  </div>;
}
