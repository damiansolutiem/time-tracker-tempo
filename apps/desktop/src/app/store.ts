import type {
  Group,
  GroupDraft,
  FinalizedReportPeriod,
  HistoryEntry,
  RecentEntry,
  ReportExportColumn,
  Task,
  TaskDraft,
  TimeEntryCorrectionDraft,
  TimerSnapshot,
  TrayTimeMode,
  WeeklyWorkSchedule,
  WorkScheduleOverride,
  WorkScheduleOverrideEvent,
  WorkScheduleRevision,
  WorkdayClassification,
  WorkdayClassificationDraft,
  WorkdayClassificationSnapshot,
  WorkdayReminderSettings,
  WorkdayReminderState,
  WorkCheckSettings,
  WorkCheckState,
  WorkNoteDraft,
  WorkCategory,
  WorkLabelDraft,
  WorkTag,
} from '@time-tracker/domain';
import { localDateKey, localDayBounds } from '../features/history/day';
import { HistoryRepository } from '../features/history/historyRepository';
import { GroupRepository } from '../features/groups/groupRepository';
import { WorkNoteRepository } from '../features/notes/workNoteRepository';
import {
  currentMonthRange,
  validateReportRange,
  type ReportRange,
} from '../features/reports/report';
import { ReportRepository } from '../features/reports/reportRepository';
import { FinalizedPeriodRepository } from '../features/reports/finalizedPeriodRepository';
import { ReportExportSettingsRepository } from '../features/reports/reportExportSettingsRepository';
import { defaultReportExportColumns } from '../features/reports/reportExportConfiguration';
import { TaskRepository } from '../features/tasks/taskRepository';
import { TaxonomyRepository } from '../features/taxonomy/taxonomyRepository';
import type { TaskImportResult, TaskImportRow } from '../features/tasks/taskTransfer';
import { SettingsRepository } from '../features/settings/settingsRepository';
import { defaultWorkSchedule } from '../features/settings/workSchedule';
import { WorkSchedulePolicyRepository } from '../features/settings/workSchedulePolicyRepository';
import {
  resolveWorkScheduleForDate,
  resolveWorkSchedulesForRange,
} from '../features/settings/workSchedulePolicy';
import { TimerCoordinator } from '../features/timer/TimerCoordinator';
import { SqliteTimeEntryRepository } from '../features/timer/timeEntryRepository';
import { WorkCheckCoordinator } from '../features/work-check/WorkCheckCoordinator';
import { SqliteWorkCheckRepository } from '../features/work-check/workCheckRepository';
import { getRuntimeSessionId } from '../infrastructure/runtimeSession';
import { WorkdayClassificationCoordinator } from '../features/workday/WorkdayClassificationCoordinator';
import { SqliteWorkdayClassificationRepository } from '../features/workday/workdayClassificationRepository';
import { calculateTrackedDayFacts } from '../features/workday/workdayCoverage';
import { buildUnclassifiedScheduledGaps } from '../features/workday/workdayGaps';
import {
  evaluateWorkdayReminder,
  type PersistedReminderState,
} from '../features/workday/workdayReminder';

type Listener = () => void;

export type AppSnapshot = {
  status: 'loading' | 'ready' | 'error';
  groups: Group[];
  archivedGroups: Group[];
  tasks: Task[];
  archivedTasks: Task[];
  categories: WorkCategory[];
  archivedCategories: WorkCategory[];
  tags: WorkTag[];
  archivedTags: WorkTag[];
  recentTasks: Task[];
  recentEntries: RecentEntry[];
  workdayDate: string;
  workdayEntries: HistoryEntry[];
  workdayClassifications: WorkdayClassification[];
  historyDate: string;
  historyEntries: HistoryEntry[];
  historyClassifications: WorkdayClassification[];
  historyStatus: 'loading' | 'ready' | 'error';
  historyError: string | null;
  reportRange: ReportRange;
  reportEntries: HistoryEntry[];
  reportClassifications: WorkdayClassification[];
  finalizedReportPeriods: FinalizedReportPeriod[];
  reportStatus: 'loading' | 'ready' | 'error';
  reportError: string | null;
  reportExportColumns: ReportExportColumn[];
  timer: TimerSnapshot;
  classificationTimer: WorkdayClassificationSnapshot;
  workdayReminderSettings: WorkdayReminderSettings;
  workdayReminder: WorkdayReminderState;
  workCheckSettings: WorkCheckSettings;
  workSchedule: WeeklyWorkSchedule;
  workScheduleRevisions: WorkScheduleRevision[];
  workScheduleOverrides: WorkScheduleOverride[];
  workScheduleOverrideEvents: WorkScheduleOverrideEvent[];
  workCheck: WorkCheckState;
  todayTotalMs: number;
  currentTaskTotalMs: number;
  totalCapturedAt: number;
  trayTimeModeDefault: TrayTimeMode;
  trayTimeModeOverride: { entryId: string; mode: TrayTimeMode } | null;
  error: string | null;
};

