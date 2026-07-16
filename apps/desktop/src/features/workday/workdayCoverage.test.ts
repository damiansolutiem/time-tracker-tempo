import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WeeklyWorkSchedule } from '@time-tracker/domain';
import { createDefaultWorkSchedule } from '../settings/workSchedule';
import { clipDurationToDay, localDayBounds } from '../history/day';
import {
  buildDailyWorkdaySummary,
  calculateTrackedDayFacts,
  mergeIntervals,
} from './workdayCoverage';

const hour = 60 * 60 * 1000;
const originalTimezone = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'Europe/Madrid';
});

afterAll(() => {
  process.env.TZ = originalTimezone;
});

function enabledSchedule() {
  const schedule = createDefaultWorkSchedule();
  schedule.enabled = true;
  return schedule;
}

function localIso(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year!, month! - 1, day, hours, minutes).toISOString();
}

function entry(date: string, start: string, end: string | null) {
  return { startedAt: localIso(date, start), endedAt: end ? localIso(date, end) : null };
}

describe('daily workday coverage', () => {
  it('defines disabled, unscheduled, and before-work states', () => {
    const disabled = buildDailyWorkdaySummary(
      createDefaultWorkSchedule(),
      '2026-07-15',
      [],
      new Date(2026, 6, 15, 10).getTime(),
    );
    expect(disabled).toMatchObject({ enabled: false, scheduledMs: 0, coverageRatio: null });

    const beforeWork = buildDailyWorkdaySummary(
      enabledSchedule(),
      '2026-07-15',
      [],
      new Date(2026, 6, 15, 8).getTime(),
    );
    expect(beforeWork).toMatchObject({
      scheduledDay: true,
      scheduledMs: 8 * hour,
      elapsedScheduledMs: 0,
      remainingScheduledMs: 8 * hour,
      nonWorkedMs: 0,
      coverageRatio: null,
    });

    const weekend = buildDailyWorkdaySummary(
      enabledSchedule(),
      '2026-07-18',
      [],
      new Date(2026, 6, 18, 12).getTime(),
    );
    expect(weekend).toMatchObject({ enabled: true, scheduledDay: false, scheduledMs: 0 });
  });

  it('measures worked and non-worked time relative to the current time', () => {
    const summary = buildDailyWorkdaySummary(
      enabledSchedule(),
      '2026-07-15',
      [entry('2026-07-15', '09:00', '09:30')],
      new Date(2026, 6, 15, 10).getTime(),
    );
    expect(summary).toMatchObject({
      elapsedScheduledMs: hour,
      trackedTotalMs: 0.5 * hour,
      trackedScheduledMs: 0.5 * hour,
      nonWorkedMs: 0.5 * hour,
      remainingScheduledMs: 7 * hour,
      coverageRatio: 0.5,
      nonWorkedRatio: 0.5,
      currentlyScheduled: true,
      currentGapMs: 0.5 * hour,
      firstTrackedAt: localIso('2026-07-15', '09:00'),
      lastTrackedAt: localIso('2026-07-15', '09:30'),
    });
  });

  it('excludes planned breaks from elapsed scheduled time', () => {
    const summary = buildDailyWorkdaySummary(
      enabledSchedule(),
      '2026-07-15',
      [entry('2026-07-15', '09:00', '13:00')],
      new Date(2026, 6, 15, 13, 30).getTime(),
    );
    expect(summary).toMatchObject({
      scheduledMs: 8 * hour,
      elapsedScheduledMs: 4 * hour,
      trackedScheduledMs: 4 * hour,
      nonWorkedMs: 0,
      remainingScheduledMs: 4 * hour,
      plannedBreakMs: hour,
      coverageRatio: 1,
      currentlyScheduled: false,
      currentGapMs: 0,
    });
  });

  it('removes ignored classifications from the scheduled expectation', () => {
    const summary = buildDailyWorkdaySummary(
      enabledSchedule(),
      '2026-07-15',
      [entry('2026-07-15', '09:00', '09:30')],
      new Date(2026, 6, 15, 10).getTime(),
      [
        {
          category: 'ignored',
          startedAt: localIso('2026-07-15', '09:30'),
          endedAt: localIso('2026-07-15', '10:00'),
        },
      ],
    );
    expect(summary).toMatchObject({
      scheduledMs: 7.5 * hour,
      elapsedScheduledMs: 0.5 * hour,
      trackedScheduledMs: 0.5 * hour,
      nonWorkedMs: 0,
      coverageRatio: 1,
      currentlyScheduled: true,
    });
  });

  it('uses running entries and unions overlaps instead of double-counting', () => {
    const summary = buildDailyWorkdaySummary(
      enabledSchedule(),
      '2026-07-15',
      [entry('2026-07-15', '09:00', '10:00'), entry('2026-07-15', '09:30', null)],
      new Date(2026, 6, 15, 10, 30).getTime(),
    );
    expect(summary).toMatchObject({
      elapsedScheduledMs: 1.5 * hour,
      trackedScheduledMs: 1.5 * hour,
      nonWorkedMs: 0,
      overtimeMs: 0,
      currentGapMs: 0,
    });
  });

  it('matches the History day total for valid non-overlapping entries', () => {
    const date = '2026-07-15';
    const now = new Date(2026, 6, 15, 12).getTime();
    const entries = [
      entry(date, '08:30', '09:15'),
      entry(date, '09:30', '10:45'),
      entry(date, '11:00', null),
    ];
    const historyTotal = entries.reduce(
      (total, item) =>
        total + clipDurationToDay(item.startedAt, item.endedAt, localDayBounds(date), now),
      0,
    );
    const facts = calculateTrackedDayFacts(date, entries, now);
    const summary = buildDailyWorkdaySummary(enabledSchedule(), date, entries, now);

    expect(facts.trackedTotalMs).toBe(historyTotal);
    expect(summary.trackedTotalMs).toBe(historyTotal);
    expect(summary.trackedTotalMs).toBe(summary.trackedScheduledMs + summary.overtimeMs);
    expect(facts.firstTrackedAt).toBe(localIso(date, '08:30'));
    expect(facts.lastTrackedAt).toBe(new Date(now).toISOString());
  });

  it('clips entries at midnight and separates work outside the schedule as overtime', () => {
    const crossMidnight = {
      startedAt: localIso('2026-07-14', '23:30'),
      endedAt: localIso('2026-07-15', '09:30'),
    };
    const summary = buildDailyWorkdaySummary(
      enabledSchedule(),
      '2026-07-15',
      [crossMidnight, entry('2026-07-15', '18:00', '19:00')],
      new Date(2026, 6, 15, 20).getTime(),
    );
    expect(summary.trackedScheduledMs).toBe(0.5 * hour);
    expect(summary.trackedTotalMs).toBe(10.5 * hour);
    expect(summary.overtimeMs).toBe(10 * hour);
    expect(summary.trackedTotalMs).toBe(summary.trackedScheduledMs + summary.overtimeMs);
    expect(summary.nonWorkedMs).toBe(7.5 * hour);
  });

  it('uses actual elapsed duration for schedule blocks across DST changes', () => {
    const schedule: WeeklyWorkSchedule = enabledSchedule();
    schedule.days.sunday = [{ id: 'dst', start: '00:00', end: '04:00' }];

    const spring = buildDailyWorkdaySummary(
      schedule,
      '2026-03-29',
      [],
      new Date(2026, 2, 29, 5).getTime(),
    );
    const autumn = buildDailyWorkdaySummary(
      schedule,
      '2026-10-25',
      [],
      new Date(2026, 9, 25, 5).getTime(),
    );
    expect(spring.scheduledMs).toBe(3 * hour);
    expect(autumn.scheduledMs).toBe(5 * hour);
  });
});

describe('interval union', () => {
  it('merges overlapping and adjacent intervals and discards invalid ranges', () => {
    expect(
      mergeIntervals([
        { start: 10, end: 20 },
        { start: 15, end: 30 },
        { start: 30, end: 40 },
        { start: 50, end: 40 },
      ]),
    ).toEqual([{ start: 10, end: 40 }]);
  });
});
