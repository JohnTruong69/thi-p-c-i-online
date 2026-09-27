import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/wedding/events_/$id")({
  head: () => ({ meta: [
    { title: "Sửa buổi lễ | Thiệp Cưới Online Việt" },
    { name: "description", content: "Sửa buổi lễ — bản dùng thử Thiệp Cưới Online Việt." },
    { property: "og:title", content: "Sửa buổi lễ | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Sửa buổi lễ — bản dùng thử Thiệp Cưới Online Việt." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { const { id } = Route.useParams(); return <PhaseOne screen="events" focusId={id} />; }
