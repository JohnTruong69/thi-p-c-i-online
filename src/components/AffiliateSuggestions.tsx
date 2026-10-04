import { Fragment } from 'react';
import { AffiliateBadge, AffiliateLink } from './Affiliate';
import type { AffiliateProduct } from '@/lib/affiliate';

/**
 * Một dòng gợi ý affiliate đặt native trong luồng sử dụng (GĐ C):
 * chỉ render khi có sản phẩm, luôn kèm nhãn "Liên kết tiếp thị" một lần cho cả nhóm.
 */
export function AffiliateSuggestionLine({ label, products }: { label: string; products: AffiliateProduct[] | undefined }) {
  if (!products || products.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-2 text-xs">
      <span className="font-semibold text-foreground">{label}:</span>
      {products.map((p, i) => (
        <Fragment key={p.id}>
          {i > 0 && <span className="text-muted-foreground" aria-hidden>·</span>}
          <AffiliateLink code={p.code} showBadge={false}>
            {p.name}{p.price_hint ? ` (${p.price_hint})` : ''}
          </AffiliateLink>
        </Fragment>
      ))}
      <AffiliateBadge />
    </div>
  );
}
