import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/checkout")({
  head: () => ({ meta: [
    { title: "Thanh toán gói Wedding | Thiệp Cưới Online Việt" },
    { name: "description", content: "Thanh toán gói Wedding chưa mở; không tạo đơn hay nhận tiền cho đến khi điều khoản được duyệt." },
    { property: "og:title", content: "Thanh toán gói Wedding | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Thanh toán gói Wedding chưa mở; không tạo đơn hay nhận tiền cho đến khi điều khoản được duyệt." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="checkout" />; }
