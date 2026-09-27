import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/checkout")({
  head: () => ({ meta: [
    { title: "Đơn Wedding minh họa | Thiệp Cưới Online Việt" },
    { name: "description", content: "Xem lại đơn Wedding 149.000 đ, thanh toán một lần và thời hạn 24 tháng trong bản demo." },
    { property: "og:title", content: "Đơn Wedding minh họa | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Xem lại đơn Wedding 149.000 đ, thanh toán một lần và thời hạn 24 tháng trong bản demo." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="checkout" />; }
