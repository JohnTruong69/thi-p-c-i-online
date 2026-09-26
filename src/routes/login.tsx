import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/login")({
  head: () => ({ meta: [
    { title: "login | Thiệp Cưới Online Việt" },
    { name: "description", content: "login — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:title", content: "login | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "login — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="login" />; }
