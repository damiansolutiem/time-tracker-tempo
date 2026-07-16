import type { WorkScheduleOverride, WorkScheduleRevision } from '@time-tracker/domain';
import { describe, expect, it } from 'vitest';
import { createDefaultWorkSchedule } from './workSchedule';
import { buildDailyWorkdaySummary } from '../workday/workdayCoverage';
import { resolveWorkScheduleForDate, resolveWorkSchedulesForRange } from './workSchedulePolicy';

function revision(
  id: string,
  effectiveFrom: string,
  sequence: number,
  mondayStart: string,
): WorkScheduleRevision {
  const schedule = createDefaultWorkSchedule();
  schedule.enabled = true;
  schedule.days.monday = [{ id: `${id}-monday`, start: mondayStart, end: '18:00' }];
  return {
    id,
    effectiveFrom,
    schedule,
    createdAt: `2026-07-${String(sequence).padStart(2, '0')}T08:00:00.000Z`,
    sequence,
    reason: null,
  };
}

describe('effective-dated work schedule policy', () => {
  it('uses the latest revision effective on each local date', () => {
    const fallback = createDefaultWorkSchedule();
    const revisions = [
      revision('old', '0001-01-01', 1, '09:00'),
      revision('new', '2026-08-01', 2, '10:00'),
    ];

    expect(
      resolveWorkScheduleForDate(fallback, revisions, [], '2026-07-27').days.monday[0]?.start,
    ).toBe('09:00');
    expect(
      resolveWorkScheduleForDate(fallback, revisions, [], '2026-08-03').days.monday[0]?.start,
    ).toBe('10:00');
  });

  it('uses the latest appended correction when revisions share an effective date', () => {
    const fallback = createDefaultWorkSchedule();
    const revisions = [
      revision('first', '2026-08-01', 4, '09:00'),
      revision('corrected', '2026-08-01', 5, '11:00'),
    ];

    expect(
      resolveWorkScheduleForDate(fallback, revisions, [], '2026-08-03').days.monday[0]?.start,
    ).toBe('11:00');
  });

  it('replaces only the selected local date with its active override', () => {
    const fallback = createDefaultWorkSchedule();
    const revisions = [revision('base', '0001-01-01', 1, '09:00')];
    const overrides: WorkScheduleOverride[] = [
      {
        id: 'holiday',
        date: '2026-08-03',
        name: 'Holiday',
        blocks: [],
        createdAt: '2026-07-20T08:00:00.000Z',
        sequence: 2,
      },
    ];

    const map = resolveWorkSchedulesForRange(fallback, revisions, overrides, {
      startDate: '2026-08-03',
      endDate: '2026-08-04',
    });
    expect(map['2026-08-03']?.enabled).toBe(true);
    expect(map['2026-08-03']?.days.monday).toEqual([]);
    expect(map['2026-08-04']?.days.tuesday).toHaveLength(2);
  });

  it('preserves actual elapsed DST duration for a custom date override', () => {
    const fallback = createDefaultWorkSchedule();
    const overrides: WorkScheduleOverride[] = [
      {
        id: 'dst-hours',
        date: '2026-03-29',
        name: 'Exceptional Sunday',
        blocks: [{ id: 'dst-block', start: '00:00', end: '04:00' }],
        createdAt: '2026-03-01T08:00:00.000Z',
        sequence: 1,
      },
    ];
    const schedule = resolveWorkScheduleForDate(fallback, [], overrides, '2026-03-29');
    const summary = buildDailyWorkdaySummary(
      schedule,
      '2026-03-29',
      [],
      new Date(2026, 2, 29, 5).getTime(),
    );

    expect(summary.scheduledMs).toBe(3 * 60 * 60 * 1000);
  });

  it('leaves a finalized per-date snapshot unchanged after later revisions', () => {
    const fallback = createDefaultWorkSchedule();
    const original = revision('original', '0001-01-01', 1, '09:00');
    const frozen = resolveWorkSchedulesForRange(fallback, [original], [], {
      startDate: '2026-08-03',
      endDate: '2026-08-03',
    });
    const corrected = revision('corrected', '2026-08-03', 2, '12:00');

    expect(frozen['2026-08-03']?.days.monday[0]?.start).toBe('09:00');
    expect(
      resolveWorkScheduleForDate(fallback, [original, corrected], [], '2026-08-03').days.monday[0]
        ?.start,
    ).toBe('12:00');
    expect(frozen['2026-08-03']?.days.monday[0]?.start).toBe('09:00');
  });
});
