import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [
    { title: "Tổng quan | Thiệp Cưới Online Việt" },
    { name: "description", content: "Tổng quan — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:title", content: "Tổng quan | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Tổng quan — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="home" />; }
