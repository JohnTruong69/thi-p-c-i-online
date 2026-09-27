import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/plan/tasks_/suggestions")({
  head: () => ({ meta: [
    { title: "Thư viện việc gợi ý | Thiệp Cưới Online Việt" },
    { name: "description", content: "Thư viện việc gợi ý — bản dùng thử Thiệp Cưới Online Việt." },
    { property: "og:title", content: "Thư viện việc gợi ý | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Thư viện việc gợi ý — bản dùng thử Thiệp Cưới Online Việt." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="tasks" />; }
