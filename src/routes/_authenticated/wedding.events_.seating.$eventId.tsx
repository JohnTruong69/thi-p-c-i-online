import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/wedding/events_/seating/$eventId")({
  head: () => ({ meta: [
    { title: "Xếp bàn | Se Duyên" },
    { name: "description", content: "Xếp bàn tiệc cưới — Se Duyên." },
    { property: "og:title", content: "Xếp bàn | Se Duyên" },
    { property: "og:description", content: "Xếp bàn tiệc cưới — Se Duyên." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { const { eventId } = Route.useParams(); return <PhaseOne screen="seating" focusId={eventId} />; }
