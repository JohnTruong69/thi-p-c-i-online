import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/guests_/import_/$batch")({
  head: () => ({ meta: [
    { title: "batch | Thiệp Cưới Online Việt" },
    { name: "description", content: "batch — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:title", content: "batch | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "batch — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="batch" />; }