const taskRepository = new TaskRepository();
const taxonomyRepository = new TaxonomyRepository();
const groupRepository = new GroupRepository();
const workNoteRepository = new WorkNoteRepository();
const entryRepository = new SqliteTimeEntryRepository();
const historyRepository = new HistoryRepository();
const reportRepository = new ReportRepository();
const finalizedPeriodRepository = new FinalizedPeriodRepository();
const reportExportSettingsRepository = new ReportExportSettingsRepository();
const settingsRepository = new SettingsRepository();
const workSchedulePolicyRepository = new WorkSchedulePolicyRepository();
const classificationRepository = new SqliteWorkdayClassificationRepository();
export const timerCoordinator = new TimerCoordinator(entryRepository);
export const classificationCoordinator = new WorkdayClassificationCoordinator(
  classificationRepository,
);
const workCheckCoordinator = new WorkCheckCoordinator(
  entryRepository,
  new SqliteWorkCheckRepository(),
);

const defaultWorkCheckSettings: WorkCheckSettings = {
  enabled: true,
  intervalMinutes: 60,
  graceMinutes: 5,
  notificationsEnabled: true,
};

class TempoStore {
  private snapshot: AppSnapshot = {
    status: 'loading',
    groups: [],
    archivedGroups: [],
    tasks: [],
    archivedTasks: [],
    categories: [],
    archivedCategories: [],
    tags: [],
    archivedTags: [],
    recentTasks: [],
    recentEntries: [],
    workdayDate: localDateKey(),
    workdayEntries: [],
    workdayClassifications: [],
    historyDate: localDateKey(),
    historyEntries: [],
    historyClassifications: [],
    historyStatus: 'loading',
    historyError: null,
    reportRange: currentMonthRange(),
    reportEntries: [],
    reportClassifications: [],
    finalizedReportPeriods: [],
    reportStatus: 'loading',
    reportError: null,
    reportExportColumns: defaultReportExportColumns,
    timer: timerCoordinator.getSnapshot(),
    classificationTimer: classificationCoordinator.getSnapshot(),
    workdayReminderSettings: { enabled: false, gapMinutes: 15, snoozeMinutes: 15 },
    workdayReminder: { status: 'idle', gapStartedAt: null, durationMs: 0 },
    workCheckSettings: defaultWorkCheckSettings,
    workSchedule: defaultWorkSchedule,
    workScheduleRevisions: [],
    workScheduleOverrides: [],
    workScheduleOverrideEvents: [],
    workCheck: { status: 'idle', entryId: null, deadline: null, reason: null },
    todayTotalMs: 0,
    currentTaskTotalMs: 0,
    totalCapturedAt: Date.now(),
    trayTimeModeDefault: 'session',
    trayTimeModeOverride: null,
    error: null,
  };
  private readonly listeners = new Set<Listener>();
  private initialization: Promise<void> | null = null;
  private historyRequest = 0;
  private reportRequest = 0;
  private workCheckOperation: Promise<void> = Promise.resolve();
  private reminderPersisted: PersistedReminderState = {
    gapStartedAt: null,
    nextReminderAt: null,
  };

