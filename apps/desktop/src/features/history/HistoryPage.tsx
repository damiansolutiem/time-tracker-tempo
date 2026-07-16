import type {
  Group,
  FinalizedReportPeriod,
  HistoryEntry,
  Task,
  WeeklyWorkSchedule,
  WorkdayClassification,
  WorkdayClassificationDraft,
  WorkCategory,
  WorkTag,
  WorkScheduleOverride,
  WorkScheduleRevision,
} from '@time-tracker/domain';
import { CheckCircle2, ChevronLeft, ChevronRight, Clock3, Pencil, Tag } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { appStore } from '../../app/store';
import { WorkNotesPanel } from '../notes/WorkNotesPanel';
import { taskColorClass } from '../tasks/taskColors';
import { formatCompactDuration } from '../timer/time';
import { clipDurationToDay, localDateKey, localDayBounds, shiftLocalDate } from './day';
import { EntryDialog } from './EntryDialog';
import { CorrectionHistory } from './CorrectionHistory';
import { ClassificationDialog } from '../workday/ClassificationDialog';
import { classificationLabels } from '../workday/classificationLabels';
import { buildUnclassifiedScheduledGaps } from '../workday/workdayGaps';
import { resolveWorkScheduleForDate } from '../settings/workSchedulePolicy';

type Actions = typeof appStore;

function formatTime(iso: string) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(iso),
  );
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [active]);
  return now;
}

