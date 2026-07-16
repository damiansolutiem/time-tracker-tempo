import {
  weekdays,
  type Weekday,
  type WeeklyWorkSchedule,
  type WorkBlock,
} from '@time-tracker/domain';

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function defaultBlocks(day: Weekday): WorkBlock[] {
  if (day === 'saturday' || day === 'sunday') return [];
  const prefix = day.slice(0, 3);
  return [
    { id: `${prefix}-morning`, start: '09:00', end: '13:00' },
    { id: `${prefix}-afternoon`, start: '14:00', end: '18:00' },
  ];
}

export function createDefaultWorkSchedule(): WeeklyWorkSchedule {
  return {
    enabled: false,
    days: Object.fromEntries(weekdays.map((day) => [day, defaultBlocks(day)])) as Record<
      Weekday,
      WorkBlock[]
    >,
  };
}

export const defaultWorkSchedule = createDefaultWorkSchedule();

export function timeToMinutes(value: string): number | null {
  if (!timePattern.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours! * 60 + minutes!;
}

export function getWorkScheduleValidationErrors(schedule: WeeklyWorkSchedule): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  if (schedule.enabled && weekdays.every((day) => schedule.days[day].length === 0)) {
    errors.push('Add at least one work block before enabling the work schedule.');
  }
  for (const day of weekdays) {
    const ordered = [...schedule.days[day]].sort((first, second) =>
      first.start.localeCompare(second.start),
    );
    for (const [index, block] of ordered.entries()) {
      if (!block.id.trim() || ids.has(block.id)) {
        errors.push(`${day}: work blocks must have unique identifiers.`);
      }
      ids.add(block.id);
      const start = timeToMinutes(block.start);
      const end = timeToMinutes(block.end);
      if (start === null || end === null) {
        errors.push(`${day}: work blocks must use valid 24-hour times.`);
        continue;
      }
      if (start >= end) {
        errors.push(`${day}: a work block must end after it starts.`);
        continue;
      }
      const previous = ordered[index - 1];
      if (previous) {
        const previousEnd = timeToMinutes(previous.end);
        if (previousEnd !== null && start < previousEnd) {
          errors.push(`${day}: work blocks cannot overlap.`);
        }
      }
    }
  }
  return [...new Set(errors)];
}

function isWorkBlock(value: unknown): value is WorkBlock {
  if (!value || typeof value !== 'object') return false;
  const block = value as Partial<WorkBlock>;
  return (
    typeof block.id === 'string' &&
    block.id.trim().length > 0 &&
    typeof block.start === 'string' &&
    typeof block.end === 'string'
  );
}

export function normalizeWorkSchedule(value: unknown): WeeklyWorkSchedule {
  if (!value || typeof value !== 'object') return createDefaultWorkSchedule();
  const candidate = value as { enabled?: unknown; days?: unknown };
  if (
    typeof candidate.enabled !== 'boolean' ||
    !candidate.days ||
    typeof candidate.days !== 'object'
  )
    return createDefaultWorkSchedule();

  const rawDays = candidate.days as Record<string, unknown>;
  const days = {} as Record<Weekday, WorkBlock[]>;
  for (const day of weekdays) {
    const blocks = rawDays[day];
    if (!Array.isArray(blocks) || !blocks.every(isWorkBlock)) return createDefaultWorkSchedule();
    days[day] = blocks
      .map((block) => ({ id: block.id.trim(), start: block.start, end: block.end }))
      .sort((first, second) => first.start.localeCompare(second.start));
  }

  const normalized: WeeklyWorkSchedule = { enabled: candidate.enabled, days };
  return getWorkScheduleValidationErrors(normalized).length
    ? createDefaultWorkSchedule()
    : normalized;
}

export function workBlockDurationMinutes(block: WorkBlock): number {
  const start = timeToMinutes(block.start);
  const end = timeToMinutes(block.end);
  return start === null || end === null || end <= start ? 0 : end - start;
}

export function scheduledMinutesForDay(schedule: WeeklyWorkSchedule, day: Weekday): number {
  return schedule.days[day].reduce((total, block) => total + workBlockDurationMinutes(block), 0);
}

export function scheduledMinutesForWeek(schedule: WeeklyWorkSchedule): number {
  return weekdays.reduce((total, day) => total + scheduledMinutesForDay(schedule, day), 0);
}

export function copyMondayToWeekdays(
  schedule: WeeklyWorkSchedule,
  createId: () => string,
): WeeklyWorkSchedule {
  return {
    ...schedule,
    days: {
      ...schedule.days,
      ...(Object.fromEntries(
        weekdays
          .slice(1, 5)
          .map((day) => [day, schedule.days.monday.map((block) => ({ ...block, id: createId() }))]),
      ) as Pick<WeeklyWorkSchedule['days'], 'tuesday' | 'wednesday' | 'thursday' | 'friday'>),
    },
  };
}
