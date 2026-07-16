export type Group = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GroupDraft = {
  name: string;
  description: string | null;
  color: string | null;
};

export type WorkCategory = {
  id: string;
  name: string;
  color: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkTag = WorkCategory;

export type WorkLabelDraft = {
  name: string;
  color: string | null;
};

export type EntryCategory = Pick<WorkCategory, 'id' | 'name' | 'color'>;
export type EntryTag = Pick<WorkTag, 'id' | 'name' | 'color'>;

export type Task = {
  id: string;
  externalId: string | null;
  groupId: string | null;
  category: WorkCategory | null;
  tags: WorkTag[];
  title: string;
  description: string | null;
  color: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskDraft = {
  /** Optional, editable user-facing task identifier. */
  externalId?: string | null;
  groupId: string | null;
  categoryId?: string | null;
  tagIds?: string[];
  title: string;
  description: string | null;
  color: string | null;
};

export type WorkNoteExtraData = {
  timeSpentMs?: number;
  [key: string]: unknown;
};

export type WorkNote = {
  id: string;
  timeEntryId: string;
  content: string;
  extraData: WorkNoteExtraData;
  createdAt: string;
  updatedAt: string;
};

export type WorkNoteDraft = {
  content: string;
  extraData: WorkNoteExtraData;
};

export type TimeEntry = {
  id: string;
  taskId: string;
  groupId: string | null;
  category: EntryCategory | null;
  tags: EntryTag[];
  startedAt: string;
  endedAt: string | null;
  note: string | null;
  confirmedAt: string | null;
  checkDueAt: string | null;
  verificationState: 'confirmed' | 'pending';
  notes: WorkNote[];
};

export type RunningTimer = TimeEntry & { task: Task; group: Group | null };

export type RecentEntry = Pick<TimeEntry, 'id' | 'startedAt' | 'endedAt'> & {
  task: Pick<Task, 'id' | 'externalId' | 'title' | 'color'>;
  group: Pick<Group, 'id' | 'name' | 'color'> | null;
};

export type HistoryEntry = TimeEntry & {
  task: Task;
  group: Group | null;
  correctionCount: number;
  lastCorrectedAt: string | null;
};

export type TimeEntryDraft = {
  taskId: string;
  categoryId?: string | null;
  tagIds?: string[];
  startedAt: string;
  endedAt: string | null;
  note: string | null;
};

export type TimeEntryCorrectionDraft = TimeEntryDraft & { reason: string };

export type TimeEntryCorrectionSnapshot = {
  taskId: string;
  taskExternalId: string | null;
  taskTitle: string;
  groupId: string | null;
  groupName: string | null;
  category: EntryCategory | null;
  tags: EntryTag[];
  startedAt: string;
  endedAt: string | null;
  note: string | null;
};

export type TimeEntryCorrection = {
  id: string;
  timeEntryId: string;
  reason: string;
  before: TimeEntryCorrectionSnapshot;
  after: TimeEntryCorrectionSnapshot;
  createdAt: string;
};

export type FinalizedReportPeriod = {
  id: string;
  startDate: string;
  endDate: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
  schedule: WeeklyWorkSchedule;
  schedulesByDate: Record<string, WeeklyWorkSchedule>;
  finalizedAt: string;
  unlockedAt: string | null;
  unlockReason: string | null;
};

export type TimerSnapshot = {
  status: 'loading' | 'ready' | 'error';
  running: RunningTimer | null;
  error: string | null;
};

export type ThemeMode = 'system' | 'light' | 'dark';
export type TrayTimeMode = 'session' | 'task-total';

export type ReportExportField =
  | 'exported_at'
  | 'date'
  | 'group'
  | 'group_id'
  | 'task'
  | 'task_id'
  | 'internal_task_id'
  | 'category'
  | 'category_id'
  | 'tags'
  | 'tag_ids'
  | 'started_at'
  | 'ended_at'
  | 'duration'
  | 'note_count'
  | 'work_notes'
  | 'note'
  | 'day_status'
  | 'scheduled_duration'
  | 'adjusted_scheduled_duration'
  | 'tracked_in_schedule_duration'
  | 'tracked_beyond_schedule_duration'
  | 'planned_break_duration'
  | 'additional_break_duration'
  | 'personal_away_duration'
  | 'distraction_duration'
  | 'ignored_duration'
  | 'unclassified_duration'
  | 'non_worked_duration'
  | 'coverage';

export type ReportExportValueFormat =
  | 'text'
  | 'iso-date'
  | 'iso-datetime'
  | 'local-datetime'
  | 'milliseconds'
  | 'decimal-hours'
  | 'hh:mm:ss'
  | 'integer'
  | 'json'
  | 'percentage';

export type ReportExportColumn = {
  id: string;
  field: ReportExportField;
  header: string;
  format: ReportExportValueFormat;
  visible: boolean;
};

export type WorkCheckSettings = {
  enabled: boolean;
  intervalMinutes: number;
  graceMinutes: number;
  notificationsEnabled: boolean;
};

export const weekdays = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type Weekday = (typeof weekdays)[number];

export type WorkBlock = {
  id: string;
  start: string;
  end: string;
};

export type DaySchedule = WorkBlock[];

export type WeeklyWorkSchedule = {
  enabled: boolean;
  days: Record<Weekday, DaySchedule>;
};

export type WorkScheduleRevision = {
  id: string;
  effectiveFrom: string;
  schedule: WeeklyWorkSchedule;
  createdAt: string;
  sequence: number;
  reason: string | null;
};

export type WorkScheduleOverride = {
  id: string;
  date: string;
  name: string;
  blocks: WorkBlock[];
  createdAt: string;
  sequence: number;
};

export type WorkScheduleOverrideEvent = {
  id: string;
  date: string;
  action: 'set' | 'remove';
  name: string | null;
  blocks: WorkBlock[] | null;
  createdAt: string;
  sequence: number;
};

export type DailyWorkdaySummary = {
  date: string;
  enabled: boolean;
  scheduledDay: boolean;
  scheduledMs: number;
  elapsedScheduledMs: number;
  trackedTotalMs: number;
  trackedScheduledMs: number;
  nonWorkedMs: number;
  remainingScheduledMs: number;
  plannedBreakMs: number;
  overtimeMs: number;
  coverageRatio: number | null;
  nonWorkedRatio: number | null;
  currentlyScheduled: boolean;
  currentGapMs: number;
  firstTrackedAt: string | null;
  lastTrackedAt: string | null;
};

export const workdayClassificationCategories = [
  'break',
  'personal_away',
  'distraction',
  'ignored',
] as const;

export type WorkdayClassificationCategory = (typeof workdayClassificationCategories)[number];

export type WorkdayClassification = {
  id: string;
  category: WorkdayClassificationCategory;
  startedAt: string;
  endedAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkdayClassificationDraft = Pick<
  WorkdayClassification,
  'category' | 'startedAt' | 'endedAt' | 'note'
>;

export type WorkdayClassificationSnapshot = {
  status: 'loading' | 'ready' | 'error';
  running: WorkdayClassification | null;
  error: string | null;
};

export type WorkdayGap = {
  startedAt: string;
  endedAt: string;
  durationMs: number;
};

export type WorkdayReminderSettings = {
  enabled: boolean;
  gapMinutes: number;
  snoozeMinutes: number;
};

export type WorkdayReminderState = {
  status: 'idle' | 'pending';
  gapStartedAt: string | null;
  durationMs: number;
};

export type WorkCheckState = {
  status: 'idle' | 'scheduled' | 'pending';
  entryId: string | null;
  deadline: string | null;
  reason: 'interval' | 'recovery' | null;
};
