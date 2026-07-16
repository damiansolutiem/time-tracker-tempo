export type LocalDayBounds = { start: Date; end: Date };

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function localDayBounds(key: string): LocalDayBounds {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new Error('Invalid local date.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = new Date(year, month - 1, day);
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) {
    throw new Error('Invalid local date.');
  }
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function shiftLocalDate(key: string, days: number) {
  const { start } = localDayBounds(key);
  start.setDate(start.getDate() + days);
  return localDateKey(start);
}

export function clipDurationToDay(
  startedAt: string,
  endedAt: string | null,
  day: LocalDayBounds,
  now = Date.now(),
) {
  const start = Math.max(new Date(startedAt).getTime(), day.start.getTime());
  const end = Math.min(endedAt ? new Date(endedAt).getTime() : now, day.end.getTime());
  return Math.max(0, end - start);
}
