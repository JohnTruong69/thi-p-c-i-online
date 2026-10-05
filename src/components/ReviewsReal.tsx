/** Shared vendor reviews: star summary + review dialog (one review per couple per vendor). */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { friendlyError } from '@/lib/wedding-api';
import { deleteVendorReview, upsertVendorReview, vendorReviewsQuery } from '@/lib/reviews-api';
import { ratingSummary, reviewMonth, validateReview, type VendorReview } from '@/lib/reviews';
import type { AffiliateVendor } from '@/lib/affiliate';
import { FormField, Note, inputCls } from './PhaseOne';
import { Loading } from './PhaseThree';

export function Stars({ value, className = '' }: { value: number; className?: string }) {
  const full = Math.round(value);
  return <span role="img" aria-label={`${value} trên 5 sao`} className={`inline-flex gap-0.5 text-base leading-none ${className}`}>
    {Array.from({ length: 5 }, (_, i) => <span key={i} aria-hidden className={i < full ? 'text-gold' : 'text-muted-foreground/30'}>★</span>)}
  </span>;
}

function StarInput({ value, onChange, error }: { value: number; onChange: (n: number) => void; error?: string | undefined }) {
  return <div>
    <span id="review-rating-label" className="mb-1 block text-sm font-medium">Số sao *</span>
    <div role="radiogroup" aria-labelledby="review-rating-label" className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} sao`}
        onClick={() => onChange(n)} className="flex min-h-11 min-w-11 items-center justify-center text-3xl leading-none">
        <span aria-hidden className={n <= value ? 'text-gold' : 'text-muted-foreground/30'}>★</span>
      </button>)}
    </div>
    {error && <p role="alert" className="mt-1 text-xs font-semibold text-destructive">{error}</p>}
  </div>;
}

export function VendorRatingLine({ vendorId, totals }: { vendorId: string; totals: { vendor_id: string; rating: number }[] | undefined }) {
  const s = ratingSummary((totals ?? []).filter(r => r.vendor_id === vendorId));
  if (s.count === 0) return <p className="mt-1 text-xs text-muted-foreground">Chưa có đánh giá</p>;
  return <p className="mt-1 flex items-center gap-1.5 text-xs"><Stars value={s.avg!} className="text-sm" /><span className="font-semibold">{s.avg!.toFixed(1)}</span><span className="text-muted-foreground">· {s.count} đánh giá</span></p>;
}

export function ReviewDialog({ vendor, weddingId, onClose }: { vendor: AffiliateVendor; weddingId: string; onClose: () => void }) {
  return <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
    <DialogContent className="max-h-[92vh] w-[calc(100vw-24px)] max-w-lg overflow-y-auto rounded-lg bg-card p-5 text-foreground sm:p-6">
      <DialogHeader className="text-left">
        <DialogTitle className="break-words font-display text-2xl">Đánh giá · {vendor.name}</DialogTitle>
        <DialogDescription>Chia sẻ trải nghiệm thật để các cặp đôi khác tham khảo. Mỗi cặp đôi chỉ để lại một đánh giá cho mỗi nhà cung cấp.</DialogDescription>
      </DialogHeader>
      <ReviewBody vendor={vendor} weddingId={weddingId} onClose={onClose} />
    </DialogContent>
  </Dialog>;
}

function ReviewBody({ vendor, weddingId, onClose }: { vendor: AffiliateVendor; weddingId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const rq = useQuery(vendorReviewsQuery(vendor.id));
  if (rq.isPending) return <Loading label="Đang tải đánh giá…" />;
  if (rq.isError) return <Note tone="copper">Không tải được đánh giá. Hãy đóng và thử lại.</Note>;
  return <ReviewForm vendor={vendor} weddingId={weddingId} reviews={rq.data} onDone={() => { qc.invalidateQueries({ queryKey: ['vendor-reviews'] }); onClose(); }} />;
}

function ReviewForm({ vendor, weddingId, reviews, onDone }: { vendor: AffiliateVendor; weddingId: string; reviews: VendorReview[]; onDone: () => void }) {
  const mine = reviews.find(r => r.wedding_id === weddingId) ?? null;
  const others = reviews.filter(r => r.wedding_id !== weddingId);
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [comment, setComment] = useState(mine?.comment ?? '');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: async () => upsertVendorReview(weddingId, vendor.id, rating, comment),
    onSuccess: onDone,
    onError: e => setErrs({ form: friendlyError(e) }),
  });
  const del = useMutation({
    mutationFn: async () => deleteVendorReview(weddingId, vendor.id),
    onSuccess: onDone,
    onError: e => setErrs({ form: friendlyError(e) }),
  });
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (save.isPending) return; const v = validateReview(rating, comment); setErrs(v); if (Object.keys(v).length) return; save.mutate(); };
  const sum = ratingSummary(reviews);
  return <div>
    {sum.count > 0 && <p className="mb-4 flex items-center gap-2 text-sm"><Stars value={sum.avg!} /><span className="font-semibold">{sum.avg!.toFixed(1)}</span><span className="text-muted-foreground">· {sum.count} đánh giá</span></p>}
    <form noValidate onSubmit={submit} className="space-y-4">
      <StarInput value={rating} onChange={n => { setRating(n); setErrs(e => ({ ...e, rating: '' })); }} error={errs['rating'] || undefined} />
      <FormField label="Nhận xét (không bắt buộc)" id="review-comment" error={errs['comment']}>
        <textarea id="review-comment" rows={3} maxLength={500} value={comment} aria-invalid={!!errs['comment']}
          onChange={e => setComment(e.target.value)} className={inputCls} placeholder="Ví dụ: tư vấn nhiệt tình, báo giá rõ ràng…" />
      </FormField>
      {errs['form'] && <div role="alert"><Note tone="copper">{errs['form']}</Note></div>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="lg" className="min-h-11" disabled={save.isPending} aria-busy={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}{mine ? 'Cập nhật đánh giá' : 'Gửi đánh giá'}
        </Button>
        {mine && <Button type="button" variant="ghost" size="lg" className="min-h-11 text-destructive" disabled={del.isPending} onClick={() => del.mutate()}>
          {del.isPending ? 'Đang xóa…' : 'Xóa đánh giá của mình'}
        </Button>}
      </div>
    </form>
    <div className="mt-6 border-t border-border pt-4">
      <h3 className="mb-3 text-sm font-semibold">Đánh giá từ các cặp đôi khác ({others.length})</h3>
      {others.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có đánh giá nào khác. Hãy là người đầu tiên chia sẻ.</p> :
        <ul className="max-h-64 space-y-3 overflow-y-auto">{others.map(r => <li key={r.id} className="rounded-md bg-muted/60 p-3">
          <div className="flex items-center justify-between gap-2"><Stars value={r.rating} /><span className="text-xs text-muted-foreground">{reviewMonth(r.created_at)}</span></div>
          {r.comment && <p className="mt-1.5 break-words text-sm leading-relaxed">{r.comment}</p>}
        </li>)}</ul>}
    </div>
  </div>;
}
