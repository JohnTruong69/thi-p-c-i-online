import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/wedding/events")({
  head: () => ({ meta: [
    { title: "events | Se Duyên" },
    { name: "description", content: "events — Se Duyên: kế hoạch cưới cho hai bạn." },
    { property: "og:title", content: "events | Se Duyên" },
    { property: "og:description", content: "events — Se Duyên: kế hoạch cưới cho hai bạn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="events" />; }
