/** Pure presale helpers (client-safe). Price is locked by the owner; sales still require every go-live gate. */
export const PRESALE_PRICE_VND = 199_000;
export const PRESALE_MONTHS = 36;

export function maskEmail(e: string) {
  const [u = '', d = ''] = e.split('@');
  return `${u.slice(0, 1)}${'•'.repeat(Math.max(2, u.length - 1))}@${d}`;
}

export function sepayQrUrl(acc: string, bank: string, amount: number, code: string) {
  const p = new URLSearchParams({ acc, bank, amount: String(amount), des: code });
  return `https://qr.sepay.vn/img?${p.toString()}`;
}

export function claimErrorText(msg: string) {
  if (msg.includes('email mismatch')) return 'Email của tài khoản này khác email đã dùng khi thanh toán. Hãy đăng nhập bằng đúng email đó.';
  if (msg.includes('email not confirmed')) return 'Hãy xác nhận email (mở thư xác nhận) rồi thử lại.';
  if (msg.includes('already claimed')) return 'Đơn này đã được dùng để tạo đám cưới.';
  if (msg.includes('already has wedding')) return 'Tài khoản này đã có đám cưới, không thể dùng thêm đơn.';
  if (msg.includes('claim expired')) return 'Liên kết tạo đám cưới của đơn đã hết hạn.';
  if (msg.includes('not paid')) return 'Đơn chưa được SePay xác nhận thanh toán.';
  if (msg.includes('invalid claim')) return 'Liên kết không hợp lệ.';
  return 'Chưa tạo được đám cưới. Hãy thử lại.';
}

export type PresaleSettingsRow = { live_enabled: boolean; price_vnd: number | string; plan_version: string; terms_url: string | null; terms_approved_at: string | null } | null | undefined;
/** Public package is locked: sales/QR only when settings exactly match it AND server gates are on. */
export function presaleLive(s: PresaleSettingsRow, env: { goLive: boolean; webhookSecret: boolean }) {
  return !!s && s.live_enabled && Number(s.price_vnd) === PRESALE_PRICE_VND && s.plan_version === 'one_payment_36m'
    && !!s.terms_approved_at && typeof s.terms_url === 'string' && /^https:\/\/\S+$/.test(s.terms_url) && env.goLive && env.webhookSecret;
}
