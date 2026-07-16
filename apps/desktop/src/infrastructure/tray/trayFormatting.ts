import type { RunningTimer } from '@time-tracker/domain';
import { formatDuration } from '../../features/timer/time';

export const TRAY_TASK_TITLE_LENGTH = 45;

export function truncateTrayTaskTitle(title: string, maximum = TRAY_TASK_TITLE_LENGTH) {
  const characters = Array.from(title.trim());
  if (characters.length <= maximum) return characters.join('');
  return `${characters.slice(0, Math.max(1, maximum - 1)).join('')}…`;
}

export function formatTrayTaskLabel(running: RunningTimer) {
  const label = running.task.externalId
    ? `${running.task.externalId} · ${running.task.title}`
    : running.task.title;
  return truncateTrayTaskTitle(label);
}

export function formatTrayTitle(
  running: RunningTimer | null,
  now = Date.now(),
  displayedDurationMs?: number,
) {
  if (!running) return null;
  const elapsed = displayedDurationMs ?? now - new Date(running.startedAt).getTime();
  return `${formatTrayTaskLabel(running)} · ${formatDuration(elapsed)}`;
}

export function formatTrayTooltip(
  running: RunningTimer | null,
  now = Date.now(),
  confirmationPending = false,
  displayedDurationMs?: number,
) {
  return running
    ? `Tempo — ${formatTrayTitle(running, now, displayedDurationMs)}${confirmationPending ? ' — Confirmation required' : ''}`
    : 'Tempo — No task running';
}
