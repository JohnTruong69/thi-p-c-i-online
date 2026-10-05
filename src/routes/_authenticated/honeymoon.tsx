import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/honeymoon")({
  head: () => ({ meta: [
    { title: "Trăng mật của hai bạn | Wedding Planner Việt" },
    { name: "description", content: "Gợi ý điểm đến trăng mật và đặt phòng, tour cho hai bạn sau ngày cưới." },
    { property: "og:title", content: "Trăng mật của hai bạn | Wedding Planner Việt" },
    { property: "og:description", content: "Gợi ý điểm đến trăng mật và đặt phòng, tour cho hai bạn sau ngày cưới." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="honeymoon" />; }
