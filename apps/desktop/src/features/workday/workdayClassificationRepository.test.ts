import { describe, expect, it } from 'vitest';
import { validateWorkdayClassificationDraft } from './workdayClassificationRepository';

const now = new Date('2026-07-15T12:00:00.000Z');

describe('workday classification validation', () => {
  it('rejects future and inverted intervals', () => {
    expect(() =>
      validateWorkdayClassificationDraft(
        { category: 'break', startedAt: '2026-07-15T13:00:00.000Z', endedAt: null, note: null },
        now,
      ),
    ).toThrow('future');
    expect(() =>
      validateWorkdayClassificationDraft(
        {
          category: 'break',
          startedAt: '2026-07-15T11:00:00.000Z',
          endedAt: '2026-07-15T10:00:00.000Z',
          note: null,
        },
        now,
      ),
    ).toThrow('after');
  });

  it('requires ignored intervals to be completed', () => {
    expect(() =>
      validateWorkdayClassificationDraft(
        { category: 'ignored', startedAt: '2026-07-15T11:00:00.000Z', endedAt: null, note: null },
        now,
      ),
    ).toThrow('end time');
  });
});
