import type {
  DailyWorkdaySummary,
  Weekday,
  WeeklyWorkSchedule,
  WorkdayClassification,
} from '@time-tracker/domain';
import { weekdays } from '@time-tracker/domain';
import { localDayBounds } from '../history/day';
import { timeToMinutes } from '../settings/workSchedule';

export type Interval = { start: number; end: number };

export type WorkdayCoverageEntry = {
  startedAt: string;
  endedAt: string | null;
};

export type TrackedDayFacts = {
  intervals: Interval[];
  trackedTotalMs: number;
  firstTrackedAt: string | null;
  lastTrackedAt: string | null;
};

export function intervalDuration(intervals: Interval[]) {
  return intervals.reduce((total, interval) => total + interval.end - interval.start, 0);
}

export function mergeIntervals(intervals: Interval[]): Interval[] {
  const ordered = intervals
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((first, second) => first.start - second.start || first.end - second.end);
  const merged: Interval[] = [];
  for (const interval of ordered) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end) {
      merged.push({ ...interval });
    } else {
      previous.end = Math.max(previous.end, interval.end);
    }
  }
  return merged;
}

export function intersectIntervals(first: Interval[], second: Interval[]): Interval[] {
  const intersections: Interval[] = [];
  let firstIndex = 0;
  let secondIndex = 0;
  while (firstIndex < first.length && secondIndex < second.length) {
    const left = first[firstIndex]!;
    const right = second[secondIndex]!;
    const start = Math.max(left.start, right.start);
    const end = Math.min(left.end, right.end);
    if (end > start) intersections.push({ start, end });
    if (left.end <= right.end) firstIndex += 1;
    else secondIndex += 1;
  }
  return mergeIntervals(intersections);
}

export function subtractIntervals(source: Interval[], excluded: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const interval of source) {
    let cursor = interval.start;
    for (const exclusion of excluded) {
      if (exclusion.end <= cursor || exclusion.start >= interval.end) continue;
      if (exclusion.start > cursor)
        result.push({ start: cursor, end: Math.min(exclusion.start, interval.end) });
      cursor = Math.max(cursor, exclusion.end);
      if (cursor >= interval.end) break;
    }
    if (cursor < interval.end) result.push({ start: cursor, end: interval.end });
  }
  return mergeIntervals(result);
}

function weekdayFor(date: Date): Weekday {
  return weekdays[(date.getDay() + 6) % 7]!;
}

export function scheduleIntervalsForDate(schedule: WeeklyWorkSchedule, date: string): Interval[] {
  const { start } = localDayBounds(date);
  const blocks = schedule.days[weekdayFor(start)];
  return mergeIntervals(
    blocks.flatMap((block) => {
      const startMinutes = timeToMinutes(block.start);
      const endMinutes = timeToMinutes(block.end);
      if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return [];
      const intervalStart = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate(),
        Math.floor(startMinutes / 60),
        startMinutes % 60,
      ).getTime();
      const intervalEnd = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate(),
        Math.floor(endMinutes / 60),
        endMinutes % 60,
      ).getTime();
      return intervalEnd > intervalStart ? [{ start: intervalStart, end: intervalEnd }] : [];
    }),
  );
}

export function plannedBreakDuration(intervals: Interval[]) {
  let total = 0;
  for (let index = 1; index < intervals.length; index += 1) {
    total += Math.max(0, intervals[index]!.start - intervals[index - 1]!.end);
  }
  return total;
}

export function calculateTrackedDayFacts(
  date: string,
  entries: WorkdayCoverageEntry[],
  now = Date.now(),
): TrackedDayFacts {
  const day = localDayBounds(date);
  const cutoff = Math.min(Math.max(now, day.start.getTime()), day.end.getTime());
  const intervals = mergeIntervals(
    entries.map((entry) => ({
      start: Math.max(new Date(entry.startedAt).getTime(), day.start.getTime()),
      end: Math.min(
        entry.endedAt ? new Date(entry.endedAt).getTime() : now,
        cutoff,
        day.end.getTime(),
      ),
    })),
  );
  const first = intervals[0];
  const last = intervals.at(-1);
  return {
    intervals,
    trackedTotalMs: intervalDuration(intervals),
    firstTrackedAt: first ? new Date(first.start).toISOString() : null,
    lastTrackedAt: last ? new Date(last.end).toISOString() : null,
  };
}

