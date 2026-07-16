import type {
  FinalizedReportPeriod,
  HistoryEntry,
  ReportExportColumn,
  WeeklyWorkSchedule,
  WorkdayClassification,
  WorkScheduleOverride,
  WorkScheduleRevision,
} from '@time-tracker/domain';
import {
  BarChart3,
  CalendarDays,
  Clock3,
  Download,
  FileJson,
  FileSpreadsheet,
  LockKeyhole,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { appStore } from '../../app/store';
import { saveReportExport, type ExportFormat } from '../../infrastructure/dataPortability';
import { useModalDialog } from '../../infrastructure/useModalDialog';
import { localDateKey, localDayBounds, shiftLocalDate } from '../history/day';
import { resolveWorkSchedulesForRange } from '../settings/workSchedulePolicy';
import { taskColorClass } from '../tasks/taskColors';
import { formatCompactDuration } from '../timer/time';
import { buildReport, currentMonthRange, filterReportEntries, type ReportRange } from './report';
import {
  buildReportExportRows,
  serializeReportCsv,
  serializeReportJson,
  serializeReportWorkbook,
} from './reportExport';

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

function startOfWeek(now: Date) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return localDateKey(date);
}

function previousMonthRange(now = new Date()): ReportRange {
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return { startDate: localDateKey(start), endDate: localDateKey(end) };
}

function dateLabel(date: string, includeYear = false) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' as const } : {}),
  }).format(localDayBounds(date).start);
}

