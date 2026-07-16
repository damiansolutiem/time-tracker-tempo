import type { HistoryEntry, WorkdayClassification } from '@time-tracker/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDefaultWorkSchedule } from '../settings/workSchedule';
import { buildReport, filterReportEntries } from './report';

const originalTimezone = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'Europe/Madrid';
});

afterAll(() => {
  process.env.TZ = originalTimezone;
});

function entry(
  id: string,
  taskId: string,
  title: string,
  startedAt: Date,
  endedAt: Date | null,
): HistoryEntry {
  return {
    id,
    taskId,
    groupId: null,
    category: null,
    tags: [],
    startedAt: startedAt.toISOString(),
    endedAt: endedAt?.toISOString() ?? null,
    note: null,
    confirmedAt: endedAt?.toISOString() ?? null,
    checkDueAt: null,
    verificationState: 'confirmed',
    notes: [],
    correctionCount: 0,
    lastCorrectedAt: null,
    group: null,
    task: {
      id: taskId,
      externalId: null,
      groupId: null,
      category: null,
      tags: [],
      title,
      description: null,
      color: null,
      archivedAt: null,
      createdAt: startedAt.toISOString(),
      updatedAt: startedAt.toISOString(),
    },
  };
}

describe('date-range reports', () => {
  it('splits entries at local midnight and groups totals by day and task', () => {
    const first = entry(
      'entry-1',
      'task-1',
      'Build report',
      new Date(2026, 6, 15, 23, 30),
      new Date(2026, 6, 16, 1, 0),
    );
    const second = entry(
      'entry-2',
      'task-2',
      'Review',
      new Date(2026, 6, 16, 9, 0),
      new Date(2026, 6, 16, 10, 0),
    );

    const report = buildReport([first, second], {
      startDate: '2026-07-15',
      endDate: '2026-07-16',
    });

    expect(report.totalMs).toBe(2.5 * 60 * 60 * 1000);
    expect(report.days.map((day) => day.totalMs)).toEqual([30 * 60 * 1000, 2 * 60 * 60 * 1000]);
    expect(report.tasks.map(({ task, totalMs }) => [task.title, totalMs])).toEqual([
      ['Build report', 1.5 * 60 * 60 * 1000],
      ['Review', 60 * 60 * 1000],
    ]);
  });

  it('uses actual elapsed time across a daylight-saving boundary', () => {
    const dstDay = entry(
      'entry-dst',
      'task-1',
      'Long shift',
      new Date(2026, 2, 29, 0, 0),
      new Date(2026, 2, 30, 0, 0),
    );
    const report = buildReport([dstDay], {
      startDate: '2026-03-29',
      endDate: '2026-03-29',
    });
    expect(report.totalMs).toBe(23 * 60 * 60 * 1000);
  });

  it('clips a running entry to now', () => {
    const running = entry('running', 'task-1', 'Running', new Date(2026, 6, 15, 9), null);
    const report = buildReport(
      [running],
      { startDate: '2026-07-15', endDate: '2026-07-15' },
      new Date(2026, 6, 15, 10, 30).getTime(),
    );
    expect(report.totalMs).toBe(1.5 * 60 * 60 * 1000);
  });

  it('keeps one task separated by its historical group attribution', () => {
    const first = entry(
      'entry-1',
      'task-1',
      'Consulting',
      new Date(2026, 6, 15, 9),
      new Date(2026, 6, 15, 10),
    );
    const second = entry(
      'entry-2',
      'task-1',
      'Consulting',
      new Date(2026, 6, 15, 10),
      new Date(2026, 6, 15, 12),
    );
    first.groupId = 'client-a';
    first.group = {
      id: 'client-a',
      name: 'Client A',
      description: null,
      color: 'blue',
      archivedAt: null,
      createdAt: first.startedAt,
      updatedAt: first.startedAt,
    };
    second.groupId = 'client-b';
    second.group = { ...first.group, id: 'client-b', name: 'Client B' };

    const report = buildReport([first, second], {
      startDate: '2026-07-15',
      endDate: '2026-07-15',
    });

    expect(report.groups.map(({ group, totalMs }) => [group?.name, totalMs])).toEqual([
      ['Client B', 2 * 60 * 60 * 1000],
      ['Client A', 60 * 60 * 1000],
    ]);
    expect(report.tasks).toHaveLength(2);
  });

  it('reconciles tracked time and classified non-worked time from one daily calculator', () => {
    const date = '2026-07-15';
    const at = (hours: number, minutes = 0) => new Date(2026, 6, 15, hours, minutes);
    const schedule = createDefaultWorkSchedule();
    schedule.enabled = true;
    const classifications: WorkdayClassification[] = [
      ['break', 11, 0, 11, 30],
      ['personal_away', 11, 30, 12, 0],
      ['distraction', 12, 0, 12, 15],
      ['ignored', 12, 15, 13, 0],
    ].map(([category, startHour, startMinute, endHour, endMinute], index) => ({
      id: `classification-${index}`,
      category: category as WorkdayClassification['category'],
      startedAt: at(Number(startHour), Number(startMinute)).toISOString(),
      endedAt: at(Number(endHour), Number(endMinute)).toISOString(),
      note: null,
      createdAt: at(Number(startHour), Number(startMinute)).toISOString(),
      updatedAt: at(Number(endHour), Number(endMinute)).toISOString(),
    }));
    const entries = [
      entry('morning', 'task-1', 'Work', at(9), at(11)),
      entry('afternoon', 'task-1', 'Work', at(14), at(15)),
      entry('beyond', 'task-1', 'Work', at(18), at(19)),
    ];

    const report = buildReport(entries, { startDate: date, endDate: date }, at(20).getTime(), {
      schedule,
      classifications,
    });
    const day = report.days[0]!;

    expect(day).toMatchObject({
      totalMs: 4 * 60 * 60 * 1000,
      scheduledMs: 8 * 60 * 60 * 1000,
      adjustedScheduledMs: 7.25 * 60 * 60 * 1000,
      trackedInScheduleMs: 3 * 60 * 60 * 1000,
      trackedBeyondScheduleMs: 60 * 60 * 1000,
      plannedBreakMs: 60 * 60 * 1000,
      breakMs: 0.5 * 60 * 60 * 1000,
      personalAwayMs: 0.5 * 60 * 60 * 1000,
      distractionMs: 0.25 * 60 * 60 * 1000,
      ignoredMs: 0.75 * 60 * 60 * 1000,
      unclassifiedMs: 3 * 60 * 60 * 1000,
      nonWorkedMs: 4.25 * 60 * 60 * 1000,
    });
    expect(day.totalMs).toBe(day.trackedInScheduleMs + day.trackedBeyondScheduleMs);
    expect(day.nonWorkedMs).toBe(
      day.breakMs + day.personalAwayMs + day.distractionMs + day.unclassifiedMs,
    );
    expect(report.workday.trackedInScheduleMs).toBe(day.trackedInScheduleMs);
  });

  it('marks current-day schedule metrics as incomplete', () => {
    const schedule = createDefaultWorkSchedule();
    schedule.enabled = true;
    const now = new Date(2026, 6, 15, 12);
    const report = buildReport(
      [entry('morning', 'task-1', 'Work', new Date(2026, 6, 15, 9), new Date(2026, 6, 15, 10))],
      { startDate: '2026-07-15', endDate: '2026-07-15' },
      now.getTime(),
      { schedule, classifications: [] },
    );

    expect(report.days[0]).toMatchObject({ incomplete: true, nonWorkedMs: 2 * 60 * 60 * 1000 });
    expect(report.workday.incompleteDayCount).toBe(1);
  });

  it('reconciles exclusive categories while keeping tag totals explicitly overlapping', () => {
    const first = entry(
      'first',
      'task-1',
      'Work',
      new Date(2026, 6, 15, 9),
      new Date(2026, 6, 15, 10),
    );
    first.category = { id: 'development', name: 'Development', color: 'blue' };
    first.tags = [
      { id: 'billable', name: 'Billable', color: 'green' },
      { id: 'focus', name: 'Focus', color: null },
    ];
    const second = entry(
      'second',
      'task-2',
      'Meeting',
      new Date(2026, 6, 15, 10),
      new Date(2026, 6, 15, 11),
    );
    second.category = { id: 'meeting', name: 'Meeting', color: 'amber' };
    second.tags = [{ id: 'billable', name: 'Billable', color: 'green' }];

    const report = buildReport([first, second], {
      startDate: '2026-07-15',
      endDate: '2026-07-15',
    });

    expect(report.categories.reduce((sum, item) => sum + item.totalMs, 0)).toBe(report.totalMs);
    expect(report.tags.find((item) => item.tag.id === 'billable')?.totalMs).toBe(report.totalMs);
    expect(report.tags.reduce((sum, item) => sum + item.totalMs, 0)).toBeGreaterThan(
      report.totalMs,
    );
  });

  it('filters category and tag scopes without changing entry durations', () => {
    const categorized = entry(
      'categorized',
      'task-1',
      'Work',
      new Date(2026, 6, 15, 9),
      new Date(2026, 6, 15, 10),
    );
    categorized.category = { id: 'development', name: 'Development', color: null };
    categorized.tags = [{ id: 'billable', name: 'Billable', color: null }];
    const other = entry(
      'other',
      'task-2',
      'Other',
      new Date(2026, 6, 15, 10),
      new Date(2026, 6, 15, 12),
    );
    const filtered = filterReportEntries([categorized, other], {
      categoryId: 'development',
      tagId: 'billable',
    });
    const report = buildReport(filtered, {
      startDate: '2026-07-15',
      endDate: '2026-07-15',
    });

    expect(filtered.map((item) => item.id)).toEqual(['categorized']);
    expect(report.totalMs).toBe(60 * 60 * 1000);
    expect(report.workday.trackedBeyondScheduleMs).toBe(0);
  });

  it('keeps renamed historical label snapshots distinct while preserving category reconciliation', () => {
    const beforeRename = entry(
      'before',
      'task-1',
      'Work',
      new Date(2026, 6, 15, 9),
      new Date(2026, 6, 15, 10),
    );
    const afterRename = entry(
      'after',
      'task-1',
      'Work',
      new Date(2026, 6, 15, 10),
      new Date(2026, 6, 15, 11),
    );
    beforeRename.category = { id: 'client-work', name: 'Client work', color: null };
    afterRename.category = { id: 'client-work', name: 'Billable work', color: null };
    const report = buildReport([beforeRename, afterRename], {
      startDate: '2026-07-15',
      endDate: '2026-07-15',
    });

    expect(report.categories.map((item) => item.category?.name)).toEqual([
      'Billable work',
      'Client work',
    ]);
    expect(report.categories.reduce((sum, item) => sum + item.totalMs, 0)).toBe(report.totalMs);
  });

  it('keeps historical task-title snapshots distinct across a rename', () => {
    const beforeRename = entry(
      'before-title',
      'task-1',
      'Old task title',
      new Date(2026, 6, 15, 9),
      new Date(2026, 6, 15, 10),
    );
    const afterRename = entry(
      'after-title',
      'task-1',
      'New task title',
      new Date(2026, 6, 15, 10),
      new Date(2026, 6, 15, 11),
    );
    const report = buildReport([beforeRename, afterRename], {
      startDate: '2026-07-15',
      endDate: '2026-07-15',
    });

    expect(report.tasks.map((item) => item.task.title)).toEqual([
      'New task title',
      'Old task title',
    ]);
    expect(report.tasks.reduce((sum, item) => sum + item.totalMs, 0)).toBe(report.totalMs);
  });

  it('applies the current schedule historically without mutating persisted records', () => {
    const at = (hours: number) => new Date(2026, 6, 15, hours);
    const historicalEntry = entry('entry-1', 'task-1', 'Work', at(9), at(10));
    const historicalClassification: WorkdayClassification = {
      id: 'classification-1',
      category: 'personal_away',
      startedAt: at(10).toISOString(),
      endedAt: at(11).toISOString(),
      note: 'Appointment',
      createdAt: at(11).toISOString(),
      updatedAt: at(11).toISOString(),
    };
    const persistedBefore = structuredClone({ historicalEntry, historicalClassification });
    const originalSchedule = createDefaultWorkSchedule();
    originalSchedule.enabled = true;
    const revisedSchedule = structuredClone(originalSchedule);
    revisedSchedule.days.wednesday = [{ id: 'revised', start: '09:00', end: '12:00' }];

    const original = buildReport(
      [historicalEntry],
      { startDate: '2026-07-15', endDate: '2026-07-15' },
      at(20).getTime(),
      { schedule: originalSchedule, classifications: [historicalClassification] },
    );
    const revised = buildReport(
      [historicalEntry],
      { startDate: '2026-07-15', endDate: '2026-07-15' },
      at(20).getTime(),
      { schedule: revisedSchedule, classifications: [historicalClassification] },
    );

    expect(original.days[0]?.scheduledMs).toBe(8 * 60 * 60 * 1000);
    expect(revised.days[0]?.scheduledMs).toBe(3 * 60 * 60 * 1000);
    expect(revised.days[0]?.totalMs).toBe(original.days[0]?.totalMs);
    expect({ historicalEntry, historicalClassification }).toEqual(persistedBefore);
  });
});
