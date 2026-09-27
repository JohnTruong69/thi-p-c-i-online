import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/guests_/export")({
  head: () => ({ meta: [
    { title: "Xuất sổ khách | Thiệp Cưới Online Việt" },
    { name: "description", content: "Xuất sổ khách — bản dùng thử Thiệp Cưới Online Việt." },
    { property: "og:title", content: "Xuất sổ khách | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Xuất sổ khách — bản dùng thử Thiệp Cưới Online Việt." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="export" />; }
