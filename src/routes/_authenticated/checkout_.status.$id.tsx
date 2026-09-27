import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/checkout_/status/$id")({
  head: () => ({ meta: [
    { title: "Trạng thái đơn | Thiệp Cưới Online Việt" },
    { name: "description", content: "Trạng thái đơn Wedding; chỉ hiện đã thanh toán khi giao dịch được hệ thống xác minh." },
    { property: "og:title", content: "Trạng thái đơn | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Trạng thái đơn Wedding; chỉ hiện đã thanh toán khi giao dịch được hệ thống xác minh." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { const { id } = Route.useParams(); return <PhaseOne screen="status" focusId={id} />; }
