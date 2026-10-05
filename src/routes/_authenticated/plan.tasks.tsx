import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/plan/tasks")({
  head: () => ({ meta: [
    { title: "Việc cần làm | Wedding Planner Việt" },
    { name: "description", content: "Việc cần làm của hai bạn, lưu vào tài khoản: hạn, trạng thái, số bàn và việc gợi ý." },
    { property: "og:title", content: "Việc cần làm | Wedding Planner Việt" },
    { property: "og:description", content: "Việc cần làm của hai bạn, lưu vào tài khoản: hạn, trạng thái, số bàn và việc gợi ý." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="tasks" />; }
