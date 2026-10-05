import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Bắt đầu | Se Duyên" },
    { name: "description", content: "Bắt đầu — Se Duyên: kế hoạch cưới cho hai bạn." },
    { property: "og:title", content: "Bắt đầu | Se Duyên" },
    { property: "og:description", content: "Bắt đầu — Se Duyên: kế hoạch cưới cho hai bạn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="start" />; }
