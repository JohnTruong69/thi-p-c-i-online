import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/components/AuthScreens";
export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string; reason?: string } => ({
    ...(typeof s['redirect'] === "string" ? { redirect: s['redirect'] } : {}),
    ...(typeof s['reason'] === "string" ? { reason: s['reason'] } : {}),
  }),
  head: () => ({ meta: [
    { title: "Đăng nhập | Thiệp Cưới Online Việt" },
    { name: "description", content: "Đăng nhập để cùng chuẩn bị đám cưới của hai bạn." },
    { property: "og:title", content: "Đăng nhập | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Đăng nhập để cùng chuẩn bị đám cưới của hai bạn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { const s = Route.useSearch() as { redirect?: string; reason?: string }; return <LoginPage redirect={s.redirect} reason={s.reason} />; }
