import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/i/$token_/rsvp_/receipt")({
  head: () => ({ meta: [
    { title: "Biên nhận minh họa | Thiệp Cưới Online Việt" },
    { name: "description", content: "Xem lại lựa chọn RSVP trong phiên minh họa; không có phản hồi nào được gửi thật." },
    { property: "og:title", content: "Biên nhận minh họa | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Xem lại lựa chọn RSVP trong phiên minh họa; không có phản hồi nào được gửi thật." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { const { token } = Route.useParams(); return <PhaseOne screen="receipt" token={token} />; }
