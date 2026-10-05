import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { validateEmail, validateLogin } from '@/lib/phase2c';
import { acceptInvite, friendlyError, inspectInvite, safeRedirect } from '@/lib/wedding-api';
import { markManualSignOut } from '@/lib/auth-events';
import { FormField, Header, Note, Panel, inputCls } from './PhaseOne';

export function PublicShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background"><div className="mx-auto max-w-xl px-5 pb-16 pt-8 sm:px-8">
    <Link to="/" className="mb-8 flex items-center gap-2.5"><img src="/logo-se-duyen.webp" alt="Se Duyên" className="size-10 rounded-xl object-cover" /><span className="text-lg font-extrabold">Se Duyên</span></Link>{children}</div></div>;
}
function Submit({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return <Button type="submit" size="lg" className="min-h-11 w-full" disabled={busy} aria-busy={busy}>{busy && <Loader2 className="animate-spin" />}{children}</Button>;
}
function ErrorBox({ text }: { text: string }) { return text ? <div role="alert" className="rounded-lg bg-copper-soft p-4 text-[13px] font-semibold text-primary">{text}</div> : null; }

export function LoginPage({ redirect, reason }: { redirect?: string | undefined; reason?: string | undefined }) {
  const navigate = useNavigate(); const qc = useQueryClient();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState<Record<string, string>>({}); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(''); setUnconfirmed(false);
    const n = validateLogin(f, false); setErr(n); if (Object.keys(n).length) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
    setBusy(false);
    if (error) { setMsg(friendlyError(error)); setUnconfirmed(/not confirmed/i.test(error.message)); return; }
    await qc.invalidateQueries();
    navigate({ to: safeRedirect(redirect) ?? '/home', replace: true });
  };
  const resend = async () => { setBusy(true); const { error } = await supabase.auth.resend({ type: 'signup', email: f.email.trim(), options: { emailRedirectTo: `${window.location.origin}/login` } }); setBusy(false); setMsg(error ? friendlyError(error) : 'Đã yêu cầu gửi lại thư xác nhận. Hãy kiểm tra hộp thư (cả mục thư rác).'); };
  return <PublicShell><Header name="Chào mừng trở lại" subtitle="TÀI KHOẢN" />
    {reason === 'expired' && <div className="mb-4"><Note tone="warm">Phiên đăng nhập đã hết hạn hoặc đã đăng xuất ở nơi khác. Hãy đăng nhập lại để tiếp tục.</Note></div>}
    {safeRedirect(redirect)?.startsWith('/invite/') && <div className="mb-4"><Note>Đăng nhập bằng đúng email được mời để nhận lời mời cùng quản lý.</Note></div>}
    <Panel><form noValidate onSubmit={submit} className="space-y-4">
      <FormField label="Email *" id="lg-email" error={err['email']}><input id="lg-email" type="email" autoComplete="email" className={inputCls} value={f.email} maxLength={255} onChange={e => setF({ ...f, email: e.target.value })} /></FormField>
      <FormField label="Mật khẩu *" id="lg-pw" error={err['password']}><input id="lg-pw" type="password" autoComplete="current-password" className={inputCls} value={f.password} maxLength={128} onChange={e => setF({ ...f, password: e.target.value })} /></FormField>
      <ErrorBox text={msg} />
      {unconfirmed && <Button type="button" variant="outline" size="lg" className="min-h-11 w-full" disabled={busy} onClick={resend}>Gửi lại thư xác nhận</Button>}
      <Submit busy={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</Submit>
    </form>
      <div className="mt-4 grid gap-2 text-center text-sm">
        <Link to="/forgot-password" className="min-h-11 content-center font-semibold text-primary underline-offset-4 hover:underline">Quên mật khẩu?</Link>
        <Link to="/register" search={redirect ? { redirect } : {}} className="min-h-11 content-center font-semibold text-primary underline-offset-4 hover:underline">Chưa có tài khoản? Tạo tài khoản</Link>
      </div>
    </Panel></PublicShell>;
}

export function RegisterPage({ redirect }: { redirect?: string | undefined }) {
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState<Record<string, string>>({}); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);
  const back = safeRedirect(redirect);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg('');
    const n = validateLogin(f, true); setErr(n); if (Object.keys(n).length) return;
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email: f.email.trim(), password: f.password, options: { data: { display_name: f.name.trim() }, emailRedirectTo: `${window.location.origin}/login${back ? `?redirect=${encodeURIComponent(back)}` : ''}` } });
    setBusy(false);
    if (error) { setMsg(friendlyError(error)); return; }
    // Supabase returns a user without identities when the email already exists (no enumeration); treat the same way.
    if (data.user && (data.user.identities?.length ?? 0) === 0) { setMsg('Email này có thể đã có tài khoản. Hãy đăng nhập hoặc lấy lại mật khẩu.'); return; }
    setSent(true);
  };
  if (sent) return <PublicShell><Header name="Kiểm tra hộp thư" subtitle="TÀI KHOẢN" /><Panel><p className="text-sm leading-6">Chúng mình vừa gửi thư xác nhận tới <strong>{f.email.trim()}</strong>. Mở thư và bấm liên kết để hoàn tất tạo tài khoản, rồi đăng nhập.</p><p className="mt-3 text-xs text-muted-foreground">Chưa thấy thư sau vài phút? Hãy xem mục thư rác, hoặc thử đăng nhập để gửi lại thư xác nhận.</p><Button asChild size="lg" className="mt-5 min-h-11 w-full"><Link to="/login" search={back ? { redirect: back } : {}}>Đến trang đăng nhập</Link></Button></Panel></PublicShell>;
  return <PublicShell><Header name="Tạo tài khoản" subtitle="TÀI KHOẢN" />
    <Panel><form noValidate onSubmit={submit} className="space-y-4">
      <FormField label="Tên của bạn *" id="rg-name" error={err['name']}><input id="rg-name" autoComplete="name" className={inputCls} value={f.name} maxLength={80} onChange={e => setF({ ...f, name: e.target.value })} /></FormField>
      <FormField label="Email *" id="rg-email" error={err['email']}><input id="rg-email" type="email" autoComplete="email" className={inputCls} value={f.email} maxLength={255} onChange={e => setF({ ...f, email: e.target.value })} /></FormField>
      <FormField label="Mật khẩu * (ít nhất 8 ký tự)" id="rg-pw" error={err['password']}><input id="rg-pw" type="password" autoComplete="new-password" className={inputCls} value={f.password} maxLength={128} onChange={e => setF({ ...f, password: e.target.value })} /></FormField>
      <ErrorBox text={msg} />
      <Submit busy={busy}>{busy ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}</Submit>
    </form>
      <Link to="/login" search={back ? { redirect: back } : {}} className="mt-4 block min-h-11 content-center text-center text-sm font-semibold text-primary">Đã có tài khoản? Đăng nhập</Link>
    </Panel></PublicShell>;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState(''); const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(''); const n = validateEmail(email); setErr(n['email'] ?? ''); if (n['email']) return;
    setBusy(true); const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` }); setBusy(false);
    if (error) { setMsg(friendlyError(error)); return; } setDone(true);
  };
  return <PublicShell><Header name="Lấy lại mật khẩu" subtitle="TÀI KHOẢN" /><Panel>
    {done ? <div role="status"><Note>Nếu <strong>{email.trim()}</strong> có tài khoản, thư đặt lại mật khẩu đã được gửi. Mở thư và bấm liên kết để chọn mật khẩu mới.</Note></div> :
      <form noValidate onSubmit={submit} className="space-y-4">
        <FormField label="Email của tài khoản *" id="fp-email" error={err}><input id="fp-email" type="email" autoComplete="email" className={inputCls} value={email} maxLength={255} onChange={e => setEmail(e.target.value)} /></FormField>
        <ErrorBox text={msg} /><Submit busy={busy}>{busy ? 'Đang gửi…' : 'Gửi liên kết đặt lại'}</Submit>
      </form>}
    <Link to="/login" className="mt-4 block min-h-11 content-center text-center text-sm font-semibold text-primary">Quay lại đăng nhập</Link>
  </Panel></PublicShell>;
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<'wait' | 'ok' | 'bad'>('wait'); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY' || ev === 'SIGNED_IN') setReady('ok'); });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady('ok'); });
    const t = setTimeout(() => setReady(r => (r === 'wait' ? 'bad' : r)), 4000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(''); if (pw.length < 8) { setErr('Mật khẩu cần ít nhất 8 ký tự.'); return; } setErr('');
    setBusy(true); const { error } = await supabase.auth.updateUser({ password: pw }); setBusy(false);
    if (error) { setMsg(friendlyError(error)); return; } navigate({ to: '/home', replace: true });
  };
  return <PublicShell><Header name="Chọn mật khẩu mới" subtitle="TÀI KHOẢN" /><Panel>
    {ready === 'wait' && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Đang kiểm tra liên kết…</p>}
    {ready === 'bad' && <><Note tone="warm">Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.</Note><Button asChild size="lg" className="mt-4 min-h-11 w-full"><Link to="/forgot-password">Gửi lại liên kết</Link></Button></>}
    {ready === 'ok' && <form noValidate onSubmit={submit} className="space-y-4">
      <FormField label="Mật khẩu mới * (ít nhất 8 ký tự)" id="rp-pw" error={err}><input id="rp-pw" type="password" autoComplete="new-password" className={inputCls} value={pw} maxLength={128} onChange={e => setPw(e.target.value)} /></FormField>
      <ErrorBox text={msg} /><Submit busy={busy}>{busy ? 'Đang lưu…' : 'Lưu mật khẩu mới'}</Submit>
    </form>}
  </Panel></PublicShell>;
}

export function InviteAcceptPage({ token }: { token: string }) {
  const navigate = useNavigate(); const qc = useQueryClient();
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'signedOut' } | { kind: 'error'; text: string } | { kind: 'info'; status: string; matches: boolean; email: string }>({ kind: 'loading' });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const load = async () => {
    setState({ kind: 'loading' });
    const { data } = await supabase.auth.getUser();
    if (!data.user) { setState({ kind: 'signedOut' }); return; }
    try { const r = await inspectInvite(token); setState({ kind: 'info', status: r.status, matches: r.email_matches, email: data.user.email ?? '' }); }
    catch (e) { setState({ kind: 'error', text: friendlyError(e) }); }
  };
  useEffect(() => { void load(); }, [token]);
  const accept = async () => {
    setBusy(true); setMsg('');
    try { const w = await acceptInvite(token); if (!w) { setMsg('Lời mời đã hết hạn. Hãy nhờ người mời tạo lời mời mới.'); await load(); return; } await qc.invalidateQueries(); navigate({ to: '/home', replace: true }); }
    catch (e) { setMsg(friendlyError(e)); } finally { setBusy(false); }
  };
  const signOut = async () => { markManualSignOut(); qc.clear(); await supabase.auth.signOut(); await load(); };
  const here = `/invite/${token}`;
  return <PublicShell><Header name="Lời mời cùng quản lý" subtitle="NGƯỜI CÙNG QUẢN LÝ" /><Panel>
    {state.kind === 'loading' && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Đang kiểm tra lời mời…</p>}
    {state.kind === 'error' && <><ErrorBox text={state.text} /><Button size="lg" variant="outline" className="mt-3 min-h-11 w-full" onClick={load}>Thử lại</Button></>}
    {state.kind === 'signedOut' && <><p className="text-sm leading-6">Bạn được mời cùng quản lý một đám cưới. Hãy đăng nhập hoặc tạo tài khoản bằng <strong>đúng email nhận lời mời</strong> để chấp nhận. Trước khi chấp nhận, bạn chưa xem được dữ liệu nào.</p>
      <div className="mt-4 grid gap-2"><Button asChild size="lg" className="min-h-11"><Link to="/login" search={{ redirect: here }}>Đăng nhập để chấp nhận</Link></Button><Button asChild size="lg" variant="outline" className="min-h-11"><Link to="/register" search={{ redirect: here }}>Tạo tài khoản</Link></Button></div></>}
    {state.kind === 'info' && (state.status === 'pending' ? (state.matches
      ? <><p className="text-sm leading-6">Sau khi chấp nhận, bạn có quyền như người mời ở mọi việc của đám cưới này.</p><ErrorBox text={msg} /><Button size="lg" className="mt-4 min-h-11 w-full" disabled={busy} onClick={accept}>{busy && <Loader2 className="animate-spin" />}Chấp nhận lời mời</Button></>
      : <><Note tone="warm">Bạn đang đăng nhập bằng <strong>{state.email}</strong>, nhưng lời mời này dành cho một email khác. Hãy đăng xuất rồi đăng nhập bằng email được mời.</Note><Button size="lg" variant="outline" className="mt-4 min-h-11 w-full" onClick={signOut}>Đăng xuất</Button></>)
      : <><Note tone="warm">{state.status === 'expired' ? 'Lời mời đã hết hạn. Hãy nhờ người mời tạo lời mời mới.' : state.status === 'revoked' ? 'Lời mời đã bị hủy.' : state.status === 'accepted' ? 'Lời mời đã được dùng.' : 'Không tìm thấy lời mời này. Hãy kiểm tra lại đường dẫn.'}</Note>{state.status === 'accepted' && <Button asChild size="lg" className="mt-4 min-h-11 w-full"><Link to="/home">Về tổng quan</Link></Button>}</>)}
  </Panel></PublicShell>;
}
