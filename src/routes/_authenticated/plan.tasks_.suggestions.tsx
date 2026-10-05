import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/plan/tasks_/suggestions")({
  head: () => ({ meta: [
    { title: "Thư viện việc gợi ý | Wedding Planner Việt" },
    { name: "description", content: "Thư viện việc gợi ý — Wedding Planner Việt." },
    { property: "og:title", content: "Thư viện việc gợi ý | Wedding Planner Việt" },
    { property: "og:description", content: "Thư viện việc gợi ý — Wedding Planner Việt." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="tasks" focusId="suggestions" />; }
