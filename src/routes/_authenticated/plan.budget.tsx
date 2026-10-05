import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/plan/budget")({
  head: () => ({ meta: [
    { title: "Ngân sách cưới | Se Duyên" },
    { name: "description", content: "Ngân sách cưới lưu vào tài khoản: dự tính, giá chốt, đã trả, lịch trả nhà cung cấp." },
    { property: "og:title", content: "Ngân sách cưới | Se Duyên" },
    { property: "og:description", content: "Ngân sách cưới lưu vào tài khoản: dự tính, giá chốt, đã trả, lịch trả nhà cung cấp." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="budget" />; }
