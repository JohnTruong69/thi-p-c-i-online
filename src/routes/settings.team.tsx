import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/settings/team")({
  head: () => ({ meta: [
    { title: "team | Thiệp Cưới Online Việt" },
    { name: "description", content: "team — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:title", content: "team | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "team — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="team" />; }
