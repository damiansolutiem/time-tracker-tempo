import type {
  HistoryEntry,
  EntryTag,
  ReportExportColumn,
  ReportExportField,
  WorkNote,
} from '@time-tracker/domain';
import { localDayBounds, shiftLocalDate } from '../history/day';
import {
  buildReport,
  type ReportAccountingInput,
  type ReportDayTotal,
  type ReportRange,
} from './report';
import { defaultReportExportColumns } from './reportExportConfiguration';

export type ReportExportRow = {
  exportedAt: string;
  date: string;
  groupId: string;
  group: string;
  taskId: string;
  internalTaskId: string;
  task: string;
  categoryId: string;
  category: string;
  tags: EntryTag[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
  notes: WorkNote[];
  note: string;
  day: ReportDayTotal;
};

function canonicalEntryRow(row: ReportExportRow): Omit<ReportExportRow, 'day'> {
  return {
    exportedAt: row.exportedAt,
    date: row.date,
    groupId: row.groupId,
    group: row.group,
    taskId: row.taskId,
    internalTaskId: row.internalTaskId,
    task: row.task,
    categoryId: row.categoryId,
    category: row.category,
    tags: row.tags,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationMs: row.durationMs,
    notes: row.notes,
    note: row.note,
  };
}

export function buildReportExportRows(
  entries: HistoryEntry[],
  range: ReportRange,
  now = Date.now(),
  accounting?: ReportAccountingInput,
): ReportExportRow[] {
  const rows: ReportExportRow[] = [];
  const days = new Map(
    buildReport(entries, range, now, accounting).days.map((day) => [day.date, day]),
  );
  for (let date = range.startDate; ; date = shiftLocalDate(date, 1)) {
    const day = localDayBounds(date);
    for (const entry of entries) {
      const startedAt = Math.max(new Date(entry.startedAt).getTime(), day.start.getTime());
      const endedAt = Math.min(
        entry.endedAt ? new Date(entry.endedAt).getTime() : now,
        day.end.getTime(),
      );
      if (endedAt <= startedAt) continue;
      rows.push({
        exportedAt: new Date(now).toISOString(),
        date,
        groupId: entry.groupId ?? '',
        group: entry.group?.name ?? '',
        taskId: entry.task.externalId ?? '',
        internalTaskId: entry.taskId,
        task: entry.task.title,
        categoryId: entry.category?.id ?? '',
        category: entry.category?.name ?? '',
        tags: entry.tags,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
        durationMs: endedAt - startedAt,
        notes: entry.notes,
        note: entry.note ?? '',
        day: days.get(date)!,
      });
    }
    if (date === range.endDate) break;
  }
  return rows;
}

function csvText(value: string) {
  const spreadsheetSafe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${spreadsheetSafe.replaceAll('"', '""')}"`;
}

function rawField(row: ReportExportRow, field: ReportExportField) {
  const values = {
    exported_at: row.exportedAt,
    date: row.date,
    group: row.group,
    group_id: row.groupId,
    task: row.task,
    task_id: row.taskId,
    internal_task_id: row.internalTaskId,
    category: row.category,
    category_id: row.categoryId,
    tags: row.tags.map((tag) => tag.name).join(' | '),
    tag_ids: row.tags.map((tag) => tag.id).join(' | '),
    started_at: row.startedAt,
    ended_at: row.endedAt,
    duration: row.durationMs,
    note_count: row.notes.length,
    work_notes: row.notes,
    note: row.note,
    day_status: row.day.incomplete ? 'in-progress' : 'complete',
    scheduled_duration: row.day.scheduledMs,
    adjusted_scheduled_duration: row.day.adjustedScheduledMs,
    tracked_in_schedule_duration: row.day.trackedInScheduleMs,
    tracked_beyond_schedule_duration: row.day.trackedBeyondScheduleMs,
    planned_break_duration: row.day.plannedBreakMs,
    additional_break_duration: row.day.breakMs,
    personal_away_duration: row.day.personalAwayMs,
    distraction_duration: row.day.distractionMs,
    ignored_duration: row.day.ignoredMs,
    unclassified_duration: row.day.unclassifiedMs,
    non_worked_duration: row.day.nonWorkedMs,
    coverage: row.day.coverageRatio ?? 0,
  } satisfies Record<ReportExportField, unknown>;
  return values[field];
}

export function formatReportExportValue(
  row: ReportExportRow,
  column: Pick<ReportExportColumn, 'field' | 'format'>,
): string | number {
  const value = rawField(row, column.field);
  const textValue = typeof value === 'string' ? value : '';
  switch (column.format) {
    case 'milliseconds':
      return Number(value);
    case 'decimal-hours':
      return Number((Number(value) / 3_600_000).toFixed(6));
    case 'hh:mm:ss': {
      const seconds = Math.floor(Number(value) / 1000);
      const hours = Math.floor(seconds / 3600);
      return `${String(hours).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }
    case 'integer':
      return Math.round(Number(value));
    case 'json':
      return JSON.stringify(value);
    case 'percentage':
      return `${(Number(value) * 100).toFixed(2)}%`;
    case 'local-datetime':
      return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(textValue));
    case 'iso-date':
      return column.field === 'date' ? textValue : new Date(textValue).toISOString().slice(0, 10);
    case 'iso-datetime':
      return new Date(textValue).toISOString();
    case 'text':
      if (Array.isArray(value)) return value.map((note: WorkNote) => note.content).join(' | ');
      if (typeof value === 'number' || typeof value === 'boolean') return `${value}`;
      return textValue;
  }
}

function csvHeader(value: string) {
  return /[",\r\n]/.test(value) ? csvText(value) : value;
}

export function serializeReportCsv(rows: ReportExportRow[], columns = defaultReportExportColumns) {
  const visibleColumns = columns.filter((column) => column.visible);
  const header = visibleColumns.map((column) => csvHeader(column.header)).join(',');
  const lines = rows.map((row) =>
    visibleColumns
      .map((column) => {
        const value = formatReportExportValue(row, column);
        if (typeof value === 'number') return String(value);
        const forceQuote = [
          'group',
          'task',
          'task_id',
          'category',
          'tags',
          'work_notes',
          'note',
        ].includes(column.field);
        return forceQuote || /[",\r\n]/.test(value) || /^[=+\-@]/.test(value)
          ? csvText(value)
          : value;
      })
      .join(','),
  );
  return `\uFEFF${[header, ...lines].join('\r\n')}\r\n`;
}

export function serializeReportJson(
  entries: HistoryEntry[],
  range: ReportRange,
  now = Date.now(),
  accounting?: ReportAccountingInput,
) {
  const rows = buildReportExportRows(entries, range, now, accounting);
  const report = buildReport(entries, range, now, accounting);
  return JSON.stringify(
    {
      format: 'tempo-report',
      version: 7,
      exportedAt: new Date(now).toISOString(),
      range,
      totalMs: report.totalMs,
      activeDayCount: report.activeDayCount,
      entrySegmentCount: rows.length,
      workday: report.workday,
      days: report.days,
      groupTotals: report.groups.map(({ group, totalMs, tasks }) => ({
        groupId: group?.id ?? null,
        group: group?.name ?? null,
        totalMs,
        tasks: tasks.map(({ task, totalMs: taskTotalMs }) => ({
          taskId: task.externalId,
          internalTaskId: task.id,
          task: task.title,
          totalMs: taskTotalMs,
        })),
      })),
      categoryTotals: report.categories.map(({ category, totalMs }) => ({ category, totalMs })),
      tagTotals: report.tags.map(({ tag, totalMs }) => ({ tag, totalMs })),
      entries: rows.map(canonicalEntryRow),
      classifications: accounting?.classifications ?? [],
      schedulesByDate: accounting?.schedulesByDate ?? null,
    },
    null,
    2,
  );
}

export async function serializeReportWorkbook(
  entries: HistoryEntry[],
  range: ReportRange,
  now = Date.now(),
  columns = defaultReportExportColumns,
  accounting?: ReportAccountingInput,
) {
  const { default: ExcelJS } = await import('exceljs');
  const rows = buildReportExportRows(entries, range, now, accounting);
  const visibleColumns = columns.filter((column) => column.visible);
  const report = buildReport(entries, range, now, accounting);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tempo';
  workbook.created = new Date(now);

  const summary = workbook.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 9 }] });
  summary.addRows([
    ['Tempo report'],
    ['From', range.startDate],
    ['Through', range.endDate],
    ['Generated at', new Date(now).toISOString()],
    ['Total hours', report.totalMs / 3_600_000],
    ['Active days', report.activeDayCount],
    ['Entry segments', rows.length],
    [],
    ['Group', 'Task', 'Task ID', 'Internal task ID', 'Hours'],
  ]);
  for (const group of report.groups) {
    for (const task of group.tasks) {
      summary.addRow([
        group.group?.name ?? 'Ungrouped',
        task.task.title,
        task.task.externalId ?? '',
        task.task.id,
        task.totalMs / 3_600_000,
      ]);
    }
  }
  summary.getRow(1).font = { bold: true, size: 16 };
  summary.getRow(9).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summary.getRow(9).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF287A55' },
  };
  summary.getColumn(4).width = 38;
  summary.columns = [
    { width: 24 },
    { width: 34 },
    { width: 20 },
    { width: 38 },
    { width: 14, style: { numFmt: '0.00' } },
  ];
  summary.getCell('G1').value = 'Workday context';
  summary.getCell('G1').font = { bold: true, size: 14 };
  const workdaySummaryRows: [string, string | number][] = [
    ['Planned hours', report.workday.scheduledMs / 3_600_000],
    ['Adjusted plan hours', report.workday.adjustedScheduledMs / 3_600_000],
    ['Tracked in plan hours', report.workday.trackedInScheduleMs / 3_600_000],
    ['Tracked beyond plan hours', report.workday.trackedBeyondScheduleMs / 3_600_000],
    ['Non-worked hours', report.workday.nonWorkedMs / 3_600_000],
    ['Unclassified hours', report.workday.unclassifiedMs / 3_600_000],
    ['Distraction hours', report.workday.distractionMs / 3_600_000],
    ['Coverage', report.workday.coverageRatio ?? ''],
  ];
  workdaySummaryRows.forEach(([label, value], index) => {
    summary.getCell(index + 2, 7).value = label;
    summary.getCell(index + 2, 8).value = value;
  });
  summary.getColumn(7).width = 28;
  summary.getColumn(8).width = 16;
  summary.getColumn(8).numFmt = '0.00';
  summary.getCell('H9').numFmt = '0.00%';

  const categoryTotals = workbook.addWorksheet('Category totals', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  categoryTotals.addRow(['Category ID', 'Category', 'Hours']);
  for (const item of report.categories) {
    categoryTotals.addRow([
      item.category?.id ?? '',
      item.category?.name ?? 'Uncategorized',
      item.totalMs / 3_600_000,
    ]);
  }
  categoryTotals.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  categoryTotals.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF287A55' },
  };
  categoryTotals.columns = [{ width: 38 }, { width: 30 }, { width: 16, style: { numFmt: '0.00' } }];

  const tagTotals = workbook.addWorksheet('Tag totals', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  tagTotals.addRow(['Tag ID', 'Tag', 'Hours', 'Accounting note']);
  for (const item of report.tags) {
    tagTotals.addRow([
      item.tag.id,
      item.tag.name,
      item.totalMs / 3_600_000,
      'Non-additive: entries with multiple tags appear in multiple totals',
    ]);
  }
  tagTotals.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  tagTotals.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF287A55' },
  };
  tagTotals.columns = [
    { width: 38 },
    { width: 30 },
    { width: 16, style: { numFmt: '0.00' } },
    { width: 58 },
  ];

  const daily = workbook.addWorksheet('Daily summary', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  daily.addRow([
    'Date',
    'Status',
    'Tracked hours',
    'Planned hours',
    'Adjusted plan hours',
    'Elapsed adjusted plan hours',
    'Tracked in plan hours',
    'Tracked beyond plan hours',
    'Planned break hours',
    'Additional break hours',
    'Personal/away hours',
    'Distraction hours',
    'Ignored hours',
    'Unclassified hours',
    'Non-worked hours',
    'Coverage',
  ]);
  for (const day of report.days) {
    daily.addRow([
      day.date,
      day.incomplete ? 'In progress' : 'Complete',
      day.totalMs / 3_600_000,
      day.scheduledMs / 3_600_000,
      day.adjustedScheduledMs / 3_600_000,
      day.elapsedAdjustedScheduledMs / 3_600_000,
      day.trackedInScheduleMs / 3_600_000,
      day.trackedBeyondScheduleMs / 3_600_000,
      day.plannedBreakMs / 3_600_000,
      day.breakMs / 3_600_000,
      day.personalAwayMs / 3_600_000,
      day.distractionMs / 3_600_000,
      day.ignoredMs / 3_600_000,
      day.unclassifiedMs / 3_600_000,
      day.nonWorkedMs / 3_600_000,
      day.coverageRatio ?? '',
    ]);
  }
  daily.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  daily.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF287A55' },
  };
  daily.autoFilter = { from: 'A1', to: 'P1' };
  daily.columns = [
    { width: 14 },
    { width: 14 },
    ...Array.from({ length: 13 }, () => ({ width: 22, style: { numFmt: '0.00' } })),
    { width: 14, style: { numFmt: '0.00%' } },
  ];

  if (accounting) {
    const schedules = workbook.addWorksheet('Schedule context', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    schedules.addRow(['Date', 'Coverage enabled', 'Resolved schedule JSON']);
    for (const day of report.days) {
      const schedule = accounting.schedulesByDate?.[day.date] ?? accounting.schedule;
      schedules.addRow([day.date, schedule.enabled ? 'Yes' : 'No', JSON.stringify(schedule)]);
    }
    schedules.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    schedules.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF287A55' },
    };
    schedules.autoFilter = { from: 'A1', to: 'C1' };
    schedules.columns = [{ width: 14 }, { width: 18 }, { width: 100 }];
  }

  const details = workbook.addWorksheet('Time entries', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  details.addRow(visibleColumns.map((column) => column.header));
  for (const row of rows) {
    details.addRow(visibleColumns.map((column) => formatReportExportValue(row, column)));
  }
  details.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  details.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF287A55' },
  };
  details.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: visibleColumns.length },
  };
  details.columns = visibleColumns.map((column) => ({
    width: Math.min(48, Math.max(14, column.header.length + 4)),
    ...(column.format === 'decimal-hours' ? { style: { numFmt: '0.000000' } } : {}),
    ...(column.format === 'percentage' ? { style: { numFmt: '0.00%' } } : {}),
  }));

  const workNotes = workbook.addWorksheet('Work notes', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  workNotes.addRow([
    'Note ID',
    'Internal entry ID',
    'Task',
    'Task ID',
    'Internal task ID',
    'Content',
    'Added at',
    'Modified at',
    'Time spent hours',
    'Extra data JSON',
  ]);
  for (const entry of entries) {
    for (const note of entry.notes) {
      workNotes.addRow([
        note.id,
        entry.id,
        entry.task.title,
        entry.task.externalId ?? '',
        entry.task.id,
        note.content,
        note.createdAt,
        note.updatedAt,
        note.extraData.timeSpentMs ? note.extraData.timeSpentMs / 3_600_000 : '',
        JSON.stringify(note.extraData),
      ]);
    }
  }
  workNotes.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  workNotes.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF287A55' },
  };
  workNotes.autoFilter = { from: 'A1', to: 'J1' };
  workNotes.columns = [
    { width: 38 },
    { width: 38 },
    { width: 34 },
    { width: 20 },
    { width: 38 },
    { width: 52 },
    { width: 26 },
    { width: 26 },
    { width: 18, style: { numFmt: '0.00' } },
    { width: 40 },
  ];

  const classifications = workbook.addWorksheet('Classifications', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  classifications.addRow([
    'Classification ID',
    'Category',
    'Started at',
    'Ended at',
    'Duration hours',
    'Note',
    'Created at',
    'Modified at',
  ]);
  for (const item of accounting?.classifications ?? []) {
    const end = item.endedAt ? new Date(item.endedAt).getTime() : now;
    classifications.addRow([
      item.id,
      item.category,
      item.startedAt,
      item.endedAt ?? '',
      Math.max(0, end - new Date(item.startedAt).getTime()) / 3_600_000,
      item.note ?? '',
      item.createdAt,
      item.updatedAt,
    ]);
  }
  classifications.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  classifications.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF287A55' },
  };
  classifications.autoFilter = { from: 'A1', to: 'H1' };
  classifications.columns = [
    { width: 38 },
    { width: 20 },
    { width: 26 },
    { width: 26 },
    { width: 18, style: { numFmt: '0.00' } },
    { width: 42 },
    { width: 26 },
    { width: 26 },
  ];

  return workbook.xlsx.writeBuffer();
}
