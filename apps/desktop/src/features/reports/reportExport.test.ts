import type { HistoryEntry, WorkdayClassification } from '@time-tracker/domain';
import { describe, expect, it } from 'vitest';
import { createDefaultWorkSchedule } from '../settings/workSchedule';
import { buildReport, filterReportEntries } from './report';
import {
  buildReportExportRows,
  serializeReportCsv,
  serializeReportJson,
  serializeReportWorkbook,
} from './reportExport';

function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 'entry-1',
    taskId: 'task-1',
    groupId: null,
    category: null,
    tags: [],
    startedAt: new Date(2026, 6, 15, 23, 30).toISOString(),
    endedAt: new Date(2026, 6, 16, 1, 0).toISOString(),
    note: 'A note, with a comma',
    confirmedAt: null,
    checkDueAt: null,
    verificationState: 'confirmed',
    notes: [],
    correctionCount: 0,
    lastCorrectedAt: null,
    group: null,
    task: {
      id: 'task-1',
      externalId: 'ACME-104',
      groupId: null,
      category: null,
      tags: [],
      title: 'Build "reports"',
      description: null,
      color: null,
      archivedAt: null,
      createdAt: new Date(2026, 6, 15).toISOString(),
      updatedAt: new Date(2026, 6, 15).toISOString(),
    },
    ...overrides,
  };
}

const range = { startDate: '2026-07-15', endDate: '2026-07-16' };
const workNote = {
  id: 'note-1',
  timeEntryId: 'entry-1',
  content: 'Reviewed proposal',
  extraData: { timeSpentMs: 7_200_000, category: 'review' },
  createdAt: '2026-07-15T22:00:00.000Z',
  updatedAt: '2026-07-15T22:30:00.000Z',
};

