import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/i/$token_/rsvp")({
  head: () => ({ meta: [
    { title: "Xác nhận tham dự | Thiệp Cưới Online Việt" },
    { name: "description", content: "Trả lời tham dự cho từng buổi lễ của thiệp cưới." },
    { property: "og:title", content: "Xác nhận tham dự | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Trả lời tham dự cho từng buổi lễ của thiệp cưới." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { const { token } = Route.useParams(); return <PhaseOne screen="guestRsvp" token={token} />; }
