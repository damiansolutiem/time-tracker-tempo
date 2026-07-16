import type {
  WorkdayGap,
  WorkdayReminderSettings,
  WorkdayReminderState,
} from '@time-tracker/domain';

export type PersistedReminderState = {
  gapStartedAt: string | null;
  nextReminderAt: string | null;
};

export function evaluateWorkdayReminder({
  settings,
  gaps,
  now,
  taskRunning,
  classificationRunning,
  workCheckPending,
  persisted,
}: {
  settings: WorkdayReminderSettings;
  gaps: WorkdayGap[];
  now: number;
  taskRunning: boolean;
  classificationRunning: boolean;
  workCheckPending: boolean;
  persisted: PersistedReminderState;
}): { state: WorkdayReminderState; shouldNotify: boolean } {
  const idle: WorkdayReminderState = { status: 'idle', gapStartedAt: null, durationMs: 0 };
  if (!settings.enabled || taskRunning || classificationRunning || workCheckPending) {
    return { state: idle, shouldNotify: false };
  }
  const gap = gaps.at(-1);
  if (!gap || new Date(gap.endedAt).getTime() !== now) return { state: idle, shouldNotify: false };
  if (gap.durationMs < settings.gapMinutes * 60_000) return { state: idle, shouldNotify: false };

  const sameGap = persisted.gapStartedAt === gap.startedAt;
  const snoozeDue =
    sameGap &&
    persisted.nextReminderAt !== null &&
    new Date(persisted.nextReminderAt).getTime() <= now;
  const shouldNotify = !sameGap || snoozeDue;
  return {
    state: shouldNotify
      ? { status: 'pending', gapStartedAt: gap.startedAt, durationMs: gap.durationMs }
      : idle,
    shouldNotify,
  };
}
