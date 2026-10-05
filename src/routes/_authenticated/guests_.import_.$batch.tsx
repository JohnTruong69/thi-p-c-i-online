import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/guests_/import_/$batch")({
  head: () => ({ meta: [
    { title: "batch | Se Duyên" },
    { name: "description", content: "batch — Se Duyên: kế hoạch cưới cho hai bạn." },
    { property: "og:title", content: "batch | Se Duyên" },
    { property: "og:description", content: "batch — Se Duyên: kế hoạch cưới cho hai bạn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { const { batch } = Route.useParams(); return <PhaseOne screen="batch" focusId={batch} />; }
