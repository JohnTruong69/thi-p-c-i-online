import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/settings/data")({
  head: () => ({ meta: [
    { title: "Tài khoản và dữ liệu | Thiệp Cưới Online Việt" },
    { name: "description", content: "Quản lý một người còn lại trong cặp đôi và xem dữ liệu dùng thử." },
    { property: "og:title", content: "Tài khoản và dữ liệu | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Quản lý một người còn lại trong cặp đôi và xem dữ liệu dùng thử." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="data" />; }
