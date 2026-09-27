import { createFileRoute } from "@tanstack/react-router";
import { ForgotPasswordPage } from "@/components/AuthScreens";
export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [
    { title: "Lấy lại mật khẩu | Thiệp Cưới Online Việt" },
    { name: "description", content: "Nhận liên kết đặt lại mật khẩu qua email." },
    { property: "og:title", content: "Lấy lại mật khẩu | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Nhận liên kết đặt lại mật khẩu qua email." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ForgotPasswordPage,
});
