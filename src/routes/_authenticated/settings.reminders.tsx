import { createFileRoute } from "@tanstack/react-router";
import { PhaseOne } from "@/components/PhaseOne";
export const Route = createFileRoute("/_authenticated/settings/reminders")({
  head: () => ({ meta: [
    { title: "Nhắc việc | Se Duyên" },
    { name: "description", content: "Cài đặt nhắc việc qua email — Se Duyên." },
    { property: "og:title", content: "Nhắc việc | Se Duyên" },
    { property: "og:description", content: "Cài đặt nhắc việc qua email — Se Duyên." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Screen,
});
function Screen() { return <PhaseOne screen="reminders" />; }
