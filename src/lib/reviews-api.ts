/** Typed data layer for vendor reviews. Browser client; RLS: every signed-in
 *  couple can read all reviews, but each couple writes only its own. */
import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { VendorReview } from './reviews';

const must = <T,>(r: { data: T | null; error: unknown }): T => { if (r.error) throw r.error; return (r.data ?? (null as unknown)) as T; };

export const vendorReviewsQuery = (vendorId: string) => queryOptions({
  queryKey: ['vendor-reviews', vendorId],
  queryFn: async (): Promise<VendorReview[]> =>
    must(await supabase.from('vendor_reviews').select('id,vendor_id,wedding_id,rating,comment,created_at').eq('vendor_id', vendorId).order('created_at', { ascending: false })) as VendorReview[],
});

/** Slim list for directory averages (no comments). */
export const vendorRatingTotalsQuery = () => queryOptions({
  queryKey: ['vendor-reviews', 'totals'],
  queryFn: async (): Promise<{ vendor_id: string; rating: number }[]> =>
    must(await supabase.from('vendor_reviews').select('vendor_id,rating')) as { vendor_id: string; rating: number }[],
});

export async function upsertVendorReview(weddingId: string, vendorId: string, rating: number, comment: string) {
  must(await supabase.from('vendor_reviews').upsert(
    { vendor_id: vendorId, wedding_id: weddingId, rating, comment: comment.trim() },
    { onConflict: 'vendor_id,wedding_id' },
  ));
}
export async function deleteVendorReview(weddingId: string, vendorId: string) {
  must(await supabase.from('vendor_reviews').delete().eq('vendor_id', vendorId).eq('wedding_id', weddingId));
}
