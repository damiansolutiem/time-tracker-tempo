import type { TimeEntryDraft } from '@time-tracker/domain';
import { describe, expect, it } from 'vitest';
import { intervalsOverlap, validateTimeEntryDraft } from './entryValidation';

const base: TimeEntryDraft = {
  taskId: 'task-1',
  startedAt: '2026-07-15T08:00:00.000Z',
  endedAt: '2026-07-15T09:00:00.000Z',
  note: null,
};
const now = new Date('2026-07-15T12:00:00.000Z').getTime();

describe('history correction validation', () => {
  it('requires a positive, non-future interval', () => {
    expect(() => validateTimeEntryDraft(base, now)).not.toThrow();
    expect(() => validateTimeEntryDraft({ ...base, endedAt: base.startedAt }, now)).toThrow(
      'End time must be after start time.',
    );
    expect(() =>
      validateTimeEntryDraft({ ...base, endedAt: '2026-07-15T13:00:00.000Z' }, now),
    ).toThrow('Time entries cannot be in the future.');
  });

  it('allows adjacent entries but detects intersecting intervals', () => {
    expect(
      intervalsOverlap(base, {
        startedAt: '2026-07-15T09:00:00.000Z',
        endedAt: '2026-07-15T10:00:00.000Z',
      }),
    ).toBe(false);
    expect(
      intervalsOverlap(base, {
        startedAt: '2026-07-15T08:59:59.000Z',
        endedAt: '2026-07-15T10:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('treats a running entry as extending indefinitely', () => {
    expect(
      intervalsOverlap(
        { startedAt: '2026-07-15T10:00:00.000Z', endedAt: null },
        { startedAt: '2026-07-15T11:00:00.000Z', endedAt: '2026-07-15T11:30:00.000Z' },
      ),
    ).toBe(true);
  });
});
