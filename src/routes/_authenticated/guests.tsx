import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/guests")({
  head: () => ({ meta: [
    { title: "guests | Se Duyên" },
    { name: "description", content: "guests — Se Duyên: kế hoạch cưới cho hai bạn." },
    { property: "og:title", content: "guests | Se Duyên" },
    { property: "og:description", content: "guests — Se Duyên: kế hoạch cưới cho hai bạn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="guests" />; }
