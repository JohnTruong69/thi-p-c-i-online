import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/invitation/history")({
  head: () => ({ meta: [
    { title: "Chia sẻ và lịch sử thiệp | Thiệp Cưới Online Việt" },
    { name: "description", content: "Chia sẻ và lịch sử thiệp — bản dùng thử Thiệp Cưới Online Việt." },
    { property: "og:title", content: "Chia sẻ và lịch sử thiệp | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Chia sẻ và lịch sử thiệp — bản dùng thử Thiệp Cưới Online Việt." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="history" />; }
