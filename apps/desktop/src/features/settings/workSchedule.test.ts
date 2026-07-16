import { describe, expect, it } from 'vitest';
import { weekdays, type WeeklyWorkSchedule } from '@time-tracker/domain';
import {
  copyMondayToWeekdays,
  createDefaultWorkSchedule,
  getWorkScheduleValidationErrors,
  normalizeWorkSchedule,
  scheduledMinutesForDay,
  scheduledMinutesForWeek,
} from './workSchedule';

describe('weekly work schedule', () => {
  it('defaults to a disabled 40-hour Monday–Friday split schedule', () => {
    const schedule = createDefaultWorkSchedule();
    expect(schedule.enabled).toBe(false);
    expect(scheduledMinutesForDay(schedule, 'monday')).toBe(8 * 60);
    expect(scheduledMinutesForWeek(schedule)).toBe(40 * 60);
    expect(schedule.days.saturday).toEqual([]);
  });

  it('round-trips a valid schedule and sorts its blocks', () => {
    const schedule = createDefaultWorkSchedule();
    schedule.enabled = true;
    schedule.days.monday.reverse();
    expect(normalizeWorkSchedule(JSON.parse(JSON.stringify(schedule)))).toEqual({
      ...schedule,
      days: { ...schedule.days, monday: [...schedule.days.monday].reverse() },
    });
  });

  it('falls back safely for malformed, overlapping, overnight, or duplicate-id data', () => {
    const malformed = { enabled: true, days: { monday: [] } };
    expect(normalizeWorkSchedule(malformed)).toEqual(createDefaultWorkSchedule());

    for (const blocks of [
      [
        { id: 'one', start: '09:00', end: '12:00' },
        { id: 'two', start: '11:00', end: '13:00' },
      ],
      [{ id: 'one', start: '22:00', end: '06:00' }],
      [
        { id: 'same', start: '09:00', end: '10:00' },
        { id: 'same', start: '11:00', end: '12:00' },
      ],
    ]) {
      const schedule = createDefaultWorkSchedule();
      schedule.days.monday = blocks;
      expect(normalizeWorkSchedule(schedule)).toEqual(createDefaultWorkSchedule());
    }
  });

  it('reports invalid input for editing without discarding the draft', () => {
    const schedule: WeeklyWorkSchedule = createDefaultWorkSchedule();
    schedule.days.monday = [{ id: 'bad', start: '10:00', end: '10:00' }];
    expect(getWorkScheduleValidationErrors(schedule)).toEqual([
      'monday: a work block must end after it starts.',
    ]);
    expect(weekdays).toHaveLength(7);
  });

  it('copies Monday to weekdays with independent identifiers', () => {
    const schedule = createDefaultWorkSchedule();
    schedule.days.tuesday = [];
    let id = 0;
    const copied = copyMondayToWeekdays(schedule, () => `copied-${++id}`);

    for (const day of weekdays.slice(1, 5)) {
      expect(copied.days[day].map(({ start, end }) => ({ start, end }))).toEqual(
        schedule.days.monday.map(({ start, end }) => ({ start, end })),
      );
    }
    expect(new Set(weekdays.flatMap((day) => copied.days[day].map((block) => block.id))).size).toBe(
      10,
    );
    expect(schedule.days.tuesday).toEqual([]);
  });
});
