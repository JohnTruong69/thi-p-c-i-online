import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/plan/tasks_/$id")({
  head: () => ({ meta: [
    { title: "Chi tiết việc cần làm | Wedding Planner Việt" },
    { name: "description", content: "Mở và sửa một việc trong kế hoạch cưới đã lưu của hai bạn." },
    { property: "og:title", content: "Chi tiết việc cần làm | Wedding Planner Việt" },
    { property: "og:description", content: "Mở và sửa một việc trong kế hoạch cưới đã lưu của hai bạn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { const { id } = Route.useParams(); return <PhaseOne screen="tasks" focusId={id} />; }
