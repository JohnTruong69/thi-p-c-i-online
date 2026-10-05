import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/settings/team")({
  head: () => ({ meta: [
    { title: "Người cùng quản lý | Wedding Planner Việt" },
    { name: "description", content: "Mời người cùng quản lý đám cưới; hai người có quyền như nhau." },
    { property: "og:title", content: "Người cùng quản lý | Wedding Planner Việt" },
    { property: "og:description", content: "Mời người cùng quản lý đám cưới; hai người có quyền như nhau." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="team" />; }
