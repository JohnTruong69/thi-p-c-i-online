import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/publish")({
  head: () => ({ meta: [
    { title: "publish | Thiệp Cưới Online Việt" },
    { name: "description", content: "publish — Thiệp Cưới Online Việt: thiệp cưới online và kế hoạch cưới cho hai bạn." },
    { property: "og:title", content: "publish | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "publish — Thiệp Cưới Online Việt: thiệp cưới online và kế hoạch cưới cho hai bạn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="publish" />; }
