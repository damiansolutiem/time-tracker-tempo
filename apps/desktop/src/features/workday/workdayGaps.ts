import type { WeeklyWorkSchedule, WorkdayClassification, WorkdayGap } from '@time-tracker/domain';
import { localDayBounds } from '../history/day';
import {
  mergeIntervals,
  scheduleIntervalsForDate,
  subtractIntervals,
  type WorkdayCoverageEntry,
} from './workdayCoverage';

export function buildUnclassifiedScheduledGaps(
  schedule: WeeklyWorkSchedule,
  date: string,
  entries: WorkdayCoverageEntry[],
  classifications: Pick<WorkdayClassification, 'startedAt' | 'endedAt'>[],
  now = Date.now(),
): WorkdayGap[] {
  if (!schedule.enabled) return [];
  const day = localDayBounds(date);
  const cutoff = Math.min(Math.max(now, day.start.getTime()), day.end.getTime());
  const elapsedSchedule = mergeIntervals(
    scheduleIntervalsForDate(schedule, date).map((interval) => ({
      start: interval.start,
      end: Math.min(interval.end, cutoff),
    })),
  );
  const accounted = mergeIntervals([
    ...entries.map((entry) => ({
      start: Math.max(new Date(entry.startedAt).getTime(), day.start.getTime()),
      end: Math.min(
        entry.endedAt ? new Date(entry.endedAt).getTime() : now,
        cutoff,
        day.end.getTime(),
      ),
    })),
    ...classifications.map((item) => ({
      start: Math.max(new Date(item.startedAt).getTime(), day.start.getTime()),
      end: Math.min(
        item.endedAt ? new Date(item.endedAt).getTime() : now,
        cutoff,
        day.end.getTime(),
      ),
    })),
  ]);
  return subtractIntervals(elapsedSchedule, accounted).map(({ start, end }) => ({
    startedAt: new Date(start).toISOString(),
    endedAt: new Date(end).toISOString(),
    durationMs: end - start,
  }));
}
