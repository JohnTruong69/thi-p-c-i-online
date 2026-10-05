import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/wedding/new")({
  head: () => ({ meta: [
    { title: "new | Wedding Planner Việt" },
    { name: "description", content: "new — Wedding Planner Việt: kế hoạch cưới cho hai bạn." },
    { property: "og:title", content: "new | Wedding Planner Việt" },
    { property: "og:description", content: "new — Wedding Planner Việt: kế hoạch cưới cho hai bạn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="new" />; }
