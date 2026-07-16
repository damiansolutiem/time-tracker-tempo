import { describe, expect, it } from 'vitest';
import { fromDateTimeInputValue, toDateTimeInputValue } from './dateTimeInput';

describe('date-time input conversion', () => {
  it('preserves an unchanged persisted boundary including milliseconds', () => {
    const original = '2026-07-15T14:23:35.907Z';
    const displayed = toDateTimeInputValue(original);

    expect(fromDateTimeInputValue(displayed, original)).toBe(original);
    expect(fromDateTimeInputValue(displayed)).not.toBe(original);
  });

  it('uses the edited value instead of the original boundary', () => {
    const original = '2026-07-15T14:23:35.907Z';
    const displayed = toDateTimeInputValue(original);
    const edited = displayed.replace(/:\d{2}$/, ':34');

    expect(fromDateTimeInputValue(edited, original)).not.toBe(original);
  });
});
