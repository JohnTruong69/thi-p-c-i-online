import { createFileRoute } from "@tanstack/react-router";
import { PackagePage } from "@/components/Presale";
export const Route = createFileRoute("/goi")({
  head: () => ({ meta: [
    { title: "Gói Thiệp Cưới 199.000đ / 36 tháng | Thiệp Cưới Online Việt" },
    { name: "description", content: "Một gói cho một đám cưới: kế hoạch cưới, sổ khách, thiệp Đường Hẹn và trả lời tham dự trong 36 tháng." },
    { property: "og:title", content: "Gói Thiệp Cưới | Thiệp Cưới Online Việt" },
    { property: "og:description", content: "Một gói cho một đám cưới, dùng 36 tháng kể từ khi thanh toán qua SePay." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PackagePage,
});
