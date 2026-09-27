import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/plan/budget_/$id")({
  head: () => ({ meta: [
    { title: "Chi tiết khoản chi | Thiệp Cưới Online Việt" },
    { name: "description", content: "Chi tiết khoản chi — bản dùng thử Thiệp Cưới Online Việt." },
    { property: "og:title", content: "Chi tiết khoản chi | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Chi tiết khoản chi — bản dùng thử Thiệp Cưới Online Việt." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="budget" />; }
