import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deletionRequestsQuery, exportWeddingData, requestDataDeletion, saveWeddingExport, withdrawDataDeletion } from '@/lib/data-controls';
import { friendlyError, useMyWedding } from '@/lib/wedding-api';

const inputCls = 'mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring';

const STATUS: Record<string, string> = {
  pending: 'Đã nhận yêu cầu',
  in_review: 'Đang xem xét',
  withdrawn: 'Đã rút yêu cầu',
  resolved: 'Đã xử lý',
};

export function DataControls() {
  const wedding = useMyWedding().data!;
  const qc = useQueryClient();
  const requests = useQuery(deletionRequestsQuery(wedding.id));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [notice, setNotice] = useState('');
  const exportMutation = useMutation({
    mutationFn: () => exportWeddingData(wedding.id),
    onSuccess: data => { saveWeddingExport(data); setNotice('Đã tải tệp dữ liệu xuống thiết bị của bạn.'); },
    onError: e => setNotice(friendlyError(e)),
  });
  const requestMutation = useMutation({
    mutationFn: () => requestDataDeletion(wedding.id),
    onSuccess: async () => { setConfirmOpen(false); setConfirmation(''); setNotice('Đã ghi nhận yêu cầu. Dữ liệu chưa bị xóa.'); await qc.invalidateQueries({ queryKey: ['data-deletion-requests', wedding.id] }); },
    onError: e => setNotice(friendlyError(e)),
  });
  const withdrawMutation = useMutation({
    mutationFn: (id: string) => withdrawDataDeletion(id),
    onSuccess: async () => { setNotice('Đã rút yêu cầu xóa dữ liệu.'); await qc.invalidateQueries({ queryKey: ['data-deletion-requests', wedding.id] }); },
    onError: e => setNotice(friendlyError(e)),
  });
  const active = requests.data?.find(r => r.status === 'pending' || r.status === 'in_review');

  return <>
    <section className="rounded-lg border border-border bg-card p-5">
      <h3 className="font-display text-lg">Tải dữ liệu của hai bạn</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Tệp JSON gồm đám cưới, buổi lễ, kế hoạch, ngân sách, sổ khách, cấu hình thiệp, phản hồi tham dự và nhật ký. Hai bạn đều có quyền tải. Ảnh gốc được lưu riêng trên Lovable Cloud; tệp này có danh sách ảnh nhưng chưa chứa ảnh gốc.</p>
      <Button type="button" variant="outline" size="lg" className="mt-4 min-h-11" disabled={exportMutation.isPending} onClick={() => { setNotice(''); exportMutation.mutate(); }}>
        {exportMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        {exportMutation.isPending ? 'Đang chuẩn bị tệp…' : 'Tải dữ liệu JSON'}
      </Button>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">Tệp có tên, số điện thoại và thông tin riêng của khách. Hãy giữ ở nơi chỉ hai bạn truy cập.</p>
    </section>
    <section className="mt-4 rounded-lg border border-border bg-card p-5">
      <h3 className="font-display text-lg">Yêu cầu xóa dữ liệu</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Gửi yêu cầu để được xem xét. Thao tác này không xóa dữ liệu ngay. Quy trình và thời hạn lưu sau khi link thiệp hết hạn sẽ được công bố trước khi app nhận thanh toán thật.</p>
      {requests.isPending && <p role="status" className="mt-3 text-sm">Đang tải trạng thái yêu cầu…</p>}
      {requests.isError && <p role="alert" className="mt-3 text-sm text-destructive">Không tải được trạng thái yêu cầu. Hãy thử lại.</p>}
      {active ? <div className="mt-4 rounded-md border border-border p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2"><span className="inline-flex shrink-0 rounded-full bg-warm px-3 py-1 text-[11px] font-semibold text-foreground">{STATUS[active.status] ?? active.status}</span><span>Từ {new Date(active.created_at).toLocaleString('vi-VN')}</span></div>
        {active.status === 'pending' && <Button type="button" variant="ghost" size="sm" className="mt-2 min-h-11" disabled={withdrawMutation.isPending} onClick={() => { setNotice(''); withdrawMutation.mutate(active.id); }}>Rút yêu cầu</Button>}
      </div> : <Button type="button" variant="outline" size="lg" className="mt-4 min-h-11" disabled={requests.isPending || requests.isError} onClick={() => { setConfirmation(''); setNotice(''); setConfirmOpen(true); }}>Gửi yêu cầu xóa</Button>}
    </section>
    {notice && <div role="status" className="mt-3 rounded-lg bg-sage p-4 text-[13px] leading-relaxed">{notice}</div>}
    <Dialog open={confirmOpen} onOpenChange={v => { if (!requestMutation.isPending) { setConfirmOpen(v); if (!v) setConfirmation(''); } }}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-24px)] max-w-lg overflow-y-auto rounded-lg bg-card p-5 sm:p-6">
        <DialogHeader className="text-left"><DialogTitle className="font-display text-2xl">Gửi yêu cầu xóa dữ liệu?</DialogTitle>
          <DialogDescription>Yêu cầu áp dụng cho dữ liệu đám cưới của cả hai bạn. Dữ liệu vẫn được giữ nguyên trong khi chờ xem xét; bạn có thể rút yêu cầu nếu chưa được xử lý.</DialogDescription></DialogHeader>
        <label htmlFor="confirm-deletion-request" className="text-sm font-semibold">Nhập YÊU CẦU XÓA để xác nhận</label>
        <input id="confirm-deletion-request" className={inputCls} autoComplete="off" value={confirmation} onChange={e => setConfirmation(e.target.value)} />
        {requestMutation.isError && <p role="alert" className="text-sm text-destructive">{friendlyError(requestMutation.error)}</p>}
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row"><Button type="button" variant="outline" size="lg" className="min-h-11" onClick={() => setConfirmOpen(false)}>Để sau</Button>
          <Button type="button" size="lg" className="min-h-11" disabled={confirmation.trim() !== 'YÊU CẦU XÓA' || requestMutation.isPending} onClick={() => requestMutation.mutate()}>{requestMutation.isPending && <Loader2 className="size-4 animate-spin" />}Gửi yêu cầu</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
