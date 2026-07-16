import { describe, expect, it } from 'vitest';
import { nextWorkScheduleTab } from './workScheduleTabs';

describe('work schedule tab keyboard navigation', () => {
  it('wraps arrow navigation and supports Home and End', () => {
    expect(nextWorkScheduleTab('weekly', 'ArrowRight')).toBe('exceptions');
    expect(nextWorkScheduleTab('exceptions', 'ArrowRight')).toBe('weekly');
    expect(nextWorkScheduleTab('weekly', 'ArrowLeft')).toBe('exceptions');
    expect(nextWorkScheduleTab('exceptions', 'Home')).toBe('weekly');
    expect(nextWorkScheduleTab('weekly', 'End')).toBe('exceptions');
  });

  it('does not consume unrelated keys', () => {
    expect(nextWorkScheduleTab('weekly', 'Tab')).toBeNull();
    expect(nextWorkScheduleTab('exceptions', 'Enter')).toBeNull();
  });
});
