import type { RunningTimer } from '@time-tracker/domain';
import { describe, expect, it } from 'vitest';
import { formatTrayTitle, formatTrayTooltip, truncateTrayTaskTitle } from './trayFormatting';

const running: RunningTimer = {
  id: 'entry-1',
  taskId: 'task-1',
  groupId: null,
  category: null,
  tags: [],
  startedAt: '2026-07-15T08:00:00.000Z',
  endedAt: null,
  note: null,
  confirmedAt: '2026-07-15T08:00:00.000Z',
  checkDueAt: null,
  verificationState: 'confirmed',
  notes: [],
  group: null,
  task: {
    id: 'task-1',
    externalId: null,
    groupId: null,
    category: null,
    tags: [],
    title: 'Implement an exceptionally long checkout flow',
    description: null,
    color: 'green',
    archivedAt: null,
    createdAt: '2026-07-15T08:00:00.000Z',
    updatedAt: '2026-07-15T08:00:00.000Z',
  },
};

describe('tray formatting', () => {
  it('keeps the status title compact while preserving elapsed time', () => {
    expect(formatTrayTitle(running, new Date('2026-07-15T09:23:45.000Z').getTime())).toBe(
      'Implement an exceptionally long checkout flow · 01:23:45',
    );
  });

  it('prefixes the status title with the external task ID when available', () => {
    const withTaskId = {
      ...running,
      task: { ...running.task, externalId: 'ACME-104', title: 'Checkout improvements' },
    };
    expect(formatTrayTitle(withTaskId, new Date('2026-07-15T09:23:45.000Z').getTime())).toBe(
      'ACME-104 · Checkout improvements · 01:23:45',
    );
  });

  it('can display a supplied task total instead of the current session', () => {
    expect(formatTrayTitle(running, Date.now(), 9_005_000)).toBe(
      'Implement an exceptionally long checkout flow · 02:30:05',
    );
  });

  it('truncates by Unicode characters rather than UTF-16 code units', () => {
    expect(truncateTrayTaskTitle('Plan 🚀 launch', 8)).toBe('Plan 🚀 …');
  });

  it('uses an icon-only idle status with an explanatory tooltip', () => {
    expect(formatTrayTitle(null)).toBeNull();
    expect(formatTrayTooltip(null)).toBe('Tempo — No task running');
  });

  it('describes a pending confirmation in the tooltip without changing the title text', () => {
    const now = new Date('2026-07-15T09:23:45.000Z').getTime();
    expect(formatTrayTitle(running, now)).toBe(
      'Implement an exceptionally long checkout flow · 01:23:45',
    );
    expect(formatTrayTooltip(running, now, true)).toBe(
      'Tempo — Implement an exceptionally long checkout flow · 01:23:45 — Confirmation required',
    );
  });
});
