import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/wedding/new")({
  head: () => ({ meta: [
    { title: "new | Se Duyên" },
    { name: "description", content: "new — Se Duyên: kế hoạch cưới cho hai bạn." },
    { property: "og:title", content: "new | Se Duyên" },
    { property: "og:description", content: "new — Se Duyên: kế hoạch cưới cho hai bạn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="new" />; }
