import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/guests")({
  head: () => ({ meta: [
    { title: "guests | Thiệp Cưới Online Việt" },
    { name: "description", content: "guests — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:title", content: "guests | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "guests — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="guests" />; }
