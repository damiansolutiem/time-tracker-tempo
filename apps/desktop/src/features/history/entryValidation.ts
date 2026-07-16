import type { TimeEntryDraft } from '@time-tracker/domain';

export function validateTimeEntryDraft(draft: TimeEntryDraft, now = Date.now()) {
  if (!draft.taskId) throw new Error('Choose a task.');
  const start = new Date(draft.startedAt).getTime();
  const end = draft.endedAt ? new Date(draft.endedAt).getTime() : null;
  if (!Number.isFinite(start)) throw new Error('Enter a valid start time.');
  if (end !== null && !Number.isFinite(end)) throw new Error('Enter a valid end time.');
  if (end !== null && end <= start) throw new Error('End time must be after start time.');
  if (start > now || (end !== null && end > now)) {
    throw new Error('Time entries cannot be in the future.');
  }
}

export function intervalsOverlap(
  first: Pick<TimeEntryDraft, 'startedAt' | 'endedAt'>,
  second: Pick<TimeEntryDraft, 'startedAt' | 'endedAt'>,
) {
  const infinity = Number.POSITIVE_INFINITY;
  const firstStart = new Date(first.startedAt).getTime();
  const firstEnd = first.endedAt ? new Date(first.endedAt).getTime() : infinity;
  const secondStart = new Date(second.startedAt).getTime();
  const secondEnd = second.endedAt ? new Date(second.endedAt).getTime() : infinity;
  return firstStart < secondEnd && secondStart < firstEnd;
}
