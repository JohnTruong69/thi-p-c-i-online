import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/register")({
  head: () => ({ meta: [
    { title: "register | Thiệp Cưới Online Việt" },
    { name: "description", content: "register — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:title", content: "register | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "register — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="register" />; }
