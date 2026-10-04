import { createFileRoute, redirect } from "@tanstack/react-router";
import { trackAffiliateClick } from "@/lib/affiliate";

export const Route = createFileRoute("/r/$code")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Đang chuyển hướng…" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ params }) => {
    const target = await trackAffiliateClick(params.code);
    if (target) throw redirect({ href: target });
    return { code: params.code };
  },
  pendingComponent: () => (
    <div className="grid min-h-screen place-items-center px-6">
      <p role="status" className="text-sm text-muted-foreground">Đang chuyển hướng đến trang đối tác…</p>
    </div>
  ),
  component: Screen,
});

function Screen() {
  const { code } = Route.useParams();
  return (
    <div className="mx-auto grid min-h-screen max-w-md place-items-center px-6">
      <div className="text-center">
        <h1 className="font-display text-2xl">Không tìm thấy liên kết</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Mã “{code}” không tồn tại hoặc đã ngừng hoạt động.
        </p>
        <a
          href="/home"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground"
        >
          Về trang tổng quan
        </a>
      </div>
    </div>
  );
}
