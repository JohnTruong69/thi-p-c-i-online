import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/guests_/gifts")({
  head: () => ({ meta: [
    { title: "gifts | Se Duyên" },
    { name: "description", content: "gifts — Se Duyên: kế hoạch cưới cho hai bạn." },
    { property: "og:title", content: "gifts | Se Duyên" },
    { property: "og:description", content: "gifts — Se Duyên: kế hoạch cưới cho hai bạn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="gifts" />; }
