import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/wedding/events_/$id")({
  head: () => ({ meta: [
    { title: "Sửa buổi lễ | Se Duyên" },
    { name: "description", content: "Sửa buổi lễ — Se Duyên." },
    { property: "og:title", content: "Sửa buổi lễ | Se Duyên" },
    { property: "og:description", content: "Sửa buổi lễ — Se Duyên." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { const { id } = Route.useParams(); return <PhaseOne screen="events" focusId={id} />; }
