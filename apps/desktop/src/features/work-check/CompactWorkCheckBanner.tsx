import type {
  Group,
  RunningTimer,
  Task,
  WorkCheckSettings,
  WorkCheckState,
} from '@time-tracker/domain';
import { Check, CircleStop, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { appStore } from '../../app/store';
import { formatDuration } from '../timer/time';

type Props = {
  running: RunningTimer;
  workCheck: WorkCheckState;
  settings: WorkCheckSettings;
  tasks: Task[];
  groups: Group[];
  actions: typeof appStore;
};

export function CompactWorkCheckBanner({
  running,
  workCheck,
  settings,
  tasks,
  groups,
  actions,
}: Props) {
  const [now, setNow] = useState(Date.now());
  const [taskId, setTaskId] = useState(tasks.find((task) => task.id !== running.taskId)?.id ?? '');

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  if (!workCheck.deadline || workCheck.entryId !== running.id) return null;
  const graceEndsAt = new Date(workCheck.deadline).getTime() + settings.graceMinutes * 60_000;
  const remaining = Math.max(0, graceEndsAt - now);
  const switchTasks = tasks.filter((task) => task.id !== running.taskId);

  return (
    <aside className="sticky top-0 z-20 border-b border-warning/35 bg-warning-container px-6 py-3 text-foreground shadow-sm">
      <div className="mx-auto flex max-w-5xl items-center gap-4">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning text-white">
          <RefreshCw size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="m-0 text-sm font-semibold">
              {workCheck.reason === 'recovery'
                ? 'Timer recovered after restart'
                : 'Work confirmation'}
            </p>
            <span className="truncate text-sm text-surface-muted-foreground">
              {running.task.title}
            </span>
          </div>
          <p className="mt-0.5 mb-0 text-xs text-surface-muted-foreground">
            {remaining > 0 ? `${formatDuration(remaining)} left to respond` : 'Reconciling…'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void actions.confirmWork(running.id)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
        >
          <Check size={15} /> Still working
        </button>
        <button
          type="button"
          onClick={() => void actions.stopTimer(running.id)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-xs font-semibold"
        >
          <CircleStop size={14} /> Stop
        </button>
        {switchTasks.length ? (
          <div className="flex shrink-0 gap-2">
            <select
              aria-label="Task to switch to"
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
              className="max-w-36 rounded-lg border bg-card px-2 py-2 text-xs"
            >
              {switchTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {groups.find((group) => group.id === task.groupId)?.name
                    ? `${groups.find((group) => group.id === task.groupId)?.name} · `
                    : ''}
                  {task.title}
                  {task.externalId ? ` [${task.externalId}]` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!taskId}
              onClick={() => void actions.startTask(taskId, running.id)}
              className="rounded-lg border bg-card px-3 py-2 text-xs font-semibold disabled:opacity-50"
            >
              Switch
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
