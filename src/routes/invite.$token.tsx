import { createFileRoute } from "@tanstack/react-router";
import { InviteAcceptPage } from "@/components/AuthScreens";
export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Lời mời cùng quản lý | Wedding Planner Việt" },
    { name: "description", content: "Chấp nhận lời mời cùng quản lý đám cưới." },
    { property: "og:title", content: "Lời mời cùng quản lý | Wedding Planner Việt" },
    { property: "og:description", content: "Chấp nhận lời mời cùng quản lý đám cưới." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: Screen,
});
function Screen() { const { token } = Route.useParams(); return <InviteAcceptPage token={token} />; }
