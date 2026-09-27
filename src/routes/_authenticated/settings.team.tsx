import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/settings/team")({
  head: () => ({ meta: [
    { title: "Hai bạn cùng quản lý | Thiệp Cưới Online Việt" },
    { name: "description", content: "Quyền cố định của hai bạn và dữ liệu dùng thử trong Phase 1." },
    { property: "og:title", content: "Hai bạn cùng quản lý | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Quyền cố định của hai bạn và dữ liệu dùng thử trong Phase 1." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="team" />; }
