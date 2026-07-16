import type { WorkdayGap, WorkdayReminderSettings } from '@time-tracker/domain';
import { describe, expect, it } from 'vitest';
import { evaluateWorkdayReminder } from './workdayReminder';

const settings: WorkdayReminderSettings = { enabled: true, gapMinutes: 15, snoozeMinutes: 10 };
const now = new Date('2026-07-15T10:00:00.000Z').getTime();
const gap: WorkdayGap = {
  startedAt: '2026-07-15T09:40:00.000Z',
  endedAt: new Date(now).toISOString(),
  durationMs: 20 * 60_000,
};
const emptyPersisted = { gapStartedAt: null, nextReminderAt: null };

function evaluate(overrides: Partial<Parameters<typeof evaluateWorkdayReminder>[0]> = {}) {
  return evaluateWorkdayReminder({
    settings,
    gaps: [gap],
    now,
    taskRunning: false,
    classificationRunning: false,
    workCheckPending: false,
    persisted: emptyPersisted,
    ...overrides,
  });
}

describe('workday reminder eligibility', () => {
  it('notifies once when the current gap reaches the threshold', () => {
    expect(evaluate()).toMatchObject({ shouldNotify: true, state: { status: 'pending' } });
    expect(
      evaluate({ persisted: { gapStartedAt: gap.startedAt, nextReminderAt: null } }),
    ).toMatchObject({ shouldNotify: false, state: { status: 'idle' } });
  });

  it('suppresses short or non-current gaps and disabled reminders', () => {
    expect(evaluate({ settings: { ...settings, gapMinutes: 30 } }).shouldNotify).toBe(false);
    expect(
      evaluate({ gaps: [{ ...gap, endedAt: new Date(now - 60_000).toISOString() }] }).shouldNotify,
    ).toBe(false);
    expect(evaluate({ settings: { ...settings, enabled: false } }).shouldNotify).toBe(false);
  });

  it('suppresses reminders for either running activity and pending work confirmation', () => {
    expect(evaluate({ taskRunning: true }).shouldNotify).toBe(false);
    expect(evaluate({ classificationRunning: true }).shouldNotify).toBe(false);
    expect(evaluate({ workCheckPending: true }).shouldNotify).toBe(false);
  });

  it('respects snooze and becomes eligible exactly when snooze expires', () => {
    const persisted = {
      gapStartedAt: gap.startedAt,
      nextReminderAt: new Date(now + 60_000).toISOString(),
    };
    expect(evaluate({ persisted }).shouldNotify).toBe(false);
    expect(
      evaluate({ persisted: { ...persisted, nextReminderAt: new Date(now).toISOString() } })
        .shouldNotify,
    ).toBe(true);
  });
});
