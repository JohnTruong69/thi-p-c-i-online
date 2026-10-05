import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/start")({
  head: () => ({ meta: [
    { title: "start | Se Duyên" },
    { name: "description", content: "start — Se Duyên: kế hoạch cưới cho hai bạn." },
    { property: "og:title", content: "start | Se Duyên" },
    { property: "og:description", content: "start — Se Duyên: kế hoạch cưới cho hai bạn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="start" />; }
