import { createFileRoute } from "@tanstack/react-router";
import { ViewerInviteAcceptPage } from "@/components/ViewerScreens";
export const Route = createFileRoute("/viewer-invite/$token")({
  ssr: false,
  head: () => ({ meta: [
    { name: "referrer", content: "no-referrer" },
    { title: "Lời mời xem kế hoạch cưới | Thiệp Cưới Online Việt" },
    { name: "description", content: "Chấp nhận lời mời xem một phần kế hoạch cưới." },
    { property: "og:title", content: "Lời mời xem kế hoạch cưới | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Chấp nhận lời mời xem một phần kế hoạch cưới." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: Screen,
});
function Screen() { const { token } = Route.useParams(); return <ViewerInviteAcceptPage token={token} />; }
