import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/plan/budget_/$id")({
  head: () => ({ meta: [
    { title: "Chi tiết khoản chi | Wedding Planner Việt" },
    { name: "description", content: "Chi tiết khoản chi — Wedding Planner Việt." },
    { property: "og:title", content: "Chi tiết khoản chi | Wedding Planner Việt" },
    { property: "og:description", content: "Chi tiết khoản chi — Wedding Planner Việt." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { const { id } = Route.useParams(); return <PhaseOne screen="budget" focusId={id} />; }