export function HistoryPage({
  date,
  entries,
  classifications,
  finalizedPeriods,
  workSchedule,
  workScheduleRevisions,
  workScheduleOverrides,
  groups,
  categories,
  tags,
  status,
  error,
  tasks,
  actions,
}: {
  date: string;
  entries: HistoryEntry[];
  classifications: WorkdayClassification[];
  finalizedPeriods: FinalizedReportPeriod[];
  workSchedule: WeeklyWorkSchedule;
  workScheduleRevisions: WorkScheduleRevision[];
  workScheduleOverrides: WorkScheduleOverride[];
  groups: Group[];
  categories: WorkCategory[];
  tags: WorkTag[];
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  tasks: Task[];
  actions: Actions;
}) {
  const [editing, setEditing] = useState<HistoryEntry | null>(null);
  const [editingClassification, setEditingClassification] = useState<WorkdayClassification | null>(
    null,
  );
  const [newClassification, setNewClassification] = useState<WorkdayClassificationDraft | null>(
    null,
  );
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState('all');
  const visibleEntries = useMemo(
    () =>
      entries.filter((entry) =>
        groupFilter === 'all'
          ? true
          : groupFilter === 'ungrouped'
            ? !entry.groupId
            : entry.groupId === groupFilter,
      ),
    [entries, groupFilter],
  );
  const day = useMemo(() => localDayBounds(date), [date]);
  const finalizedPeriod = finalizedPeriods.find(
    (period) =>
      !period.unlockedAt &&
      day.start.toISOString() < period.endsAt &&
      day.end.toISOString() > period.startsAt,
  );
  const effectiveWorkSchedule = finalizedPeriod
    ? (finalizedPeriod.schedulesByDate[date] ?? finalizedPeriod.schedule)
    : resolveWorkScheduleForDate(workSchedule, workScheduleRevisions, workScheduleOverrides, date);
  const now = useNow(
    visibleEntries.some((entry) => !entry.endedAt) ||
      classifications.some((item) => !item.endedAt) ||
      (effectiveWorkSchedule.enabled && date === localDateKey()),
  );
  const reviewGaps = useMemo(
    () =>
      buildUnclassifiedScheduledGaps(effectiveWorkSchedule, date, entries, classifications, now),
    [classifications, date, effectiveWorkSchedule, entries, now],
  );
  const totals = useMemo(() => {
    const perTask = new Map<
      string,
      { task: HistoryEntry['task']; group: HistoryEntry['group']; total: number }
    >();
    let total = 0;
    for (const entry of visibleEntries) {
      const duration = clipDurationToDay(entry.startedAt, entry.endedAt, day, now);
      total += duration;
      const key = `${entry.groupId ?? 'ungrouped'}:${entry.group?.name ?? ''}:${entry.taskId}:${entry.task.externalId ?? ''}:${entry.task.title}`;
      const current = perTask.get(key);
      perTask.set(key, {
        task: entry.task,
        group: entry.group,
        total: (current?.total ?? 0) + duration,
      });
    }
    return {
      total,
      perTask: [...perTask.values()].sort((first, second) => second.total - first.total),
    };
  }, [day, now, visibleEntries]);
  const displayDate = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(day.start);
  const isToday = date === localDateKey();

  function selectDate(next: string) {
    void actions.loadHistory(next);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-10 py-9">
      <header className="mb-7 flex items-start justify-between">
        <div>
          <h1 className="m-0 text-3xl font-semibold tracking-tight">History</h1>
          <p className="mt-2 text-sm text-surface-muted-foreground">
            Review and correct your recorded time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Filter history by group"
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value)}
            className="rounded-lg border bg-card px-3 py-2 text-sm font-medium"
          >
            <option value="all">All groups</option>
            <option value="ungrouped">Ungrouped</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
                {group.archivedAt ? ' (archived)' : ''}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
            <button
              type="button"
              onClick={() => selectDate(shiftLocalDate(date, -1))}
              className="grid size-8 place-items-center rounded-md hover:bg-surface-muted"
              aria-label="Previous day"
            >
              <ChevronLeft size={17} />
            </button>
            <input
              aria-label="History date"
              type="date"
              value={date}
              max={localDateKey()}
              onChange={(event) => selectDate(event.target.value)}
              className="border-0 bg-transparent px-2 text-sm font-medium outline-none"
            />
            <button
              type="button"
              disabled={isToday}
              onClick={() => selectDate(shiftLocalDate(date, 1))}
              className="grid size-8 place-items-center rounded-md hover:bg-surface-muted disabled:opacity-30"
              aria-label="Next day"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </header>
      {finalizedPeriod ? (
        <p className="mb-5 rounded-lg border border-warning/30 bg-warning-container/25 px-4 py-3 text-sm text-warning">
          This day is finalized in Reports. Entries, work notes, and gap classifications are
          read-only until the period is deliberately unlocked.
        </p>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-5">
        <section>
          <div className="mb-3">
            <h2 className="m-0 text-lg font-semibold">{displayDate}</h2>
            <p className="mt-1 text-sm text-surface-muted-foreground">
              {visibleEntries.length} work {visibleEntries.length === 1 ? 'entry' : 'entries'} ·{' '}
              {classifications.length} gap{' '}
              {classifications.length === 1 ? 'classification' : 'classifications'}
            </p>
          </div>
          {effectiveWorkSchedule.enabled && !finalizedPeriod ? (
            <div className="mb-5 rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="m-0 text-sm font-semibold">Daily gap review</h3>
                  <p className="mt-1 mb-0 text-xs leading-5 text-surface-muted-foreground">
                    Unclassified elapsed time inside planned blocks. Adjust an interval to split it;
                    adjacent unresolved time is combined automatically.
                  </p>
                </div>
                <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-semibold text-surface-muted-foreground">
                  {reviewGaps.length} open
                </span>
              </div>
              {reviewError ? (
                <p className="mt-3 rounded-lg bg-danger-container px-3 py-2 text-xs text-danger">
                  {reviewError}
                </p>
              ) : null}
              {reviewGaps.length ? (
                <div className="mt-4 space-y-2">
                  {reviewGaps.map((gap) => (
                    <div
                      key={gap.startedAt}
                      className="flex items-center gap-3 rounded-lg border bg-surface-muted/20 px-3 py-2.5"
                    >
                      <Clock3 size={14} className="text-warning" />
                      <span className="text-xs font-semibold tabular-nums">
                        {formatTime(gap.startedAt)}–{formatTime(gap.endedAt)}
                      </span>
                      <span className="flex-1 font-mono text-xs tabular-nums text-surface-muted-foreground">
                        {formatCompactDuration(gap.durationMs)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setNewClassification({
                            category: 'personal_away',
                            startedAt: gap.startedAt,
                            endedAt: gap.endedAt,
                            note: null,
                          })
                        }
                        className="rounded-md border bg-card px-2.5 py-1.5 text-[11px] font-semibold"
                      >
                        Classify
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReviewError(null);
                          void actions
                            .createWorkdayClassification({
                              category: 'ignored',
                              startedAt: gap.startedAt,
                              endedAt: gap.endedAt,
                              note: null,
                            })
                            .catch((caught) =>
                              setReviewError(
                                caught instanceof Error
                                  ? caught.message
                                  : 'Could not ignore this gap.',
                              ),
                            );
                        }}
                        className="rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-surface-muted-foreground hover:bg-surface-muted"
                      >
                        Ignore
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 mb-0 flex items-center gap-2 text-xs text-success">
                  <CheckCircle2 size={15} /> All elapsed planned time is accounted for.
                </p>
              )}
            </div>
          ) : null}
          {status === 'loading' ? (
            <div className="rounded-2xl border bg-card px-6 py-16 text-center text-sm text-surface-muted-foreground">
              Loading timeline…
            </div>
          ) : status === 'error' ? (
            <p className="rounded-lg bg-danger-container p-4 text-sm text-danger">{error}</p>
          ) : visibleEntries.length === 0 && classifications.length === 0 ? (
            <div className="rounded-2xl border bg-card px-6 py-16 text-center">
              <Clock3 className="mx-auto mb-3 text-surface-muted-foreground" />
              <p className="m-0 text-sm font-medium">No time recorded</p>
              <p className="mt-1 text-xs text-surface-muted-foreground">
                Entries overlapping this day will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleEntries.map((entry) => {
                const duration = clipDurationToDay(entry.startedAt, entry.endedAt, day, now);
                return (
                  <article
                    key={entry.id}
                    className="group flex items-stretch overflow-hidden rounded-xl border bg-card shadow-sm"
                  >
                    <div className={`w-1.5 ${taskColorClass(entry.task.color)}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-4 px-4 py-4">
                        <div className="w-28 shrink-0">
                          <p className="m-0 text-sm font-semibold tabular-nums">
                            {formatTime(entry.startedAt)}
                          </p>
                          <p className="mt-1 text-xs text-surface-muted-foreground">
                            {entry.endedAt ? formatTime(entry.endedAt) : 'Running'}
                          </p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="m-0 truncate text-sm font-semibold">{entry.task.title}</p>
                            {entry.task.externalId ? (
                              <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-surface-muted-foreground">
                                {entry.task.externalId}
                              </span>
                            ) : null}
                            {entry.task.archivedAt && (
                              <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-surface-muted-foreground">
                                Archived
                              </span>
                            )}
                            {entry.correctionCount ? (
                              <span className="rounded bg-warning-container px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                                Edited
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 truncate text-xs text-surface-muted-foreground">
                            {entry.group?.name ?? 'Ungrouped'}
                            {entry.category ? ` · ${entry.category.name}` : ''}
                            {entry.tags.length
                              ? ` · ${entry.tags.map((tag) => `#${tag.name}`).join(' ')}`
                              : ''}{' '}
                            · {entry.notes.length}{' '}
                            {entry.notes.length === 1 ? 'work note' : 'work notes'}
                          </p>
                        </div>
                        <span className="font-mono text-sm tabular-nums">
                          {formatCompactDuration(duration)}
                        </span>
                        <button
                          disabled={Boolean(finalizedPeriod)}
                          onClick={() => setEditing(entry)}
                          className="grid size-8 place-items-center rounded-lg text-surface-muted-foreground opacity-0 hover:bg-surface-muted group-hover:opacity-100 focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-25"
                          aria-label={`Edit ${entry.task.title} entry`}
                        >
                          <Pencil size={15} />
                        </button>
                      </div>
                      <details className="border-t bg-surface-muted/25 px-4 py-2.5">
                        <summary className="cursor-pointer text-xs font-semibold text-surface-muted-foreground">
                          {entry.notes.length
                            ? `View ${entry.notes.length} work ${entry.notes.length === 1 ? 'note' : 'notes'}`
                            : 'Add work note'}
                        </summary>
                        <div className="pt-3 pb-1">
                          <WorkNotesPanel
                            entryId={entry.id}
                            notes={entry.notes}
                            actions={actions}
                            compact
                            readOnly={Boolean(finalizedPeriod)}
                          />
                        </div>
                      </details>
                      <CorrectionHistory
                        entryId={entry.id}
                        count={entry.correctionCount}
                        load={(id) => actions.listHistoryEntryCorrections(id)}
                      />
                    </div>
                  </article>
                );
              })}
              {classifications.length ? (
                <div className="pt-3">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-surface-muted-foreground">
                    Gap classifications
                  </h3>
                  <div className="space-y-2">
                    {classifications.map((classification) => {
                      const duration = clipDurationToDay(
                        classification.startedAt,
                        classification.endedAt,
                        day,
                        now,
                      );
                      return (
                        <article
                          key={classification.id}
                          className="group flex items-center gap-4 rounded-xl border border-warning/25 bg-warning-container/20 px-4 py-3"
                        >
                          <Tag size={16} className="shrink-0 text-warning" />
                          <div className="w-28 shrink-0">
                            <p className="m-0 text-sm font-semibold tabular-nums">
                              {formatTime(classification.startedAt)}
                            </p>
                            <p className="mt-1 text-xs text-surface-muted-foreground">
                              {classification.endedAt
                                ? formatTime(classification.endedAt)
                                : 'Running'}
                            </p>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="m-0 text-sm font-semibold">
                              {classificationLabels[classification.category]}
                            </p>
                            <p className="mt-1 mb-0 truncate text-xs text-surface-muted-foreground">
                              {classification.note ||
                                (classification.category === 'ignored'
                                  ? 'Excluded from scheduled expectation'
                                  : 'Still counted as non-worked time')}
                            </p>
                          </div>
                          <span className="font-mono text-sm tabular-nums">
                            {formatCompactDuration(duration)}
                          </span>
                          <button
                            disabled={Boolean(finalizedPeriod)}
                            onClick={() => setEditingClassification(classification)}
                            className="grid size-8 place-items-center rounded-lg text-surface-muted-foreground opacity-0 hover:bg-surface-muted group-hover:opacity-100 focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-25"
                            aria-label={`Edit ${classificationLabels[classification.category]}`}
                          >
                            <Pencil size={15} />
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>
        <aside className="space-y-4">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <p className="m-0 text-xs font-semibold uppercase tracking-wider text-surface-muted-foreground">
              Daily total
            </p>
            <p className="my-2 text-3xl font-semibold tracking-tight">
              {formatCompactDuration(totals.total)}
            </p>
            <p className="m-0 text-xs text-surface-muted-foreground">Clipped to local midnight</p>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <h3 className="mt-0 mb-4 text-sm font-semibold">By task</h3>
            <div className="space-y-3">
              {totals.perTask.map(({ task, group, total }) => (
                <div
                  key={`${group?.id ?? 'ungrouped'}:${group?.name ?? ''}:${task.id}:${task.externalId ?? ''}:${task.title}`}
                  className="flex items-center gap-2"
                >
                  <span className={`size-2 rounded-full ${taskColorClass(task.color)}`} />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {group ? `${group.name} · ` : ''}
                    {task.title}
                    {task.externalId ? (
                      <span className="ml-1 font-mono text-[10px] text-surface-muted-foreground">
                        {task.externalId}
                      </span>
                    ) : null}
                  </span>
                  <span className="font-mono text-xs tabular-nums">
                    {formatCompactDuration(total)}
                  </span>
                </div>
              ))}
              {!totals.perTask.length && (
                <p className="m-0 text-xs text-surface-muted-foreground">No totals for this day.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
      {editing && (
        <EntryDialog
          entry={editing}
          tasks={tasks}
          groups={groups}
          categories={categories}
          tags={tags}
          onClose={() => setEditing(null)}
          onSave={(draft) => actions.updateHistoryEntry(editing.id, draft)}
        />
      )}
      {editingClassification ? (
        <ClassificationDialog
          classification={editingClassification}
          onClose={() => setEditingClassification(null)}
          onSave={(draft) => actions.updateWorkdayClassification(editingClassification.id, draft)}
          onDelete={() => actions.deleteWorkdayClassification(editingClassification.id)}
        />
      ) : null}
      {newClassification ? (
        <ClassificationDialog
          initial={newClassification}
          onClose={() => setNewClassification(null)}
          onSave={(draft) => actions.createWorkdayClassification(draft)}
        />
      ) : null}
    </div>
  );
}
