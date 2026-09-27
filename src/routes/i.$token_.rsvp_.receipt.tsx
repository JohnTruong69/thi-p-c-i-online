import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/i/$token_/rsvp_/receipt")({
  head: () => ({ meta: [
    { title: "Xác nhận đã gửi | Thiệp Cưới Online Việt" },
    { name: "description", content: "Xem lại câu trả lời tham dự bạn đã gửi." },
    { property: "og:title", content: "Xác nhận đã gửi | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Xem lại câu trả lời tham dự bạn đã gửi." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { const { token } = Route.useParams(); return <PhaseOne screen="receipt" token={token} />; }
