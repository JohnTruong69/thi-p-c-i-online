import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/checkout_/status/$id")({
  head: () => ({ meta: [
    { title: "Trạng thái đơn minh họa | Thiệp Cưới Online Việt" },
    { name: "description", content: "Xem trạng thái minh họa của đơn Wedding; không xác nhận thanh toán hoặc cấp quyền thật." },
    { property: "og:title", content: "Trạng thái đơn minh họa | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Xem trạng thái minh họa của đơn Wedding; không xác nhận thanh toán hoặc cấp quyền thật." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="status" />; }
