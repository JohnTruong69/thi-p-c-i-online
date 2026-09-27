import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/invitation/check")({
  head: () => ({ meta: [
    { title: "Kiểm tra thiệp | Thiệp Cưới Online Việt" },
    { name: "description", content: "Kiểm tra thiệp — bản dùng thử Thiệp Cưới Online Việt." },
    { property: "og:title", content: "Kiểm tra thiệp | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Kiểm tra thiệp — bản dùng thử Thiệp Cưới Online Việt." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="check" />; }