  constructor() {
    timerCoordinator.subscribe(() => {
      this.setSnapshot({ ...this.snapshot, timer: timerCoordinator.getSnapshot() });
    });
    classificationCoordinator.subscribe(() => {
      this.setSnapshot({
        ...this.snapshot,
        classificationTimer: classificationCoordinator.getSnapshot(),
      });
    });
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  initialize() {
    this.initialization ??= this.load();
    return this.initialization;
  }

  async createTask(draft: TaskDraft) {
    const task = await taskRepository.create(draft);
    await this.refreshCollections();
    return task;
  }

  async createCategory(draft: WorkLabelDraft) {
    const category = await taxonomyRepository.createCategory(draft);
    await this.refreshCollections();
    return category;
  }

  async updateCategory(id: string, draft: WorkLabelDraft) {
    await taxonomyRepository.updateCategory(id, draft);
    await this.refreshCollections();
  }

  async archiveCategory(id: string, archived: boolean) {
    await taxonomyRepository.archiveCategory(id, archived);
    await this.refreshCollections();
  }

  async createTag(draft: WorkLabelDraft) {
    const tag = await taxonomyRepository.createTag(draft);
    await this.refreshCollections();
    return tag;
  }

  async updateTag(id: string, draft: WorkLabelDraft) {
    await taxonomyRepository.updateTag(id, draft);
    await this.refreshCollections();
  }

  async archiveTag(id: string, archived: boolean) {
    await taxonomyRepository.archiveTag(id, archived);
    await this.refreshCollections();
  }

  async importTasks(rows: TaskImportRow[]): Promise<TaskImportResult> {
    const groups = [
      ...(await groupRepository.list()),
      ...(await groupRepository.list({ archived: true })),
    ];
    const groupsByName = new Map(
      groups.map((group) => [group.name.trim().toLocaleLowerCase(), group]),
    );
    const categories = [
      ...(await taxonomyRepository.listCategories()),
      ...(await taxonomyRepository.listCategories({ archived: true })),
    ];
    const tags = [
      ...(await taxonomyRepository.listTags()),
      ...(await taxonomyRepository.listTags({ archived: true })),
    ];
    const categoriesByName = new Map(
      categories.map((category) => [category.name.trim().toLocaleLowerCase(), category]),
    );
    const tagsByName = new Map(tags.map((tag) => [tag.name.trim().toLocaleLowerCase(), tag]));
    const knownTaskIds = new Set(
      [...(await taskRepository.list()), ...(await taskRepository.list({ archived: true }))]
        .map((task) => task.externalId?.toLocaleLowerCase())
        .filter((id): id is string => Boolean(id)),
    );
    const errors: TaskImportResult['errors'] = [];
    let imported = 0;
    let groupsCreated = 0;
    let categoriesCreated = 0;
    let tagsCreated = 0;
    for (const row of rows) {
      try {
        if (!row.title.trim()) throw new Error('Title is required.');
        if (row.externalId && knownTaskIds.has(row.externalId.trim().toLocaleLowerCase())) {
          throw new Error(`A task with ID "${row.externalId.trim()}" already exists.`);
        }
        if (row.color && !['green', 'blue', 'amber', 'red'].includes(row.color.toLowerCase())) {
          throw new Error('Color must be green, blue, amber, or red.');
        }
        let groupId: string | null = null;
        if (row.groupName) {
          const key = row.groupName.trim().toLocaleLowerCase();
          let group = groupsByName.get(key);
          if (group?.archivedAt) throw new Error(`Group "${group.name}" is archived.`);
          if (!group) {
            group = await groupRepository.create({
              name: row.groupName,
              description: null,
              color: null,
            });
            groupsByName.set(key, group);
            groupsCreated += 1;
          }
          groupId = group.id;
        }
        let categoryId: string | null = null;
        if (row.categoryName) {
          const key = row.categoryName.trim().toLocaleLowerCase();
          let category = categoriesByName.get(key);
          if (category?.archivedAt) throw new Error(`Category "${category.name}" is archived.`);
          if (!category) {
            category = await taxonomyRepository.createCategory({
              name: row.categoryName,
              color: null,
            });
            categoriesByName.set(key, category);
            categoriesCreated += 1;
          }
          categoryId = category.id;
        }
        const tagIds: string[] = [];
        for (const tagName of row.tagNames) {
          const key = tagName.trim().toLocaleLowerCase();
          let tag = tagsByName.get(key);
          if (tag?.archivedAt) throw new Error(`Tag "${tag.name}" is archived.`);
          if (!tag) {
            tag = await taxonomyRepository.createTag({ name: tagName, color: null });
            tagsByName.set(key, tag);
            tagsCreated += 1;
          }
          tagIds.push(tag.id);
        }
        const task = await taskRepository.create({
          externalId: row.externalId,
          groupId,
          categoryId,
          tagIds,
          title: row.title,
          description: row.description,
          color: row.color?.toLowerCase() || 'green',
        });
        if (row.archived) await taskRepository.setArchived(task.id, true);
        if (task.externalId) knownTaskIds.add(task.externalId.toLocaleLowerCase());
        imported += 1;
      } catch (error) {
        errors.push({
          rowNumber: row.rowNumber,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    await this.refreshCollections();
    return { imported, groupsCreated, categoriesCreated, tagsCreated, errors };
  }

  async createGroup(draft: GroupDraft) {
    const group = await groupRepository.create(draft);
    await this.refreshCollections();
    return group;
  }

  async updateGroup(id: string, draft: GroupDraft) {
    await groupRepository.update(id, draft);
    await Promise.all([
      this.refreshCollections(),
      timerCoordinator.refresh(),
      this.refreshHistory(),
      this.refreshReport(),
    ]);
  }

  async archiveGroup(id: string) {
    await groupRepository.setArchived(id, true);
    await Promise.all([
      this.refreshCollections(),
      timerCoordinator.refresh(),
      this.refreshHistory(),
      this.refreshReport(),
    ]);
  }

  async restoreGroup(id: string) {
    await groupRepository.setArchived(id, false);
    await Promise.all([
      this.refreshCollections(),
      timerCoordinator.refresh(),
      this.refreshHistory(),
      this.refreshReport(),
    ]);
  }

  async updateTask(id: string, draft: TaskDraft) {
    await taskRepository.update(id, draft);
    await Promise.all([
      this.refreshCollections(),
      timerCoordinator.refresh(),
      this.refreshHistory(),
      this.refreshReport(),
    ]);
  }

  async archiveTask(id: string) {
    if (this.snapshot.timer.running?.taskId === id) await timerCoordinator.stop();
    await taskRepository.setArchived(id, true);
    await Promise.all([this.refreshCollections(), this.refreshHistory(), this.refreshReport()]);
  }

  async restoreTask(id: string) {
    await taskRepository.setArchived(id, false);
    await Promise.all([this.refreshCollections(), this.refreshHistory(), this.refreshReport()]);
  }

  async startTask(id: string, expectedEntryId?: string) {
    const startedAt = new Date();
    await classificationCoordinator.stop(startedAt);
    await timerCoordinator.start(id, {
      ...(expectedEntryId ? { expectedEntryId } : {}),
      startedAt,
    });
    this.setSnapshot({
      ...this.snapshot,
      trayTimeModeOverride: null,
      workdayReminder: { status: 'idle', gapStartedAt: null, durationMs: 0 },
    });
    await this.reconcileWorkCheck();
    await Promise.all([this.refreshCollections(), this.refreshHistory(), this.refreshReport()]);
  }

  async stopTimer(expectedEntryId?: string) {
    await timerCoordinator.stop(expectedEntryId ? { expectedEntryId } : undefined);
    this.setSnapshot({
      ...this.snapshot,
      workCheck: { status: 'idle', entryId: null, deadline: null, reason: null },
      trayTimeModeOverride: null,
    });
    await Promise.all([this.refreshCollections(), this.refreshHistory(), this.refreshReport()]);
  }

  async startBreak() {
    const startedAt = new Date();
    await classificationCoordinator.startBreak(startedAt);
    await timerCoordinator.refresh();
    this.setSnapshot({
      ...this.snapshot,
      workCheck: { status: 'idle', entryId: null, deadline: null, reason: null },
      trayTimeModeOverride: null,
      workdayReminder: { status: 'idle', gapStartedAt: null, durationMs: 0 },
    });
    await Promise.all([this.refreshCollections(), this.refreshHistory(), this.refreshReport()]);
  }

  async stopBreak() {
    await classificationCoordinator.stop();
    await Promise.all([this.refreshCollections(), this.refreshHistory(), this.refreshReport()]);
  }

  async createWorkdayClassification(draft: WorkdayClassificationDraft) {
    await classificationRepository.create(draft);
    this.dismissWorkdayReminder();
    await Promise.all([
      classificationCoordinator.refresh(),
      this.refreshCollections(),
      this.refreshHistory(),
      this.refreshReport(),
    ]);
  }

  async updateWorkdayReminderSettings(settings: WorkdayReminderSettings) {
    const normalized = {
      enabled: settings.enabled,
      gapMinutes: Math.min(240, Math.max(1, Math.round(settings.gapMinutes))),
      snoozeMinutes: Math.min(240, Math.max(1, Math.round(settings.snoozeMinutes))),
    };
    await settingsRepository.updateWorkdayReminders(normalized);
    this.setSnapshot({
      ...this.snapshot,
      workdayReminderSettings: normalized,
      ...(!normalized.enabled
        ? { workdayReminder: { status: 'idle' as const, gapStartedAt: null, durationMs: 0 } }
        : {}),
    });
  }

  async reconcileWorkdayReminder(now = new Date()) {
    if (this.snapshot.workdayReminder.status === 'pending') return false;
    const date = localDateKey(now);
    const schedule = resolveWorkScheduleForDate(
      this.snapshot.workSchedule,
      this.snapshot.workScheduleRevisions,
      this.snapshot.workScheduleOverrides,
      date,
    );
    const gaps = buildUnclassifiedScheduledGaps(
      schedule,
      date,
      this.snapshot.workdayDate === date ? this.snapshot.workdayEntries : [],
      this.snapshot.workdayDate === date ? this.snapshot.workdayClassifications : [],
      now.getTime(),
    );
    const result = evaluateWorkdayReminder({
      settings: this.snapshot.workdayReminderSettings,
      gaps,
      now: now.getTime(),
      taskRunning: Boolean(this.snapshot.timer.running),
      classificationRunning: Boolean(this.snapshot.classificationTimer.running),
      workCheckPending: this.snapshot.workCheck.status === 'pending',
      persisted: this.reminderPersisted,
    });
    if (result.shouldNotify && result.state.gapStartedAt) {
      this.reminderPersisted = {
        gapStartedAt: result.state.gapStartedAt,
        nextReminderAt: null,
      };
      await settingsRepository.updateWorkdayReminderState(this.reminderPersisted);
    }
    this.setSnapshot({ ...this.snapshot, workdayReminder: result.state });
    return result.shouldNotify;
  }

  dismissWorkdayReminder() {
    this.setSnapshot({
      ...this.snapshot,
      workdayReminder: { status: 'idle', gapStartedAt: null, durationMs: 0 },
    });
  }

  async snoozeWorkdayReminder() {
    const gapStartedAt = this.snapshot.workdayReminder.gapStartedAt;
    if (!gapStartedAt) return;
    this.reminderPersisted = {
      gapStartedAt,
      nextReminderAt: new Date(
        Date.now() + this.snapshot.workdayReminderSettings.snoozeMinutes * 60_000,
      ).toISOString(),
    };
    await settingsRepository.updateWorkdayReminderState(this.reminderPersisted);
    this.dismissWorkdayReminder();
  }

  async updateWorkdayClassification(id: string, draft: WorkdayClassificationDraft) {
    await classificationRepository.update(id, draft);
    await Promise.all([
      classificationCoordinator.refresh(),
      this.refreshCollections(),
      this.refreshHistory(),
      this.refreshReport(),
    ]);
  }

  async deleteWorkdayClassification(id: string) {
    await classificationRepository.delete(id);
    await Promise.all([
      classificationCoordinator.refresh(),
      this.refreshCollections(),
      this.refreshHistory(),
      this.refreshReport(),
    ]);
  }

  async createWorkNote(entryId: string, draft: WorkNoteDraft) {
    const note = await workNoteRepository.create(entryId, draft);
    await Promise.all([timerCoordinator.refresh(), this.refreshHistory(), this.refreshReport()]);
    return note;
  }

  async updateWorkNote(id: string, draft: WorkNoteDraft) {
    await workNoteRepository.update(id, draft);
    await Promise.all([timerCoordinator.refresh(), this.refreshHistory(), this.refreshReport()]);
  }

  async deleteWorkNote(id: string) {
    await workNoteRepository.delete(id);
    await Promise.all([timerCoordinator.refresh(), this.refreshHistory(), this.refreshReport()]);
  }

  async reconcile() {
    await this.reconcileWorkCheck();
    await Promise.all([
      timerCoordinator.refresh(),
      classificationCoordinator.refresh(),
      this.refreshCollections(),
    ]);
  }

  async updateWorkCheckSettings(settings: WorkCheckSettings) {
    const previous = this.snapshot.workCheckSettings;
    const intervalMinutes = Number.isFinite(settings.intervalMinutes)
      ? Math.min(480, Math.max(1, Math.round(settings.intervalMinutes)))
      : previous.intervalMinutes;
    const graceMinutes = Number.isFinite(settings.graceMinutes)
      ? Math.min(60, Math.max(1, Math.round(settings.graceMinutes)))
      : previous.graceMinutes;
    const normalized = {
      ...settings,
      intervalMinutes,
      graceMinutes,
    };
    await settingsRepository.updateWorkChecks(normalized);
    this.setSnapshot({ ...this.snapshot, workCheckSettings: normalized });
    if (
      previous.intervalMinutes !== normalized.intervalMinutes ||
      (!previous.enabled && normalized.enabled)
    ) {
      const result = await workCheckCoordinator.resetSchedule(normalized);
      this.setSnapshot({ ...this.snapshot, workCheck: result.state });
    } else {
      await this.reconcileWorkCheck();
    }
    await timerCoordinator.refresh();
  }

  async updateTrayTimeModeDefault(mode: TrayTimeMode) {
    await settingsRepository.updateTrayTimeMode(mode);
    this.setSnapshot({ ...this.snapshot, trayTimeModeDefault: mode });
  }

  async updateWorkSchedule(
    schedule: WeeklyWorkSchedule,
    effectiveFrom: string,
    reason: string | null,
  ) {
    await workSchedulePolicyRepository.createRevision(schedule, effectiveFrom, reason);
    await this.refreshWorkSchedulePolicy();
  }

  async setWorkScheduleOverride(
    date: string,
    name: string,
    blocks: WorkScheduleOverride['blocks'],
  ) {
    await workSchedulePolicyRepository.setOverride(date, name, blocks);
    await this.refreshWorkSchedulePolicy();
  }

  async removeWorkScheduleOverride(date: string) {
    await workSchedulePolicyRepository.removeOverride(date);
    await this.refreshWorkSchedulePolicy();
  }

  async updateReportExportColumns(columns: ReportExportColumn[]) {
    const reportExportColumns = await reportExportSettingsRepository.update(columns);
    this.setSnapshot({ ...this.snapshot, reportExportColumns });
  }

  setCurrentTrayTimeMode(mode: TrayTimeMode) {
    const entryId = this.snapshot.timer.running?.id;
    if (!entryId) return;
    this.setSnapshot({ ...this.snapshot, trayTimeModeOverride: { entryId, mode } });
  }

  async confirmWork(entryId: string) {
    const confirmed = await workCheckCoordinator.confirm(entryId, this.snapshot.workCheckSettings);
    await this.reconcileWorkCheck();
    await Promise.all([
      timerCoordinator.refresh(),
      this.refreshCollections(),
      this.refreshHistory(),
      this.refreshReport(),
    ]);
    return confirmed;
  }

  async loadHistory(date: string) {
    localDayBounds(date);
    const request = ++this.historyRequest;
    this.setSnapshot({
      ...this.snapshot,
      historyDate: date,
      historyStatus: 'loading',
      historyError: null,
    });
    try {
      const [entries, classifications] = await Promise.all([
        historyRepository.listForDay(localDayBounds(date)),
        classificationRepository.listForDay(localDayBounds(date)),
      ]);
      if (request !== this.historyRequest) return;
      this.setSnapshot({
        ...this.snapshot,
        historyDate: date,
        historyEntries: entries,
        historyClassifications: classifications,
        historyStatus: 'ready',
        historyError: null,
      });
    } catch (error) {
      if (request !== this.historyRequest) return;
      this.setSnapshot({
        ...this.snapshot,
        historyStatus: 'error',
        historyError: error instanceof Error ? error.message : 'Could not load history.',
      });
    }
  }

  async loadWorkdayEntries(date = localDateKey()) {
    const [entries, classifications] = await Promise.all([
      historyRepository.listForDay(localDayBounds(date)),
      classificationRepository.listForDay(localDayBounds(date)),
    ]);
    this.setSnapshot({
      ...this.snapshot,
      workdayDate: date,
      workdayEntries: entries,
      workdayClassifications: classifications,
    });
  }

  async loadReport(range: ReportRange) {
    const request = ++this.reportRequest;
    this.setSnapshot({
      ...this.snapshot,
      reportRange: range,
      reportStatus: 'loading',
      reportError: null,
    });
    try {
      const bounds = validateReportRange(range);
      const [entries, classifications] = await Promise.all([
        reportRepository.listForRange(range),
        classificationRepository.listForRange(bounds),
      ]);
      if (request !== this.reportRequest) return;
      this.setSnapshot({
        ...this.snapshot,
        reportRange: range,
        reportEntries: entries,
        reportClassifications: classifications,
        reportStatus: 'ready',
        reportError: null,
      });
    } catch (error) {
      if (request !== this.reportRequest) return;
      this.setSnapshot({
        ...this.snapshot,
        reportStatus: 'error',
        reportError: error instanceof Error ? error.message : 'Could not load the report.',
      });
    }
  }

  async getReportDataForExport(range: ReportRange) {
    const bounds = validateReportRange(range);
    const [entries, classifications] = await Promise.all([
      reportRepository.listForRange(range),
      classificationRepository.listForRange(bounds),
    ]);
    return { entries, classifications };
  }

  async updateHistoryEntry(id: string, draft: TimeEntryCorrectionDraft) {
    await historyRepository.update(id, draft);
    await Promise.all([
      timerCoordinator.refresh(),
      this.refreshCollections(),
      this.refreshHistory(),
      this.refreshReport(),
    ]);
  }

  listHistoryEntryCorrections(id: string) {
    return historyRepository.listCorrections(id);
  }

  async finalizeReportPeriod(range: ReportRange, note: string | null) {
    const schedulesByDate = resolveWorkSchedulesForRange(
      this.snapshot.workSchedule,
      this.snapshot.workScheduleRevisions,
      this.snapshot.workScheduleOverrides,
      range,
    );
    await finalizedPeriodRepository.finalize(
      range,
      note,
      schedulesByDate[range.startDate] ?? this.snapshot.workSchedule,
      schedulesByDate,
    );
    const finalizedReportPeriods = await finalizedPeriodRepository.list();
    this.setSnapshot({ ...this.snapshot, finalizedReportPeriods });
  }

  async unlockReportPeriod(id: string, reason: string) {
    await finalizedPeriodRepository.unlock(id, reason);
    const finalizedReportPeriods = await finalizedPeriodRepository.list();
    this.setSnapshot({ ...this.snapshot, finalizedReportPeriods });
  }

  private async load() {
    try {
      const [
        workCheckSettings,
        workSchedule,
        trayTimeModeDefault,
        reportExportColumns,
        workdayReminderSettings,
        reminderPersisted,
        workScheduleRevisions,
        workScheduleOverrides,
        workScheduleOverrideEvents,
      ] = await Promise.all([
        settingsRepository.getWorkChecks(),
        settingsRepository.getWorkSchedule(),
        settingsRepository.getTrayTimeMode(),
        reportExportSettingsRepository.get(),
        settingsRepository.getWorkdayReminders(),
        settingsRepository.getWorkdayReminderState(),
        workSchedulePolicyRepository.listRevisions(),
        workSchedulePolicyRepository.listOverrides(),
        workSchedulePolicyRepository.listOverrideEvents(),
      ]);
      this.reminderPersisted = reminderPersisted;
      const isNewRuntime = await settingsRepository.claimRuntimeSession(
        await getRuntimeSessionId(),
      );
      const resolvedWorkSchedule = resolveWorkScheduleForDate(
        workSchedule,
        workScheduleRevisions,
        workScheduleOverrides,
        localDateKey(),
      );
      this.setSnapshot({
        ...this.snapshot,
        workCheckSettings,
        workSchedule: resolvedWorkSchedule,
        workScheduleRevisions,
        workScheduleOverrides,
        workScheduleOverrideEvents,
        trayTimeModeDefault,
        reportExportColumns,
        workdayReminderSettings,
      });
      await Promise.all([
        timerCoordinator.initialize(),
        classificationCoordinator.initialize(),
        this.refreshCollections(),
        this.loadHistory(this.snapshot.historyDate),
        this.loadReport(this.snapshot.reportRange),
      ]);
      await this.recoverExclusiveActivity();
      if (isNewRuntime) {
        const result = await workCheckCoordinator.recover(workCheckSettings);
        this.setSnapshot({ ...this.snapshot, workCheck: result.state });
        if (result.changed) await timerCoordinator.refresh();
      } else {
        await this.reconcileWorkCheck();
      }
      await timerCoordinator.refresh();
      this.setSnapshot({ ...this.snapshot, status: 'ready', error: null });
    } catch (error) {
      this.setSnapshot({
        ...this.snapshot,
        status: 'error',
        error: error instanceof Error ? error.message : 'Could not open the local database.',
      });
    }
  }

  private async refreshCollections() {
    const now = new Date();
    const runningTaskId =
      timerCoordinator.getSnapshot().running?.taskId ??
      (await entryRepository.getRunning())?.taskId ??
      null;
    const [
      groups,
      archivedGroups,
      tasks,
      archivedTasks,
      categories,
      archivedCategories,
      tags,
      archivedTags,
      recentTasks,
      recentEntries,
      workdayEntries,
      workdayClassifications,
      currentTaskTotalMs,
      finalizedReportPeriods,
    ] = await Promise.all([
      groupRepository.list(),
      groupRepository.list({ archived: true }),
      taskRepository.list(),
      taskRepository.list({ archived: true }),
      taxonomyRepository.listCategories(),
      taxonomyRepository.listCategories({ archived: true }),
      taxonomyRepository.listTags(),
      taxonomyRepository.listTags({ archived: true }),
      taskRepository.listRecent(),
      entryRepository.listRecent(),
      historyRepository.listForDay(localDayBounds(localDateKey(now)), now),
      classificationRepository.listForDay(localDayBounds(localDateKey(now)), now),
      runningTaskId ? entryRepository.getTaskTotal(runningTaskId, now) : Promise.resolve(0),
      finalizedPeriodRepository.list(),
    ]);
    const todayTotalMs = calculateTrackedDayFacts(
      localDateKey(now),
      workdayEntries,
      now.getTime(),
    ).trackedTotalMs;
    this.setSnapshot({
      ...this.snapshot,
      groups,
      archivedGroups,
      tasks,
      archivedTasks,
      categories,
      archivedCategories,
      tags,
      archivedTags,
      recentTasks,
      recentEntries,
      workdayDate: localDateKey(now),
      workdayEntries,
      workdayClassifications,
      todayTotalMs,
      currentTaskTotalMs,
      finalizedReportPeriods,
      totalCapturedAt: now.getTime(),
      error: null,
    });
  }

  private async refreshWorkSchedulePolicy() {
    const [workScheduleRevisions, workScheduleOverrides, workScheduleOverrideEvents] =
      await Promise.all([
        workSchedulePolicyRepository.listRevisions(),
        workSchedulePolicyRepository.listOverrides(),
        workSchedulePolicyRepository.listOverrideEvents(),
      ]);
    const workSchedule = resolveWorkScheduleForDate(
      this.snapshot.workSchedule,
      workScheduleRevisions,
      workScheduleOverrides,
      localDateKey(),
    );
    this.setSnapshot({
      ...this.snapshot,
      workSchedule,
      workScheduleRevisions,
      workScheduleOverrides,
      workScheduleOverrideEvents,
    });
    await Promise.all([
      this.refreshHistory(),
      this.refreshReport(),
      this.reconcileWorkdayReminder(),
    ]);
  }

  private async refreshHistory() {
    const date = this.snapshot.historyDate;
    const [entries, classifications] = await Promise.all([
      historyRepository.listForDay(localDayBounds(date)),
      classificationRepository.listForDay(localDayBounds(date)),
    ]);
    if (this.snapshot.historyDate !== date) return;
    this.setSnapshot({
      ...this.snapshot,
      historyEntries: entries,
      historyClassifications: classifications,
      historyStatus: 'ready',
      historyError: null,
    });
  }

  private async refreshReport() {
    const range = this.snapshot.reportRange;
    const bounds = validateReportRange(range);
    const [entries, classifications] = await Promise.all([
      reportRepository.listForRange(range),
      classificationRepository.listForRange(bounds),
    ]);
    if (
      this.snapshot.reportRange.startDate !== range.startDate ||
      this.snapshot.reportRange.endDate !== range.endDate
    )
      return;
    this.setSnapshot({
      ...this.snapshot,
      reportEntries: entries,
      reportClassifications: classifications,
      reportStatus: 'ready',
      reportError: null,
    });
  }

  private async recoverExclusiveActivity() {
    const runningTask = timerCoordinator.getSnapshot().running;
    const runningClassification = classificationCoordinator.getSnapshot().running;
    if (!runningTask || !runningClassification) return;
    const taskStart = new Date(runningTask.startedAt);
    const classificationStart = new Date(runningClassification.startedAt);
    if (taskStart.getTime() >= classificationStart.getTime()) {
      await classificationCoordinator.stop(taskStart);
    } else {
      await timerCoordinator.stop({ endedAt: classificationStart });
    }
    await Promise.all([timerCoordinator.refresh(), classificationCoordinator.refresh()]);
  }

  private async reconcileWorkCheck() {
    const next = this.workCheckOperation.then(() => this.performWorkCheckReconciliation());
    this.workCheckOperation = next.catch(() => undefined);
    await next;
  }

  private async performWorkCheckReconciliation() {
    const result = await workCheckCoordinator.reconcile(this.snapshot.workCheckSettings);
    this.setSnapshot({ ...this.snapshot, workCheck: result.state });
    if (result.changed) {
      await timerCoordinator.refresh();
      if (result.expired) {
        await Promise.all([this.refreshCollections(), this.refreshHistory(), this.refreshReport()]);
      }
    }
  }

  private setSnapshot(snapshot: AppSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
}

export const appStore = new TempoStore();