export function ReportsPage({
  range,
  entries,
  classifications,
  finalizedPeriods,
  workSchedule,
  workScheduleRevisions,
  workScheduleOverrides,
  status,
  error,
  exportColumns,
  actions,
  onConfigureExports,
}: {
  range: ReportRange;
  entries: HistoryEntry[];
  classifications: WorkdayClassification[];
  finalizedPeriods: FinalizedReportPeriod[];
  workSchedule: WeeklyWorkSchedule;
  workScheduleRevisions: WorkScheduleRevision[];
  workScheduleOverrides: WorkScheduleOverride[];
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  exportColumns: ReportExportColumn[];
  actions: Actions;
  onConfigureExports: () => void;
}) {
  const [draft, setDraft] = useState(range);
  const [exportDraft, setExportDraft] = useState(range);
  const [exportRequest, setExportRequest] = useState<ExportFormat | null>(null);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [periodAction, setPeriodAction] = useState<'finalize' | 'unlock' | null>(null);
  const [periodReason, setPeriodReason] = useState('');
  const [periodBusy, setPeriodBusy] = useState(false);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const today = localDateKey();
  const activePeriods = finalizedPeriods.filter((period) => !period.unlockedAt);
  const overlappingPeriods = activePeriods.filter(
    (period) => period.startDate <= range.endDate && period.endDate >= range.startDate,
  );
  const periodAudit = finalizedPeriods.filter(
    (period) => period.startDate <= range.endDate && period.endDate >= range.startDate,
  );
  const exactFinalization = activePeriods.find(
    (period) => period.startDate === range.startDate && period.endDate === range.endDate,
  );
  const schedulesByDate = exactFinalization
    ? exactFinalization.schedulesByDate
    : resolveWorkSchedulesForRange(
        workSchedule,
        workScheduleRevisions,
        workScheduleOverrides,
        range,
      );
  const effectiveSchedule =
    schedulesByDate[range.startDate] ?? exactFinalization?.schedule ?? workSchedule;
  const now = useNow(
    entries.some((entry) => !entry.endedAt) ||
      classifications.some((item) => !item.endedAt) ||
      (effectiveSchedule.enabled && range.startDate <= today && range.endDate >= today),
  );
  const accounting = useMemo(
    () => ({ schedule: effectiveSchedule, schedulesByDate, classifications }),
    [classifications, effectiveSchedule, schedulesByDate],
  );
  const categoryOptions = useMemo(
    () =>
      [
        ...new Map(
          entries.flatMap((entry) =>
            entry.category ? [[entry.category.id, entry.category] as const] : [],
          ),
        ).values(),
      ].sort((first, second) => first.name.localeCompare(second.name)),
    [entries],
  );
  const tagOptions = useMemo(
    () =>
      [
        ...new Map(
          entries.flatMap((entry) => entry.tags.map((tag) => [tag.id, tag] as const)),
        ).values(),
      ].sort((first, second) => first.name.localeCompare(second.name)),
    [entries],
  );
  const taxonomyFilters = useMemo(
    () => ({ categoryId: categoryFilter, tagId: tagFilter }),
    [categoryFilter, tagFilter],
  );
  const filteredEntries = useMemo(
    () => filterReportEntries(entries, taxonomyFilters),
    [entries, taxonomyFilters],
  );
  const taxonomyFilterActive = categoryFilter !== 'all' || tagFilter !== 'all';
  const report = useMemo(
    () => buildReport(filteredEntries, range, now, taxonomyFilterActive ? undefined : accounting),
    [accounting, filteredEntries, now, range, taxonomyFilterActive],
  );
  const maxDay = Math.max(...report.days.map((day) => day.totalMs), 1);
  const maxTask = Math.max(...report.tasks.map((task) => task.totalMs), 1);
  const maxGroup = Math.max(...report.groups.map((group) => group.totalMs), 1);
  const invalidRange = draft.startDate > draft.endDate || draft.endDate > today;
  const averageMs = report.activeDayCount ? report.totalMs / report.activeDayCount : 0;

  async function applyPeriodAction() {
    if (!periodAction) return;
    setPeriodBusy(true);
    setPeriodError(null);
    try {
      if (periodAction === 'finalize') await actions.finalizeReportPeriod(range, periodReason);
      else if (exactFinalization)
        await actions.unlockReportPeriod(exactFinalization.id, periodReason);
      setPeriodAction(null);
      setPeriodReason('');
    } catch (caught) {
      setPeriodError(caught instanceof Error ? caught.message : 'Could not update this period.');
    } finally {
      setPeriodBusy(false);
    }
  }

  useEffect(() => setDraft(range), [range]);

  function load(next: ReportRange) {
    setDraft(next);
    void actions.loadReport(next);
  }

  function requestExport(format: ExportFormat) {
    setExportDraft(range);
    setExportRequest(format);
    setExportError(null);
  }

  async function exportReport() {
    if (!exportRequest) return;
    setExporting(exportRequest);
    setExportMessage(null);
    setExportError(null);
    try {
      const exportData = await actions.getReportDataForExport(exportDraft);
      const exportEntries = filterReportEntries(exportData.entries, taxonomyFilters);
      const exportNow = Date.now();
      const exportFinalization = activePeriods.find(
        (period) =>
          period.startDate === exportDraft.startDate && period.endDate === exportDraft.endDate,
      );
      const exportSchedulesByDate = exportFinalization
        ? exportFinalization.schedulesByDate
        : resolveWorkSchedulesForRange(
            workSchedule,
            workScheduleRevisions,
            workScheduleOverrides,
            exportDraft,
          );
      const exportAccounting = taxonomyFilterActive
        ? undefined
        : {
            schedule:
              exportSchedulesByDate[exportDraft.startDate] ??
              exportFinalization?.schedule ??
              workSchedule,
            schedulesByDate: exportSchedulesByDate,
            classifications: exportData.classifications,
          };
      const contents =
        exportRequest === 'csv'
          ? serializeReportCsv(
              buildReportExportRows(exportEntries, exportDraft, exportNow, exportAccounting),
              exportColumns,
            )
          : exportRequest === 'json'
            ? serializeReportJson(exportEntries, exportDraft, exportNow, exportAccounting)
            : await serializeReportWorkbook(
                exportEntries,
                exportDraft,
                exportNow,
                exportColumns,
                exportAccounting,
              );
      const path = await saveReportExport(
        exportRequest,
        contents,
        `tempo-report-${exportDraft.startDate}-to-${exportDraft.endDate}.${exportRequest}`,
      );
      if (path) {
        setExportMessage(`${exportRequest.toUpperCase()} export saved.`);
        setExportRequest(null);
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(null);
    }
  }

  const presets = [
    {
      label: 'Today',
      range: { startDate: today, endDate: today },
    },
    {
      label: 'Yesterday',
      range: { startDate: shiftLocalDate(today, -1), endDate: shiftLocalDate(today, -1) },
    },
    {
      label: 'This week',
      range: { startDate: startOfWeek(new Date()), endDate: today },
    },
    {
      label: 'Last 7 days',
      range: { startDate: shiftLocalDate(today, -6), endDate: today },
    },
    { label: 'This month', range: currentMonthRange() },
    { label: 'Last month', range: previousMonthRange() },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-10 py-9">
      <header className="mb-7 flex items-start justify-between gap-5">
        <div>
          <h1 className="m-0 text-3xl font-semibold tracking-tight">Reports</h1>
          <p className="mt-2 text-sm text-surface-muted-foreground">
            Understand where your recorded time went across a date range.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={
              status !== 'ready' ||
              (!exactFinalization && taxonomyFilterActive) ||
              (!exactFinalization && overlappingPeriods.length > 0)
            }
            title={
              !exactFinalization && taxonomyFilterActive
                ? 'Clear category and tag filters before finalizing.'
                : undefined
            }
            onClick={() => {
              setPeriodReason('');
              setPeriodError(null);
              setPeriodAction(exactFinalization ? 'unlock' : 'finalize');
            }}
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-semibold shadow-sm hover:bg-surface-muted disabled:opacity-45"
          >
            <LockKeyhole size={15} /> {exactFinalization ? 'Unlock period' : 'Finalize period'}
          </button>
          <button
            type="button"
            onClick={onConfigureExports}
            className="rounded-lg border bg-card px-3 py-2 text-sm font-semibold shadow-sm hover:bg-surface-muted"
          >
            Configure
          </button>
          <button
            type="button"
            disabled={status !== 'ready' || exporting !== null}
            onClick={() => requestExport('csv')}
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-semibold shadow-sm hover:bg-surface-muted disabled:opacity-45"
          >
            <Download size={16} /> {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
          </button>
          <button
            type="button"
            disabled={status !== 'ready' || exporting !== null}
            onClick={() => requestExport('json')}
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-semibold shadow-sm hover:bg-surface-muted disabled:opacity-45"
          >
            <FileJson size={16} /> {exporting === 'json' ? 'Exporting…' : 'Export JSON'}
          </button>
          <button
            type="button"
            disabled={status !== 'ready' || exporting !== null}
            onClick={() => requestExport('xlsx')}
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-semibold shadow-sm hover:bg-surface-muted disabled:opacity-45"
          >
            <FileSpreadsheet size={16} /> {exporting === 'xlsx' ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>
      </header>

      {exportMessage ? (
        <p className="mb-5 rounded-lg bg-success-container px-4 py-3 text-sm text-success">
          {exportMessage}
        </p>
      ) : null}
      {exportError && !exportRequest ? (
        <p className="mb-5 rounded-lg bg-danger-container px-4 py-3 text-sm text-danger">
          Export failed: {exportError}
        </p>
      ) : null}

      {overlappingPeriods.length ? (
        <p className="mb-5 rounded-lg border border-warning/30 bg-warning-container/25 px-4 py-3 text-sm text-warning">
          <LockKeyhole size={14} className="mr-2 inline" />
          {exactFinalization
            ? `This range was finalized ${new Date(exactFinalization.finalizedAt).toLocaleString()}. Entries, notes, and gap classifications are protected.`
            : 'Part of this range overlaps a finalized period. Open that exact period to unlock it.'}
        </p>
      ) : null}

      {periodAudit.length ? (
        <details className="mb-5 rounded-lg border bg-card px-4 py-3 text-xs">
          <summary className="cursor-pointer font-semibold">
            Period finalization audit ({periodAudit.length})
          </summary>
          <div className="mt-3 space-y-2">
            {periodAudit.map((period) => (
              <div key={period.id} className="rounded-lg bg-surface-muted/40 px-3 py-2">
                <strong>
                  {period.startDate} through {period.endDate}
                </strong>{' '}
                · finalized {new Date(period.finalizedAt).toLocaleString()}
                {period.note ? ` · ${period.note}` : ''}
                {period.unlockedAt
                  ? ` · unlocked ${new Date(period.unlockedAt).toLocaleString()}: ${period.unlockReason}`
                  : ' · currently locked'}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {periodAction ? (
        <section className="mb-5 rounded-xl border border-warning/35 bg-card p-4">
          <h2 className="m-0 text-sm font-semibold">
            {periodAction === 'finalize'
              ? 'Finalize this reporting period?'
              : 'Unlock this period?'}
          </h2>
          <p className="mt-1 text-xs leading-5 text-surface-muted-foreground">
            {periodAction === 'finalize'
              ? 'Finalizing prevents changes to overlapping entries, work notes, and gap classifications. Task and group names are preserved as entry snapshots.'
              : 'Unlocking permits historical changes again. The finalization and unlock remain in the audit record.'}
          </p>
          <label htmlFor="report-period-reason" className="sr-only">
            {periodAction === 'finalize' ? 'Finalization note' : 'Reason for unlocking'}
          </label>
          <textarea
            id="report-period-reason"
            value={periodReason}
            onChange={(event) => setPeriodReason(event.target.value)}
            placeholder={
              periodAction === 'finalize'
                ? 'Optional note, such as Invoice 2026-07'
                : 'Required reason for unlocking'
            }
            rows={2}
            className="mt-2 w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm"
          />
          {periodError ? (
            <p role="alert" className="mt-2 text-xs text-danger">
              {periodError}
            </p>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPeriodAction(null)}
              className="rounded-lg border px-3 py-2 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={periodBusy || (periodAction === 'unlock' && !periodReason.trim())}
              onClick={() => void applyPeriodAction()}
              className="rounded-lg bg-warning px-3 py-2 text-xs font-semibold text-warning-foreground disabled:opacity-45"
            >
              {periodBusy ? 'Saving…' : periodAction === 'finalize' ? 'Finalize' : 'Unlock'}
            </button>
          </div>
        </section>
      ) : null}

      {exportRequest ? (
        <ExportDialog
          format={exportRequest}
          range={exportDraft}
          today={today}
          exporting={exporting !== null}
          error={exportError}
          onChange={setExportDraft}
          onClose={() => {
            if (!exporting) setExportRequest(null);
          }}
          onExport={() => void exportReport()}
        />
      ) : null}

      <section className="mb-5 rounded-2xl border bg-card p-4 shadow-sm" aria-label="Report range">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 text-xs font-medium text-surface-muted-foreground">
            From
            <input
              type="date"
              value={draft.startDate}
              max={draft.endDate}
              onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
              className="rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-surface-muted-foreground">
            Through
            <input
              type="date"
              value={draft.endDate}
              min={draft.startDate}
              max={today}
              onChange={(event) => setDraft({ ...draft, endDate: event.target.value })}
              className="rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <button
            type="button"
            disabled={invalidRange || !draft.startDate || !draft.endDate}
            onClick={() => load(draft)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            Apply
          </button>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => load(preset.range)}
                className="rounded-lg border bg-background px-3 py-2 text-xs font-medium hover:bg-surface-muted"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t pt-3">
          <label className="grid gap-1.5 text-xs font-medium text-surface-muted-foreground">
            Category
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="min-w-40 rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="all">All categories</option>
              <option value="uncategorized">Uncategorized</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-surface-muted-foreground">
            Tag
            <select
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              className="min-w-40 rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="all">All tags</option>
              {tagOptions.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>
          {categoryFilter !== 'all' || tagFilter !== 'all' ? (
            <button
              type="button"
              onClick={() => {
                setCategoryFilter('all');
                setTagFilter('all');
              }}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-primary hover:bg-primary-container"
            >
              Clear filters
            </button>
          ) : null}
          <span className="ml-auto text-xs text-surface-muted-foreground">
            Exports use these filters. Schedule context is omitted while filtering task labels.
          </span>
        </div>
      </section>

      {status === 'loading' ? (
        <div className="rounded-2xl border bg-card px-6 py-20 text-center text-sm text-surface-muted-foreground">
          Calculating report…
        </div>
      ) : status === 'error' ? (
        <p className="rounded-lg bg-danger-container p-4 text-sm text-danger">{error}</p>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-3 gap-4">
            <SummaryCard
              icon={Clock3}
              label="Total recorded"
              value={formatCompactDuration(report.totalMs)}
              detail={`${report.entryCount} ${report.entryCount === 1 ? 'entry' : 'entries'}`}
            />
            <SummaryCard
              icon={CalendarDays}
              label="Active days"
              value={String(report.activeDayCount)}
              detail={`${report.days.length} calendar ${report.days.length === 1 ? 'day' : 'days'} selected`}
            />
            <SummaryCard
              icon={BarChart3}
              label="Average active day"
              value={formatCompactDuration(averageMs)}
              detail="Days with recorded time"
            />
          </div>

          {report.workday.scheduledDayCount ? (
            <section className="mb-5 rounded-2xl border bg-card/70 p-4 text-surface-muted-foreground">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <div>
                  <h2 className="m-0 text-sm font-semibold text-foreground">Schedule context</h2>
                  <p className="mt-1 mb-0 text-xs">
                    Planning context only. All tracked task time remains included above. Each date
                    uses its effective schedule revision and any date override.
                  </p>
                </div>
                {report.workday.incompleteDayCount ? (
                  <span className="rounded-full bg-warning-container px-2.5 py-1 text-[11px] font-semibold text-warning">
                    Includes today in progress
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-4 gap-2">
                <ContextMetric
                  label="Planned"
                  value={formatCompactDuration(report.workday.scheduledMs)}
                  detail={`Adjusted ${formatCompactDuration(report.workday.adjustedScheduledMs)}`}
                />
                <ContextMetric
                  label="Tracked in plan"
                  value={formatCompactDuration(report.workday.trackedInScheduleMs)}
                  detail={`Beyond plan ${formatCompactDuration(report.workday.trackedBeyondScheduleMs)}`}
                />
                <ContextMetric
                  label="Non-worked"
                  value={formatCompactDuration(report.workday.nonWorkedMs)}
                  detail={`Unclassified ${formatCompactDuration(report.workday.unclassifiedMs)}`}
                />
                <ContextMetric
                  label="Elapsed-plan coverage"
                  value={
                    report.workday.coverageRatio === null
                      ? '—'
                      : `${Math.round(report.workday.coverageRatio * 100)}%`
                  }
                  detail={`${report.workday.scheduledDayCount} planned ${report.workday.scheduledDayCount === 1 ? 'day' : 'days'}`}
                />
              </div>
              <div className="mt-2 grid grid-cols-6 gap-2 text-xs">
                <ContextMetric
                  compact
                  label="Planned breaks"
                  value={formatCompactDuration(report.workday.plannedBreakMs)}
                />
                <ContextMetric
                  compact
                  label="Additional breaks"
                  value={formatCompactDuration(report.workday.breakMs)}
                />
                <ContextMetric
                  compact
                  label="Personal / away"
                  value={formatCompactDuration(report.workday.personalAwayMs)}
                />
                <ContextMetric
                  compact
                  label="Distraction"
                  value={formatCompactDuration(report.workday.distractionMs)}
                  detail={`Avg. ${formatCompactDuration(report.workday.averageDistractionMs)} per planned day`}
                />
                <ContextMetric
                  compact
                  label="Ignored"
                  value={formatCompactDuration(report.workday.ignoredMs)}
                />
                <ContextMetric
                  compact
                  label="Avg. unclassified"
                  value={formatCompactDuration(report.workday.averageUnclassifiedMs)}
                />
              </div>
            </section>
          ) : null}

          {report.totalMs === 0 && !report.workday.scheduledDayCount ? (
            <div className="rounded-2xl border bg-card px-6 py-20 text-center">
              <BarChart3 className="mx-auto mb-3 text-surface-muted-foreground" />
              <p className="m-0 text-sm font-medium">No recorded time in this range</p>
              <p className="mt-1 text-xs text-surface-muted-foreground">
                Choose another range or start tracking a task.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] gap-5">
                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="mb-5 flex items-baseline justify-between gap-4">
                    <h2 className="m-0 text-base font-semibold">By day</h2>
                    <span className="text-xs text-surface-muted-foreground">
                      {dateLabel(range.startDate, true)} – {dateLabel(range.endDate, true)}
                    </span>
                  </div>
                  <div className="max-h-[420px] space-y-3 overflow-auto pr-1">
                    {report.days.map((day) => (
                      <div
                        key={day.date}
                        className="grid grid-cols-[92px_minmax(0,1fr)_74px] items-center gap-3"
                      >
                        <span className="text-xs text-surface-muted-foreground">
                          {dateLabel(day.date)}
                          {day.incomplete ? (
                            <span className="mt-0.5 block text-[10px] text-warning">
                              In progress
                            </span>
                          ) : null}
                        </span>
                        <div className="space-y-1.5">
                          <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${(day.totalMs / maxDay) * 100}%` }}
                            />
                          </div>
                          {day.scheduledDay ? (
                            <p className="m-0 text-[10px] text-surface-muted-foreground">
                              Non-worked {formatCompactDuration(day.nonWorkedMs)} · coverage{' '}
                              {day.coverageRatio === null
                                ? '—'
                                : `${Math.round(day.coverageRatio * 100)}%`}
                            </p>
                          ) : null}
                        </div>
                        <span className="text-right font-mono text-xs tabular-nums">
                          {formatCompactDuration(day.totalMs)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                  <h2 className="mt-0 mb-5 text-base font-semibold">By group and task</h2>
                  <div className="max-h-[420px] space-y-5 overflow-auto pr-1">
                    {!report.groups.length ? (
                      <p className="m-0 text-xs text-surface-muted-foreground">
                        No tracked task time in this range.
                      </p>
                    ) : null}
                    {report.groups.map(({ group, totalMs, tasks }) => (
                      <details key={group?.id ?? 'ungrouped'} open>
                        <summary className="mb-2 cursor-pointer list-none">
                          <div className="flex items-center gap-2">
                            <span
                              className={`size-2.5 rounded-full ${taskColorClass(group?.color ?? null)}`}
                            />
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                              {group?.name ?? 'Ungrouped'}
                            </span>
                            {group?.archivedAt ? (
                              <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-surface-muted-foreground">
                                Archived
                              </span>
                            ) : null}
                            <span className="font-mono text-xs tabular-nums">
                              {formatCompactDuration(totalMs)}
                            </span>
                          </div>
                        </summary>
                        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className={`h-full rounded-full ${taskColorClass(group?.color ?? null)}`}
                            style={{ width: `${(totalMs / maxGroup) * 100}%` }}
                          />
                        </div>
                        <div className="space-y-2 border-l pl-3">
                          {tasks.map(({ task, totalMs: taskTotal }) => (
                            <div key={task.id} className="flex items-center gap-2 text-xs">
                              <span
                                className={`size-2 rounded-full ${taskColorClass(task.color)}`}
                              />
                              <span className="min-w-0 flex-1 truncate">{task.title}</span>
                              {task.externalId ? (
                                <span className="max-w-20 truncate font-mono text-[10px] text-surface-muted-foreground">
                                  {task.externalId}
                                </span>
                              ) : null}
                              <span className="font-mono tabular-nums">
                                {formatCompactDuration(taskTotal)}
                              </span>
                              <span className="sr-only">
                                {Math.round((taskTotal / maxTask) * 100)} percent of largest task
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-5">
                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                  <h2 className="mt-0 mb-1 text-base font-semibold">By category</h2>
                  <p className="mt-0 mb-4 text-xs text-surface-muted-foreground">
                    Mutually exclusive totals; together they equal total recorded time.
                  </p>
                  <div className="space-y-2">
                    {report.categories.map(({ category, totalMs }) => (
                      <div key={category?.id ?? 'uncategorized'} className="flex gap-3 text-xs">
                        <span className="min-w-0 flex-1 truncate">
                          {category?.name ?? 'Uncategorized'}
                        </span>
                        <span className="font-mono tabular-nums">
                          {formatCompactDuration(totalMs)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                  <h2 className="mt-0 mb-1 text-base font-semibold">By tag</h2>
                  <p className="mt-0 mb-4 text-xs text-surface-muted-foreground">
                    Non-additive: an entry with several tags appears in each matching total.
                  </p>
                  <div className="space-y-2">
                    {report.tags.length ? (
                      report.tags.map(({ tag, totalMs }) => (
                        <div key={tag.id} className="flex gap-3 text-xs">
                          <span className="min-w-0 flex-1 truncate">#{tag.name}</span>
                          <span className="font-mono tabular-nums">
                            {formatCompactDuration(totalMs)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="m-0 text-xs text-surface-muted-foreground">No tagged time.</p>
                    )}
                  </div>
                </section>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ContextMetric({
  label,
  value,
  detail,
  compact = false,
}: {
  label: string;
  value: string;
  detail?: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-background/55 px-3 py-2.5">
      <p className="m-0 text-[10px] font-semibold uppercase tracking-wide">{label}</p>
      <p
        className={`${compact ? 'mt-1 text-sm' : 'mt-1.5 text-lg'} mb-0 font-semibold tabular-nums text-foreground`}
      >
        {value}
      </p>
      {detail ? <p className="mt-1 mb-0 text-[10px]">{detail}</p> : null}
    </div>
  );
}

function ExportDialog({
  format,
  range,
  today,
  exporting,
  error,
  onChange,
  onClose,
  onExport,
}: {
  format: ExportFormat;
  range: ReportRange;
  today: string;
  exporting: boolean;
  error: string | null;
  onChange: (range: ReportRange) => void;
  onClose: () => void;
  onExport: () => void;
}) {
  const invalid = !range.startDate || !range.endDate || range.startDate > range.endDate;
  const dialogRef = useModalDialog<HTMLElement>(onClose, exporting);
  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/35 p-6 backdrop-blur-[1px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        aria-describedby="export-description"
        tabIndex={-1}
        className="max-h-[calc(100vh-3rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border bg-card p-6 shadow-[var(--shadow)]"
      >
        <h2 id="export-title" className="m-0 text-xl font-semibold">
          Export {format.toUpperCase()}
        </h2>
        <p id="export-description" className="mt-2 text-sm leading-6 text-surface-muted-foreground">
          Choose the inclusive date range to include in this export.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-4">
          <label className="grid gap-2 text-sm font-medium">
            From
            <input
              type="date"
              autoFocus
              value={range.startDate}
              max={range.endDate || today}
              onChange={(event) => onChange({ ...range, startDate: event.target.value })}
              className="rounded-lg border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Through
            <input
              type="date"
              value={range.endDate}
              min={range.startDate}
              max={today}
              onChange={(event) => onChange({ ...range, endDate: event.target.value })}
              className="rounded-lg border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-danger-container px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={exporting}
            onClick={onClose}
            className="rounded-lg border bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-muted disabled:opacity-45"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={invalid || exporting}
            onClick={onExport}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-45"
          >
            {exporting ? 'Preparing…' : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-surface-muted-foreground">
        <Icon size={15} /> {label}
      </div>
      <p className="mt-3 mb-1 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="m-0 text-xs text-surface-muted-foreground">{detail}</p>
    </article>
  );
}
