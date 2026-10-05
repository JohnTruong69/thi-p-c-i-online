import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/guests_/import")({
  head: () => ({ meta: [
    { title: "import | Se Duyên" },
    { name: "description", content: "import — Se Duyên: kế hoạch cưới cho hai bạn." },
    { property: "og:title", content: "import | Se Duyên" },
    { property: "og:description", content: "import — Se Duyên: kế hoạch cưới cho hai bạn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="import" />; }
