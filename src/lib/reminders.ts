/** Pure rules for email reminders. No I/O. */

export type ReminderPrefs = {
  wedding_id: string; task_reminders: boolean; event_reminders: boolean;
};

/** Days before the due date / event date when a reminder goes out. */
export const TASK_REMINDER_DAYS = [7, 3, 1];
export const EVENT_REMINDER_DAYS = [30, 7, 1];

/** Whole days from `today` until `date` (both YYYY-MM-DD). Negative = past. */
export function daysUntil(today: string, date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

/** Which reminder window a due date falls into, or null when none matches. */
export function matchingReminderDay(daysLeft: number, windows: number[]): number | null {
  return windows.includes(daysLeft) ? daysLeft : null;
}

/** Prefs fall back to ON when the couple never opened the settings screen. */
export function effectivePrefs(row: ReminderPrefs | null): { task_reminders: boolean; event_reminders: boolean } {
  return { task_reminders: row?.task_reminders ?? true, event_reminders: row?.event_reminders ?? true };
}
