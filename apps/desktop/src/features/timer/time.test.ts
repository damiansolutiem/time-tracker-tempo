import { describe, expect, it } from 'vitest';
import { formatCompactDuration, formatDuration, liveTotal } from './time';

describe('duration formatting', () => {
  it('formats clock duration without relying on an incremented counter', () => {
    expect(formatDuration(3_723_900)).toBe('01:02:03');
  });

  it('formats compact totals', () => {
    expect(formatCompactDuration(5_400_000)).toBe('1h 30m');
    expect(formatCompactDuration(1_200_000)).toBe('20m');
  });

  it('advances captured totals with the same live timer delta', () => {
    expect(liveTotal(7_200_000, 1_000, 6_000, true)).toBe(7_205_000);
    expect(liveTotal(7_200_000, 1_000, 6_000, false)).toBe(7_200_000);
  });
});
