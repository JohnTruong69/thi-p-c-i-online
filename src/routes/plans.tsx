import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/plans")({
  head: () => ({ meta: [
    { title: "Công bố thiệp | Thiệp Cưới Online Việt" },
    { name: "description", content: "Chuẩn bị miễn phí, xem gói Wedding 149.000 đ và thời hạn công bố thiệp 24 tháng." },
    { property: "og:title", content: "Công bố thiệp | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Chuẩn bị miễn phí, xem gói Wedding 149.000 đ và thời hạn công bố thiệp 24 tháng." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="plans" />; }
