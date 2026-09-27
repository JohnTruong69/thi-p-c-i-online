import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/wedding/events")({
  head: () => ({ meta: [
    { title: "events | Thiệp Cưới Online Việt" },
    { name: "description", content: "events — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:title", content: "events | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "events — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="events" />; }
