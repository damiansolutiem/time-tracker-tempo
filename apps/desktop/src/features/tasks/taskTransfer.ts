import type { Group, Task } from '@time-tracker/domain';

export type TaskImportRow = {
  rowNumber: number;
  externalId: string | null;
  title: string;
  groupName: string | null;
  categoryName: string | null;
  tagNames: string[];
  description: string | null;
  color: string | null;
  archived: boolean;
};

export type TaskImportResult = {
  imported: number;
  groupsCreated: number;
  categoriesCreated: number;
  tagsCreated: number;
  errors: { rowNumber: number; message: string }[];
};

const columns = [
  'task_id',
  'internal_id',
  'title',
  'group',
  'category',
  'tags',
  'description',
  'color',
  'status',
] as const;

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function cleanCell(value: string | undefined) {
  const cleaned = (value ?? '').trim();
  return /^'[=+\-@]/.test(cleaned) ? cleaned.slice(1) : cleaned;
}

function parseArchived(value: string) {
  return ['archived', 'true', 'yes', '1', 'inactive'].includes(value.trim().toLowerCase());
}

function tableToRows(table: string[][]): TaskImportRow[] {
  const firstPopulated = table.findIndex((row) => row.some((cell) => cell.trim()));
  if (firstPopulated < 0) throw new Error('The import is empty.');
  const headers = table[firstPopulated] ?? [];
  const indexes = new Map(headers.map((header, index) => [normalizeHeader(header), index]));
  const titleIndex = indexes.get('title') ?? indexes.get('task') ?? indexes.get('tasktitle');
  if (titleIndex === undefined) {
    throw new Error('A title column is required. Include a header row with at least “title”.');
  }
  const value = (row: string[], ...names: string[]) => {
    for (const name of names) {
      const index = indexes.get(name);
      if (index !== undefined) return cleanCell(row[index]);
    }
    return '';
  };
  return table
    .slice(firstPopulated + 1)
    .map((row, offset) => {
      const status = value(row, 'status', 'archived', 'inactive');
      return {
        rowNumber: firstPopulated + offset + 2,
        externalId: value(row, 'taskid', 'id', 'code', 'externalid') || null,
        title: cleanCell(row[titleIndex]),
        groupName:
          value(
            row,
            'group',
            'groupname',
            'client',
            'clientname',
            'department',
            'departmentname',
          ) || null,
        categoryName: value(row, 'category', 'categoryname', 'type', 'worktype') || null,
        tagNames: value(row, 'tags', 'tag', 'labels')
          .split(/[|;]/)
          .map((item) => item.trim())
          .filter(Boolean),
        description: value(row, 'description', 'details', 'notes') || null,
        color: value(row, 'color', 'colour') || null,
        archived: parseArchived(status),
      };
    })
    .filter(
      (row) =>
        row.title ||
        row.externalId ||
        row.groupName ||
        row.categoryName ||
        row.tagNames.length ||
        row.description,
    );
}

export function parseDelimitedTasks(source: string): TaskImportRow[] {
  const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = firstLine.includes('\t')
    ? '\t'
    : firstLine.includes(';') && !firstLine.includes(',')
      ? ';'
      : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  row.push(cell);
  rows.push(row);
  return tableToRows(rows);
}

export async function parseTaskWorkbook(buffer: ArrayBuffer) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('The workbook has no worksheets.');
  const table: string[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (excelRow) => {
    const values: string[] = [];
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      values.push(excelRow.getCell(column).text);
    }
    table.push(values);
  });
  return tableToRows(table);
}

function csvText(value: string) {
  const protectedValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

function exportRows(tasks: Task[], groups: Group[]) {
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  return tasks.map((task) => [
    task.externalId ?? '',
    task.id,
    task.title,
    task.groupId ? (groupsById.get(task.groupId)?.name ?? '') : '',
    task.category?.name ?? '',
    task.tags.map((tag) => tag.name).join(' | '),
    task.description ?? '',
    task.color ?? '',
    task.archivedAt ? 'archived' : 'active',
  ]);
}

export function serializeTasksCsv(tasks: Task[], groups: Group[]) {
  return [columns, ...exportRows(tasks, groups)]
    .map((row) => row.map((value) => csvText(value)).join(','))
    .join('\r\n');
}

export async function serializeTasksWorkbook(tasks: Task[], groups: Group[]) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tempo';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet('Tasks', { views: [{ state: 'frozen', ySplit: 1 }] });
  worksheet.addRow(columns);
  for (const row of exportRows(tasks, groups)) worksheet.addRow(row);
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF287A55' } };
  worksheet.autoFilter = { from: 'A1', to: 'I1' };
  worksheet.columns = [
    { width: 24 },
    { width: 24 },
    { width: 32 },
    { width: 38 },
    { width: 34 },
    { width: 24 },
    { width: 44 },
    { width: 14 },
    { width: 14 },
  ];
  return workbook.xlsx.writeBuffer();
}
