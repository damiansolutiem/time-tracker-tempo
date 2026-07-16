import type {
  ReportExportColumn,
  ReportExportField,
  ReportExportValueFormat,
} from '@time-tracker/domain';

type FieldDefinition = {
  field: ReportExportField;
  label: string;
  defaultHeader: string;
  defaultFormat: ReportExportValueFormat;
  formats: ReportExportValueFormat[];
};

export const exportFieldDefinitions: FieldDefinition[] = [
  {
    field: 'exported_at',
    label: 'Report generated at',
    defaultHeader: 'exported_at',
    defaultFormat: 'iso-datetime',
    formats: ['iso-datetime', 'local-datetime', 'text'],
  },
  {
    field: 'date',
    label: 'Entry date',
    defaultHeader: 'date',
    defaultFormat: 'iso-date',
    formats: ['iso-date', 'text'],
  },
  {
    field: 'group',
    label: 'Group name',
    defaultHeader: 'group',
    defaultFormat: 'text',
    formats: ['text'],
  },
  {
    field: 'group_id',
    label: 'Internal group ID',
    defaultHeader: 'group_id',
    defaultFormat: 'text',
    formats: ['text'],
  },
  {
    field: 'task',
    label: 'Task name',
    defaultHeader: 'task',
    defaultFormat: 'text',
    formats: ['text'],
  },
  {
    field: 'task_id',
    label: 'Task ID',
    defaultHeader: 'task_id',
    defaultFormat: 'text',
    formats: ['text'],
  },
  {
    field: 'internal_task_id',
    label: 'Internal task ID',
    defaultHeader: 'internal_task_id',
    defaultFormat: 'text',
    formats: ['text'],
  },
  {
    field: 'category',
    label: 'Category name',
    defaultHeader: 'category',
    defaultFormat: 'text',
    formats: ['text'],
  },
  {
    field: 'category_id',
    label: 'Internal category ID',
    defaultHeader: 'category_id',
    defaultFormat: 'text',
    formats: ['text'],
  },
  {
    field: 'tags',
    label: 'Tag names',
    defaultHeader: 'tags',
    defaultFormat: 'text',
    formats: ['text'],
  },
  {
    field: 'tag_ids',
    label: 'Internal tag IDs',
    defaultHeader: 'tag_ids',
    defaultFormat: 'text',
    formats: ['text'],
  },
  {
    field: 'started_at',
    label: 'Started at',
    defaultHeader: 'started_at',
    defaultFormat: 'iso-datetime',
    formats: ['iso-datetime', 'local-datetime', 'text'],
  },
  {
    field: 'ended_at',
    label: 'Ended at',
    defaultHeader: 'ended_at',
    defaultFormat: 'iso-datetime',
    formats: ['iso-datetime', 'local-datetime', 'text'],
  },
  {
    field: 'duration',
    label: 'Duration',
    defaultHeader: 'duration_ms',
    defaultFormat: 'milliseconds',
    formats: ['milliseconds', 'decimal-hours', 'hh:mm:ss'],
  },
  {
    field: 'note_count',
    label: 'Work-note count',
    defaultHeader: 'note_count',
    defaultFormat: 'integer',
    formats: ['integer', 'text'],
  },
  {
    field: 'work_notes',
    label: 'Work notes',
    defaultHeader: 'work_notes_json',
    defaultFormat: 'json',
    formats: ['json', 'text'],
  },
  {
    field: 'note',
    label: 'Legacy entry note',
    defaultHeader: 'note',
    defaultFormat: 'text',
    formats: ['text'],
  },
  {
    field: 'day_status',
    label: 'Day status',
    defaultHeader: 'day_status',
    defaultFormat: 'text',
    formats: ['text'],
  },
  ...[
    ['scheduled_duration', 'Day: planned duration', 'day_planned_ms'],
    ['adjusted_scheduled_duration', 'Day: adjusted plan duration', 'day_adjusted_plan_ms'],
    ['tracked_in_schedule_duration', 'Day: tracked in plan', 'day_tracked_in_plan_ms'],
    ['tracked_beyond_schedule_duration', 'Day: tracked beyond plan', 'day_tracked_beyond_plan_ms'],
    ['planned_break_duration', 'Day: planned break duration', 'day_planned_break_ms'],
    ['additional_break_duration', 'Day: additional break duration', 'day_additional_break_ms'],
    ['personal_away_duration', 'Day: personal/away duration', 'day_personal_away_ms'],
    ['distraction_duration', 'Day: distraction duration', 'day_distraction_ms'],
    ['ignored_duration', 'Day: ignored duration', 'day_ignored_ms'],
    ['unclassified_duration', 'Day: unclassified duration', 'day_unclassified_ms'],
    ['non_worked_duration', 'Day: non-worked duration', 'day_non_worked_ms'],
  ].map(([field, label, defaultHeader]) => ({
    field: field as ReportExportField,
    label: label!,
    defaultHeader: defaultHeader!,
    defaultFormat: 'milliseconds' as const,
    formats: ['milliseconds', 'decimal-hours', 'hh:mm:ss'] as ReportExportValueFormat[],
  })),
  {
    field: 'coverage',
    label: 'Day: elapsed plan coverage',
    defaultHeader: 'day_coverage_percent',
    defaultFormat: 'percentage',
    formats: ['percentage', 'text'],
  },
];

