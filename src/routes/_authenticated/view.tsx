import { createFileRoute } from "@tanstack/react-router";
import { ViewerHomeScreen } from "@/components/ViewerScreens";
export const Route = createFileRoute("/_authenticated/view")({
  head: () => ({ meta: [
    { title: "Kế hoạch được chia sẻ | Thiệp Cưới Online Việt" },
    { name: "description", content: "Xem các kế hoạch cưới được chia sẻ với bạn." },
    { property: "og:title", content: "Kế hoạch được chia sẻ | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Xem các kế hoạch cưới được chia sẻ với bạn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: ViewerHomeScreen,
});
