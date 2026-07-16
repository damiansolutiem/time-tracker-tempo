import type { DailyWorkdaySummary } from '@time-tracker/domain';
import { CalendarClock, Coffee, Play, Settings2, Tag } from 'lucide-react';
import { formatCompactDuration, formatDuration } from '../timer/time';

type Props = {
  summary: DailyWorkdaySummary;
  timerRunning: boolean;
  breakRunning: boolean;
  onStartTask: () => void;
  onStartBreak: () => void;
  onClassifyGap: () => void;
  onOpenSettings: () => void;
};

function percentage(value: number | null) {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function formatTime(iso: string | null) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(iso),
  );
}

export function WorkdaySummaryCard({
  summary,
  timerRunning,
  breakRunning,
  onStartTask,
  onStartBreak,
  onClassifyGap,
  onOpenSettings,
}: Props) {
  if (!summary.enabled) {
    return (
      <section className="mt-6 flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-sm">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-muted text-surface-muted-foreground">
          <CalendarClock size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-sm font-semibold">Workday coverage is off</h2>
          <p className="mt-1 mb-0 text-xs text-surface-muted-foreground">
            Enable your work schedule to compare tracked work with elapsed planned time.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex shrink-0 items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-xs font-semibold hover:bg-surface-muted"
        >
          <Settings2 size={14} /> Configure
        </button>
      </section>
    );
  }

  if (!summary.scheduledDay) {
    return (
      <section className="mt-6 flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-sm">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-container text-primary">
          <CalendarClock size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-sm font-semibold">No work scheduled today</h2>
          <p className="mt-1 mb-0 text-xs text-surface-muted-foreground">
            Task time can still be recorded; it will be treated as work outside your schedule.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-surface-muted-foreground hover:bg-surface-muted"
          aria-label="Open work schedule settings"
        >
          <Settings2 size={16} />
        </button>
      </section>
    );
  }

  const trackedPercent = (summary.trackedScheduledMs / summary.scheduledMs) * 100;
  const nonWorkedPercent = (summary.nonWorkedMs / summary.scheduledMs) * 100;
  const remainingPercent = (summary.remainingScheduledMs / summary.scheduledMs) * 100;
  const currentStatus = summary.currentlyScheduled
    ? summary.currentGapMs > 0
      ? `${formatDuration(summary.currentGapMs)} in the current gap`
      : 'Work is currently tracked'
    : summary.elapsedScheduledMs === 0
      ? 'Scheduled work has not started'
      : summary.remainingScheduledMs > 0
        ? 'Scheduled work is paused'
        : 'Scheduled workday complete';

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-5 px-6 pt-5 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarClock size={18} className="text-primary" />
            <h2 className="m-0 text-base font-semibold">Today’s workday</h2>
          </div>
          <p
            className={`mt-1.5 mb-0 text-xs ${summary.currentGapMs > 0 ? 'font-semibold text-warning' : 'text-surface-muted-foreground'}`}
          >
            {currentStatus}
          </p>
          <p className="mt-2 mb-0 text-[11px] text-surface-muted-foreground">
            First start ·{' '}
            <span className="font-medium text-foreground">
              {formatTime(summary.firstTrackedAt)}
            </span>
            <span className="mx-2">·</span>
            Last activity ·{' '}
            <span className="font-medium text-foreground">
              {timerRunning
                ? `Now (${formatTime(summary.lastTrackedAt)})`
                : formatTime(summary.lastTrackedAt)}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!breakRunning ? (
            <button
              type="button"
              onClick={onStartBreak}
              className="flex items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-xs font-semibold hover:bg-surface-muted"
            >
              <Coffee size={14} /> Start break
            </button>
          ) : null}
          {summary.currentGapMs > 0 && !timerRunning && !breakRunning ? (
            <button
              type="button"
              onClick={onClassifyGap}
              className="flex items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-xs font-semibold hover:bg-surface-muted"
            >
              <Tag size={14} /> Classify gap
            </button>
          ) : null}
          {!timerRunning && summary.currentlyScheduled ? (
            <button
              type="button"
              onClick={onStartTask}
              className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            >
              <Play size={14} fill="currentColor" /> Start a task
            </button>
          ) : null}
          <button
            type="button"
            onClick={onOpenSettings}
            className="grid size-8 place-items-center rounded-lg text-surface-muted-foreground hover:bg-surface-muted"
            aria-label="Open work schedule settings"
          >
            <Settings2 size={15} />
          </button>
        </div>
      </div>

      <div className="mx-6 mb-4 grid grid-cols-2 overflow-hidden rounded-lg border bg-surface-muted/15 text-surface-muted-foreground min-[1100px]:grid-cols-4">
        <SecondaryMetric
          label="Tracked in plan"
          value={formatCompactDuration(summary.trackedScheduledMs)}
        />
        <SecondaryMetric
          label="Tracked beyond plan"
          value={formatCompactDuration(summary.overtimeMs)}
        />
        <SecondaryMetric label="Planned today" value={formatCompactDuration(summary.scheduledMs)} />
        <SecondaryMetric
          label="Planned breaks"
          value={formatCompactDuration(summary.plannedBreakMs)}
        />
      </div>

      <div className="grid grid-cols-2 border-y min-[1100px]:grid-cols-[1.25fr_1.25fr_1fr_1fr]">
        <div className="border-r border-b bg-success/5 px-4 py-4 min-[1100px]:border-b-0 min-[1100px]:px-5">
          <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-success">
            Total tracked today
          </p>
          <p className="mt-1 mb-0 font-mono text-xl font-semibold tabular-nums min-[1100px]:text-2xl">
            {formatDuration(summary.trackedTotalMs)}
          </p>
          <p className="mt-1 mb-0 text-[11px] text-surface-muted-foreground">All task time</p>
        </div>
        <div className="border-r border-b bg-warning-container/35 px-4 py-4 min-[1100px]:border-b-0 min-[1100px]:px-5">
          <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-warning">
            Non-worked so far
          </p>
          <p className="mt-1 mb-0 font-mono text-xl font-semibold tabular-nums text-warning min-[1100px]:text-2xl">
            {formatDuration(summary.nonWorkedMs)}
          </p>
          <p className="mt-1 mb-0 text-[11px] text-surface-muted-foreground">
            {percentage(summary.nonWorkedRatio)} of elapsed plan
          </p>
        </div>
        <Metric label="Plan elapsed" value={formatDuration(summary.elapsedScheduledMs)} />
        <Metric label="Still planned" value={formatDuration(summary.remainingScheduledMs)} />
      </div>

      <div className="px-6 py-4">
        <div
          className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-muted"
          aria-label={`${percentage(summary.coverageRatio)} work coverage so far`}
        >
          <span className="bg-success" style={{ width: `${trackedPercent}%` }} />
          <span className="bg-warning" style={{ width: `${nonWorkedPercent}%` }} />
          <span className="bg-surface-muted" style={{ width: `${remainingPercent}%` }} />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-surface-muted-foreground">
          <Legend
            color="bg-success"
            label={`Worked · ${percentage(summary.coverageRatio)} so far`}
          />
          <Legend color="bg-warning" label="Non-worked" />
          <Legend color="bg-surface-muted" label="Future scheduled" />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-b px-4 py-4 last:border-r-0 last:border-b-0 min-[1100px]:border-b-0">
      <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-surface-muted-foreground">
        {label}
      </p>
      <p className="mt-2 mb-0 font-mono text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function SecondaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-r border-b px-3 py-2 last:border-r-0 min-[1100px]:border-b-0">
      <span className="text-[9px] font-medium">{label}</span>
      <span className="font-mono text-[11px] font-medium tabular-nums text-foreground/70">
        {value}
      </span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${color}`} /> {label}
    </span>
  );
}