export const exportFormatLabels: Record<ReportExportValueFormat, string> = {
  text: 'Text',
  'iso-date': 'ISO date (YYYY-MM-DD)',
  'iso-datetime': 'ISO date and time',
  'local-datetime': 'Local date and time',
  milliseconds: 'Milliseconds',
  'decimal-hours': 'Decimal hours',
  'hh:mm:ss': 'HH:MM:SS',
  integer: 'Whole number',
  json: 'JSON',
  percentage: 'Percentage',
};

const defaultColumnTuples: [ReportExportField, string, ReportExportValueFormat][] = [
  ['date', 'date', 'iso-date'],
  ['group', 'group', 'text'],
  ['group_id', 'group_id', 'text'],
  ['task', 'task', 'text'],
  ['task_id', 'task_id', 'text'],
  ['internal_task_id', 'internal_task_id', 'text'],
  ['category', 'category', 'text'],
  ['category_id', 'category_id', 'text'],
  ['tags', 'tags', 'text'],
  ['tag_ids', 'tag_ids', 'text'],
  ['started_at', 'started_at', 'iso-datetime'],
  ['ended_at', 'ended_at', 'iso-datetime'],
  ['duration', 'duration_ms', 'milliseconds'],
  ['duration', 'duration_hours', 'decimal-hours'],
  ['note_count', 'note_count', 'integer'],
  ['work_notes', 'work_notes_json', 'json'],
  ['note', 'note', 'text'],
  ['exported_at', 'exported_at', 'iso-datetime'],
];

export const defaultReportExportColumns: ReportExportColumn[] = defaultColumnTuples.map(
  ([field, header, format], index) => ({
    id: `default-${index + 1}`,
    field,
    header,
    format,
    visible: true,
  }),
);

export function definitionFor(field: ReportExportField) {
  return exportFieldDefinitions.find((definition) => definition.field === field)!;
}

export function normalizeReportExportColumns(value: unknown): ReportExportColumn[] {
  if (!Array.isArray(value)) return defaultReportExportColumns;
  const normalized = value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Partial<ReportExportColumn>;
    const definition = exportFieldDefinitions.find(({ field }) => field === candidate.field);
    if (!definition || !candidate.format || !definition.formats.includes(candidate.format))
      return [];
    const header = typeof candidate.header === 'string' ? candidate.header.trim() : '';
    if (!header) return [];
    return [
      {
        id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `column-${index}`,
        field: definition.field,
        header,
        format: candidate.format,
        visible: candidate.visible !== false,
      },
    ];
  });
  return normalized.length ? normalized : defaultReportExportColumns;
}
