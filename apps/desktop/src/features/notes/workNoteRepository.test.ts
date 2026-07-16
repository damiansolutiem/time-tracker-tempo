import { describe, expect, it } from 'vitest';
import { normalizeWorkNoteDraft } from './workNoteRepository';

describe('work-note validation', () => {
  it('normalizes time spent while preserving future extra-data fields', () => {
    expect(
      normalizeWorkNoteDraft({
        content: '  Reviewed the proposal  ',
        extraData: { timeSpentMs: 7_200_000.4, category: 'review' },
      }),
    ).toEqual({
      content: 'Reviewed the proposal',
      extraData: { timeSpentMs: 7_200_000, category: 'review' },
    });
  });

  it('rejects empty notes and invalid durations', () => {
    expect(() => normalizeWorkNoteDraft({ content: '  ', extraData: {} })).toThrow(
      'Note text is required',
    );
    expect(() =>
      normalizeWorkNoteDraft({ content: 'Work', extraData: { timeSpentMs: -1 } }),
    ).toThrow('Time spent must be a positive duration');
  });
});
