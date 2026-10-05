import { createFileRoute } from "@tanstack/react-router";
import { RegisterPage } from "@/components/AuthScreens";
export const Route = createFileRoute("/register")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => (typeof s['redirect'] === "string" ? { redirect: s['redirect'] } : {}),
  head: () => ({ meta: [
    { title: "Tạo tài khoản | Wedding Planner Việt" },
    { name: "description", content: "Tạo tài khoản để lưu đám cưới và các buổi lễ của hai bạn." },
    { property: "og:title", content: "Tạo tài khoản | Wedding Planner Việt" },
    { property: "og:description", content: "Tạo tài khoản để lưu đám cưới và các buổi lễ của hai bạn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { const s = Route.useSearch() as { redirect?: string; reason?: string }; return <RegisterPage redirect={s.redirect} />; }
