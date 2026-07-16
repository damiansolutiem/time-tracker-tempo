import { describe, expect, it } from 'vitest';
import { migrations } from './migrations';

describe('database foundation', () => {
  it('enforces one running entry at the database boundary', () => {
    const sql = migrations.flatMap(({ statements }) => statements).join('\n');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS one_running_entry');
    expect(sql).toContain('WHERE ended_at IS NULL');
  });

  it('persists the authoritative work-check deadline', () => {
    const sql = migrations.flatMap(({ statements }) => statements).join('\n');
    expect(sql).toContain('check_due_at TEXT');
    expect(sql).toContain("verification_state IN ('confirmed', 'pending')");
    expect(sql).toContain("'work_check_interval_minutes', '60'");
    expect(sql).toContain("'work_check_grace_minutes', '5'");
    expect(sql).toContain("verification_state = 'confirmed', updated_at = NEW.started_at");
  });

  it('atomically closes a running entry before starting another', () => {
    const sql = migrations.flatMap(({ statements }) => statements).join('\n');
    expect(sql).toContain('CREATE TRIGGER IF NOT EXISTS stop_running_entry_before_insert');
    expect(sql).toContain('SET ended_at = NEW.started_at');
  });

  it('stores both current task grouping and historical entry grouping', () => {
    const sql = migrations.flatMap(({ statements }) => statements).join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS groups');
    expect(sql).toContain('ALTER TABLE tasks ADD COLUMN group_id');
    expect(sql).toContain('ALTER TABLE time_entries ADD COLUMN group_id');
    expect(sql).toContain('time_entries_by_group');
  });

  it('separates optional user-facing task IDs from internal primary IDs', () => {
    const sql = migrations.flatMap(({ statements }) => statements).join('\n');
    expect(sql).toContain('ALTER TABLE tasks ADD COLUMN external_id');
    expect(sql).toContain('tasks_by_external_id');
    expect(sql).toContain('external_id COLLATE NOCASE');
  });

  it('stores timestamped work-note lists with extensible extra data', () => {
    const sql = migrations.flatMap(({ statements }) => statements).join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS work_notes');
    expect(sql).toContain('extra_data_json TEXT NOT NULL');
    expect(sql).toContain("'legacy-note:' || id");
    expect(sql).toContain('work_notes_by_entry');
  });

  it('seeds a disabled versioned weekly work schedule', () => {
    const sql = migrations.flatMap(({ statements }) => statements).join('\n');
    expect(sql).toContain("'weekly_work_schedule_v1'");
    expect(sql).toContain('"enabled":false');
    expect(sql).toContain('"monday"');
    expect(sql).toContain('"sunday"');
  });

  it('stores gap classifications and enforces one active kind of timer', () => {
    const sql = migrations.flatMap(({ statements }) => statements).join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS workday_classifications');
    expect(sql).toContain('one_running_workday_classification');
    expect(sql).toContain('stop_classification_before_time_entry_insert');
    expect(sql).toContain('stop_time_entry_before_classification_insert');
  });

  it('seeds opt-in untracked-time reminder settings', () => {
    const sql = migrations.flatMap(({ statements }) => statements).join('\n');
    expect(sql).toContain("'workday_reminders_enabled', 'false'");
    expect(sql).toContain("'workday_reminder_gap_minutes', '15'");
    expect(sql).toContain("'workday_reminder_snooze_minutes', '15'");
  });

  it('stores task defaults and immutable entry snapshots for categories and tags', () => {
    const sql = migrations.flatMap(({ statements }) => statements).join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS work_categories');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS work_tags');
    expect(sql).toContain('ALTER TABLE tasks ADD COLUMN category_id');
    expect(sql).toContain('ALTER TABLE tasks ADD COLUMN tag_ids_json');
    expect(sql).toContain('ALTER TABLE time_entries ADD COLUMN category_name');
    expect(sql).toContain('ALTER TABLE time_entries ADD COLUMN tags_json');
  });

  it('audits corrections and protects finalized reporting periods at the database boundary', () => {
    const sql = migrations.flatMap(({ statements }) => statements).join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS time_entry_corrections');
    expect(sql).toContain('CREATE TRIGGER IF NOT EXISTS audit_time_entry_correction');
    expect(sql).toContain('Correction history is immutable.');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS finalized_report_periods');
    expect(sql).toContain('protect_finalized_time_entry_update');
    expect(sql).toContain('protect_finalized_work_note_update');
    expect(sql).toContain('protect_finalized_classification_update');
    expect(sql).toContain('ALTER TABLE finalized_report_periods ADD COLUMN schedule_json');
  });

  it('stores immutable effective schedule revisions and append-only date overrides', () => {
    const sql = migrations.flatMap(({ statements }) => statements).join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS work_schedule_revisions');
    expect(sql).toContain("'legacy-weekly-schedule-v1', '0001-01-01'");
    expect(sql).toContain('Schedule revision history is immutable.');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS work_schedule_override_events');
    expect(sql).toContain("action IN ('set', 'remove')");
    expect(sql).toContain('ALTER TABLE finalized_report_periods ADD COLUMN schedules_by_date_json');
    expect(sql).toContain('ALTER TABLE work_schedule_revisions ADD COLUMN reason');
  });
});
