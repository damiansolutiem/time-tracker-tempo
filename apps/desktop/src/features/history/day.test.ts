import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clipDurationToDay, localDateKey, localDayBounds, shiftLocalDate } from './day';

const originalTimezone = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'Europe/Madrid';
});

afterAll(() => {
  process.env.TZ = originalTimezone;
});

describe('local calendar days', () => {
  it('uses calendar boundaries across DST changes', () => {
    const spring = localDayBounds('2026-03-29');
    const autumn = localDayBounds('2026-10-25');
    expect(spring.end.getTime() - spring.start.getTime()).toBe(23 * 60 * 60 * 1000);
    expect(autumn.end.getTime() - autumn.start.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it('shifts by local calendar date rather than 24-hour increments', () => {
    expect(shiftLocalDate('2026-03-29', 1)).toBe('2026-03-30');
    expect(localDateKey(localDayBounds('2026-03-30').start)).toBe('2026-03-30');
  });

  it('clips an entry that crosses midnight to the selected day', () => {
    const entryStart = new Date(2026, 6, 15, 23, 30).toISOString();
    const entryEnd = new Date(2026, 6, 16, 1, 0).toISOString();
    expect(clipDurationToDay(entryStart, entryEnd, localDayBounds('2026-07-15'))).toBe(
      30 * 60 * 1000,
    );
    expect(clipDurationToDay(entryStart, entryEnd, localDayBounds('2026-07-16'))).toBe(
      60 * 60 * 1000,
    );
  });
});
