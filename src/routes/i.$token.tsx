import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/i/$token")({
  head: () => ({ meta: [
    { title: "Thiệp cưới | Thiệp Cưới Online Việt" },
    { name: "description", content: "Thiệp cưới — Thiệp Cưới Online Việt: thiệp cưới online và kế hoạch cưới cho hai bạn." },
    { property: "og:title", content: "Thiệp cưới | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Thiệp cưới — Thiệp Cưới Online Việt: thiệp cưới online và kế hoạch cưới cho hai bạn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { const { token } = Route.useParams(); return <PhaseOne screen="guest" token={token} />; }
