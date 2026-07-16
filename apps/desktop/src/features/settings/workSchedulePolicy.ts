import type {
  WeeklyWorkSchedule,
  WorkScheduleOverride,
  WorkScheduleRevision,
} from '@time-tracker/domain';
import { weekdays } from '@time-tracker/domain';
import { localDayBounds, shiftLocalDate } from '../history/day';
import type { ReportRange } from '../reports/report';

function clone(schedule: WeeklyWorkSchedule): WeeklyWorkSchedule {
  return {
    enabled: schedule.enabled,
    days: Object.fromEntries(
      weekdays.map((day) => [day, schedule.days[day].map((block) => ({ ...block }))]),
    ) as WeeklyWorkSchedule['days'],
  };
}

export function resolveWorkScheduleForDate(
  fallback: WeeklyWorkSchedule,
  revisions: WorkScheduleRevision[],
  overrides: WorkScheduleOverride[],
  date: string,
) {
  const revision = revisions
    .filter((item) => item.effectiveFrom <= date)
    .sort(
      (first, second) =>
        second.effectiveFrom.localeCompare(first.effectiveFrom) ||
        second.createdAt.localeCompare(first.createdAt) ||
        second.sequence - first.sequence,
    )[0];
  const schedule = clone(revision?.schedule ?? fallback);
  const override = overrides.find((item) => item.date === date);
  if (!override) return schedule;
  const weekday = weekdays[(localDayBounds(date).start.getDay() + 6) % 7]!;
  schedule.enabled = true;
  schedule.days[weekday] = override.blocks.map((block) => ({ ...block }));
  return schedule;
}

export function resolveWorkSchedulesForRange(
  fallback: WeeklyWorkSchedule,
  revisions: WorkScheduleRevision[],
  overrides: WorkScheduleOverride[],
  range: ReportRange,
) {
  const result: Record<string, WeeklyWorkSchedule> = {};
  for (let date = range.startDate; ; date = shiftLocalDate(date, 1)) {
    result[date] = resolveWorkScheduleForDate(fallback, revisions, overrides, date);
    if (date === range.endDate) return result;
  }
}
