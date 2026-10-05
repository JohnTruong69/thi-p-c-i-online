import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/plan/tasks_/suggestions")({
  head: () => ({ meta: [
    { title: "Thư viện việc gợi ý | Se Duyên" },
    { name: "description", content: "Thư viện việc gợi ý — Se Duyên." },
    { property: "og:title", content: "Thư viện việc gợi ý | Se Duyên" },
    { property: "og:description", content: "Thư viện việc gợi ý — Se Duyên." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="tasks" focusId="suggestions" />; }
