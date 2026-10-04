import { ExternalLink } from 'lucide-react';

/** Nhãn chuẩn cho mọi link affiliate trong app: rõ ràng, không gây khó chịu. */
export function AffiliateBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`ml-1.5 inline-block whitespace-nowrap rounded bg-muted px-1.5 py-0.5 align-middle text-[10px] font-medium text-muted-foreground ${className}`}
      title="Liên kết tiếp thị — chúng mình có thể nhận hoa hồng khi bạn mua qua link này, giá bạn trả không đổi."
    >
      Liên kết tiếp thị
    </span>
  );
}

/** Link affiliate nội bộ: đi qua /r/:code để ghi nhận click rồi chuyển đến trang đích. */
export function AffiliateLink({ code, children, className = '', showBadge = true }: {
  code: string; children: React.ReactNode; className?: string; showBadge?: boolean;
}) {
  return (
    <a
      href={`/r/${code}`}
      target="_blank"
      rel="nofollow sponsored noopener"
      className={`inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline ${className}`}
    >
      <ExternalLink className="size-3.5 shrink-0" />
      <span>{children}</span>
      {showBadge && <AffiliateBadge />}
    </a>
  );
}
