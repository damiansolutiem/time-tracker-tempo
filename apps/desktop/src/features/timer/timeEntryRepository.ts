import type { RecentEntry, RunningTimer } from '@time-tracker/domain';
import { openDatabase } from '../../infrastructure/database/client';
import {
  parseTags,
  toRecentEntry,
  type EntryRow,
  type RecentEntryRow,
} from '../../infrastructure/database/rows';
import { WorkNoteRepository } from '../notes/workNoteRepository';

const workNoteRepository = new WorkNoteRepository();

type RunningRow = EntryRow & {
  task_group_id: string | null;
  task_category_id: string | null;
  task_category_name: string | null;
  task_category_color: string | null;
  task_category_archived_at: string | null;
  task_category_created_at: string | null;
  task_category_updated_at: string | null;
  task_tags_json: string;
  task_external_id: string | null;
  task_title: string;
  task_description: string | null;
  task_color: string | null;
  task_archived_at: string | null;
  task_created_at: string;
  task_updated_at: string;
  group_name: string | null;
  group_description: string | null;
  group_color: string | null;
  group_archived_at: string | null;
  group_created_at: string | null;
  group_updated_at: string | null;
};

export type StartResult = { id: string; startedAt: string };

export interface TimerRepository {
  getRunning(): Promise<RunningTimer | null>;
  start(taskId: string, startedAt: string, expectedEntryId?: string): Promise<StartResult>;
  stop(endedAt: string, expectedEntryId?: string): Promise<void>;
}

export class SqliteTimeEntryRepository implements TimerRepository {
  async getRunning(): Promise<RunningTimer | null> {
    const database = await openDatabase();
    const rows = await database.select<RunningRow[]>(
      `SELECT e.*,
        t.group_id AS task_group_id, t.external_id AS task_external_id, t.title AS task_title,
        t.description AS task_description, t.color AS task_color,
        t.archived_at AS task_archived_at, t.created_at AS task_created_at,
        t.updated_at AS task_updated_at,
        c.id AS task_category_id, c.name AS task_category_name,
        c.color AS task_category_color, c.archived_at AS task_category_archived_at,
        c.created_at AS task_category_created_at, c.updated_at AS task_category_updated_at,
        COALESCE((SELECT json_group_array(json_object(
          'id', selected.id, 'name', selected.name, 'color', selected.color,
          'archivedAt', selected.archived_at, 'createdAt', selected.created_at,
          'updatedAt', selected.updated_at
        )) FROM (
          SELECT tag.id, tag.name, tag.color, tag.archived_at, tag.created_at, tag.updated_at
          FROM json_each(t.tag_ids_json) assignment
          JOIN work_tags tag ON tag.id = assignment.value
          ORDER BY tag.name COLLATE NOCASE
        ) selected), '[]') AS task_tags_json,
        g.name AS group_name, g.description AS group_description, g.color AS group_color,
        g.archived_at AS group_archived_at, g.created_at AS group_created_at,
        g.updated_at AS group_updated_at
       FROM time_entries e JOIN tasks t ON t.id = e.task_id
       LEFT JOIN groups g ON g.id = e.group_id
       LEFT JOIN work_categories c ON c.id = t.category_id
       WHERE e.ended_at IS NULL LIMIT 1`,
    );
    const row = rows[0];
    if (!row) return null;
    const notes = await workNoteRepository.listForEntryIds([row.id]);
    return {
      id: row.id,
      taskId: row.task_id,
      groupId: row.group_id,
      category:
        row.category_id && row.category_name
          ? { id: row.category_id, name: row.category_name, color: row.category_color }
          : null,
      tags: parseTags(row.tags_json),
      startedAt: row.started_at,
      endedAt: row.ended_at,
      note: row.note,
      confirmedAt: row.confirmed_at,
      checkDueAt: row.check_due_at,
      verificationState: row.verification_state,
      notes: notes.get(row.id) ?? [],
      task: {
        id: row.task_id,
        externalId: row.task_external_id,
        groupId: row.task_group_id,
        category:
          row.task_category_id &&
          row.task_category_name &&
          row.task_category_created_at &&
          row.task_category_updated_at
            ? {
                id: row.task_category_id,
                name: row.task_category_name,
                color: row.task_category_color,
                archivedAt: row.task_category_archived_at,
                createdAt: row.task_category_created_at,
                updatedAt: row.task_category_updated_at,
              }
            : null,
        tags: parseTags(row.task_tags_json),
        title: row.task_title,
        description: row.task_description,
        color: row.task_color,
        archivedAt: row.task_archived_at,
        createdAt: row.task_created_at,
        updatedAt: row.task_updated_at,
      },
      group:
        row.group_id && row.group_name && row.group_created_at && row.group_updated_at
          ? {
              id: row.group_id,
              name: row.group_name,
              description: row.group_description,
              color: row.group_color,
              archivedAt: row.group_archived_at,
              createdAt: row.group_created_at,
              updatedAt: row.group_updated_at,
            }
          : null,
    };
  }

