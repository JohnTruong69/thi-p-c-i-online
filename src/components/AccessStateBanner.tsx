import { Link } from '@tanstack/react-router';
import { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from './ui/button';
import type { Json } from '../integrations/supabase/types';

type AccessState = {
  state: 'trial_not_started' | 'trial_active' | 'trial_expired_read_only' |
    'paid_active' | 'paid_expired_read_only' | 'legacy_paid_active' | 'legacy_paid_expired';
  trial_ends_at: string | null;
  paid_expires_at: string | null;
  /** Server decision; false only when the staged write gate is ON for this wedding and access has ended. */
  writable: boolean;
  write_gate_enabled: boolean;
};

export function parseAccessState(value: Json): AccessState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid access state');
  const state = value['state'];
  const known = ['trial_not_started', 'trial_active', 'trial_expired_read_only',
    'paid_active', 'paid_expired_read_only', 'legacy_paid_active', 'legacy_paid_expired'];
  if (typeof state !== 'string' || !known.includes(state)) throw new Error('invalid access state');
  return {
    state: state as AccessState['state'],
    trial_ends_at: typeof value['trial_ends_at'] === 'string' ? value['trial_ends_at'] : null,
    paid_expires_at: typeof value['paid_expires_at'] === 'string' ? value['paid_expires_at'] : null,
    writable: value['writable'] !== false,
    write_gate_enabled: value['write_gate_enabled'] === true,
  };
}

function vnDate(value: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return 'chưa có ngày';
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('day')}/${part('month')}/${part('year')} ${part('hour')}:${part('minute')}`;
}

/** True when the server says this wedding is read-only. Editing controls use it; the server enforces regardless. */
export const ReadOnlyContext = createContext(false);
export const useReadOnly = () => useContext(ReadOnlyContext);
export const READ_ONLY_REASON = 'Đám cưới đang ở chế độ chỉ xem nên chưa sửa được.';

export function useAccessState(weddingId: string | undefined) {
  return useQuery({
    enabled: !!weddingId,
    queryKey: ['wedding-access', weddingId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('wedding_access_state', { p_wedding_id: weddingId! });
      if (error) throw error;
      return parseAccessState(data);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Access status banner. Read-only only happens when the server-side write gate is ON for this wedding. */
export function AccessStateBanner({ weddingId }: { weddingId: string }) {
  const q = useAccessState(weddingId);
  if (q.isPending) return null;
  if (q.isError) return <div role="alert" className="mb-5 rounded-lg bg-copper-soft px-4 py-3 text-sm">
    Chưa tải được thời hạn sử dụng. <button type="button" className="font-semibold underline" onClick={() => q.refetch()}>Thử lại</button>
  </div>;

  const access = q.data;
  const locked = access.writable === false;
  if (access.state === 'trial_not_started' && !locked) return null;
  const expired = locked || access.state === 'trial_expired_read_only' || access.state === 'paid_expired_read_only' || access.state === 'legacy_paid_expired';
  let message: string;
  if (access.state === 'trial_active') message = `Planner mở đến ${vnDate(access.trial_ends_at)} (giờ Việt Nam).`;
  else if (access.state === 'paid_active') message = `Đã thanh toán · Planner và thiệp dùng đến ${vnDate(access.paid_expires_at)} (giờ Việt Nam).`;
  else if (access.state === 'trial_expired_read_only') message = 'Thời gian sử dụng đã kết thúc. Hai bạn vẫn xem và tải dữ liệu đã nhập.';
  else if (access.state === 'paid_expired_read_only') message = 'Thời hạn gói đã kết thúc. Link thiệp ngừng mở; hai bạn vẫn xem và tải dữ liệu.';
  else if (access.state === 'legacy_paid_active') message = `Gói thiệp cũ còn hạn đến ${vnDate(access.paid_expires_at)} (giờ Việt Nam).`;
  else if (access.state === 'legacy_paid_expired') message = 'Gói thiệp cũ đã hết hạn. Hai bạn vẫn có thể xem và tải dữ liệu.';
  else message = 'Đám cưới đang ở chế độ chỉ xem.';

  return <div role="status" className={`mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3 text-sm ${expired ? 'bg-warm' : 'bg-sage'}`}>
    <span>{message}{locked && <> <strong>Chế độ chỉ xem:</strong> các nút thêm, sửa, xóa tạm khóa. Hai bạn vẫn xem, tải dữ liệu, gửi yêu cầu xóa dữ liệu, và người thân vẫn xem được phần đã chia sẻ. Gói mới chưa mở bán và hiện chưa thể thanh toán, nên chưa thể mở khóa trong ứng dụng. Dữ liệu của hai bạn vẫn được giữ nguyên.</>}</span>
    <span className="flex flex-wrap gap-x-4">
      {(expired || locked) && <Link to="/settings/data" className="min-h-11 content-center font-semibold text-primary underline">Tải dữ liệu</Link>}
    </span>
  </div>;
}

/** A Button for persisted edits: disabled with an explanation when the wedding is read-only. The server still enforces. */
export function WriteButton({ disabled, title, ...props }: React.ComponentProps<typeof Button>) {
  const ro = useReadOnly();
  return <Button {...props} disabled={ro || disabled} aria-disabled={ro || disabled || undefined} title={ro ? READ_ONLY_REASON : title} />;
}
