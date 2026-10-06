import { describe, expect, it } from 'vitest';
import { daysUntil, effectivePrefs, matchingReminderDay, EVENT_REMINDER_DAYS, TASK_REMINDER_DAYS } from './reminders';

describe('daysUntil', () => {
  it('counts whole days between YYYY-MM-DD dates', () => {
    expect(daysUntil('2026-10-06', '2026-10-13')).toBe(7);
    expect(daysUntil('2026-10-06', '2026-10-06')).toBe(0);
    expect(daysUntil('2026-10-06', '2026-10-05')).toBe(-1);
  });
});

describe('matchingReminderDay', () => {
  it('matches only the configured windows', () => {
    expect(matchingReminderDay(7, TASK_REMINDER_DAYS)).toBe(7);
    expect(matchingReminderDay(3, TASK_REMINDER_DAYS)).toBe(3);
    expect(matchingReminderDay(5, TASK_REMINDER_DAYS)).toBeNull();
    expect(matchingReminderDay(30, EVENT_REMINDER_DAYS)).toBe(30);
    expect(matchingReminderDay(14, EVENT_REMINDER_DAYS)).toBeNull();
  });
});

describe('effectivePrefs', () => {
  it('defaults ON when the couple never opened settings', () => {
    expect(effectivePrefs(null)).toEqual({ task_reminders: true, event_reminders: true });
    expect(effectivePrefs({ wedding_id: 'w', task_reminders: false, event_reminders: true }))
      .toEqual({ task_reminders: false, event_reminders: true });
  });
});
