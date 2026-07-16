import type {
  Group,
  HistoryEntry,
  RecentEntry,
  RunningTimer,
  Task,
  TrayTimeMode,
  WeeklyWorkSchedule,
  WorkScheduleOverride,
  WorkScheduleRevision,
  WorkdayClassification,
  WorkdayClassificationDraft,
} from '@time-tracker/domain';
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coffee,
  Play,
  Plus,
  Search,
  Square,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { appStore } from '../../app/store';
import { useModalDialog } from '../../infrastructure/useModalDialog';
import { localDateKey } from '../history/day';
import { WorkNotesPanel } from '../notes/WorkNotesPanel';
import { taskColorClass } from '../tasks/taskColors';
import { WorkdaySummaryCard } from '../workday/WorkdaySummaryCard';
import { buildDailyWorkdaySummary } from '../workday/workdayCoverage';
import { resolveWorkScheduleForDate } from '../settings/workSchedulePolicy';
import { ClassificationDialog } from '../workday/ClassificationDialog';
import { formatCompactDuration, formatDuration, formatRelativeDay, liveTotal } from './time';

type Actions = typeof appStore;

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [active]);
  return now;
}

export function TimerPage({
  running,
  tasks,
  recentTasks,
  groups,
  recentEntries,
  activeTaskCount,
  todayTotalMs,
  currentTaskTotalMs,
  totalCapturedAt,
  workSchedule,
  workScheduleRevisions,
  workScheduleOverrides,
  workdayDate,
  workdayEntries,
  workdayClassifications,
  runningClassification,
  trayTimeMode,
  actions,
  onViewTasks,
  onViewSettings,
}: {
  running: RunningTimer | null;
  tasks: Task[];
  recentTasks: Task[];
  groups: Group[];
  recentEntries: RecentEntry[];
  activeTaskCount: number;
  todayTotalMs: number;
  currentTaskTotalMs: number;
  totalCapturedAt: number;
  workSchedule: WeeklyWorkSchedule;
  workScheduleRevisions: WorkScheduleRevision[];
  workScheduleOverrides: WorkScheduleOverride[];
  workdayDate: string;
  workdayEntries: HistoryEntry[];
  workdayClassifications: WorkdayClassification[];
  runningClassification: WorkdayClassification | null;
  trayTimeMode: TrayTimeMode;
  actions: Actions;
  onViewTasks: () => void;
  onViewSettings: () => void;
}) {
  const now = useNow(
    Boolean(running) ||
      Boolean(runningClassification) ||
      workSchedule.enabled ||
      workScheduleRevisions.some((revision) => revision.schedule.enabled) ||
      workScheduleOverrides.length > 0,
  );
  const [error, setError] = useState<string | null>(null);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [classificationDraft, setClassificationDraft] = useState<WorkdayClassificationDraft | null>(
    null,
  );
  const elapsed = running ? now - new Date(running.startedAt).getTime() : 0;
  const liveTodayTotal = liveTotal(todayTotalMs, totalCapturedAt, now, Boolean(running));
  const liveTaskTotal = liveTotal(currentTaskTotalMs, totalCapturedAt, now, Boolean(running));
  const currentDate = localDateKey(new Date(now));
  const effectiveWorkSchedule = resolveWorkScheduleForDate(
    workSchedule,
    workScheduleRevisions,
    workScheduleOverrides,
    currentDate,
  );
  const workdaySummary = buildDailyWorkdaySummary(
    effectiveWorkSchedule,
    currentDate,
    workdayDate === currentDate ? workdayEntries : [],
    now,
    workdayDate === currentDate ? workdayClassifications : [],
  );
  const today = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(now));
  const hour = new Date(now).getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    if (workdayDate !== currentDate) void actions.loadWorkdayEntries(currentDate);
  }, [actions, currentDate, workdayDate]);

  async function perform(operation: () => Promise<void>) {
    setError(null);
    try {
      await operation();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The timer could not be updated.');
      return false;
    }
  }

  async function toggleTimer() {
    if (running) return actions.stopTimer();
    setTaskPickerOpen(true);
  }

  async function chooseTask(taskId: string) {
    if (await perform(() => actions.startTask(taskId))) setTaskPickerOpen(false);
  }

  async function startBreak() {
    if (running && !window.confirm('Stop the current task and start a break?')) return;
    await perform(() => actions.startBreak());
  }

  function classifyCurrentGap() {
    const endedAt = new Date(now);
    const rawStart = now - workdaySummary.currentGapMs;
    const latestClassifiedEnd = workdayClassifications.reduce((latest, item) => {
      const end = item.endedAt ? new Date(item.endedAt).getTime() : 0;
      return end <= now && end >= rawStart ? Math.max(latest, end) : latest;
    }, rawStart);
    if (latestClassifiedEnd >= now) {
      setError('The current gap is already classified.');
      return;
    }
    const startedAt = new Date(latestClassifiedEnd);
    setClassificationDraft({
      category: 'personal_away',
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      note: null,
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-10 py-9">
      <header className="mb-8">
        <p className="mb-1 text-sm font-medium text-primary">{today}</p>
        <h1 className="m-0 text-3xl font-semibold tracking-[-0.035em]">{greeting}</h1>
        <p className="mt-2 text-sm text-surface-muted-foreground">What are you working on?</p>
      </header>
      {error && (
        <p className="rounded-lg bg-danger-container px-3 py-2 text-sm text-danger">{error}</p>
      )}
      {runningClassification ? (
        <section className="mb-4 flex items-center gap-4 rounded-2xl border border-warning/30 bg-warning-container/35 p-5 shadow-sm">
          <span className="grid size-11 place-items-center rounded-xl bg-warning-container text-warning">
            <Coffee size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-xs font-semibold uppercase tracking-wider text-warning">
              Break running
            </p>
            <p className="mt-1 mb-0 font-mono text-xl font-semibold tabular-nums">
              {formatDuration(now - new Date(runningClassification.startedAt).getTime())}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void perform(() => actions.stopBreak())}
            className="flex items-center gap-2 rounded-lg bg-warning px-4 py-2 text-sm font-semibold text-white"
          >
            <Square size={14} fill="currentColor" /> End break
          </button>
        </section>
      ) : null}
      <section className="overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow)]">
        <div className="flex items-center justify-between gap-5 p-7">
          <div className="flex min-w-0 items-center gap-4">
            <div
              className={`grid size-12 shrink-0 place-items-center rounded-xl ${running ? 'bg-primary-container text-primary' : 'bg-surface-muted text-surface-muted-foreground'}`}
            >
              {running ? <Clock3 size={22} /> : <Square size={18} fill="currentColor" />}
            </div>
            <div className="min-w-0">
              <p className="m-0 text-xs font-semibold uppercase tracking-[0.14em] text-surface-muted-foreground">
                {running
                  ? `Tracking now${running.task.externalId ? ` · ${running.task.externalId}` : ''}`
                  : 'Timer is idle'}
              </p>
              <h2 className="my-1 truncate text-lg font-semibold">
                {running?.task.title ?? 'Choose a task to begin'}
              </h2>
              <p className="m-0 truncate text-sm text-surface-muted-foreground">
                {running
                  ? [
                      running.group?.name,
                      running.category?.name,
                      ...running.tags.map((tag) => `#${tag.name}`),
                      running.task.description,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Ungrouped task'
                  : 'Time is derived from persisted timestamps'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-5">
            <div>
              <div className="flex items-end justify-end gap-5 text-right">
                {running ? (
                  <div>
                    <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-surface-muted-foreground">
                      Task total
                    </p>
                    <p className="mt-1 mb-0 font-mono text-lg font-medium tabular-nums">
                      {formatDuration(liveTaskTotal)}
                    </p>
                  </div>
                ) : null}
                <div>
                  <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-surface-muted-foreground">
                    This session
                  </p>
                  <p className="mt-1 mb-0 font-mono text-3xl font-medium tabular-nums tracking-tight">
                    {formatDuration(elapsed)}
                  </p>
                </div>
              </div>
              {running ? (
                <label className="mt-2 flex items-center justify-end gap-2 text-[11px] text-surface-muted-foreground">
                  Menu bar time
                  <select
                    value={trayTimeMode}
                    onChange={(event) =>
                      actions.setCurrentTrayTimeMode(event.target.value as TrayTimeMode)
                    }
                    className="rounded-md border bg-surface px-2 py-1 text-xs font-medium text-foreground"
                  >
                    <option value="session">This session</option>
                    <option value="task-total">Task total</option>
                  </select>
                </label>
              ) : null}
            </div>
            <button
              onClick={() => void perform(toggleTimer)}
              className={`grid size-12 place-items-center rounded-full text-white shadow-sm transition hover:scale-[1.03] ${running ? 'bg-danger' : 'bg-primary'}`}
              aria-label={running ? 'Stop timer' : 'Choose a task to start tracking'}
            >
              {running ? (
                <Square size={17} fill="currentColor" />
              ) : (
                <Play size={18} fill="currentColor" />
              )}
            </button>
          </div>
        </div>
        {running ? (
          <div className="border-t bg-surface-muted/20 px-7 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-muted-foreground">
              Work notes
            </p>
            <WorkNotesPanel entryId={running.id} notes={running.notes} actions={actions} compact />
          </div>
        ) : null}
        <div className="flex items-center gap-2 border-t bg-surface-muted/60 px-7 py-3 text-xs text-surface-muted-foreground">
          <CheckCircle2 size={14} className="text-success" />
          {running
            ? `Started ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(running.startedAt))} · Saved locally`
            : 'Ready · Only one timer can run at a time'}
        </div>
      </section>

      <WorkdaySummaryCard
        summary={workdaySummary}
        timerRunning={Boolean(running)}
        breakRunning={Boolean(runningClassification)}
        onStartTask={() => setTaskPickerOpen(true)}
        onStartBreak={() => void startBreak()}
        onClassifyGap={classifyCurrentGap}
        onOpenSettings={onViewSettings}
      />

      <div className="mt-9 mb-4 flex items-center justify-between">
        <div>
          <h2 className="m-0 text-lg font-semibold">Recent tasks</h2>
          <p className="mt-1 text-sm text-surface-muted-foreground">Start or switch in one click</p>
        </div>
        <button
          onClick={onViewTasks}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm"
        >
          <Plus size={16} /> Manage tasks
        </button>
      </div>
      <div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
        {recentTasks.map((task) => (
          <button
            key={task.id}
            onClick={() => void perform(() => actions.startTask(task.id))}
            className="group flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-surface-muted/50"
          >
            <span className={`size-2.5 rounded-full ${taskColorClass(task.color)}`} />
            <span className="flex-1">
              <span className="block text-sm font-medium">
                {task.title}
                {task.externalId ? (
                  <span className="ml-1 font-mono text-[10px] text-surface-muted-foreground">
                    {task.externalId}
                  </span>
                ) : null}
              </span>
              <span className="mt-1 block text-xs text-surface-muted-foreground">
                {[groups.find((group) => group.id === task.groupId)?.name, task.description]
                  .filter(Boolean)
                  .join(' · ') || 'Ungrouped'}
              </span>
            </span>
            <span className="mr-2 text-xs font-medium text-surface-muted-foreground opacity-0 transition group-hover:opacity-100">
              {running?.taskId === task.id ? 'Restart' : running ? 'Switch' : 'Start'}
            </span>
            <ChevronRight size={17} className="text-surface-muted-foreground" />
          </button>
        ))}
        {recentTasks.length === 0 && (
          <button onClick={onViewTasks} className="w-full px-6 py-10 text-center">
            <span className="block text-sm font-medium">Create your first task</span>
            <span className="mt-1 block text-xs text-surface-muted-foreground">
              A timer always belongs to a task.
            </span>
          </button>
        )}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        {[
          ['Today', formatCompactDuration(liveTodayTotal), 'All tracked task time'],
          ['Active tasks', String(activeTaskCount), 'Available to track'],
          ['Recent entries', String(recentEntries.length), 'Latest activity'],
        ].map(([label, value, detail]) => (
          <div key={label} className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="m-0 text-xs font-medium text-surface-muted-foreground">{label}</p>
            <p className="my-2 text-2xl font-semibold tracking-tight">{value}</p>
            <p className="m-0 text-xs text-surface-muted-foreground">{detail}</p>
          </div>
        ))}
      </div>
      {recentEntries.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Recent activity</h2>
          <div className="divide-y overflow-hidden rounded-2xl border bg-card">
            {recentEntries.slice(0, 5).map((entry) => {
              const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now;
              return (
                <div key={entry.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className={`size-2 rounded-full ${taskColorClass(entry.task.color)}`} />
                  <span className="flex-1 text-sm font-medium">{entry.task.title}</span>
                  {entry.group ? (
                    <span className="max-w-32 truncate text-xs text-surface-muted-foreground">
                      {entry.group.name}
                    </span>
                  ) : null}
                  <span className="text-xs text-surface-muted-foreground">
                    {formatRelativeDay(entry.startedAt)}
                  </span>
                  <span className="w-20 text-right font-mono text-xs tabular-nums">
                    {formatCompactDuration(end - new Date(entry.startedAt).getTime())}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {taskPickerOpen ? (
        <TaskPickerDialog
          tasks={tasks}
          groups={groups}
          onChoose={(taskId) => chooseTask(taskId)}
          onManage={() => {
            setTaskPickerOpen(false);
            onViewTasks();
          }}
          onClose={() => setTaskPickerOpen(false)}
        />
      ) : null}
      {classificationDraft ? (
        <ClassificationDialog
          initial={classificationDraft}
          onClose={() => setClassificationDraft(null)}
          onSave={(draft) => actions.createWorkdayClassification(draft)}
        />
      ) : null}
    </div>
  );
}

function TaskPickerDialog({
  tasks,
  groups,
  onChoose,
  onManage,
  onClose,
}: {
  tasks: Task[];
  groups: Group[];
  onChoose: (taskId: string) => Promise<void>;
  onManage: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [startingId, setStartingId] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleTasks = tasks.filter((task) => {
    const groupName = groups.find((group) => group.id === task.groupId)?.name ?? '';
    return [task.externalId, task.title, task.description, groupName]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase().includes(normalizedQuery));
  });

  const dialogRef = useModalDialog<HTMLElement>(onClose, Boolean(startingId));

  async function start(taskId: string) {
    setStartingId(taskId);
    try {
      await onChoose(taskId);
    } finally {
      setStartingId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/20 p-6 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !startingId) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-picker-title"
        aria-describedby="task-picker-description"
        tabIndex={-1}
        className="flex max-h-[min(680px,calc(100vh-3rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-[var(--shadow)]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div>
            <h2 id="task-picker-title" className="m-0 text-xl font-semibold">
              Start a task
            </h2>
            <p id="task-picker-description" className="mt-1 text-sm text-surface-muted-foreground">
              Choose the task you want to track.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(startingId)}
            className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-surface-muted disabled:opacity-45"
            aria-label="Close task picker"
          >
            <X size={18} />
          </button>
        </header>

        {tasks.length ? (
          <div className="shrink-0 px-6 pb-4">
            <label className="relative block">
              <span className="sr-only">Search tasks</span>
              <Search
                size={16}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-surface-muted-foreground"
              />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by task, ID, or group"
                className="w-full rounded-lg border bg-surface py-2.5 pr-3 pl-9 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-y">
          {visibleTasks.map((task) => {
            const group = groups.find((item) => item.id === task.groupId);
            return (
              <button
                key={task.id}
                type="button"
                disabled={Boolean(startingId)}
                onClick={() => void start(task.id)}
                className="group flex w-full items-center gap-3 border-b px-6 py-3.5 text-left last:border-b-0 hover:bg-surface-muted/60 disabled:opacity-55"
              >
                <span className={`size-2.5 shrink-0 rounded-full ${taskColorClass(task.color)}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    {task.externalId ? (
                      <span className="shrink-0 font-mono text-[11px] font-semibold text-primary">
                        {task.externalId}
                      </span>
                    ) : null}
                    <span className="truncate text-sm font-medium">{task.title}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-surface-muted-foreground">
                    {[group?.name, task.description].filter(Boolean).join(' · ') || 'Ungrouped'}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-primary">
                  {startingId === task.id ? 'Starting…' : 'Start'} <Play size={13} />
                </span>
              </button>
            );
          })}
          {tasks.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="m-0 text-sm font-medium">No active tasks</p>
              <p className="mt-1 text-xs text-surface-muted-foreground">
                Create a task before starting the timer.
              </p>
            </div>
          ) : visibleTasks.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-surface-muted-foreground">
              No tasks match “{query}”.
            </div>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 px-6 py-4">
          <span className="text-xs text-surface-muted-foreground">
            {visibleTasks.length} {visibleTasks.length === 1 ? 'task' : 'tasks'}
          </span>
          <button
            type="button"
            disabled={Boolean(startingId)}
            onClick={onManage}
            className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-surface-muted disabled:opacity-45"
          >
            Manage tasks
          </button>
        </footer>
      </section>
    </div>
  );
}
