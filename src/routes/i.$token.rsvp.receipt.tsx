import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/i/$token/rsvp/receipt")({
  head: () => ({ meta: [
    { title: "Đã nhận câu trả lời | Thiệp Cưới Online Việt" },
    { name: "description", content: "Đã nhận câu trả lời — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:title", content: "Đã nhận câu trả lời | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Đã nhận câu trả lời — trải nghiệm minh họa Thiệp Cưới Online Việt, Phase 1." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { const { token } = Route.useParams(); return <PhaseOne screen="receipt", token={token} />; }
