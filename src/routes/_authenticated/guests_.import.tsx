import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/guests_/import")({
  head: () => ({ meta: [
    { title: "import | Wedding Planner Việt" },
    { name: "description", content: "import — Wedding Planner Việt: kế hoạch cưới cho hai bạn." },
    { property: "og:title", content: "import | Wedding Planner Việt" },
    { property: "og:description", content: "import — Wedding Planner Việt: kế hoạch cưới cho hai bạn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="import" />; }
