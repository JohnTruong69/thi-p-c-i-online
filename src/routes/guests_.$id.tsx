import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/guests_/$id")({
  head: () => ({ meta: [
    { title: "Hồ sơ khách | Thiệp Cưới Online Việt" },
    { name: "description", content: "Hồ sơ khách — bản dùng thử Thiệp Cưới Online Việt." },
    { property: "og:title", content: "Hồ sơ khách | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Hồ sơ khách — bản dùng thử Thiệp Cưới Online Việt." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="guests" />; }
