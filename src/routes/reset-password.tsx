import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordPage } from "@/components/AuthScreens";
export const Route = createFileRoute("/reset-password")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { next?: string } => (typeof s['next'] === 'string' ? { next: s['next'] } : {}),
  head: () => ({ meta: [
    { title: "Chọn mật khẩu mới | Thiệp Cưới Online Việt" },
    { name: "description", content: "Đặt mật khẩu mới cho tài khoản của bạn." },
    { property: "og:title", content: "Chọn mật khẩu mới | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Đặt mật khẩu mới cho tài khoản của bạn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { const { next } = Route.useSearch(); return <ResetPasswordPage next={next} />; }
