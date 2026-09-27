import { createFileRoute } from "@tanstack/react-router";
import { ClaimScreen } from "@/components/Presale";
import { PublicShell } from "@/components/AuthScreens";
export const Route = createFileRoute("/_authenticated/claim/$token")({
  head: () => ({ meta: [
    { name: "referrer", content: "no-referrer" },
    { title: "Tạo đám cưới từ đơn đã thanh toán | Thiệp Cưới Online Việt" },
    { name: "description", content: "Dùng đơn đã được SePay xác nhận để tạo đám cưới và mở quyền 36 tháng." },
    { name: "robots", content: "noindex" },
    { property: "og:title", content: "Tạo đám cưới | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Dùng đơn đã thanh toán để tạo đám cưới." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { const { token } = Route.useParams(); return <PublicShell><ClaimScreen token={token} /></PublicShell>; }
