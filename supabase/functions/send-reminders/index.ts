// Supabase Edge Function: send-reminders
// Runs daily (~07:00 Vietnam time). Scans tasks due soon and upcoming events,
// sends one digest email per wedding via Resend, and logs each reminder so it
// is never sent twice for the same (wedding, kind, ref, days_before, recipient).
//
// Required secrets: RESEND_API_KEY
// Optional: REMINDER_FROM (default "Se Duyên <chao@seduyen.app>"), APP_URL (default https://seduyen.app)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("REMINDER_FROM") ?? "Se Duyên <chao@seduyen.app>";
const APP_URL = (Deno.env.get("APP_URL") ?? "https://seduyen.app").replace(/\/$/, "");

const TASK_DAYS = [7, 3, 1];
const EVENT_DAYS = [30, 7, 1];

/** YYYY-MM-DD in Vietnam (UTC+7, no DST). */
function vnDate(offsetDays = 0): string {
  return new Date(Date.now() + 7 * 3600 * 1000 + offsetDays * 86400 * 1000)
    .toISOString().slice(0, 10);
}
function daysUntil(today: string, date: string): number {
  return Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000,
  );
}
const fmtDate = (d: string) => d.split("-").reverse().slice(0, 2).join("/");

type DueTask = { id: string; wedding_id: string; title: string; due_date: string; days: number };
type DueEvent = { id: string; wedding_id: string; name: string; event_date: string; days: number };

