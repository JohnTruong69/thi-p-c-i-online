import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/vendors")({
  head: () => ({ meta: [
    { title: "Nhà cung cấp đề xuất | Wedding Planner Việt" },
    { name: "description", content: "Danh bạ nhà cung cấp cưới được đề xuất: studio ảnh cưới, makeup, nhà hàng tiệc cưới — xem ưu đãi và đặt lịch tư vấn." },
    { property: "og:title", content: "Nhà cung cấp đề xuất | Wedding Planner Việt" },
    { property: "og:description", content: "Danh bạ nhà cung cấp cưới được đề xuất: studio ảnh cưới, makeup, nhà hàng tiệc cưới — xem ưu đãi và đặt lịch tư vấn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="vendors" />; }
