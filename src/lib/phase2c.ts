export type LoginInput = { name: string; email: string; password: string };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): Record<string, string> {
  const e = email.trim();
  if (!e) return { email: 'Hãy nhập email.' };
  if (e.length > 255 || !EMAIL.test(e)) return { email: 'Email chưa đúng định dạng.' };
  return {};
}

export function validateLogin(f: LoginInput, register: boolean): Record<string, string> {
  const n = validateEmail(f.email);
  if (register && !f.name.trim()) n['name'] = 'Hãy nhập tên của bạn.';
  if (!f.password) n['password'] = 'Hãy nhập mật khẩu.';
  else if (register && f.password.length < 8) n['password'] = 'Mật khẩu cần ít nhất 8 ký tự.';
  return n;
}

const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV sổ khách: BOM cho Excel, số điện thoại giữ dạng chuỗi (không mất số 0). */
export function guestsToCsv(
  guests: { name: string; phone: string; side: string; events: string[]; party: number; state: string }[],
  eventName: (id: string) => string,
): string {
  const head = ['Tên', 'Điện thoại', 'Phía', 'Buổi được mời', 'Số người', 'Phản hồi'];
  const rows = guests.map(g => [g.name, g.phone, g.side, g.events.map(eventName).filter(Boolean).join('; '), String(g.party), g.state].map(cell).join(','));
  return '\uFEFF' + [head.join(','), ...rows].join('\r\n');
}
