import type {
  EntryCategory,
  EntryTag,
  Group,
  HistoryEntry,
  Task,
  WeeklyWorkSchedule,
  WorkdayClassification,
} from '@time-tracker/domain';
import { clipDurationToDay, localDateKey, localDayBounds, shiftLocalDate } from '../history/day';
import {
  buildDailyWorkdaySummary,
  intersectIntervals,
  intervalDuration,
  mergeIntervals,
  plannedBreakDuration,
  scheduleIntervalsForDate,
  subtractIntervals,
  type Interval,
} from '../workday/workdayCoverage';

export type ReportRange = {
  startDate: string;
  endDate: string;
};

export type ReportDayTotal = {
  date: string;
  totalMs: number;
  incomplete: boolean;
  scheduledDay: boolean;
  scheduledMs: number;
  adjustedScheduledMs: number;
  elapsedAdjustedScheduledMs: number;
  trackedInScheduleMs: number;
  trackedBeyondScheduleMs: number;
  plannedBreakMs: number;
  breakMs: number;
  personalAwayMs: number;
  distractionMs: number;
  ignoredMs: number;
  unclassifiedMs: number;
  nonWorkedMs: number;
  coverageRatio: number | null;
};

export type ReportWorkdayTotals = Omit<ReportDayTotal, 'date' | 'totalMs' | 'incomplete'> & {
  scheduledDayCount: number;
  incompleteDayCount: number;
  averageUnclassifiedMs: number;
  averageDistractionMs: number;
};

export type ReportTaskTotal = {
  task: Task;
  group: Group | null;
  totalMs: number;
};

export type ReportGroupTotal = {
  group: Group | null;
  totalMs: number;
  tasks: ReportTaskTotal[];
};

export type ReportCategoryTotal = {
  category: EntryCategory | null;
  totalMs: number;
};

export type ReportTagTotal = {
  tag: EntryTag;
  totalMs: number;
};

export type Report = {
  totalMs: number;
  entryCount: number;
  activeDayCount: number;
  days: ReportDayTotal[];
  tasks: ReportTaskTotal[];
  groups: ReportGroupTotal[];
  categories: ReportCategoryTotal[];
  tags: ReportTagTotal[];
  workday: ReportWorkdayTotals;
};

export type ReportAccountingInput = {
  schedule: WeeklyWorkSchedule;
  schedulesByDate?: Record<string, WeeklyWorkSchedule>;
  classifications: WorkdayClassification[];
};

export type ReportTaxonomyFilters = { categoryId: string; tagId: string };

export function filterReportEntries(
  entries: HistoryEntry[],
  { categoryId, tagId }: ReportTaxonomyFilters,
) {
  return entries.filter(
    (entry) =>
      (categoryId === 'all' ||
        (categoryId === 'uncategorized' ? !entry.category : entry.category?.id === categoryId)) &&
      (tagId === 'all' || entry.tags.some((tag) => tag.id === tagId)),
  );
}

export function currentMonthRange(now = new Date()): ReportRange {
  return {
    startDate: localDateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
    endDate: localDateKey(now),
  };
}

export function validateReportRange(range: ReportRange) {
  const start = localDayBounds(range.startDate).start;
  const end = localDayBounds(range.endDate).end;
  if (start.getTime() >= end.getTime())
    throw new Error('The start date must be before the end date.');
  return { start, end };
}

function classificationIntervals(
  classifications: WorkdayClassification[],
  date: string,
  now: number,
  category?: WorkdayClassification['category'],
) {
  const day = localDayBounds(date);
  const cutoff = Math.min(Math.max(now, day.start.getTime()), day.end.getTime());
  return mergeIntervals(
    classifications
      .filter((item) => !category || item.category === category)
      .map((item) => ({
        start: Math.max(new Date(item.startedAt).getTime(), day.start.getTime()),
        end: Math.min(
          item.endedAt ? new Date(item.endedAt).getTime() : now,
          cutoff,
          day.end.getTime(),
        ),
      })),
  );
}

function categoryDuration(
  classifications: WorkdayClassification[],
  date: string,
  now: number,
  category: WorkdayClassification['category'],
  scope: Interval[],
) {
  return intervalDuration(
    intersectIntervals(classificationIntervals(classifications, date, now, category), scope),
  );
}

