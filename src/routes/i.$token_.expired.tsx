import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/i/$token_/expired")({
  head: () => ({ meta: [
    { title: "expired | Thiệp Cưới Online Việt" },
    { name: "description", content: "expired — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:title", content: "expired | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "expired — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { const { token } = Route.useParams(); return <PhaseOne screen="expired" token={token} />; }
