import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/guests_/$id")({
  head: () => ({ meta: [
    { title: "Hồ sơ khách | Se Duyên" },
    { name: "description", content: "Hồ sơ khách của hai bạn Se Duyên." },
    { property: "og:title", content: "Hồ sơ khách | Se Duyên" },
    { property: "og:description", content: "Hồ sơ khách của hai bạn Se Duyên." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { const { id } = Route.useParams(); return <PhaseOne screen="guests" focusId={id} />; }
