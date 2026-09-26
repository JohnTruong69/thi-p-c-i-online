import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/start")({
  head: () => ({ meta: [
    { title: "start | Thiệp Cưới Online Việt" },
    { name: "description", content: "start — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:title", content: "start | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "start — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="start" />; }
