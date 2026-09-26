import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/i/$token/rsvp")({
  head: () => ({ meta: [
    { title: "Xác nhận tham dự | Thiệp Cưới Online Việt" },
    { name: "description", content: "Xác nhận tham dự — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:title", content: "Xác nhận tham dự | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Xác nhận tham dự — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { const { token } = Route.useParams(); return <PhaseOne screen="guestRsvp", token={token} />; }
