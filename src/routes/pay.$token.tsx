import { createFileRoute } from "@tanstack/react-router";
import { PayStatusPage } from "@/components/Presale";
export const Route = createFileRoute("/pay/$token")({
  head: () => ({ meta: [
    { title: "Đơn thanh toán | Thiệp Cưới Online Việt" },
    { name: "description", content: "Trạng thái đơn thanh toán gói Thiệp Cưới." },
    { name: "robots", content: "noindex" },
    { property: "og:title", content: "Đơn thanh toán | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Trạng thái đơn thanh toán gói Thiệp Cưới." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { const { token } = Route.useParams(); return <PayStatusPage token={token} />; }
