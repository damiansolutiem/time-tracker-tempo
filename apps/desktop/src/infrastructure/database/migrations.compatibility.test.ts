import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrations } from './migrations';

function applyThrough(database: DatabaseSync, maximumVersion: number) {
  database.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
  );
  const applied = new Set(
    database
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => Number(row.version)),
  );
  for (const migration of migrations) {
    if (migration.version > maximumVersion || applied.has(migration.version)) continue;
    database.exec('BEGIN');
    try {
      for (const statement of migration.statements) database.exec(statement);
      database
        .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(migration.version, '2026-07-15T12:00:00.000Z');
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
}

describe('pre-workday database compatibility', () => {
  it('upgrades a version 7 database without changing historical task data', () => {
    const database = new DatabaseSync(':memory:');
    applyThrough(database, 7);
    database.exec(`
      INSERT INTO groups (id, name, created_at, updated_at)
      VALUES ('group-1', 'Client A', '2026-07-01T08:00:00.000Z', '2026-07-01T08:00:00.000Z');
      INSERT INTO tasks (
        id, external_id, group_id, title, created_at, updated_at
      ) VALUES (
        'task-1', 'ACME-1', 'group-1', 'Historical task',
        '2026-07-01T08:00:00.000Z', '2026-07-01T08:00:00.000Z'
      );
      INSERT INTO time_entries (
        id, task_id, group_id, started_at, ended_at, verification_state, created_at, updated_at
      ) VALUES (
        'entry-1', 'task-1', 'group-1', '2026-07-01T08:00:00.000Z',
        '2026-07-01T09:00:00.000Z', 'confirmed',
        '2026-07-01T08:00:00.000Z', '2026-07-01T09:00:00.000Z'
      );
    `);
    const historicalColumns = `id, task_id, group_id, started_at, ended_at, note,
      confirmed_at, check_due_at, verification_state, created_at, updated_at`;
    const before = database.prepare(`SELECT ${historicalColumns} FROM time_entries`).get();

    applyThrough(database, migrations.at(-1)!.version);

    expect(database.prepare(`SELECT ${historicalColumns} FROM time_entries`).get()).toEqual(before);
    const scheduleRow = database
      .prepare("SELECT value FROM settings WHERE key = 'weekly_work_schedule_v1'")
      .get() as { value?: unknown } | undefined;
    expect(String(scheduleRow?.value)).toContain('"enabled":false');
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'workday_classifications'",
        )
        .get(),
    ).toEqual({ name: 'workday_classifications' });
    expect(database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({
      count: migrations.length,
    });
    expect(database.prepare('SELECT COUNT(*) AS count FROM work_schedule_revisions').get()).toEqual(
      {
        count: 1,
      },
    );
    expect(() =>
      database.exec("UPDATE work_schedule_revisions SET effective_from = '2026-01-01'"),
    ).toThrow('Schedule revision history is immutable.');
    database.exec(`
      INSERT INTO work_schedule_override_events (
        id, date, action, name, blocks_json, created_at
      ) VALUES ('override-set', '2026-12-25', 'set', 'Holiday', '[]', '2026-07-16T08:00:00.000Z');
      INSERT INTO work_schedule_override_events (id, date, action, created_at)
      VALUES ('override-remove', '2026-12-25', 'remove', '2026-07-16T08:00:00.000Z');
    `);
    expect(
      database
        .prepare(
          `SELECT COUNT(*) AS count FROM work_schedule_override_events event
          WHERE event.action = 'set' AND event.id = (
            SELECT latest.id FROM work_schedule_override_events latest
            WHERE latest.date = event.date
            ORDER BY latest.created_at DESC, latest.rowid DESC LIMIT 1
          )`,
        )
        .get(),
    ).toEqual({ count: 0 });
    database.close();
  });

  it('keeps entry category and tag names immutable when definitions change', () => {
    const database = new DatabaseSync(':memory:');
    applyThrough(database, migrations.at(-1)!.version);
    database.exec(`
      INSERT INTO work_categories (id, name, color, created_at, updated_at)
      VALUES ('category-1', 'Development', 'blue', '2026-07-15T08:00:00.000Z', '2026-07-15T08:00:00.000Z');
      INSERT INTO work_tags (id, name, color, created_at, updated_at)
      VALUES ('tag-1', 'Billable', 'green', '2026-07-15T08:00:00.000Z', '2026-07-15T08:00:00.000Z');
      INSERT INTO tasks (
        id, title, category_id, tag_ids_json, created_at, updated_at
      ) VALUES (
        'task-1', 'Build', 'category-1', '["tag-1"]',
        '2026-07-15T08:00:00.000Z', '2026-07-15T08:00:00.000Z'
      );
      INSERT INTO time_entries (
        id, task_id, started_at, ended_at, verification_state,
        category_id, category_name, category_color, tags_json, created_at, updated_at
      ) VALUES (
        'entry-1', 'task-1', '2026-07-15T08:00:00.000Z', '2026-07-15T09:00:00.000Z',
        'confirmed', 'category-1', 'Development', 'blue',
        '[{"id":"tag-1","name":"Billable","color":"green"}]',
        '2026-07-15T08:00:00.000Z', '2026-07-15T09:00:00.000Z'
      );
      UPDATE work_categories SET name = 'Engineering' WHERE id = 'category-1';
      UPDATE work_tags SET name = 'Client work' WHERE id = 'tag-1';
    `);

    expect(
      database
        .prepare('SELECT category_name, tags_json FROM time_entries WHERE id = ?')
        .get('entry-1'),
    ).toEqual({
      category_name: 'Development',
      tags_json: '[{"id":"tag-1","name":"Billable","color":"green"}]',
    });
    database.close();
  });

  it('can rerun the migration launcher after a completed upgrade', () => {
    const database = new DatabaseSync(':memory:');
    applyThrough(database, migrations.at(-1)!.version);
    applyThrough(database, migrations.at(-1)!.version);
    expect(database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({
      count: migrations.length,
    });
    database.close();
  });

  it('atomically audits corrections and protects finalized periods', () => {
    const database = new DatabaseSync(':memory:');
    applyThrough(database, migrations.at(-1)!.version);
    database.exec(`
      INSERT INTO tasks (id, title, created_at, updated_at)
      VALUES ('task-1', 'Build', '2026-07-15T08:00:00.000Z', '2026-07-15T08:00:00.000Z');
      INSERT INTO time_entries (
        id, task_id, task_title_snapshot, started_at, ended_at,
        verification_state, created_at, updated_at
      ) VALUES (
        'entry-1', 'task-1', 'Build', '2026-07-15T08:00:00.000Z',
        '2026-07-15T09:00:00.000Z', 'confirmed',
        '2026-07-15T08:00:00.000Z', '2026-07-15T09:00:00.000Z'
      );
      UPDATE time_entries SET started_at = '2026-07-15T08:15:00.000Z',
        correction_revision_token = 'revision-1', correction_reason = 'Corrected start',
        updated_at = '2026-07-15T10:00:00.000Z' WHERE id = 'entry-1';
    `);
    const revision = database
      .prepare('SELECT reason, before_json, after_json FROM time_entry_corrections')
      .get() as { reason: string; before_json: string; after_json: string };
    expect(revision.reason).toBe('Corrected start');
    const before = JSON.parse(revision.before_json) as { startedAt: string };
    const after = JSON.parse(revision.after_json) as { startedAt: string };
    expect(before.startedAt).toBe('2026-07-15T08:00:00.000Z');
    expect(after.startedAt).toBe('2026-07-15T08:15:00.000Z');
    expect(() => database.exec("UPDATE time_entry_corrections SET reason = 'Changed'")).toThrow(
      'Correction history is immutable.',
    );

    database.exec(`
      INSERT INTO finalized_report_periods (
        id, start_date, end_date, starts_at, ends_at, schedule_json, finalized_at
      ) VALUES (
        'period-1', '2026-07-15', '2026-07-15',
        '2026-07-14T22:00:00.000Z', '2026-07-15T22:00:00.000Z',
        '{"enabled":false,"days":{}}',
        '2026-07-16T08:00:00.000Z'
      );
    `);
    expect(() =>
      database.exec("UPDATE time_entries SET started_at = '2026-07-15T08:30:00.000Z'"),
    ).toThrow('finalized reporting period');
    expect(database.prepare('SELECT COUNT(*) AS count FROM time_entry_corrections').get()).toEqual({
      count: 1,
    });
    expect(() => database.exec("UPDATE finalized_report_periods SET note = 'Changed'")).toThrow(
      'Finalization history is immutable.',
    );
    database.exec(`UPDATE finalized_report_periods
      SET unlocked_at = '2026-07-16T09:00:00.000Z', unlock_reason = 'Approved correction'
      WHERE id = 'period-1'`);
    database.exec("UPDATE time_entries SET started_at = '2026-07-15T08:30:00.000Z'");
    expect(() =>
      database.exec("UPDATE finalized_report_periods SET unlock_reason = 'Rewritten'"),
    ).toThrow('Finalization history is immutable.');
    database.close();
  });
});
