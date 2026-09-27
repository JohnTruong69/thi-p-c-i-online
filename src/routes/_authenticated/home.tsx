import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [
    { title: "Tổng quan | Thiệp Cưới Online Việt" },
    { name: "description", content: "Tổng quan — Thiệp Cưới Online Việt: thiệp cưới online và kế hoạch cưới cho hai bạn." },
    { property: "og:title", content: "Tổng quan | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Tổng quan — Thiệp Cưới Online Việt: thiệp cưới online và kế hoạch cưới cho hai bạn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="home" />; }
