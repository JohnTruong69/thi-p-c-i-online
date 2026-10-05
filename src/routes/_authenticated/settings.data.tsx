import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/settings/data")({
  head: () => ({ meta: [
    { title: "Tài khoản và dữ liệu | Se Duyên" },
    { name: "description", content: "Hai bạn cùng quản lý, tải dữ liệu đám cưới và gửi yêu cầu xóa dữ liệu." },
    { property: "og:title", content: "Tài khoản và dữ liệu | Se Duyên" },
    { property: "og:description", content: "Hai bạn cùng quản lý, tải dữ liệu đám cưới và gửi yêu cầu xóa dữ liệu." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="data" />; }