describe('report exports', () => {
  it('splits rows by local day so exported durations equal the report', () => {
    const rows = buildReportExportRows([entry()], range);
    expect(rows.map(({ date, durationMs }) => [date, durationMs])).toEqual([
      ['2026-07-15', 30 * 60 * 1000],
      ['2026-07-16', 60 * 60 * 1000],
    ]);
  });

  it('escapes CSV values and neutralizes spreadsheet formulas', () => {
    const rows = buildReportExportRows(
      [entry({ note: '=HYPERLINK("unsafe")', task: { ...entry().task, title: 'A, B' } })],
      range,
    );
    const csv = serializeReportCsv(rows);
    expect(csv).toContain('"A, B"');
    expect(csv).toContain('internal_task_id');
    expect(csv).toContain('"ACME-104"');
    expect(csv).toContain('"\'=HYPERLINK(""unsafe"")"');
    expect(csv.startsWith('\uFEFFdate,group,group_id,task,')).toBe(true);
  });

  it('includes exact report totals in JSON', () => {
    const parsed = JSON.parse(
      serializeReportJson([entry()], range, new Date(2026, 6, 17).getTime()),
    ) as { totalMs: number; entrySegmentCount: number };
    expect(parsed.totalMs).toBe(90 * 60 * 1000);
    expect(parsed.entrySegmentCount).toBe(2);
  });

  it('exports entry snapshots and matching category/tag totals', async () => {
    const categorized = entry({
      category: { id: 'category-1', name: 'Development', color: 'blue' },
      tags: [
        { id: 'tag-1', name: 'Billable', color: 'green' },
        { id: 'tag-2', name: 'Focus', color: null },
      ],
    });
    const rows = buildReportExportRows([categorized], range);
    const csv = serializeReportCsv(rows);
    expect(csv).toContain('category,category_id,tags,tag_ids');
    expect(csv).toContain('"Development"');
    expect(csv).toContain('"Billable | Focus"');

    const json = JSON.parse(serializeReportJson([categorized], range)) as {
      version: number;
      categoryTotals: { category: { id: string }; totalMs: number }[];
      tagTotals: { tag: { id: string }; totalMs: number }[];
    };
    expect(json.version).toBe(7);
    expect(json.categoryTotals[0]?.category.id).toBe('category-1');
    expect(json.tagTotals).toHaveLength(2);

    const workbook = await serializeReportWorkbook([categorized], range);
    const { default: ExcelJS } = await import('exceljs');
    const parsed = new ExcelJS.Workbook();
    await parsed.xlsx.load(workbook);
    expect(parsed.getWorksheet('Category totals')).toBeDefined();
    expect(parsed.getWorksheet('Tag totals')).toBeDefined();
  });

  it('keeps filtered report and export totals identical', () => {
    const matching = entry({
      id: 'matching',
      category: { id: 'development', name: 'Development', color: null },
      tags: [{ id: 'billable', name: 'Billable', color: null }],
    });
    const excluded = entry({ id: 'excluded', taskId: 'task-2' });
    const filtered = filterReportEntries([matching, excluded], {
      categoryId: 'development',
      tagId: 'billable',
    });
    const report = buildReport(filtered, range);
    const rows = buildReportExportRows(filtered, range);

    expect(rows.reduce((sum, row) => sum + row.durationMs, 0)).toBe(report.totalMs);
    expect(filtered.map((item) => item.id)).toEqual(['matching']);
  });

  it('includes report generation time in configurable row exports', () => {
    const generatedAt = new Date(2026, 6, 17, 12).getTime();
    const rows = buildReportExportRows([entry()], range, generatedAt);
    const csv = serializeReportCsv(rows, [
      {
        id: 'generated',
        field: 'exported_at',
        header: 'Generated At',
        format: 'iso-datetime',
        visible: true,
      },
    ]);
    expect(csv).toContain(new Date(generatedAt).toISOString());
  });

  it('uses configured names, order, and formats for integration CSV', () => {
    const rows = buildReportExportRows([entry()], range);
    const csv = serializeReportCsv(rows, [
      { id: 'ticket', field: 'task_id', header: 'Ticket Number', format: 'text', visible: true },
      { id: 'hidden', field: 'task', header: 'Hidden Task', format: 'text', visible: false },
      {
        id: 'hours',
        field: 'duration',
        header: 'Hours Worked',
        format: 'decimal-hours',
        visible: true,
      },
      { id: 'when', field: 'started_at', header: 'Started', format: 'iso-datetime', visible: true },
    ]);
    expect(csv.startsWith('\uFEFFTicket Number,Hours Worked,Started\r\n')).toBe(true);
    expect(csv).toContain('"ACME-104",0.5,');
    expect(csv).not.toContain('internal_task_id');
    expect(csv).not.toContain('Hidden Task');
  });

  it('includes structured work notes in CSV and JSON entry segments', () => {
    const annotated = entry({ notes: [workNote] });
    const rows = buildReportExportRows([annotated], range);
    expect(serializeReportCsv(rows)).toContain('work_notes_json');
    expect(serializeReportCsv(rows)).toContain('Reviewed proposal');
    const parsed = JSON.parse(serializeReportJson([annotated], range)) as {
      entries: { notes: { extraData: { timeSpentMs: number; category: string } }[] }[];
    };
    expect(parsed.entries[0]?.notes[0]?.extraData).toEqual({
      timeSpentMs: 7_200_000,
      category: 'review',
    });
  });

  it('includes the historically captured group in every export row', () => {
    const grouped = entry({
      groupId: 'client-a',
      group: {
        id: 'client-a',
        name: 'Client A',
        description: null,
        color: 'blue',
        archivedAt: null,
        createdAt: '2026-07-15T00:00:00.000Z',
        updatedAt: '2026-07-15T00:00:00.000Z',
      },
    });
    const rows = buildReportExportRows([grouped], range);
    expect(rows[0]).toMatchObject({ groupId: 'client-a', group: 'Client A' });
    expect(serializeReportCsv(rows)).toContain('"Client A",client-a');
  });

  it('creates an Excel report with summary and detailed entry sheets', async () => {
    const { default: ExcelJS } = await import('exceljs');
    const buffer = await serializeReportWorkbook(
      [entry({ notes: [workNote] })],
      range,
      new Date(2026, 6, 17).getTime(),
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    expect(workbook.getWorksheet('Summary')?.getCell('A1').text).toBe('Tempo report');
    expect(workbook.getWorksheet('Time entries')?.getCell('E2').text).toBe('ACME-104');
    expect(workbook.getWorksheet('Time entries')?.getCell('F2').text).toBe('task-1');
    expect(workbook.getWorksheet('Work notes')?.getCell('F2').text).toBe('Reviewed proposal');
    expect(workbook.getWorksheet('Work notes')?.getCell('I2').value).toBe(2);
  });

  it('uses configured columns in the Excel time-entry sheet', async () => {
    const { default: ExcelJS } = await import('exceljs');
    const buffer = await serializeReportWorkbook(
      [entry()],
      range,
      new Date(2026, 6, 17).getTime(),
      [
        {
          id: 'hours',
          field: 'duration',
          header: 'Billable Hours',
          format: 'decimal-hours',
          visible: true,
        },
        {
          id: 'hidden',
          field: 'task',
          header: 'Hidden Task',
          format: 'text',
          visible: false,
        },
        {
          id: 'ticket',
          field: 'task_id',
          header: 'External Ticket',
          format: 'text',
          visible: true,
        },
      ],
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const details = workbook.getWorksheet('Time entries');
    expect(details?.getCell('A1').text).toBe('Billable Hours');
    expect(details?.getCell('B1').text).toBe('External Ticket');
    expect(details?.getCell('C1').value).toBeNull();
    expect(details?.getCell('A2').value).toBe(0.5);
    expect(details?.getCell('B2').text).toBe('ACME-104');
  });

  it('keeps JSON and Excel workday totals in parity with the report calculator', async () => {
    const { default: ExcelJS } = await import('exceljs');
    const dayRange = { startDate: '2026-07-15', endDate: '2026-07-15' };
    const now = new Date(2026, 6, 15, 13).getTime();
    const schedule = createDefaultWorkSchedule();
    schedule.enabled = true;
    const classification: WorkdayClassification = {
      id: 'break-1',
      category: 'break',
      startedAt: new Date(2026, 6, 15, 10).toISOString(),
      endedAt: new Date(2026, 6, 15, 10, 30).toISOString(),
      note: 'Coffee',
      createdAt: new Date(2026, 6, 15, 10).toISOString(),
      updatedAt: new Date(2026, 6, 15, 10, 30).toISOString(),
    };
    const dayEntry = entry({
      startedAt: new Date(2026, 6, 15, 9).toISOString(),
      endedAt: new Date(2026, 6, 15, 10).toISOString(),
    });
    const accounting = { schedule, classifications: [classification] };
    const report = buildReport([dayEntry], dayRange, now, accounting);
    const parsed = JSON.parse(serializeReportJson([dayEntry], dayRange, now, accounting)) as {
      workday: typeof report.workday;
      days: typeof report.days;
      classifications: WorkdayClassification[];
    };

    expect(parsed.workday).toEqual(report.workday);
    expect(parsed.days).toEqual(report.days);
    expect(parsed.classifications).toEqual([classification]);

    const buffer = await serializeReportWorkbook([dayEntry], dayRange, now, undefined, accounting);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    expect(workbook.getWorksheet('Daily summary')?.getCell('J2').value).toBe(0.5);
    expect(workbook.getWorksheet('Daily summary')?.getCell('O2').value).toBe(
      report.days[0]!.nonWorkedMs / 3_600_000,
    );
    expect(workbook.getWorksheet('Classifications')?.getCell('B2').text).toBe('break');
    expect(workbook.getWorksheet('Schedule context')?.getCell('A2').text).toBe('2026-07-15');
  });

  it('keeps report and JSON schedule totals identical across effective-date changes', () => {
    const revisionRange = { startDate: '2026-07-15', endDate: '2026-07-16' };
    const firstSchedule = createDefaultWorkSchedule();
    firstSchedule.enabled = true;
    const secondSchedule = createDefaultWorkSchedule();
    secondSchedule.enabled = true;
    secondSchedule.days.thursday = [{ id: 'short-thursday', start: '10:00', end: '12:00' }];
    const accounting = {
      schedule: firstSchedule,
      schedulesByDate: {
        '2026-07-15': firstSchedule,
        '2026-07-16': secondSchedule,
      },
      classifications: [],
    };
    const entries = [
      entry({
        id: 'day-one',
        startedAt: new Date(2026, 6, 15, 9).toISOString(),
        endedAt: new Date(2026, 6, 15, 10).toISOString(),
      }),
      entry({
        id: 'day-two',
        startedAt: new Date(2026, 6, 16, 10).toISOString(),
        endedAt: new Date(2026, 6, 16, 11).toISOString(),
      }),
    ];
    const now = new Date(2026, 6, 17).getTime();
    const report = buildReport(entries, revisionRange, now, accounting);
    const json = JSON.parse(serializeReportJson(entries, revisionRange, now, accounting)) as {
      workday: typeof report.workday;
      days: typeof report.days;
    };

    expect(report.days.map((day) => day.scheduledMs)).toEqual([
      8 * 60 * 60 * 1000,
      2 * 60 * 60 * 1000,
    ]);
    expect(json.workday).toEqual(report.workday);
    expect(json.days).toEqual(report.days);
  });

  it('supports optional repeated daily context fields in integration rows', () => {
    const dayRange = { startDate: '2026-07-15', endDate: '2026-07-15' };
    const now = new Date(2026, 6, 15, 12).getTime();
    const schedule = createDefaultWorkSchedule();
    schedule.enabled = true;
    const dayEntry = entry({
      startedAt: new Date(2026, 6, 15, 9).toISOString(),
      endedAt: new Date(2026, 6, 15, 10).toISOString(),
    });
    const rows = buildReportExportRows([dayEntry], dayRange, now, {
      schedule,
      classifications: [],
    });
    const csv = serializeReportCsv(rows, [
      { id: 'status', field: 'day_status', header: 'Status', format: 'text', visible: true },
      {
        id: 'non-worked',
        field: 'non_worked_duration',
        header: 'Non-worked hours',
        format: 'decimal-hours',
        visible: true,
      },
      {
        id: 'coverage',
        field: 'coverage',
        header: 'Coverage',
        format: 'percentage',
        visible: true,
      },
    ]);

    expect(csv).toContain('in-progress,2,33.33%');
  });
});