export function buildDailyWorkdaySummary(
  schedule: WeeklyWorkSchedule,
  date: string,
  entries: WorkdayCoverageEntry[],
  now = Date.now(),
  classifications: Pick<WorkdayClassification, 'category' | 'startedAt' | 'endedAt'>[] = [],
): DailyWorkdaySummary {
  const day = localDayBounds(date);
  const cutoff = Math.min(Math.max(now, day.start.getTime()), day.end.getTime());
  const {
    intervals: taskIntervals,
    trackedTotalMs,
    firstTrackedAt,
    lastTrackedAt,
  } = calculateTrackedDayFacts(date, entries, now);
  if (!schedule.enabled) {
    return {
      date,
      enabled: false,
      scheduledDay: false,
      scheduledMs: 0,
      elapsedScheduledMs: 0,
      trackedTotalMs,
      trackedScheduledMs: 0,
      nonWorkedMs: 0,
      remainingScheduledMs: 0,
      plannedBreakMs: 0,
      overtimeMs: 0,
      coverageRatio: null,
      nonWorkedRatio: null,
      currentlyScheduled: false,
      currentGapMs: 0,
      firstTrackedAt,
      lastTrackedAt,
    };
  }

  const rawScheduleIntervals = scheduleIntervalsForDate(schedule, date);
  const ignoredIntervals = mergeIntervals(
    classifications
      .filter((item) => item.category === 'ignored' && item.endedAt)
      .map((item) => ({
        start: Math.max(new Date(item.startedAt).getTime(), day.start.getTime()),
        end: Math.min(new Date(item.endedAt!).getTime(), day.end.getTime()),
      })),
  );
  const scheduleIntervals = subtractIntervals(rawScheduleIntervals, ignoredIntervals);
  const elapsedSchedule = mergeIntervals(
    scheduleIntervals.map(({ start, end }) => ({ start, end: Math.min(end, cutoff) })),
  );
  const trackedSchedule = intersectIntervals(taskIntervals, elapsedSchedule);
  const scheduledMs = intervalDuration(scheduleIntervals);
  const elapsedScheduledMs = Math.min(scheduledMs, intervalDuration(elapsedSchedule));
  const trackedScheduledMs = Math.min(elapsedScheduledMs, intervalDuration(trackedSchedule));
  const nonWorkedMs = Math.max(0, elapsedScheduledMs - trackedScheduledMs);
  const currentSchedule = scheduleIntervals.find(
    (interval) => now >= interval.start && now < interval.end,
  );
  let currentGapMs = 0;
  if (currentSchedule) {
    const taskTimeInCurrentBlock = intersectIntervals(taskIntervals, [currentSchedule]);
    const latestTask = taskTimeInCurrentBlock.at(-1);
    if (!latestTask || latestTask.end < cutoff) {
      currentGapMs = Math.max(0, cutoff - Math.max(currentSchedule.start, latestTask?.end ?? 0));
    }
  }

  return {
    date,
    enabled: true,
    scheduledDay: scheduleIntervals.length > 0,
    scheduledMs,
    elapsedScheduledMs,
    trackedTotalMs,
    trackedScheduledMs,
    nonWorkedMs,
    remainingScheduledMs: Math.max(0, scheduledMs - elapsedScheduledMs),
    plannedBreakMs: plannedBreakDuration(rawScheduleIntervals),
    overtimeMs: Math.max(0, trackedTotalMs - trackedScheduledMs),
    coverageRatio: elapsedScheduledMs ? trackedScheduledMs / elapsedScheduledMs : null,
    nonWorkedRatio: elapsedScheduledMs ? nonWorkedMs / elapsedScheduledMs : null,
    currentlyScheduled: Boolean(currentSchedule),
    currentGapMs,
    firstTrackedAt,
    lastTrackedAt,
  };
}
