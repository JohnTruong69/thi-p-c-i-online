import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/guests_/export")({
  head: () => ({ meta: [
    { title: "Xuất sổ khách | Wedding Planner Việt" },
    { name: "description", content: "Xuất sổ khách của hai bạn Wedding Planner Việt." },
    { property: "og:title", content: "Xuất sổ khách | Wedding Planner Việt" },
    { property: "og:description", content: "Xuất sổ khách của hai bạn Wedding Planner Việt." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="export" />; }
