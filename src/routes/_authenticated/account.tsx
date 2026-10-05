import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [
    { title: "Tài khoản | Se Duyên" },
    { name: "description", content: "Thông tin tài khoản và đăng xuất." },
    { property: "og:title", content: "Tài khoản | Se Duyên" },
    { property: "og:description", content: "Thông tin tài khoản và đăng xuất." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="account" />; }