function emptyWorkdayTotals(): ReportWorkdayTotals {
  return {
    scheduledDay: false,
    scheduledMs: 0,
    adjustedScheduledMs: 0,
    elapsedAdjustedScheduledMs: 0,
    trackedInScheduleMs: 0,
    trackedBeyondScheduleMs: 0,
    plannedBreakMs: 0,
    breakMs: 0,
    personalAwayMs: 0,
    distractionMs: 0,
    ignoredMs: 0,
    unclassifiedMs: 0,
    nonWorkedMs: 0,
    coverageRatio: null,
    scheduledDayCount: 0,
    incompleteDayCount: 0,
    averageUnclassifiedMs: 0,
    averageDistractionMs: 0,
  };
}

export function buildReport(
  entries: HistoryEntry[],
  range: ReportRange,
  now = Date.now(),
  accounting?: ReportAccountingInput,
): Report {
  validateReportRange(range);
  const days: ReportDayTotal[] = [];
  const perTask = new Map<string, ReportTaskTotal>();
  const perCategory = new Map<string, ReportCategoryTotal>();
  const perTag = new Map<string, ReportTagTotal>();
  let totalMs = 0;

  for (let date = range.startDate; ; date = shiftLocalDate(date, 1)) {
    const schedule = accounting?.schedulesByDate?.[date] ?? accounting?.schedule;
    const day = localDayBounds(date);
    let dayTotal = 0;
    for (const entry of entries) {
      const duration = clipDurationToDay(entry.startedAt, entry.endedAt, day, now);
      if (!duration) continue;
      dayTotal += duration;
      const taskKey = `${entry.groupId ?? 'ungrouped'}:${entry.group?.name ?? ''}:${entry.taskId}:${entry.task.externalId ?? ''}:${entry.task.title}`;
      const current = perTask.get(taskKey);
      perTask.set(taskKey, {
        task: entry.task,
        group: entry.group,
        totalMs: (current?.totalMs ?? 0) + duration,
      });
      const categoryKey = entry.category
        ? `${entry.category.id}:${entry.category.name}:${entry.category.color ?? ''}`
        : 'uncategorized';
      const categoryTotal = perCategory.get(categoryKey);
      perCategory.set(categoryKey, {
        category: entry.category,
        totalMs: (categoryTotal?.totalMs ?? 0) + duration,
      });
      for (const tag of entry.tags) {
        const tagKey = `${tag.id}:${tag.name}:${tag.color ?? ''}`;
        const tagTotal = perTag.get(tagKey);
        perTag.set(tagKey, { tag, totalMs: (tagTotal?.totalMs ?? 0) + duration });
      }
    }
    const dayBounds = localDayBounds(date);
    const incomplete = now >= dayBounds.start.getTime() && now < dayBounds.end.getTime();
    const scheduleIntervals = schedule?.enabled ? scheduleIntervalsForDate(schedule, date) : [];
    const ignoredIntervals = accounting
      ? classificationIntervals(accounting.classifications, date, now, 'ignored')
      : [];
    const adjustedSchedule = subtractIntervals(scheduleIntervals, ignoredIntervals);
    const cutoff = Math.min(Math.max(now, dayBounds.start.getTime()), dayBounds.end.getTime());
    const elapsedAdjustedSchedule = mergeIntervals(
      adjustedSchedule.map(({ start, end }) => ({ start, end: Math.min(end, cutoff) })),
    );
    const daily = accounting
      ? buildDailyWorkdaySummary(schedule!, date, entries, now, accounting.classifications)
      : null;
    const breakMs = accounting
      ? categoryDuration(accounting.classifications, date, now, 'break', elapsedAdjustedSchedule)
      : 0;
    const personalAwayMs = accounting
      ? categoryDuration(
          accounting.classifications,
          date,
          now,
          'personal_away',
          elapsedAdjustedSchedule,
        )
      : 0;
    const distractionMs = accounting
      ? categoryDuration(
          accounting.classifications,
          date,
          now,
          'distraction',
          elapsedAdjustedSchedule,
        )
      : 0;
    const explainedIntervals = accounting
      ? mergeIntervals([
          ...classificationIntervals(accounting.classifications, date, now, 'break'),
          ...classificationIntervals(accounting.classifications, date, now, 'personal_away'),
          ...classificationIntervals(accounting.classifications, date, now, 'distraction'),
        ])
      : [];
    const explainedMs = intervalDuration(
      intersectIntervals(explainedIntervals, elapsedAdjustedSchedule),
    );
    const rawScheduledMs = intervalDuration(scheduleIntervals);
    const ignoredMs = Math.max(0, rawScheduledMs - intervalDuration(adjustedSchedule));
    days.push({
      date,
      totalMs: dayTotal,
      incomplete,
      scheduledDay: scheduleIntervals.length > 0,
      scheduledMs: rawScheduledMs,
      adjustedScheduledMs: daily?.scheduledMs ?? 0,
      elapsedAdjustedScheduledMs: daily?.elapsedScheduledMs ?? 0,
      trackedInScheduleMs: daily?.trackedScheduledMs ?? 0,
      trackedBeyondScheduleMs: accounting ? (daily?.overtimeMs ?? dayTotal) : 0,
      plannedBreakMs: plannedBreakDuration(scheduleIntervals),
      breakMs,
      personalAwayMs,
      distractionMs,
      ignoredMs,
      unclassifiedMs: Math.max(0, (daily?.nonWorkedMs ?? 0) - explainedMs),
      nonWorkedMs: daily?.nonWorkedMs ?? 0,
      coverageRatio: daily?.coverageRatio ?? null,
    });
    totalMs += dayTotal;
    if (date === range.endDate) break;
  }

  const tasks = [...perTask.values()].sort(
    (first, second) =>
      second.totalMs - first.totalMs || first.task.title.localeCompare(second.task.title),
  );
  const perGroup = new Map<string, ReportGroupTotal>();
  for (const task of tasks) {
    const key = task.group
      ? `${task.group.id}:${task.group.name}:${task.group.color ?? ''}`
      : 'ungrouped';
    const current = perGroup.get(key);
    if (current) {
      current.totalMs += task.totalMs;
      current.tasks.push(task);
    } else {
      perGroup.set(key, { group: task.group, totalMs: task.totalMs, tasks: [task] });
    }
  }
  const groups = [...perGroup.values()].sort(
    (first, second) =>
      second.totalMs - first.totalMs ||
      (first.group?.name ?? 'Ungrouped').localeCompare(second.group?.name ?? 'Ungrouped'),
  );
  const categories = [...perCategory.values()].sort(
    (first, second) =>
      second.totalMs - first.totalMs ||
      (first.category?.name ?? 'Uncategorized').localeCompare(
        second.category?.name ?? 'Uncategorized',
      ),
  );
  const tags = [...perTag.values()].sort(
    (first, second) =>
      second.totalMs - first.totalMs || first.tag.name.localeCompare(second.tag.name),
  );

  const workday = days.reduce<ReportWorkdayTotals>((totals, day) => {
    totals.scheduledDay ||= day.scheduledDay;
    totals.scheduledMs += day.scheduledMs;
    totals.adjustedScheduledMs += day.adjustedScheduledMs;
    totals.elapsedAdjustedScheduledMs += day.elapsedAdjustedScheduledMs;
    totals.trackedInScheduleMs += day.trackedInScheduleMs;
    totals.trackedBeyondScheduleMs += day.trackedBeyondScheduleMs;
    totals.plannedBreakMs += day.plannedBreakMs;
    totals.breakMs += day.breakMs;
    totals.personalAwayMs += day.personalAwayMs;
    totals.distractionMs += day.distractionMs;
    totals.ignoredMs += day.ignoredMs;
    totals.unclassifiedMs += day.unclassifiedMs;
    totals.nonWorkedMs += day.nonWorkedMs;
    if (day.scheduledDay) totals.scheduledDayCount += 1;
    if (day.scheduledDay && day.incomplete) totals.incompleteDayCount += 1;
    return totals;
  }, emptyWorkdayTotals());
  workday.coverageRatio = workday.elapsedAdjustedScheduledMs
    ? workday.trackedInScheduleMs / workday.elapsedAdjustedScheduledMs
    : null;
  workday.averageUnclassifiedMs = workday.scheduledDayCount
    ? workday.unclassifiedMs / workday.scheduledDayCount
    : 0;
  workday.averageDistractionMs = workday.scheduledDayCount
    ? workday.distractionMs / workday.scheduledDayCount
    : 0;

  return {
    totalMs,
    entryCount: entries.length,
    activeDayCount: days.filter((day) => day.totalMs > 0).length,
    days,
    tasks,
    groups,
    categories,
    tags,
    workday,
  };
}