  async start(taskId: string, startedAt: string, expectedEntryId?: string): Promise<StartResult> {
    const database = await openDatabase();
    const id = crypto.randomUUID();
    const result = await database.execute(
      `INSERT INTO time_entries (
        id, task_id, group_id, task_external_id_snapshot, task_title_snapshot,
        task_color_snapshot, group_name_snapshot, group_color_snapshot,
        category_id, category_name, category_color, tags_json,
        started_at, confirmed_at, verification_state, created_at, updated_at
      )
      SELECT $1, task.id, task.group_id, task.external_id, task.title, task.color,
        task_group.name, task_group.color, category.id, category.name, category.color,
        COALESCE((SELECT json_group_array(json_object(
          'id', selected.id, 'name', selected.name, 'color', selected.color
        )) FROM (
          SELECT tag.id, tag.name, tag.color
          FROM json_each(task.tag_ids_json) assignment
          JOIN work_tags tag ON tag.id = assignment.value
          ORDER BY tag.name COLLATE NOCASE
      ) selected), '[]'),
        $2, $2, 'confirmed', $2, $2 FROM tasks task
      LEFT JOIN groups task_group ON task_group.id = task.group_id
      LEFT JOIN work_categories category ON category.id = task.category_id
      WHERE task.id = $3 AND task.archived_at IS NULL
        AND ($4 IS NULL OR EXISTS (
          SELECT 1 FROM time_entries WHERE id = $4 AND ended_at IS NULL
        ))`,
      [id, startedAt, taskId, expectedEntryId ?? null],
    );
    if (result.rowsAffected !== 1) throw new Error('The selected task is unavailable.');
    return { id, startedAt };
  }

  async stop(endedAt: string, expectedEntryId?: string): Promise<void> {
    const database = await openDatabase();
    await database.execute(
      `UPDATE time_entries SET ended_at = $1, check_due_at = NULL,
         verification_state = 'confirmed', updated_at = $1
       WHERE ended_at IS NULL AND started_at <= $1 AND ($2 IS NULL OR id = $2)`,
      [endedAt, expectedEntryId ?? null],
    );
  }

  async listRecent(limit = 8): Promise<RecentEntry[]> {
    const database = await openDatabase();
    const rows = await database.select<RecentEntryRow[]>(
      `SELECT e.id, e.started_at, e.ended_at, t.id AS task_id,
        t.external_id AS task_external_id,
        t.title AS task_title, t.color AS task_color,
        g.id AS group_id, g.name AS group_name, g.color AS group_color
       FROM time_entries e JOIN tasks t ON t.id = e.task_id
       LEFT JOIN groups g ON g.id = e.group_id
       ORDER BY e.started_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map(toRecentEntry);
  }

  async getTodayTotal(now = new Date()): Promise<number> {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const database = await openDatabase();
    const rows = await database.select<{ total_ms: number }[]>(
      `SELECT COALESCE(SUM(MAX(0,
        (julianday(MIN(COALESCE(ended_at, $1), $2)) - julianday(MAX(started_at, $3)))
        * 86400000
      )), 0) AS total_ms
      FROM time_entries
      WHERE started_at < $2 AND COALESCE(ended_at, $1) > $3`,
      [now.toISOString(), end.toISOString(), start.toISOString()],
    );
    return Math.max(0, Math.round(rows[0]?.total_ms ?? 0));
  }

  async getTaskTotal(taskId: string, now = new Date()): Promise<number> {
    const database = await openDatabase();
    const rows = await database.select<{ total_ms: number }[]>(
      `SELECT COALESCE(SUM(MAX(0,
        (julianday(COALESCE(ended_at, $1)) - julianday(started_at)) * 86400000
      )), 0) AS total_ms
      FROM time_entries WHERE task_id = $2`,
      [now.toISOString(), taskId],
    );
    return Math.max(0, Math.round(rows[0]?.total_ms ?? 0));
  }
}
