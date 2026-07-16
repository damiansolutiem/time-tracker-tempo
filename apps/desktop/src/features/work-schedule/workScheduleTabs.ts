export type WorkScheduleTab = 'weekly' | 'exceptions';

export function nextWorkScheduleTab(current: WorkScheduleTab, key: string): WorkScheduleTab | null {
  const tabs: WorkScheduleTab[] = ['weekly', 'exceptions'];
  const currentIndex = tabs.indexOf(current);
  if (key === 'ArrowRight') return tabs[(currentIndex + 1) % tabs.length] ?? null;
  if (key === 'ArrowLeft') return tabs[(currentIndex - 1 + tabs.length) % tabs.length] ?? null;
  if (key === 'Home') return tabs[0] ?? null;
  if (key === 'End') return tabs.at(-1) ?? null;
  return null;
}
