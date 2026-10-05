/** Pure rules for shared vendor reviews. No I/O. */

export type VendorReview = {
  id: string; vendor_id: string; wedding_id: string;
  rating: number; comment: string; created_at: string;
};

export function ratingSummary(reviews: { rating: number }[]): { count: number; avg: number | null } {
  if (reviews.length === 0) return { count: 0, avg: null };
  const sum = reviews.reduce((s, r) => s + r.rating, 0);
  return { count: reviews.length, avg: Math.round((sum / reviews.length) * 10) / 10 };
}

export function validateReview(rating: number, comment: string): Record<string, string> {
  const e: Record<string, string> = {};
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) e['rating'] = 'Hãy chọn từ 1 đến 5 sao.';
  if (comment.length > 500) e['comment'] = 'Nhận xét tối đa 500 ký tự.';
  return e;
}

/** "2026-10-05T…" -> "10/2026" for a light, anonymous attribution. */
export function reviewMonth(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getFullYear()}`;
}
