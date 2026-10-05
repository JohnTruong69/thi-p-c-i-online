import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/wedding/events")({
  head: () => ({ meta: [
    { title: "events | Wedding Planner Việt" },
    { name: "description", content: "events — Wedding Planner Việt: kế hoạch cưới cho hai bạn." },
    { property: "og:title", content: "events | Wedding Planner Việt" },
    { property: "og:description", content: "events — Wedding Planner Việt: kế hoạch cưới cho hai bạn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="events" />; }
