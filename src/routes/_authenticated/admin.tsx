import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [
    { title: "Quản trị affiliate | Se Duyên" },
    { name: "description", content: "Quản lý nhà cung cấp, sản phẩm affiliate và thống kê click." },
    { property: "og:title", content: "Quản trị affiliate | Se Duyên" },
    { property: "og:description", content: "Quản lý nhà cung cấp, sản phẩm affiliate và thống kê click." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="admin" />; }
