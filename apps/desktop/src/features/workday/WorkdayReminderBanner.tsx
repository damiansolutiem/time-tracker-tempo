import type { WorkdayReminderSettings, WorkdayReminderState } from '@time-tracker/domain';
import { BellRing, Clock3, X } from 'lucide-react';
import type { appStore } from '../../app/store';
import { formatCompactDuration } from '../timer/time';

export function WorkdayReminderBanner({
  reminder,
  settings,
  actions,
  onReview,
}: {
  reminder: WorkdayReminderState;
  settings: WorkdayReminderSettings;
  actions: typeof appStore;
  onReview: () => void;
}) {
  if (reminder.status !== 'pending') return null;
  return (
    <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-warning/25 bg-warning-container px-5 py-3 text-sm shadow-sm">
      <BellRing size={17} className="shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <span className="font-semibold">No activity is being tracked</span>
        <span className="ml-2 text-xs text-surface-muted-foreground">
          Current planned gap · {formatCompactDuration(reminder.durationMs)}
        </span>
      </div>
      <button
        type="button"
        onClick={onReview}
        className="rounded-lg bg-warning px-3 py-1.5 text-xs font-semibold text-white"
      >
        Review gap
      </button>
      <button
        type="button"
        onClick={() => void actions.snoozeWorkdayReminder()}
        className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-semibold"
      >
        <Clock3 size={13} /> {settings.snoozeMinutes} min
      </button>
      <button
        type="button"
        onClick={() => actions.dismissWorkdayReminder()}
        className="grid size-7 place-items-center rounded-md hover:bg-warning/10"
        aria-label="Dismiss reminder"
      >
        <X size={15} />
      </button>
    </div>
  );
}
