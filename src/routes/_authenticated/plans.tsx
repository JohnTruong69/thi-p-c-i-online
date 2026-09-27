import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/plans")({
  head: () => ({ meta: [
    { title: "Gói thiệp cưới 199.000đ | Thiệp Cưới Online Việt" },
    { name: "description", content: "Gói thiệp cưới 199.000đ, dùng 36 tháng cho một đám cưới — hiện chưa mở bán." },
    { property: "og:title", content: "Gói thiệp cưới 199.000đ | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Gói thiệp cưới 199.000đ, dùng 36 tháng cho một đám cưới — hiện chưa mở bán." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="plans" />; }