function emailHtml(tasks: DueTask[], events: DueEvent[]): string {
  const taskRows = tasks.map((t) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #f0e6d2;"><strong>${esc(t.title)}</strong><br><span style="color:#8a6d5a;font-size:13px;">Đến hạn ${fmtDate(t.due_date)} — còn ${t.days} ngày</span></td></tr>`
  ).join("");
  const eventRows = events.map((e) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #f0e6d2;"><strong>${esc(e.name)}</strong><br><span style="color:#8a6d5a;font-size:13px;">Ngày ${fmtDate(e.event_date)} — còn ${e.days} ngày</span></td></tr>`
  ).join("");
  return `<!doctype html><html lang="vi"><body style="margin:0;background:#fbf7ee;font-family:system-ui,sans-serif;color:#3d2b23;">
<div style="max-width:560px;margin:0 auto;padding:24px;">
<div style="text-align:center;padding:16px 0;border-bottom:2px solid #c9a227;"><span style="font-size:22px;font-weight:bold;color:#b3202c;">Se Duyên</span><br><span style="font-size:12px;color:#8a6d5a;">Se duyên cho ngày trọng đại</span></div>
<p style="font-size:16px;">Chào hai bạn,</p>
<p>Se Duyên nhắc nhẹ những việc sắp tới để hai bạn không bị lỡ nhịp:</p>
${tasks.length ? `<h3 style="color:#b3202c;">Việc sắp đến hạn</h3><table style="width:100%;border-collapse:collapse;">${taskRows}</table><p><a href="${APP_URL}/plan/tasks" style="display:inline-block;background:#b3202c;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Xem việc cần làm</a></p>` : ""}
${events.length ? `<h3 style="color:#b3202c;">Buổi lễ sắp tới</h3><table style="width:100%;border-collapse:collapse;">${eventRows}</table><p><a href="${APP_URL}/wedding/events" style="display:inline-block;background:#b3202c;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Xem các buổi lễ</a></p>` : ""}
<p style="font-size:12px;color:#8a6d5a;border-top:1px solid #f0e6d2;padding-top:12px;">Không muốn nhận nhắc việc nữa? Tắt trong app tại Khác → Tài khoản &amp; dữ liệu → Nhắc việc qua email.</p>
</div></body></html>`;
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

Deno.serve(async () => {
  if (!RESEND_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "RESEND_API_KEY secret is not set" }), { status: 500 });
  }
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const today = vnDate();
  const taskDates = TASK_DAYS.map((d) => vnDate(d));
  const eventDates = EVENT_DAYS.map((d) => vnDate(d));

  const { data: prefs } = await sb.from("reminder_prefs").select("wedding_id,task_reminders,event_reminders");
  const prefOf = (wid: string) => prefs?.find((p) => p.wedding_id === wid);
  const taskOn = (wid: string) => prefOf(wid)?.task_reminders ?? true;
  const eventOn = (wid: string) => prefOf(wid)?.event_reminders ?? true;

  const { data: tasks } = await sb.from("tasks")
    .select("id,wedding_id,title,due_date")
    .in("due_date", taskDates).neq("status", "done");
  const { data: events } = await sb.from("events")
    .select("id,wedding_id,name,event_date")
    .in("event_date", eventDates);

  // Group by wedding, attach the matched window, skip opted-out weddings.
  const byWedding = new Map<string, { tasks: DueTask[]; events: DueEvent[] }>();
  const bucket = (wid: string) => {
    let b = byWedding.get(wid);
    if (!b) { b = { tasks: [], events: [] }; byWedding.set(wid, b); }
    return b;
  };
  for (const t of tasks ?? []) {
    if (!t.due_date || !taskOn(t.wedding_id)) continue;
    bucket(t.wedding_id).tasks.push({ ...t, days: daysUntil(today, t.due_date) });
  }
  for (const e of events ?? []) {
    if (!e.event_date || !eventOn(e.wedding_id)) continue;
    bucket(e.wedding_id).events.push({ ...e, days: daysUntil(today, e.event_date) });
  }

  let sent = 0, failed = 0;
  const errors: string[] = [];
  for (const [wid, items] of byWedding) {
    try {
      // Recipients: the wedding's managers.
      const { data: members } = await sb.from("wedding_memberships").select("user_id").eq("wedding_id", wid);
      const ids = (members ?? []).map((m) => m.user_id);
      if (!ids.length) continue;
      const { data: profiles } = await sb.from("profiles").select("email").in("id", ids);
      const recipients = [...new Set((profiles ?? []).map((p) => p.email).filter(Boolean))];
      if (!recipients.length) continue;

      // Dedupe: drop items already reminded for this window.
      const freshTasks: DueTask[] = [], freshEvents: DueEvent[] = [];
      for (const t of items.tasks) {
        const { data } = await sb.from("reminder_log").select("id")
          .eq("wedding_id", wid).eq("kind", "task").eq("ref_id", t.id).eq("days_before", t.days).limit(1);
        if (!data?.length) freshTasks.push(t);
      }
      for (const e of items.events) {
        const { data } = await sb.from("reminder_log").select("id")
          .eq("wedding_id", wid).eq("kind", "event").eq("ref_id", e.id).eq("days_before", e.days).limit(1);
        if (!data?.length) freshEvents.push(e);
      }
      if (!freshTasks.length && !freshEvents.length) continue;

      const n = freshTasks.length + freshEvents.length;
      const subject = `Se Duyên nhắc nhẹ: ${n} mục sắp tới`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: recipients, subject, html: emailHtml(freshTasks, freshEvents) }),
      });
      const ok = res.ok;
      const logRows = [
        ...freshTasks.map((t) => ({ wedding_id: wid, kind: "task", ref_id: t.id, days_before: t.days, recipient: recipients.join(","), status: ok ? "sent" : "failed", error: ok ? null : `resend:${res.status}` })),
        ...freshEvents.map((e) => ({ wedding_id: wid, kind: "event", ref_id: e.id, days_before: e.days, recipient: recipients.join(","), status: ok ? "sent" : "failed", error: ok ? null : `resend:${res.status}` })),
      ];
      await sb.from("reminder_log").upsert(logRows, { onConflict: "wedding_id,kind,ref_id,days_before,recipient" });
      if (ok) sent++; else { failed++; errors.push(`${wid}: resend ${res.status}`); }
    } catch (e) {
      failed++; errors.push(`${wid}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return new Response(JSON.stringify({ ok: true, today, sent, failed, errors: errors.slice(0, 10) }), {
    headers: { "Content-Type": "application/json" },
  });
});
