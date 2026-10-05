import { createFileRoute } from "@tanstack/react-router";
import { ViewerWeddingScreen } from "@/components/ViewerScreens";
export const Route = createFileRoute("/_authenticated/view_/$weddingId")({
  head: () => ({ meta: [
    { title: "Xem kế hoạch cưới | Se Duyên" },
    { name: "description", content: "Xem phần kế hoạch cưới được chia sẻ, chỉ đọc." },
    { property: "og:title", content: "Xem kế hoạch cưới | Se Duyên" },
    { property: "og:description", content: "Xem phần kế hoạch cưới được chia sẻ, chỉ đọc." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: Screen,
});
function Screen() { const { weddingId } = Route.useParams(); return <ViewerWeddingScreen weddingId={weddingId} />; }
