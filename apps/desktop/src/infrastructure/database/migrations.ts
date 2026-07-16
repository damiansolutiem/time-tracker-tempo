export type Migration = { version: number; description: string; statements: readonly string[] };

// All persisted timestamps are UTC ISO-8601 strings. Conversion happens only at display boundaries.
export const migrations: readonly Migration[] = [
  {
    version: 1,
    description: 'Create tasks, time entries, and settings',
    statements: [
      `CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        color TEXT,
        check_interval_minutes INTEGER,
        archived_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS time_entries (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id),
        started_at TEXT NOT NULL,
        ended_at TEXT,
        note TEXT,
        confirmed_at TEXT,
        check_due_at TEXT,
        verification_state TEXT NOT NULL DEFAULT 'confirmed'
          CHECK (verification_state IN ('confirmed', 'pending')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (ended_at IS NULL OR ended_at >= started_at)
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS one_running_entry
        ON time_entries ((1)) WHERE ended_at IS NULL`,
      `CREATE INDEX IF NOT EXISTS time_entries_by_task
        ON time_entries(task_id, started_at)`,
      `CREATE INDEX IF NOT EXISTS time_entries_by_date
        ON time_entries(started_at)`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 2,
    description: 'Make starting a timer atomically stop the previous timer',
    statements: [
      `CREATE TRIGGER IF NOT EXISTS stop_running_entry_before_insert
        BEFORE INSERT ON time_entries
        WHEN NEW.ended_at IS NULL
        BEGIN
          UPDATE time_entries
          SET ended_at = NEW.started_at, updated_at = NEW.started_at
          WHERE ended_at IS NULL;
        END`,
    ],
  },
  {
    version: 3,
    description: 'Add default work-confirmation settings',
    statements: [
      `INSERT OR IGNORE INTO settings (key, value, updated_at)
       VALUES ('work_checks_enabled', 'true', CURRENT_TIMESTAMP)`,
      `INSERT OR IGNORE INTO settings (key, value, updated_at)
       VALUES ('work_check_interval_minutes', '60', CURRENT_TIMESTAMP)`,
      `INSERT OR IGNORE INTO settings (key, value, updated_at)
       VALUES ('work_check_grace_minutes', '5', CURRENT_TIMESTAMP)`,
      `INSERT OR IGNORE INTO settings (key, value, updated_at)
       VALUES ('notifications_enabled', 'true', CURRENT_TIMESTAMP)`,
    ],
  },
  {
    version: 4,
    description: 'Normalize work-check state when a timer stops or switches',
    statements: [
      `UPDATE time_entries SET check_due_at = NULL, verification_state = 'confirmed'
       WHERE ended_at IS NOT NULL AND (check_due_at IS NOT NULL OR verification_state = 'pending')`,
      `DROP TRIGGER IF EXISTS stop_running_entry_before_insert`,
      `CREATE TRIGGER stop_running_entry_before_insert
        BEFORE INSERT ON time_entries
        WHEN NEW.ended_at IS NULL
        BEGIN
          UPDATE time_entries
          SET ended_at = NEW.started_at, check_due_at = NULL,
              verification_state = 'confirmed', updated_at = NEW.started_at
          WHERE ended_at IS NULL;
        END`,
    ],
  },
  {
    version: 5,
    description: 'Add flat groups with historical time-entry attribution',
    statements: [
      `CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        color TEXT,
        archived_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `ALTER TABLE tasks ADD COLUMN group_id TEXT REFERENCES groups(id)`,
      `ALTER TABLE time_entries ADD COLUMN group_id TEXT REFERENCES groups(id)`,
      `UPDATE time_entries
       SET group_id = (SELECT group_id FROM tasks WHERE tasks.id = time_entries.task_id)
       WHERE group_id IS NULL`,
      `CREATE INDEX IF NOT EXISTS tasks_by_group ON tasks(group_id, title)`,
      `CREATE INDEX IF NOT EXISTS time_entries_by_group ON time_entries(group_id, started_at)`,
    ],
  },
  {
    version: 6,
    description: 'Separate user-facing task IDs from internal UUIDs',
    statements: [
      `ALTER TABLE tasks ADD COLUMN external_id TEXT`,
      `UPDATE tasks SET external_id = id
       WHERE NOT (
         length(id) = 36 AND substr(id, 9, 1) = '-' AND substr(id, 14, 1) = '-'
         AND substr(id, 19, 1) = '-' AND substr(id, 24, 1) = '-'
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS tasks_by_external_id
       ON tasks(external_id COLLATE NOCASE) WHERE external_id IS NOT NULL`,
    ],
  },
  {
    version: 7,
    description: 'Add structured work-note lists to time entries',
    statements: [
      `CREATE TABLE IF NOT EXISTS work_notes (
        id TEXT PRIMARY KEY,
        time_entry_id TEXT NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
        content TEXT NOT NULL CHECK (length(trim(content)) > 0),
        extra_data_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(extra_data_json)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `INSERT OR IGNORE INTO work_notes (
        id, time_entry_id, content, extra_data_json, created_at, updated_at
      )
      SELECT 'legacy-note:' || id, id, trim(note), '{}', updated_at, updated_at
      FROM time_entries
      WHERE note IS NOT NULL AND trim(note) <> ''`,
      `UPDATE time_entries SET note = NULL WHERE note IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS work_notes_by_entry
       ON work_notes(time_entry_id, created_at)`,
    ],
  },
  {
    version: 8,
    description: 'Add the default versioned weekly work schedule',
    statements: [
      `INSERT OR IGNORE INTO settings (key, value, updated_at)
       VALUES (
         'weekly_work_schedule_v1',
         '{"enabled":false,"days":{"monday":[{"id":"mon-morning","start":"09:00","end":"13:00"},{"id":"mon-afternoon","start":"14:00","end":"18:00"}],"tuesday":[{"id":"tue-morning","start":"09:00","end":"13:00"},{"id":"tue-afternoon","start":"14:00","end":"18:00"}],"wednesday":[{"id":"wed-morning","start":"09:00","end":"13:00"},{"id":"wed-afternoon","start":"14:00","end":"18:00"}],"thursday":[{"id":"thu-morning","start":"09:00","end":"13:00"},{"id":"thu-afternoon","start":"14:00","end":"18:00"}],"friday":[{"id":"fri-morning","start":"09:00","end":"13:00"},{"id":"fri-afternoon","start":"14:00","end":"18:00"}],"saturday":[],"sunday":[]}}',
         CURRENT_TIMESTAMP
       )`,
    ],
  },
  {
    version: 9,
    description: 'Add mutually exclusive workday gap classifications',
    statements: [
      `CREATE TABLE IF NOT EXISTS workday_classifications (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL CHECK (
          category IN ('break', 'personal_away', 'distraction', 'ignored')
        ),
        started_at TEXT NOT NULL,
        ended_at TEXT,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (ended_at IS NULL OR ended_at >= started_at)
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS one_running_workday_classification
        ON workday_classifications ((1)) WHERE ended_at IS NULL`,
      `CREATE INDEX IF NOT EXISTS workday_classifications_by_start
        ON workday_classifications(started_at)`,
      `CREATE INDEX IF NOT EXISTS workday_classifications_by_category
        ON workday_classifications(category, started_at)`,
      `CREATE TRIGGER IF NOT EXISTS stop_classification_before_time_entry_insert
        BEFORE INSERT ON time_entries
        WHEN NEW.ended_at IS NULL
        BEGIN
          UPDATE workday_classifications
          SET ended_at = NEW.started_at, updated_at = NEW.started_at
          WHERE ended_at IS NULL;
        END`,
      `CREATE TRIGGER IF NOT EXISTS stop_time_entry_before_classification_insert
        BEFORE INSERT ON workday_classifications
        WHEN NEW.ended_at IS NULL
        BEGIN
          UPDATE time_entries
          SET ended_at = NEW.started_at, check_due_at = NULL,
              verification_state = 'confirmed', updated_at = NEW.started_at
          WHERE ended_at IS NULL;
        END`,
    ],
  },
  {
    version: 10,
    description: 'Add opt-in untracked-time reminder settings',
    statements: [
      `INSERT OR IGNORE INTO settings (key, value, updated_at)
       VALUES ('workday_reminders_enabled', 'false', CURRENT_TIMESTAMP)`,
      `INSERT OR IGNORE INTO settings (key, value, updated_at)
       VALUES ('workday_reminder_gap_minutes', '15', CURRENT_TIMESTAMP)`,
      `INSERT OR IGNORE INTO settings (key, value, updated_at)
       VALUES ('workday_reminder_snooze_minutes', '15', CURRENT_TIMESTAMP)`,
    ],
  },
  {
    version: 11,
    description: 'Add entry-snapshotted work categories and tags',
    statements: [
      `CREATE TABLE IF NOT EXISTS work_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(name)) > 0),
        color TEXT,
        archived_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS work_categories_by_name
        ON work_categories(name COLLATE NOCASE) WHERE archived_at IS NULL`,
      `CREATE TABLE IF NOT EXISTS work_tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(name)) > 0),
        color TEXT,
        archived_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS work_tags_by_name
        ON work_tags(name COLLATE NOCASE) WHERE archived_at IS NULL`,
      `ALTER TABLE tasks ADD COLUMN category_id TEXT REFERENCES work_categories(id)`,
      `ALTER TABLE tasks ADD COLUMN tag_ids_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(tag_ids_json) AND json_type(tag_ids_json) = 'array')`,
      `ALTER TABLE time_entries ADD COLUMN category_id TEXT`,
      `ALTER TABLE time_entries ADD COLUMN category_name TEXT`,
      `ALTER TABLE time_entries ADD COLUMN category_color TEXT`,
      `ALTER TABLE time_entries ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(tags_json) AND json_type(tags_json) = 'array')`,
      `CREATE INDEX IF NOT EXISTS tasks_by_category ON tasks(category_id, title)`,
      `CREATE INDEX IF NOT EXISTS time_entries_by_category
        ON time_entries(category_id, started_at)`,
    ],
  },
  {
    version: 12,
    description: 'Add auditable corrections, immutable entry labels, and finalized periods',
    statements: [
      `ALTER TABLE time_entries ADD COLUMN task_external_id_snapshot TEXT`,
      `ALTER TABLE time_entries ADD COLUMN task_title_snapshot TEXT`,
      `ALTER TABLE time_entries ADD COLUMN task_color_snapshot TEXT`,
      `ALTER TABLE time_entries ADD COLUMN group_name_snapshot TEXT`,
      `ALTER TABLE time_entries ADD COLUMN group_color_snapshot TEXT`,
      `ALTER TABLE time_entries ADD COLUMN correction_revision_token TEXT`,
      `ALTER TABLE time_entries ADD COLUMN correction_reason TEXT`,
      `UPDATE time_entries SET
        task_external_id_snapshot = (SELECT external_id FROM tasks WHERE id = task_id),
        task_title_snapshot = (SELECT title FROM tasks WHERE id = task_id),
        task_color_snapshot = (SELECT color FROM tasks WHERE id = task_id),
        group_name_snapshot = (SELECT name FROM groups WHERE id = group_id),
        group_color_snapshot = (SELECT color FROM groups WHERE id = group_id)
       WHERE task_title_snapshot IS NULL`,
      `CREATE TABLE IF NOT EXISTS time_entry_corrections (
        id TEXT PRIMARY KEY,
        time_entry_id TEXT NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
        reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
        before_json TEXT NOT NULL CHECK (json_valid(before_json)),
        after_json TEXT NOT NULL CHECK (json_valid(after_json)),
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS time_entry_corrections_by_entry
        ON time_entry_corrections(time_entry_id, created_at)`,
      `CREATE TRIGGER IF NOT EXISTS audit_time_entry_correction
        AFTER UPDATE ON time_entries
        WHEN NEW.correction_revision_token IS NOT OLD.correction_revision_token
          AND NEW.correction_revision_token IS NOT NULL
          AND length(trim(NEW.correction_reason)) > 0
        BEGIN
          INSERT INTO time_entry_corrections (
            id, time_entry_id, reason, before_json, after_json, created_at
          ) VALUES (
            NEW.correction_revision_token, NEW.id, trim(NEW.correction_reason),
            json_object(
              'taskId', OLD.task_id, 'taskExternalId', OLD.task_external_id_snapshot,
              'taskTitle', OLD.task_title_snapshot, 'groupId', OLD.group_id,
              'groupName', OLD.group_name_snapshot,
              'category', CASE WHEN OLD.category_id IS NULL THEN NULL ELSE json_object(
                'id', OLD.category_id, 'name', OLD.category_name, 'color', OLD.category_color
              ) END,
              'tags', json(OLD.tags_json), 'startedAt', OLD.started_at,
              'endedAt', OLD.ended_at, 'note', OLD.note
            ),
            json_object(
              'taskId', NEW.task_id, 'taskExternalId', NEW.task_external_id_snapshot,
              'taskTitle', NEW.task_title_snapshot, 'groupId', NEW.group_id,
              'groupName', NEW.group_name_snapshot,
              'category', CASE WHEN NEW.category_id IS NULL THEN NULL ELSE json_object(
                'id', NEW.category_id, 'name', NEW.category_name, 'color', NEW.category_color
              ) END,
              'tags', json(NEW.tags_json), 'startedAt', NEW.started_at,
              'endedAt', NEW.ended_at, 'note', NEW.note
            ),
            NEW.updated_at
          );
        END`,
      `CREATE TRIGGER IF NOT EXISTS prevent_time_entry_correction_update
        BEFORE UPDATE ON time_entry_corrections BEGIN
          SELECT RAISE(ABORT, 'Correction history is immutable.');
        END`,
      `CREATE TRIGGER IF NOT EXISTS prevent_time_entry_correction_delete
        BEFORE DELETE ON time_entry_corrections BEGIN
          SELECT RAISE(ABORT, 'Correction history is immutable.');
        END`,
      `CREATE TABLE IF NOT EXISTS finalized_report_periods (
        id TEXT PRIMARY KEY,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        note TEXT,
        finalized_at TEXT NOT NULL,
        unlocked_at TEXT,
        unlock_reason TEXT,
        CHECK (start_date <= end_date),
        CHECK (starts_at < ends_at),
        CHECK (unlocked_at IS NULL OR length(trim(unlock_reason)) > 0)
      )`,
      `CREATE INDEX IF NOT EXISTS finalized_report_periods_active
        ON finalized_report_periods(starts_at, ends_at) WHERE unlocked_at IS NULL`,
      `CREATE TRIGGER IF NOT EXISTS protect_finalized_period_audit_update
        BEFORE UPDATE ON finalized_report_periods WHEN OLD.unlocked_at IS NOT NULL
          OR NEW.id IS NOT OLD.id OR NEW.start_date IS NOT OLD.start_date
          OR NEW.end_date IS NOT OLD.end_date OR NEW.starts_at IS NOT OLD.starts_at
          OR NEW.ends_at IS NOT OLD.ends_at OR NEW.note IS NOT OLD.note
          OR NEW.finalized_at IS NOT OLD.finalized_at
        BEGIN SELECT RAISE(ABORT, 'Finalization history is immutable.'); END`,
      `CREATE TRIGGER IF NOT EXISTS protect_finalized_period_audit_delete
        BEFORE DELETE ON finalized_report_periods
        BEGIN SELECT RAISE(ABORT, 'Finalization history is immutable.'); END`,
      `CREATE TRIGGER IF NOT EXISTS protect_finalized_time_entry_insert
        BEFORE INSERT ON time_entries WHEN EXISTS (
          SELECT 1 FROM finalized_report_periods period
          WHERE period.unlocked_at IS NULL AND NEW.started_at < period.ends_at
            AND COALESCE(NEW.ended_at, '9999-12-31T23:59:59.999Z') > period.starts_at
        ) BEGIN SELECT RAISE(ABORT, 'This entry overlaps a finalized reporting period.'); END`,
      `CREATE TRIGGER IF NOT EXISTS protect_finalized_time_entry_update
        BEFORE UPDATE ON time_entries WHEN EXISTS (
          SELECT 1 FROM finalized_report_periods period
          WHERE period.unlocked_at IS NULL AND (
            (OLD.started_at < period.ends_at AND COALESCE(OLD.ended_at, '9999-12-31T23:59:59.999Z') > period.starts_at)
            OR (NEW.started_at < period.ends_at AND COALESCE(NEW.ended_at, '9999-12-31T23:59:59.999Z') > period.starts_at)
          )
        ) BEGIN SELECT RAISE(ABORT, 'This entry overlaps a finalized reporting period.'); END`,
      `CREATE TRIGGER IF NOT EXISTS protect_finalized_time_entry_delete
        BEFORE DELETE ON time_entries WHEN EXISTS (
          SELECT 1 FROM finalized_report_periods period
          WHERE period.unlocked_at IS NULL AND OLD.started_at < period.ends_at
            AND COALESCE(OLD.ended_at, '9999-12-31T23:59:59.999Z') > period.starts_at
        ) BEGIN SELECT RAISE(ABORT, 'This entry overlaps a finalized reporting period.'); END`,
      `CREATE TRIGGER IF NOT EXISTS protect_finalized_work_note_insert
        BEFORE INSERT ON work_notes WHEN EXISTS (
          SELECT 1 FROM time_entries entry JOIN finalized_report_periods period
          WHERE entry.id = NEW.time_entry_id AND period.unlocked_at IS NULL
            AND entry.started_at < period.ends_at
            AND COALESCE(entry.ended_at, '9999-12-31T23:59:59.999Z') > period.starts_at
        ) BEGIN SELECT RAISE(ABORT, 'This note belongs to a finalized reporting period.'); END`,
      `CREATE TRIGGER IF NOT EXISTS protect_finalized_work_note_update
        BEFORE UPDATE ON work_notes WHEN EXISTS (
          SELECT 1 FROM time_entries entry JOIN finalized_report_periods period
          WHERE entry.id = OLD.time_entry_id AND period.unlocked_at IS NULL
            AND entry.started_at < period.ends_at
            AND COALESCE(entry.ended_at, '9999-12-31T23:59:59.999Z') > period.starts_at
        ) BEGIN SELECT RAISE(ABORT, 'This note belongs to a finalized reporting period.'); END`,
      `CREATE TRIGGER IF NOT EXISTS protect_finalized_work_note_delete
        BEFORE DELETE ON work_notes WHEN EXISTS (
          SELECT 1 FROM time_entries entry JOIN finalized_report_periods period
          WHERE entry.id = OLD.time_entry_id AND period.unlocked_at IS NULL
            AND entry.started_at < period.ends_at
            AND COALESCE(entry.ended_at, '9999-12-31T23:59:59.999Z') > period.starts_at
        ) BEGIN SELECT RAISE(ABORT, 'This note belongs to a finalized reporting period.'); END`,
      `CREATE TRIGGER IF NOT EXISTS protect_finalized_classification_insert
        BEFORE INSERT ON workday_classifications WHEN EXISTS (
          SELECT 1 FROM finalized_report_periods period WHERE period.unlocked_at IS NULL
            AND NEW.started_at < period.ends_at
            AND COALESCE(NEW.ended_at, '9999-12-31T23:59:59.999Z') > period.starts_at
        ) BEGIN SELECT RAISE(ABORT, 'This classification overlaps a finalized reporting period.'); END`,
      `CREATE TRIGGER IF NOT EXISTS protect_finalized_classification_update
        BEFORE UPDATE ON workday_classifications WHEN EXISTS (
          SELECT 1 FROM finalized_report_periods period WHERE period.unlocked_at IS NULL AND (
            (OLD.started_at < period.ends_at AND COALESCE(OLD.ended_at, '9999-12-31T23:59:59.999Z') > period.starts_at)
            OR (NEW.started_at < period.ends_at AND COALESCE(NEW.ended_at, '9999-12-31T23:59:59.999Z') > period.starts_at)
          )
        ) BEGIN SELECT RAISE(ABORT, 'This classification overlaps a finalized reporting period.'); END`,
      `CREATE TRIGGER IF NOT EXISTS protect_finalized_classification_delete
        BEFORE DELETE ON workday_classifications WHEN EXISTS (
          SELECT 1 FROM finalized_report_periods period WHERE period.unlocked_at IS NULL
            AND OLD.started_at < period.ends_at
            AND COALESCE(OLD.ended_at, '9999-12-31T23:59:59.999Z') > period.starts_at
        ) BEGIN SELECT RAISE(ABORT, 'This classification overlaps a finalized reporting period.'); END`,
    ],
  },
  {
    version: 13,
    description: 'Snapshot the work schedule used by finalized reports',
    statements: [
      `ALTER TABLE finalized_report_periods ADD COLUMN schedule_json TEXT`,
      `UPDATE finalized_report_periods SET schedule_json = COALESCE(
        (SELECT value FROM settings WHERE key = 'weekly_work_schedule_v1'),
        '{"enabled":false,"days":{"monday":[],"tuesday":[],"wednesday":[],"thursday":[],"friday":[],"saturday":[],"sunday":[]}}'
      ) WHERE schedule_json IS NULL`,
      `DROP TRIGGER IF EXISTS protect_finalized_period_audit_update`,
      `CREATE TRIGGER protect_finalized_period_audit_update
        BEFORE UPDATE ON finalized_report_periods WHEN OLD.unlocked_at IS NOT NULL
          OR NEW.id IS NOT OLD.id OR NEW.start_date IS NOT OLD.start_date
          OR NEW.end_date IS NOT OLD.end_date OR NEW.starts_at IS NOT OLD.starts_at
          OR NEW.ends_at IS NOT OLD.ends_at OR NEW.note IS NOT OLD.note
          OR NEW.schedule_json IS NOT OLD.schedule_json
          OR NEW.finalized_at IS NOT OLD.finalized_at
        BEGIN SELECT RAISE(ABORT, 'Finalization history is immutable.'); END`,
    ],
  },
  {
    version: 14,
    description: 'Add effective-dated schedules and local-date overrides',
    statements: [
      `CREATE TABLE IF NOT EXISTS work_schedule_revisions (
        id TEXT PRIMARY KEY,
        effective_from TEXT NOT NULL,
        schedule_json TEXT NOT NULL CHECK (json_valid(schedule_json)),
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS work_schedule_revisions_by_effective_date
        ON work_schedule_revisions(effective_from DESC, created_at DESC)`,
      `INSERT OR IGNORE INTO work_schedule_revisions (
        id, effective_from, schedule_json, created_at
      ) SELECT 'legacy-weekly-schedule-v1', '0001-01-01', value, updated_at
        FROM settings WHERE key = 'weekly_work_schedule_v1'`,
      `CREATE TRIGGER IF NOT EXISTS protect_work_schedule_revision_update
        BEFORE UPDATE ON work_schedule_revisions
        BEGIN SELECT RAISE(ABORT, 'Schedule revision history is immutable.'); END`,
      `CREATE TRIGGER IF NOT EXISTS protect_work_schedule_revision_delete
        BEFORE DELETE ON work_schedule_revisions
        BEGIN SELECT RAISE(ABORT, 'Schedule revision history is immutable.'); END`,
      `CREATE TABLE IF NOT EXISTS work_schedule_override_events (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('set', 'remove')),
        name TEXT,
        blocks_json TEXT CHECK (blocks_json IS NULL OR json_valid(blocks_json)),
        created_at TEXT NOT NULL,
        CHECK (
          (action = 'set' AND length(trim(name)) > 0 AND blocks_json IS NOT NULL)
          OR (action = 'remove' AND name IS NULL AND blocks_json IS NULL)
        )
      )`,
      `CREATE INDEX IF NOT EXISTS work_schedule_override_events_by_date
        ON work_schedule_override_events(date, created_at DESC)`,
      `CREATE TRIGGER IF NOT EXISTS protect_work_schedule_override_update
        BEFORE UPDATE ON work_schedule_override_events
        BEGIN SELECT RAISE(ABORT, 'Schedule override history is immutable.'); END`,
      `CREATE TRIGGER IF NOT EXISTS protect_work_schedule_override_delete
        BEFORE DELETE ON work_schedule_override_events
        BEGIN SELECT RAISE(ABORT, 'Schedule override history is immutable.'); END`,
      `ALTER TABLE finalized_report_periods ADD COLUMN schedules_by_date_json TEXT`,
      `DROP TRIGGER IF EXISTS protect_finalized_period_audit_update`,
      `CREATE TRIGGER protect_finalized_period_audit_update
        BEFORE UPDATE ON finalized_report_periods WHEN OLD.unlocked_at IS NOT NULL
          OR NEW.id IS NOT OLD.id OR NEW.start_date IS NOT OLD.start_date
          OR NEW.end_date IS NOT OLD.end_date OR NEW.starts_at IS NOT OLD.starts_at
          OR NEW.ends_at IS NOT OLD.ends_at OR NEW.note IS NOT OLD.note
          OR NEW.schedule_json IS NOT OLD.schedule_json
          OR NEW.schedules_by_date_json IS NOT OLD.schedules_by_date_json
          OR NEW.finalized_at IS NOT OLD.finalized_at
        BEGIN SELECT RAISE(ABORT, 'Finalization history is immutable.'); END`,
    ],
  },
  {
    version: 15,
    description: 'Record reasons for schedule revisions',
    statements: [`ALTER TABLE work_schedule_revisions ADD COLUMN reason TEXT`],
  },
];
