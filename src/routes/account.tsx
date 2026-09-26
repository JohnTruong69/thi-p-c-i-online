import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/account")({
  head: () => ({ meta: [
    { title: "Tài khoản của bạn | Thiệp Cưới Online Việt" },
    { name: "description", content: "Tài khoản minh họa và quyền cùng quản lý thiệp cưới trong Phase 1." },
    { property: "og:title", content: "Tài khoản của bạn | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Tài khoản minh họa và quyền cùng quản lý thiệp cưới trong Phase 1." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="account" />; }
