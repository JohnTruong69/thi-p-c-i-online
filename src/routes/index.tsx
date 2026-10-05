import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Bắt đầu | Wedding Planner Việt" },
    { name: "description", content: "Bắt đầu — Wedding Planner Việt: kế hoạch cưới cho hai bạn." },
    { property: "og:title", content: "Bắt đầu | Wedding Planner Việt" },
    { property: "og:description", content: "Bắt đầu — Wedding Planner Việt: kế hoạch cưới cho hai bạn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="start" />; }
