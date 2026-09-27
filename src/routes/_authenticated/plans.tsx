import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/plans")({
  head: () => ({ meta: [
    { title: "Công bố thiệp | Thiệp Cưới Online Việt" },
    { name: "description", content: "Gói mới đang hoàn thiện, chưa thể thanh toán. Xem quyền dự kiến (thử nghiệm) để công bố thiệp." },
    { property: "og:title", content: "Công bố thiệp | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Gói mới đang hoàn thiện, chưa thể thanh toán. Xem quyền dự kiến (thử nghiệm) để công bố thiệp." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="plans" />; }
